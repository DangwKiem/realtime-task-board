from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Response,
    status,
)
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import (
    CsrfAuth,
    CurrentAuth,
)
from app.models.task import (
    Task,
    TaskStatus,
)
from app.realtime.manager import (
    task_connections,
)
from app.schemas.realtime import (
    RealtimeEventType,
    make_realtime_event,
)
from app.schemas.task import (
    TaskCreate,
    TaskRead,
    TaskUpdate,
)


router = APIRouter(
    prefix="/api/tasks",
    tags=["tasks"],
)


DbSession = Annotated[
    Session,
    Depends(get_db),
]


def get_task_or_404(
    task_id: int,
    owner_id: int,
    db: Session,
) -> Task:
    task = db.scalar(
        select(Task).where(
            Task.id == task_id,
            Task.owner_id == owner_id,
        )
    )

    if task is None:
        raise HTTPException(
            status_code=(
                status.HTTP_404_NOT_FOUND
            ),
            detail=(
                f"Task {task_id} "
                "không tồn tại"
            ),
        )

    return task


def queue_realtime_event(
    background_tasks: BackgroundTasks,
    user_id: int,
    event_type: RealtimeEventType,
    data: dict[str, object],
) -> None:
    event = make_realtime_event(
        event_type,
        data,
    )

    background_tasks.add_task(
        task_connections.broadcast_to_user,
        user_id,
        event,
    )


@router.get(
    "",
    response_model=list[TaskRead],
)
def list_tasks(
    db: DbSession,
    auth: CurrentAuth,
    task_status: Annotated[
        TaskStatus | None,
        Query(alias="status"),
    ] = None,
    q: Annotated[
        str | None,
        Query(
            min_length=1,
            max_length=100,
        ),
    ] = None,
    limit: Annotated[
        int,
        Query(ge=1, le=100),
    ] = 20,
    offset: Annotated[
        int,
        Query(ge=0),
    ] = 0,
) -> list[Task]:
    statement = (
        select(Task)
        .where(
            Task.owner_id == auth.user.id
        )
        .order_by(Task.id.desc())
    )

    if task_status is not None:
        statement = statement.where(
            Task.status == task_status
        )

    if q is not None:
        pattern = f"%{q}%"

        statement = statement.where(
            or_(
                Task.title.ilike(pattern),
                Task.description.ilike(
                    pattern
                ),
            )
        )

    statement = (
        statement
        .offset(offset)
        .limit(limit)
    )

    return list(
        db.scalars(statement).all()
    )


@router.post(
    "",
    response_model=TaskRead,
    status_code=status.HTTP_201_CREATED,
)
def create_task(
    payload: TaskCreate,
    background_tasks: BackgroundTasks,
    db: DbSession,
    auth: CsrfAuth,
) -> Task:
    task = Task(
        **payload.model_dump(),
        owner_id=auth.user.id,
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    task_data = (
        TaskRead
        .model_validate(task)
        .model_dump(mode="json")
    )

    queue_realtime_event(
        background_tasks=background_tasks,
        user_id=auth.user.id,
        event_type="task.created",
        data={
            "task": task_data,
        },
    )

    return task


@router.get(
    "/{task_id}",
    response_model=TaskRead,
)
def get_task(
    task_id: int,
    db: DbSession,
    auth: CurrentAuth,
) -> Task:
    return get_task_or_404(
        task_id=task_id,
        owner_id=auth.user.id,
        db=db,
    )


@router.patch(
    "/{task_id}",
    response_model=TaskRead,
)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    background_tasks: BackgroundTasks,
    db: DbSession,
    auth: CsrfAuth,
) -> Task:
    task = get_task_or_404(
        task_id=task_id,
        owner_id=auth.user.id,
        db=db,
    )

    update_data = payload.model_dump(
        exclude_unset=True
    )

    if (
        "title" in update_data
        and update_data["title"] is None
    ):
        raise HTTPException(
            status_code=(
                status
                .HTTP_422_UNPROCESSABLE_CONTENT
            ),
            detail=(
                "title không được là null"
            ),
        )

    if (
        "status" in update_data
        and update_data["status"] is None
    ):
        raise HTTPException(
            status_code=(
                status
                .HTTP_422_UNPROCESSABLE_CONTENT
            ),
            detail=(
                "status không được là null"
            ),
        )

    for (
        field_name,
        value,
    ) in update_data.items():
        setattr(
            task,
            field_name,
            value,
        )

    db.commit()
    db.refresh(task)

    task_data = (
        TaskRead
        .model_validate(task)
        .model_dump(mode="json")
    )

    queue_realtime_event(
        background_tasks=background_tasks,
        user_id=auth.user.id,
        event_type="task.updated",
        data={
            "task": task_data,
        },
    )

    return task


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_task(
    task_id: int,
    background_tasks: BackgroundTasks,
    db: DbSession,
    auth: CsrfAuth,
) -> Response:
    task = get_task_or_404(
        task_id=task_id,
        owner_id=auth.user.id,
        db=db,
    )

    deleted_task_id = task.id

    db.delete(task)
    db.commit()

    queue_realtime_event(
        background_tasks=background_tasks,
        user_id=auth.user.id,
        event_type="task.deleted",
        data={
            "task_id": deleted_task_id,
        },
    )

    return Response(
        status_code=(
            status.HTTP_204_NO_CONTENT
        )
    )