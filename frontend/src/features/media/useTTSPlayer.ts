"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * 顺序播放 base64 编码的 mp3 片段，保证回合切换或组件卸载时不与上一段
 * 音频叠加（关键 fix：旧实现未释放上一句音频资源）。
 */
export function useTTSPlayer() {
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const speakingRef = useRef(false);
  const onSpeakingChangeRef = useRef<(v: boolean) => void>(() => {});

  const setOnSpeakingChange = useCallback((fn: (v: boolean) => void) => {
    onSpeakingChangeRef.current = fn;
  }, []);

  /** 释放当前 audio，避免新一段叠加。 */
  const _releaseCurrent = useCallback(() => {
    const a = currentAudioRef.current;
    if (!a) return;
    try {
      a.pause();
      a.src = "";
      // 解除 onended/onerror 避免 pause 后仍回调
      a.onended = null;
      a.onerror = null;
    } catch {
      /* noop */
    }
    currentAudioRef.current = null;
  }, []);

  const playBase64Mp3 = useCallback(
    (b64: string) => {
      const job = (prev: Promise<void>) =>
        prev.then(
          () =>
            new Promise<void>((resolve) => {
              if (!b64) {
                resolve();
                return;
              }
              // 新一句开始前先把上一句释放（防止叠加）
              _releaseCurrent();
              const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
              currentAudioRef.current = audio;
              speakingRef.current = true;
              onSpeakingChangeRef.current(true);
              const finish = () => {
                if (currentAudioRef.current === audio) {
                  currentAudioRef.current = null;
                }
                speakingRef.current = false;
                onSpeakingChangeRef.current(false);
                resolve();
              };
              audio.onended = finish;
              audio.onerror = finish;
              audio.play().catch(() => finish());
            }),
        );
      queueRef.current = job(queueRef.current);
    },
    [_releaseCurrent],
  );

  /** 主动停止当前播放，并清空队列后续音频。 */
  const stop = useCallback(() => {
    _releaseCurrent();
    speakingRef.current = false;
    onSpeakingChangeRef.current(false);
    queueRef.current = Promise.resolve();
  }, [_releaseCurrent]);

  useEffect(() => {
    return () => {
      _releaseCurrent();
    };
  }, [_releaseCurrent]);

  return {
    playBase64Mp3,
    setOnSpeakingChange,
    stop,
    isSpeaking: () => speakingRef.current,
  };
}
