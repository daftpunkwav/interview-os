"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TurnState = "IDLE" | "AI_SPEAKING" | "USER_SPEAKING" | "PROCESSING";

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export function useInterviewWS(sessionId: number) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [turnState, setTurnState] = useState<TurnState>("IDLE");
  const handlersRef = useRef<Record<string, (msg: WSMessage) => void>>({});

  const on = useCallback((type: string, handler: (msg: WSMessage) => void) => {
    handlersRef.current[type] = handler;
  }, []);

  const send = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    const url = `${WS_BASE}/api/v1/ws/interview/${sessionId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WSMessage;
        if (msg.type === "turn_state" && msg.state) {
          setTurnState(msg.state as TurnState);
        }
        handlersRef.current[msg.type]?.(msg);
      } catch {
        /* ignore */
      }
    };

    return () => {
      ws.close();
    };
  }, [sessionId]);

  return { connected, turnState, send, on };
}
