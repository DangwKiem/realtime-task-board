from datetime import datetime, timedelta, timezone
import secrets

from pydantic import BaseModel, ValidationError
from redis import Redis
from redis.exceptions import RedisError

from app.config import get_settings


settings = get_settings()


redis_client = Redis.from_url(
    settings.redis_url,
    decode_responses=True,
    socket_connect_timeout=3,
    socket_timeout=3,
)


class SessionStoreError(RuntimeError):
    pass


class SessionData(BaseModel):
    user_id: int
    csrf_token: str
    created_at: datetime


def session_key(session_id: str) -> str:
    return f"session:{session_id}"


def create_session(
    user_id: int,
) -> tuple[str, SessionData]:
    session_id = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)

    data = SessionData(
        user_id=user_id,
        csrf_token=csrf_token,
        created_at=datetime.now(timezone.utc),
    )

    initial_ttl = min(
        settings.session_idle_ttl_seconds,
        settings.session_absolute_ttl_seconds,
    )

    try:
        result = redis_client.set(
            session_key(session_id),
            data.model_dump_json(),
            ex=initial_ttl,
        )
    except RedisError as error:
        raise SessionStoreError(
            "Không thể tạo session trong Redis"
        ) from error

    if not result:
        raise SessionStoreError(
            "Redis không lưu được session"
        )

    return session_id, data


def read_session(
    session_id: str,
) -> SessionData | None:
    key = session_key(session_id)

    try:
        raw_data = redis_client.get(key)
    except RedisError as error:
        raise SessionStoreError(
            "Không thể đọc session từ Redis"
        ) from error

    if raw_data is None:
        return None

    try:
        data = SessionData.model_validate_json(
            raw_data
        )
    except ValidationError:
        try:
            redis_client.delete(key)
        except RedisError:
            pass

        return None

    now = datetime.now(timezone.utc)

    absolute_expiry = (
        data.created_at
        + timedelta(
            seconds=(
                settings
                .session_absolute_ttl_seconds
            )
        )
    )

    remaining_absolute_seconds = int(
        (absolute_expiry - now).total_seconds()
    )

    if remaining_absolute_seconds <= 0:
        delete_session(session_id)
        return None

    # Sliding idle expiration:
    # mỗi request hợp lệ gia hạn idle TTL,
    # nhưng không vượt quá absolute lifetime.
    next_ttl = min(
        settings.session_idle_ttl_seconds,
        remaining_absolute_seconds,
    )

    try:
        redis_client.expire(
            key,
            max(1, next_ttl),
        )
    except RedisError as error:
        raise SessionStoreError(
            "Không thể gia hạn session"
        ) from error

    return data


def delete_session(session_id: str) -> None:
    try:
        redis_client.delete(
            session_key(session_id)
        )
    except RedisError as error:
        raise SessionStoreError(
            "Không thể xóa session"
        ) from error


def ping_session_store() -> None:
    try:
        redis_client.ping()
    except RedisError as error:
        raise SessionStoreError(
            "Không kết nối được Redis"
        ) from error