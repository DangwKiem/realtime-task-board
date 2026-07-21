"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  RealtimeConnectionStatus,
  RealtimeEvent,
} from "@/types/realtime";

import {
  isRealtimeEvent,
} from "@/types/realtime";


const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL;


if (!WS_URL) {
  throw new Error(
    "Thiếu NEXT_PUBLIC_WS_URL " +
      "trong frontend/.env.local",
  );
}


interface UseTaskRealtimeResult {
  status: RealtimeConnectionStatus;
}


export function useTaskRealtime(
  onEvent: (
    event: RealtimeEvent,
  ) => void,
): UseTaskRealtimeResult {
  const [status, setStatus] =
    useState<RealtimeConnectionStatus>(
      "connecting",
    );

  const eventHandlerRef =
    useRef(onEvent);


  useEffect(() => {
    eventHandlerRef.current = onEvent;
  }, [onEvent]);


  useEffect(() => {
    let disposed = false;
    let reconnectAttempt = 0;

    let socket: WebSocket | null = null;

    let reconnectTimer:
      | number
      | null = null;


    function scheduleReconnect() {
      if (disposed) {
        return;
      }

      const baseDelay = Math.min(
        1000 * 2 ** reconnectAttempt,
        15000,
      );

      const jitter =
        Math.floor(Math.random() * 500);

      const delay =
        baseDelay + jitter;

      reconnectAttempt += 1;

      reconnectTimer =
        window.setTimeout(() => {
          if (disposed) {
            return;
          }

          setStatus("connecting");
          connect();
        }, delay);
    }


    function connect() {
      if (disposed) {
        return;
      }

      socket = new WebSocket(WS_URL);

      socket.addEventListener(
        "open",
        () => {
          reconnectAttempt = 0;
          setStatus("open");
        },
      );

      socket.addEventListener(
        "message",
        (messageEvent) => {
          if (
            typeof messageEvent.data
            !== "string"
          ) {
            return;
          }

          let parsed: unknown;

          try {
            parsed = JSON.parse(
              messageEvent.data
            );
          } catch {
            console.error(
              "WebSocket gửi JSON không hợp lệ",
              messageEvent.data,
            );
            return;
          }

          if (!isRealtimeEvent(parsed)) {
            console.error(
              "WebSocket event sai format",
              parsed,
            );
            return;
          }

          if (
            parsed.type === "server.ping"
          ) {
            if (
              socket?.readyState
              === WebSocket.OPEN
            ) {
              socket.send(
                JSON.stringify({
                  type: "client.pong",
                  data: {
                    ping_event_id:
                      parsed.event_id,
                  },
                }),
              );
            }

            return;
          }

          if (parsed.type === "error") {
            console.error(
              "WebSocket application error:",
              parsed.data,
            );
          }

          eventHandlerRef.current(parsed);
        },
      );

      socket.addEventListener(
        "error",
        () => {
          if (!disposed) {
            setStatus("error");
          }
        },
      );

      socket.addEventListener(
        "close",
        (closeEvent) => {
          if (disposed) {
            return;
          }

          setStatus("closed");

          // 1008 được backend sử dụng khi
          // session hết hạn hoặc logout.
          if (closeEvent.code === 1008) {
            window.dispatchEvent(
              new Event(
                "taskboard:session-expired",
              ),
            );

            return;
          }

          scheduleReconnect();
        },
      );
    }


    connect();


    return () => {
      disposed = true;

      if (reconnectTimer !== null) {
        window.clearTimeout(
          reconnectTimer
        );
      }

      if (
        socket &&
        (
          socket.readyState
          === WebSocket.CONNECTING ||
          socket.readyState
          === WebSocket.OPEN
        )
      ) {
        socket.close(
          1000,
          "Component unmounted",
        );
      }
    };
  }, []);


  return {
    status,
  };
}