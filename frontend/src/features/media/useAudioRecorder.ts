"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 安全关闭 AudioContext，避免重复 close 抛 InvalidStateError。 */
function safeCloseAudioContext(ctx: AudioContext | null) {
  if (ctx && ctx.state !== "closed") {
    void ctx.close().catch(() => {});
  }
}

/** 基于能量的简易 VAD + PCM 录制，静音 1.2s 触发回调。 */
export function useAudioRecorder(
  enabled: boolean,
  onSilence: (pcmBase64: string, partialText: string) => void,
  onPartial?: (text: string) => void,
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Int16Array[]>([]);
  const silenceStartRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const sessionRef = useRef(0);
  const partialRef = useRef("");
  const onSilenceRef = useRef(onSilence);
  const onPartialRef = useRef(onPartial);
  const [isRecording, setIsRecording] = useState(false);
  const [partialText, setPartialText] = useState("");
  const [micError, setMicError] = useState("");

  useEffect(() => {
    onSilenceRef.current = onSilence;
  }, [onSilence]);

  useEffect(() => {
    onPartialRef.current = onPartial;
  }, [onPartial]);

  const floatTo16BitPCM = (float32: Float32Array): Int16Array => {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  };

  const encodeBase64 = (arrays: Int16Array[]): string => {
    if (!arrays.length) return "";
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const merged = new Int16Array(total);
    let offset = 0;
    for (const a of arrays) {
      merged.set(a, offset);
      offset += a.length;
    }
    const bytes = new Uint8Array(merged.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const emitSilenceRef = useRef(() => {
    const b64 = encodeBase64(chunksRef.current);
    const text = partialRef.current;
    chunksRef.current = [];
    silenceStartRef.current = null;
    if (b64 || text) {
      onSilenceRef.current(b64, text);
    }
  });

  const stop = useCallback(() => {
    sessionRef.current += 1;
    setIsRecording(false);

    processorRef.current?.disconnect();
    processorRef.current = null;

    sourceRef.current?.disconnect();
    sourceRef.current = null;

    safeCloseAudioContext(ctxRef.current);
    ctxRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    try {
      recognitionRef.current?.stop();
    } catch {
      /* 识别器可能已停止 */
    }
    recognitionRef.current = null;

    chunksRef.current = [];
    silenceStartRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (!streamRef.current) return;
    emitSilenceRef.current();
  }, []);

  // 仅在 enabled 变化时启停录音，避免回调引用变化导致反复重启
  useEffect(() => {
    if (!enabled) {
      stop();
      partialRef.current = "";
      setPartialText("");
      return;
    }

    stop();
    const session = sessionRef.current;
    setMicError("");
    partialRef.current = "";
    setPartialText("");

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (session !== sessionRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const ctx = new AudioContext({ sampleRate: 16000 });
        ctxRef.current = ctx;
        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        const source = ctx.createMediaStreamSource(stream);
        sourceRef.current = source;

        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (session !== sessionRef.current) return;

          const input = e.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
          const rms = Math.sqrt(sum / input.length);
          const pcm = floatTo16BitPCM(input);
          chunksRef.current.push(pcm);

          if (rms < 0.008) {
            if (!silenceStartRef.current) silenceStartRef.current = Date.now();
            else if (Date.now() - silenceStartRef.current > 1200 && chunksRef.current.length > 2) {
              emitSilenceRef.current();
            }
          } else {
            silenceStartRef.current = null;
          }
        };

        source.connect(processor);
        const silent = ctx.createGain();
        silent.gain.value = 0;
        processor.connect(silent);
        silent.connect(ctx.destination);

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR && session === sessionRef.current) {
          const rec = new SR();
          rec.lang = "zh-CN";
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (event) => {
            let text = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              text += event.results[i][0].transcript;
            }
            partialRef.current = text;
            setPartialText(text);
            onPartialRef.current?.(text);
          };
          rec.start();
          recognitionRef.current = rec;
        }

        if (session === sessionRef.current) {
          setIsRecording(true);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "麦克风不可用";
        setMicError(msg);
        console.warn("麦克风不可用", e);
      }
    })();

    return () => stop();
  }, [enabled, stop]);

  return { stop, flush, isRecording, partialText, micError };
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: { [j: number]: { transcript: string }; isFinal: boolean } };
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}
