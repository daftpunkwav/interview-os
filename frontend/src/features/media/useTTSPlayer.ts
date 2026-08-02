"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 顺序播放 base64 MP3；支持用户手势解锁、失败提示、音量电平（供口型）。
 * 队列清空后触发 onPlaybackDone（用于回传 tts_playback_done）。
 * 使用 epoch：stop()/卸载后旧 Promise 链不再创建 Audio / 播放。
 */
export function useTTSPlayer() {
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const speakingRef = useRef(false);
  const pendingCountRef = useRef(0);
  const unlockedRef = useRef(false);
  const epochRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const lastFailedB64Ref = useRef<string | null>(null);
  const onSpeakingChangeRef = useRef<(v: boolean) => void>(() => {});
  const onLevelRef = useRef<(level: number) => void>(() => {});
  const onBlockedRef = useRef<(blocked: boolean) => void>(() => {});
  const onPlaybackDoneRef = useRef<() => void>(() => {});
  const [queueDepth, setQueueDepth] = useState(0);

  const setOnSpeakingChange = useCallback((fn: (v: boolean) => void) => {
    onSpeakingChangeRef.current = fn;
  }, []);

  const setOnAudioLevel = useCallback((fn: (level: number) => void) => {
    onLevelRef.current = fn;
  }, []);

  const setOnPlaybackBlocked = useCallback((fn: (blocked: boolean) => void) => {
    onBlockedRef.current = fn;
  }, []);

  const setOnPlaybackDone = useCallback((fn: () => void) => {
    onPlaybackDoneRef.current = fn;
  }, []);

  const _stopLevelLoop = useCallback(() => {
    if (levelRafRef.current != null) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    onLevelRef.current(0);
  }, []);

  const _startLevelLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = ((data[i] ?? 128) - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      onLevelRef.current(Math.min(1, rms * 4));
      levelRafRef.current = requestAnimationFrame(tick);
    };
    _stopLevelLoop();
    levelRafRef.current = requestAnimationFrame(tick);
  }, [_stopLevelLoop]);

  /** 用户手势中调用：解锁自动播放 */
  const unlockAudio = useCallback(async () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.02);
      unlockedRef.current = true;
      onBlockedRef.current(false);
      return true;
    } catch {
      unlockedRef.current = false;
      onBlockedRef.current(true);
      return false;
    }
  }, []);

  const _releaseCurrent = useCallback(() => {
    try {
      sourceNodeRef.current?.disconnect();
    } catch {
      /* noop */
    }
    sourceNodeRef.current = null;
    const a = currentAudioRef.current;
    if (!a) return;
    try {
      a.pause();
      a.src = "";
      a.onended = null;
      a.onerror = null;
    } catch {
      /* noop */
    }
    currentAudioRef.current = null;
  }, []);

  const _notifyIfIdle = useCallback(() => {
    if (pendingCountRef.current <= 0 && !speakingRef.current) {
      onPlaybackDoneRef.current();
    }
  }, []);

  const playBase64Mp3 = useCallback(
    (b64: string) => {
      const jobEpoch = epochRef.current;
      pendingCountRef.current += 1;
      setQueueDepth(pendingCountRef.current);
      const job = (prev: Promise<void>) =>
        prev.then(
          () =>
            new Promise<void>((resolve) => {
              const finish = () => {
                // 过期 epoch：不碰共享计数（stop 已清零）
                if (jobEpoch !== epochRef.current) {
                  resolve();
                  return;
                }
                pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
                setQueueDepth(pendingCountRef.current);
                if (currentAudioRef.current) {
                  currentAudioRef.current = null;
                }
                speakingRef.current = false;
                onSpeakingChangeRef.current(false);
                _stopLevelLoop();
                _notifyIfIdle();
                resolve();
              };

              if (jobEpoch !== epochRef.current) {
                resolve();
                return;
              }

              if (!b64) {
                finish();
                return;
              }

              _releaseCurrent();
              const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
              currentAudioRef.current = audio;
              speakingRef.current = true;
              onSpeakingChangeRef.current(true);

              try {
                const ctx = audioCtxRef.current ?? new AudioContext();
                audioCtxRef.current = ctx;
                if (!analyserRef.current) {
                  const analyser = ctx.createAnalyser();
                  analyser.fftSize = 256;
                  analyserRef.current = analyser;
                  analyser.connect(ctx.destination);
                }
                const src = ctx.createMediaElementSource(audio);
                sourceNodeRef.current = src;
                src.connect(analyserRef.current!);
                void ctx.resume();
                _startLevelLoop();
              } catch {
                /* MediaElementSource 失败则无电平；音频仍可经 element 播放 */
              }

              audio.onended = () => {
                lastFailedB64Ref.current = null;
                finish();
              };
              audio.onerror = () => {
                lastFailedB64Ref.current = b64;
                onBlockedRef.current(true);
                finish();
              };
              audio.play().then(
                () => {
                  if (jobEpoch !== epochRef.current) {
                    try {
                      audio.pause();
                    } catch {
                      /* noop */
                    }
                    finish();
                    return;
                  }
                  unlockedRef.current = true;
                  onBlockedRef.current(false);
                  lastFailedB64Ref.current = null;
                },
                () => {
                  lastFailedB64Ref.current = b64;
                  onBlockedRef.current(true);
                  finish();
                },
              );
            }),
        );
      queueRef.current = job(queueRef.current);
    },
    [_releaseCurrent, _startLevelLoop, _stopLevelLoop, _notifyIfIdle],
  );

  const retryLastFailed = useCallback(() => {
    const b64 = lastFailedB64Ref.current;
    if (!b64) return false;
    lastFailedB64Ref.current = null;
    onBlockedRef.current(false);
    playBase64Mp3(b64);
    return true;
  }, [playBase64Mp3]);

  const stop = useCallback(() => {
    epochRef.current += 1;
    _releaseCurrent();
    speakingRef.current = false;
    pendingCountRef.current = 0;
    setQueueDepth(0);
    onSpeakingChangeRef.current(false);
    _stopLevelLoop();
    queueRef.current = Promise.resolve();
  }, [_releaseCurrent, _stopLevelLoop]);

  useEffect(() => {
    return () => {
      stop();
      void audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    };
  }, [stop]);

  return {
    playBase64Mp3,
    setOnSpeakingChange,
    setOnAudioLevel,
    setOnPlaybackBlocked,
    setOnPlaybackDone,
    unlockAudio,
    retryLastFailed,
    stop,
    isSpeaking: () => speakingRef.current,
    isQueueBusy: () => pendingCountRef.current > 0 || speakingRef.current,
    queueDepth,
  };
}
