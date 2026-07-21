import type { Task } from "@/types/task";


interface BaseRealtimeEvent {
  version: 1;
  event_id: string;
  occurred_at: string;
}


export interface ConnectionReadyEvent
  extends BaseRealtimeEvent {
  type: "connection.ready";

  data: {
    heartbeat_seconds: number;
  };
}


export interface TaskCreatedEvent
  extends BaseRealtimeEvent {
  type: "task.created";

  data: {
    task: Task;
  };
}


export interface TaskUpdatedEvent
  extends BaseRealtimeEvent {
  type: "task.updated";

  data: {
    task: Task;
  };
}


export interface TaskDeletedEvent
  extends BaseRealtimeEvent {
  type: "task.deleted";

  data: {
    task_id: number;
  };
}


export interface ServerPingEvent
  extends BaseRealtimeEvent {
  type: "server.ping";
  data: Record<string, never>;
}


export interface ServerPongEvent
  extends BaseRealtimeEvent {
  type: "server.pong";
  data: Record<string, never>;
}


export interface RealtimeErrorEvent
  extends BaseRealtimeEvent {
  type: "error";

  data: {
    code: string;
    message: string;
  };
}


export type RealtimeEvent =
  | ConnectionReadyEvent
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskDeletedEvent
  | ServerPingEvent
  | ServerPongEvent
  | RealtimeErrorEvent;


export type RealtimeConnectionStatus =
  | "connecting"
  | "open"
  | "closed"
  | "error";


const EVENT_TYPES = new Set([
  "connection.ready",
  "task.created",
  "task.updated",
  "task.deleted",
  "server.ping",
  "server.pong",
  "error",
]);


export function isRealtimeEvent(
  value: unknown,
): value is RealtimeEvent {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const candidate = value as {
    version?: unknown;
    event_id?: unknown;
    occurred_at?: unknown;
    type?: unknown;
    data?: unknown;
  };

  return (
    candidate.version === 1 &&
    typeof candidate.event_id === "string" &&
    typeof candidate.occurred_at === "string" &&
    typeof candidate.type === "string" &&
    EVENT_TYPES.has(candidate.type) &&
    typeof candidate.data === "object" &&
    candidate.data !== null
  );
}