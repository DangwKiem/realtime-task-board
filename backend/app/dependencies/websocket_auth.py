from dataclasses import dataclass

from fastapi import WebSocket
from starlette.concurrency import (
    run_in_threadpool,
)

from app.config import get_settings
from app.database import SessionLocal
from app.models.user import User
from app.security.sessions import (
    SessionStoreError,
    delete_session,
    read_session,
)


settings = get_settings()


@dataclass(frozen=True)
class WebSocketAuthContext:
    session_id: str
    user_id: int


def _resolve_websocket_auth(
    session_id: str,
) -> WebSocketAuthContext | None:
    session = read_session(session_id)

    if session is None:
        return None

    with SessionLocal() as db:
        user = db.get(
            User,
            session.user_id,
        )

        if user is None:
            try:
                delete_session(session_id)
            except SessionStoreError:
                pass

            return None

        return WebSocketAuthContext(
            session_id=session_id,
            user_id=user.id,
        )


def _session_matches_user(
    session_id: str,
    user_id: int,
) -> bool:
    session = read_session(session_id)

    if session is None:
        return False

    return session.user_id == user_id


async def authenticate_websocket(
    websocket: WebSocket,
) -> WebSocketAuthContext | None:
    origin = websocket.headers.get(
        "origin"
    )

    # 1. WebSocket không dựa vào CORS middleware
    # như fetch. Ta kiểm tra Origin trực tiếp.
    if (
        origin is None
        or origin.rstrip("/")
        not in settings.allowed_origins
    ):
        await websocket.close(
            code=1008,
            reason="Origin not allowed",
        )
        return None

    # 2. Browser tự gửi cookie phù hợp
    # trong opening handshake.
    session_id = websocket.cookies.get(
        settings.session_cookie_name
    )

    if not session_id:
        await websocket.close(
            code=1008,
            reason="Authentication required",
        )
        return None

    try:
        auth = await run_in_threadpool(
            _resolve_websocket_auth,
            session_id,
        )
    except SessionStoreError:
        await websocket.close(
            code=1011,
            reason="Session store unavailable",
        )
        return None

    if auth is None:
        await websocket.close(
            code=1008,
            reason="Session expired",
        )
        return None

    return auth


async def websocket_session_is_valid(
    session_id: str,
    user_id: int,
) -> bool:
    try:
        return await run_in_threadpool(
            _session_matches_user,
            session_id,
            user_id,
        )
    except SessionStoreError:
        return False