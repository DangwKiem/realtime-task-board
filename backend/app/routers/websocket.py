import asyncio
import json
from time import monotonic
from typing import Any

from fastapi import (
    APIRouter,
    WebSocket,
)
from starlette.websockets import (
    WebSocketDisconnect,
)

from app.config import get_settings
from app.dependencies.websocket_auth import (
    authenticate_websocket,
    websocket_session_is_valid,
)
from app.realtime.manager import (
    ConnectionLimitError,
    task_connections,
)
from app.schemas.realtime import (
    make_realtime_event,
)


router = APIRouter(
    tags=["websocket"],
)


settings = get_settings()


async def send_error(
    websocket: WebSocket,
    code: str,
    message: str,
) -> None:
    await websocket.send_json(
        make_realtime_event(
            "error",
            {
                "code": code,
                "message": message,
            },
        )
    )


@router.websocket("/ws/tasks")
async def task_events_websocket(
    websocket: WebSocket,
) -> None:
    auth = await authenticate_websocket(
        websocket
    )

    if auth is None:
        return

    try:
        await task_connections.connect(
            user_id=auth.user_id,
            session_id=auth.session_id,
            websocket=websocket,
        )

    except ConnectionLimitError:
        await websocket.close(
            code=1013,
            reason=(
                "Too many WebSocket connections"
            ),
        )
        return

    await websocket.send_json(
        make_realtime_event(
            "connection.ready",
            {
                "heartbeat_seconds": (
                    settings
                    .websocket_heartbeat_seconds
                ),
            },
        )
    )

    awaiting_pong = False
    last_session_check = monotonic()

    try:
        while True:
            try:
                raw_message = (
                    await asyncio.wait_for(
                        websocket.receive_text(),
                        timeout=(
                            settings
                            .websocket_heartbeat_seconds
                        ),
                    )
                )

            except TimeoutError:
                # Client không trả pong cho lần ping trước.
                if awaiting_pong:
                    await websocket.close(
                        code=1001,
                        reason="Heartbeat timeout",
                    )
                    break

                session_valid = (
                    await websocket_session_is_valid(
                        session_id=(
                            auth.session_id
                        ),
                        user_id=auth.user_id,
                    )
                )

                if not session_valid:
                    await websocket.close(
                        code=1008,
                        reason="Session expired",
                    )
                    break

                last_session_check = monotonic()

                await websocket.send_json(
                    make_realtime_event(
                        "server.ping",
                        {},
                    )
                )

                awaiting_pong = True
                continue

            # Một client gửi message liên tục không được
            # ngăn server kiểm tra session hết hạn.
            if (
                monotonic()
                - last_session_check
                >= settings
                .websocket_heartbeat_seconds
            ):
                session_valid = (
                    await websocket_session_is_valid(
                        session_id=(
                            auth.session_id
                        ),
                        user_id=auth.user_id,
                    )
                )

                if not session_valid:
                    await websocket.close(
                        code=1008,
                        reason="Session expired",
                    )
                    break

                last_session_check = monotonic()

            message_size = len(
                raw_message.encode("utf-8")
            )

            if (
                message_size
                > settings
                .websocket_max_message_bytes
            ):
                await websocket.close(
                    code=1009,
                    reason="Message too large",
                )
                break

            try:
                message: Any = json.loads(
                    raw_message
                )
            except json.JSONDecodeError:
                await send_error(
                    websocket,
                    code="invalid_json",
                    message=(
                        "Message phải là JSON "
                        "hợp lệ"
                    ),
                )
                continue

            if not isinstance(message, dict):
                await send_error(
                    websocket,
                    code="invalid_message",
                    message=(
                        "Message phải là "
                        "một JSON object"
                    ),
                )
                continue

            message_type = message.get("type")

            if message_type == "client.pong":
                awaiting_pong = False
                continue

            if message_type == "client.ping":
                await websocket.send_json(
                    make_realtime_event(
                        "server.pong",
                        {},
                    )
                )
                continue

            await send_error(
                websocket,
                code="unsupported_message",
                message=(
                    "Client chỉ được gửi "
                    "client.ping hoặc client.pong"
                ),
            )

    except WebSocketDisconnect:
        pass

    except RuntimeError:
        # Có thể xảy ra khi connection đã đóng
        # trong lúc receive/send.
        pass

    finally:
        await task_connections.disconnect(
            user_id=auth.user_id,
            session_id=auth.session_id,
            websocket=websocket,
        )