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
 * - 回调参数基于 ``Extract<ServerEvent, { type: K }>`` 推导，协议变更会
 *   触发 TS 编译错误，避免前端静默吞没字段。
 * - handler 通过 props 传入，effect 内通过 ref 同步最新闭包，避免
 *   handler 引用变化时频繁重连 WS。
 * - 自动指数退避重连（最多 5 次），并暴露 ``connectionState`` /
 *   ``cancel()`` 便于页面主动断开。
 */
export function useInterviewWS(
  sessionId: number,
  handlers?: WSHandlers,
  options?: { maxRetries?: number },
) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Record<string, (msg: ServerEvent) => void>>({});
  const retryTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const cancelledRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [turnState, setTurnState] = useState<TurnState>("IDLE");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [connectionState, setConnectionState] = useState<WSConnectionState>("connecting");
  /** 手动重连令牌：递增后触发 effect 重建 WebSocket */
  const [reconnectKey, setReconnectKey] = useState(0);
  const maxRetries = options?.maxRetries ?? 5;

  // 通过 ref 同步 handlers，避免每次 render 重建导致 effect 触发重连
  useEffect(() => {
    if (handlers) {
      const next: Record<string, (msg: ServerEvent) => void> = {};
      for (const [type, handler] of Object.entries(handlers)) {
        if (handler) next[type] = handler as (msg: ServerEvent) => void;
      }
      handlersRef.current = next;
    }
  }, [handlers]);

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

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    }
    setConnected(false);
    setConnectionState("connecting");
  }, []);

  const retryNow = useCallback(() => {
    retryCountRef.current = 0;
    setReconnectAttempt(0);
    setConnectionState("connecting");
    // 递增 key 以触发 effect 关闭旧连接并建立新 WebSocket
    setReconnectKey((k) => k + 1);
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    retryCountRef.current = 0;

    const connect = () => {
      if (cancelledRef.current) return;
      const wsBase = getEnv().WS_BASE;
      const url = `${wsBase}/api/v1/ws/interview/${sessionId}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelledRef.current) {
          ws.close();
          return;
        }
        retryCountRef.current = 0;
        setReconnectAttempt(0);
        setConnected(true);
        setConnectionState("open");
      };
      ws.onclose = () => {
        if (cancelledRef.current) return;
        setConnected(false);
        retryCountRef.current += 1;
        if (retryCountRef.current > maxRetries) {
          setConnectionState("failed");
          return;
        }
        setReconnectAttempt(retryCountRef.current);
        setConnectionState("reconnecting");
        const delay = Math.min(1000 * 2 ** (retryCountRef.current - 1), 8000);
        retryTimerRef.current = window.setTimeout(connect, delay);
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
          // 心跳响应：服务端发 server_ping，5s 内必须回 pong，否则累计失败。
          if (msg.type === "server_ping") {
            ws.send(JSON.stringify({ type: "pong", t: msg.t }));
            return;
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
      cancelledRef.current = true;
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* noop */
        }
        wsRef.current = null;
      }
    };
    // handlers 通过 ref 间接引用；reconnectKey 供 retryNow 强制重建连接
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, maxRetries, reconnectKey]);

  return {
    connected,
    turnState,
    reconnectAttempt,
    connectionState,
    send,
    on,
    cancel,
    retryNow,
  };
}
