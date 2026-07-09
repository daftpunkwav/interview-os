"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEvent, ServerEvent, TurnState } from "@/types";
import { getEnv } from "@/lib/env";

type ServerHandler<K extends ServerEvent["type"]> = (
  msg: Extract<ServerEvent, { type: K }>,
) => void;

export type WSHandlers = {
  [K in ServerEvent["type"]]?: ServerHandler<K>;
};

export type WSConnectionState = "connecting" | "open" | "reconnecting" | "failed";

/**
 * 与后端 ``/api/v1/ws/interview/{id}`` 双向通信的强类型 Hook。
 *
 * - 回调参数基于 ``Extract<ServerEvent, { type: K }>`` 推导，新增/重命名字段
 *   会触发 TS 编译错误，避免前端静默吞没协议变更。
 * - 同时保留``on(type, handler)``风格的命令式注册，向后兼容已有页面。
 * - 自动指数退避重连（最多 5 次）。
 * - 暴露 ``connectionState``:超过最大重连次数后变为 ``failed``，
 *   前端可据此提示用户或显示"重新连接"按钮。
 */
export function useInterviewWS(
  sessionId: number,
  handlersOrInitial?: WSHandlers,
  options?: { maxRetries?: number },
) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Record<string, (msg: ServerEvent) => void>>({});
  const [connected, setConnected] = useState(false);
  const [turnState, setTurnState] = useState<TurnState>("IDLE");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [connectionState, setConnectionState] = useState<WSConnectionState>("connecting");
  const maxRetries = options?.maxRetries ?? 5;

  useEffect(() => {
    if (handlersOrInitial) {
      for (const [type, handler] of Object.entries(handlersOrInitial)) {
        if (handler) handlersRef.current[type] = handler as (msg: ServerEvent) => void;
      }
    }
  }, [handlersOrInitial]);

  const on = useCallback(<K extends ServerEvent["type"]>(type: K, handler: ServerHandler<K>) => {
    handlersRef.current[type] = handler as (msg: ServerEvent) => void;
  }, []);

  const send = useCallback((payload: ClientEvent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const retryNow = useCallback(() => {
    setReconnectAttempt(0);
    setConnectionState("connecting");
  }, []);

  useEffect(() => {
    let closedByUser = false;
    let retryCount = 0;

    const connect = () => {
      const wsBase = getEnv().WS_BASE;
      const url = `${wsBase}/api/v1/ws/interview/${sessionId}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCount = 0;
        setReconnectAttempt(0);
        setConnected(true);
        setConnectionState("open");
      };
      ws.onclose = () => {
        setConnected(false);
        if (closedByUser) return;
        if (retryCount >= maxRetries) {
          setConnectionState("failed");
          return;
        }
        retryCount += 1;
        setReconnectAttempt(retryCount);
        setConnectionState("reconnecting");
        const delay = Math.min(1000 * 2 ** (retryCount - 1), 8000);
        window.setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws.close();
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as ServerEvent;
          if (msg.type === "turn_state") {
            setTurnState(msg.state);
          }
          const handler = handlersRef.current[msg.type];
          if (handler) handler(msg);
        } catch {
          /* ignore malformed frame */
        }
      };
    };

    connect();
    return () => {
      closedByUser = true;
      wsRef.current?.close();
    };
  }, [sessionId, maxRetries]);

  return { connected, turnState, reconnectAttempt, connectionState, send, on, retryNow };
}
