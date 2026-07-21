from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


RealtimeEventType = Literal[
    "connection.ready",
    "task.created",
    "task.updated",
    "task.deleted",
    "server.ping",
    "server.pong",
    "error",
]


class RealtimeEvent(BaseModel):
    version: Literal[1] = 1

    event_id: str = Field(
        default_factory=lambda: uuid4().hex
    )

    type: RealtimeEventType

    occurred_at: datetime = Field(
        default_factory=lambda: datetime.now(
            timezone.utc
        )
    )

    data: dict[str, Any]


def make_realtime_event(
    event_type: RealtimeEventType,
    data: dict[str, Any],
) -> dict[str, Any]:
    event = RealtimeEvent(
        type=event_type,
        data=data,
    )

    return event.model_dump(
        mode="json"
    )