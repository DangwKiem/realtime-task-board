import asyncio
from contextlib import suppress
from typing import Any

from fastapi import WebSocket
from starlette.websockets import (
    WebSocketDisconnect,
)

from app.config import get_settings


settings = get_settings()


class ConnectionLimitError(RuntimeError):
    pass


class TaskConnectionManager:
    """
    Lưu các WebSocket đang kết nối theo:

    user_id
        └── session_id
              └── WebSocket connections
    """

    def __init__(
        self,
        max_connections_per_user: int,
        send_timeout_seconds: float,
    ) -> None:
        self._connections: dict[
            int,
            dict[str, set[WebSocket]],
        ] = {}

        self._lock = asyncio.Lock()

        self._max_connections_per_user = (
            max_connections_per_user
        )

        self._send_timeout_seconds = (
            send_timeout_seconds
        )


    async def connect(
        self,
        user_id: int,
        session_id: str,
        websocket: WebSocket,
    ) -> None:
        async with self._lock:
            user_sessions = (
                self._connections.setdefault(
                    user_id,
                    {},
                )
            )

            current_count = sum(
                len(connections)
                for connections
                in user_sessions.values()
            )

            if (
                current_count
                >= self._max_connections_per_user
            ):
                raise ConnectionLimitError(
                    "User đã vượt giới hạn "
                    "WebSocket connections"
                )

            session_connections = (
                user_sessions.setdefault(
                    session_id,
                    set(),
                )
            )

            session_connections.add(websocket)

        try:
            await websocket.accept()
        except BaseException:
            await self.disconnect(
                user_id=user_id,
                session_id=session_id,
                websocket=websocket,
            )
            raise


    async def disconnect(
        self,
        user_id: int,
        session_id: str,
        websocket: WebSocket,
    ) -> None:
        async with self._lock:
            user_sessions = (
                self._connections.get(user_id)
            )

            if not user_sessions:
                return

            session_connections = (
                user_sessions.get(session_id)
            )

            if not session_connections:
                return

            session_connections.discard(
                websocket
            )

            if not session_connections:
                user_sessions.pop(
                    session_id,
                    None,
                )

            if not user_sessions:
                self._connections.pop(
                    user_id,
                    None,
                )


    async def _snapshot_user(
        self,
        user_id: int,
    ) -> list[tuple[str, WebSocket]]:
        async with self._lock:
            user_sessions = (
                self._connections.get(
                    user_id,
                    {},
                )
            )

            return [
                (session_id, websocket)
                for session_id, connections
                in user_sessions.items()
                for websocket in connections
            ]


    async def _snapshot_session(
        self,
        session_id: str,
    ) -> list[
        tuple[int, str, WebSocket]
    ]:
        async with self._lock:
            return [
                (
                    user_id,
                    current_session_id,
                    websocket,
                )
                for user_id, user_sessions
                in self._connections.items()
                for (
                    current_session_id,
                    connections,
                )
                in user_sessions.items()
                if (
                    current_session_id
                    == session_id
                )
                for websocket in connections
            ]


    async def _snapshot_all(
        self,
    ) -> list[
        tuple[int, str, WebSocket]
    ]:
        async with self._lock:
            return [
                (
                    user_id,
                    session_id,
                    websocket,
                )
                for user_id, user_sessions
                in self._connections.items()
                for session_id, connections
                in user_sessions.items()
                for websocket in connections
            ]


    async def broadcast_to_user(
        self,
        user_id: int,
        event: dict[str, Any],
    ) -> None:
        connections = await self._snapshot_user(
            user_id
        )

        if not connections:
            return

        async def send_one(
            session_id: str,
            websocket: WebSocket,
        ) -> tuple[
            str,
            WebSocket,
        ] | None:
            try:
                await asyncio.wait_for(
                    websocket.send_json(event),
                    timeout=(
                        self
                        ._send_timeout_seconds
                    ),
                )

                return None

            except (
                TimeoutError,
                RuntimeError,
                WebSocketDisconnect,
            ):
                return (
                    session_id,
                    websocket,
                )

        results = await asyncio.gather(
            *[
                send_one(
                    session_id,
                    websocket,
                )
                for session_id, websocket
                in connections
            ]
        )

        failed_connections = [
            result
            for result in results
            if result is not None
        ]

        for (
            session_id,
            websocket,
        ) in failed_connections:
            await self.disconnect(
                user_id=user_id,
                session_id=session_id,
                websocket=websocket,
            )


    async def close_session(
        self,
        session_id: str,
        code: int = 1008,
        reason: str = "Session closed",
    ) -> None:
        connections = (
            await self._snapshot_session(
                session_id
            )
        )

        async def close_one(
            websocket: WebSocket,
        ) -> None:
            with suppress(
                RuntimeError,
                WebSocketDisconnect,
            ):
                await websocket.close(
                    code=code,
                    reason=reason,
                )

        await asyncio.gather(
            *[
                close_one(websocket)
                for _, _, websocket
                in connections
            ]
        )

        for (
            user_id,
            current_session_id,
            websocket,
        ) in connections:
            await self.disconnect(
                user_id=user_id,
                session_id=current_session_id,
                websocket=websocket,
            )


    async def close_all(
        self,
        code: int = 1001,
        reason: str = "Server shutdown",
    ) -> None:
        connections = (
            await self._snapshot_all()
        )

        async def close_one(
            websocket: WebSocket,
        ) -> None:
            with suppress(
                RuntimeError,
                WebSocketDisconnect,
            ):
                await websocket.close(
                    code=code,
                    reason=reason,
                )

        await asyncio.gather(
            *[
                close_one(websocket)
                for _, _, websocket
                in connections
            ]
        )

        async with self._lock:
            self._connections.clear()


    async def active_connection_count(
        self,
        user_id: int,
    ) -> int:
        async with self._lock:
            return sum(
                len(connections)
                for connections
                in self._connections
                .get(user_id, {})
                .values()
            )


task_connections = TaskConnectionManager(
    max_connections_per_user=(
        settings
        .websocket_max_connections_per_user
    ),
    send_timeout_seconds=(
        settings
        .websocket_send_timeout_seconds
    ),
)