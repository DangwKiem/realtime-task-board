from dataclasses import dataclass
import secrets
from typing import Annotated

from fastapi import (
    Depends,
    HTTPException,
    Request,
    status,
)
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.security.sessions import (
    SessionData,
    SessionStoreError,
    delete_session,
    read_session,
)


settings = get_settings()


DbSession = Annotated[
    Session,
    Depends(get_db),
]


@dataclass
class AuthContext:
    session_id: str
    session: SessionData
    user: User


def session_store_error() -> HTTPException:
    return HTTPException(
        status_code=(
            status.HTTP_503_SERVICE_UNAVAILABLE
        ),
        detail="Session store không khả dụng",
    )


def get_current_auth(
    request: Request,
    db: DbSession,
) -> AuthContext:
    session_id = request.cookies.get(
        settings.session_cookie_name
    )

    if not session_id:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail="Bạn chưa đăng nhập",
        )

    try:
        session = read_session(session_id)
    except SessionStoreError as error:
        raise session_store_error() from error

    if session is None:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Session không tồn tại "
                "hoặc đã hết hạn"
            ),
        )

    user = db.get(User, session.user_id)

    if user is None:
        try:
            delete_session(session_id)
        except SessionStoreError:
            pass

        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail="User không còn tồn tại",
        )

    return AuthContext(
        session_id=session_id,
        session=session,
        user=user,
    )


CurrentAuth = Annotated[
    AuthContext,
    Depends(get_current_auth),
]


def require_allowed_origin(
    request: Request,
) -> None:
    origin = request.headers.get("origin")

    # Cho phép client không phải browser như pytest/curl.
    # Browser cross-origin sẽ gửi Origin.
    if origin is None:
        return

    if origin not in settings.allowed_origins:
        raise HTTPException(
            status_code=(
                status.HTTP_403_FORBIDDEN
            ),
            detail="Origin không được phép",
        )


def require_csrf(
    request: Request,
    auth: CurrentAuth,
) -> AuthContext:
    require_allowed_origin(request)

    submitted_token = request.headers.get(
        "X-CSRF-Token"
    )

    if not submitted_token:
        raise HTTPException(
            status_code=(
                status.HTTP_403_FORBIDDEN
            ),
            detail="Thiếu CSRF token",
        )

    if not secrets.compare_digest(
        submitted_token,
        auth.session.csrf_token,
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_403_FORBIDDEN
            ),
            detail="CSRF token không hợp lệ",
        )

    return auth


CsrfAuth = Annotated[
    AuthContext,
    Depends(require_csrf),
]