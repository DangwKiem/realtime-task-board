from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import (
    CORSMiddleware,
)

from app.config import get_settings
from app.database import Base, engine
from app.models import Task, User  # noqa: F401
from app.realtime.manager import (
    task_connections,
)
from app.routers.auth import (
    router as auth_router,
)
from app.routers.tasks import (
    router as tasks_router,
)
from app.routers.websocket import (
    router as websocket_router,
)
from app.security.sessions import (
    SessionStoreError,
    ping_session_store,
)


settings = get_settings()


@asynccontextmanager
async def lifespan(
    app: FastAPI,
) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)

    try:
        ping_session_store()
    except SessionStoreError as error:
        raise RuntimeError(
            "Không kết nối được Redis. "
            "Hãy khởi động Redis trước."
        ) from error

    yield

    await task_connections.close_all(
        code=1001,
        reason="Server shutdown",
    )


app = FastAPI(
    title="Realtime Task Board API",
    version="0.3.0",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Accept",
        "Content-Type",
        "X-CSRF-Token",
    ],
)


app.include_router(auth_router)
app.include_router(tasks_router)
app.include_router(websocket_router)


@app.get(
    "/api/health",
    tags=["system"],
)
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
    }