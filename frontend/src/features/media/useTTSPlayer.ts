"use client";

import { useRef, useCallback } from "react";

export function useTTSPlayer() {
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const speakingRef = useRef(false);
  const onSpeakingChangeRef = useRef<(v: boolean) => void>(() => {});

  const setOnSpeakingChange = useCallback((fn: (v: boolean) => void) => {
    onSpeakingChangeRef.current = fn;
  }, []);

  const playBase64Mp3 = useCallback((b64: string) => {
    queueRef.current = queueRef.current.then(
      () =>
        new Promise<void>((resolve) => {
          if (!b64) {
            resolve();
            return;
          }
          const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
          speakingRef.current = true;
          onSpeakingChangeRef.current(true);
          audio.onended = () => {
            speakingRef.current = false;
            onSpeakingChangeRef.current(false);
            resolve();
          };
          audio.onerror = () => {
            speakingRef.current = false;
            onSpeakingChangeRef.current(false);
            resolve();
          };
          audio.play().catch(() => resolve());
        }),
    );
  }, []);

  return { playBase64Mp3, setOnSpeakingChange, isSpeaking: () => speakingRef.current };
}
