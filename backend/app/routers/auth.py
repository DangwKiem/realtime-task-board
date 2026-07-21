from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.dependencies.auth import (
    CsrfAuth,
    CurrentAuth,
    require_allowed_origin,
    session_store_error,
)
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    LoginInput,
    RegisterInput,
)
from app.schemas.user import UserRead
from app.security.passwords import (
    hash_password,
    perform_dummy_verify,
    verify_password,
)
from app.security.sessions import (
    SessionStoreError,
    create_session,
    delete_session,
)

from starlette.concurrency import (
    run_in_threadpool,
)

from app.realtime.manager import (
    task_connections,
)

router = APIRouter(
    prefix="/api/auth",
    tags=["authentication"],
)


settings = get_settings()


DbSession = Annotated[
    Session,
    Depends(get_db),
]


def normalize_email(email: str) -> str:
    return email.strip().lower()


def set_session_cookie(
    response: Response,
    session_id: str,
) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_id,
        max_age=(
            settings
            .session_absolute_ttl_seconds
        ),
        path="/",
        httponly=True,
        secure=settings.session_secure,
        samesite="lax",
    )

    response.headers["Cache-Control"] = (
        "no-store"
    )


def build_auth_response(
    user: User,
    csrf_token: str,
) -> AuthResponse:
    return AuthResponse(
        user=UserRead.model_validate(user),
        csrf_token=csrf_token,
    )


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    payload: RegisterInput,
    request: Request,
    response: Response,
    db: DbSession,
) -> AuthResponse:
    require_allowed_origin(request)

    email = normalize_email(
        str(payload.email)
    )

    existing_user = db.scalar(
        select(User).where(
            User.email == email
        )
    )

    if existing_user is not None:
        raise HTTPException(
            status_code=(
                status.HTTP_409_CONFLICT
            ),
            detail="Email đã được sử dụng",
        )

    user = User(
        email=email,
        password_hash=hash_password(
            payload.password
        ),
    )

    db.add(user)

    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()

        raise HTTPException(
            status_code=(
                status.HTTP_409_CONFLICT
            ),
            detail="Email đã được sử dụng",
        ) from error

    db.refresh(user)

    try:
        session_id, session = create_session(
            user.id
        )
    except SessionStoreError as error:
        raise session_store_error() from error

    set_session_cookie(
        response,
        session_id,
    )

    return build_auth_response(
        user,
        session.csrf_token,
    )


@router.post(
    "/login",
    response_model=AuthResponse,
)
def login(
    payload: LoginInput,
    request: Request,
    response: Response,
    db: DbSession,
) -> AuthResponse:
    require_allowed_origin(request)

    email = normalize_email(
        str(payload.email)
    )

    user = db.scalar(
        select(User).where(
            User.email == email
        )
    )

    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Email hoặc mật khẩu không đúng",
    )

    if user is None:
        perform_dummy_verify(payload.password)
        raise invalid_credentials

    if not verify_password(
        payload.password,
        user.password_hash,
    ):
        raise invalid_credentials

    # Nếu browser đã có session cũ,
    # xóa nó trước khi cấp session mới.
    old_session_id = request.cookies.get(
        settings.session_cookie_name
    )

    if old_session_id:
        try:
            delete_session(old_session_id)
        except SessionStoreError:
            pass

    try:
        session_id, session = create_session(
            user.id
        )
    except SessionStoreError as error:
        raise session_store_error() from error

    set_session_cookie(
        response,
        session_id,
    )

    return build_auth_response(
        user,
        session.csrf_token,
    )


@router.get(
    "/me",
    response_model=AuthResponse,
)
def get_me(
    auth: CurrentAuth,
    response: Response,
) -> AuthResponse:
    response.headers["Cache-Control"] = (
        "no-store"
    )

    return build_auth_response(
        auth.user,
        auth.session.csrf_token,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout(
    auth: CsrfAuth,
) -> Response:
    try:
        await run_in_threadpool(
            delete_session,
            auth.session_id,
        )
    except SessionStoreError as error:
        raise session_store_error() from error

    # Đóng mọi WebSocket thuộc session này.
    await task_connections.close_session(
        session_id=auth.session_id,
        code=1008,
        reason="Logged out",
    )

    response = Response(
        status_code=(
            status.HTTP_204_NO_CONTENT
        )
    )

    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
    )

    response.headers["Cache-Control"] = (
        "no-store"
    )

    return response