"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 30 MB:长会话下录音 chunks 上限,超过时丢弃最早的 chunk 防止内存泄漏。 */
const MAX_CHUNKS_BYTES = 30 * 1024 * 1024;
/** 静音触发最少需要累积的 chunk 数,防止首字节就被切。 */
const MIN_CHUNKS_BEFORE_SILENCE = 2;
/** 静音触发时长（毫秒）。 */
const SILENCE_TRIGGER_MS = 1200;
/** RMS 阈值,低于此视为静音。 */
const SILENCE_RMS_THRESHOLD = 0.008;
/** 至少累积约 0.4s 语音能量才允许静音提交，减少空包。 */
const MIN_SPEECH_CHUNKS = 4;

/** 安全关闭 AudioContext，避免重复 close 抛 InvalidStateError。 */
function safeCloseAudioContext(ctx: AudioContext | null) {
  if (ctx && ctx.state !== "closed") {
    void ctx.close().catch(() => {});
  }
}

/** 基于能量的简易 VAD + PCM 录制，静默触发回调。 */
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
  const chunksBytesRef = useRef(0);
  const speechChunksRef = useRef(0);
  const silenceStartRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const sessionRef = useRef(0);
  const finalsRef = useRef("");
  const interimRef = useRef("");
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
      const s = Math.max(-1, Math.min(1, float32[i] ?? 0));
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
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
    return btoa(binary);
  };

  const currentText = () => `${finalsRef.current}${interimRef.current}`.trim();

  const emitSilenceRef = useRef(() => {
    const text = currentText();
    const hasSpeech = speechChunksRef.current >= MIN_SPEECH_CHUNKS || Boolean(text);
    const b64 = hasSpeech ? encodeBase64(chunksRef.current) : "";
    chunksRef.current = [];
    chunksBytesRef.current = 0;
    speechChunksRef.current = 0;
    silenceStartRef.current = null;
    finalsRef.current = "";
    interimRef.current = "";
    setPartialText("");
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
      const rec = recognitionRef.current;
      if (rec) {
        rec.onend = null;
        rec.stop();
      }
    } catch {
      /* 识别器可能已停止 */
    }
    recognitionRef.current = null;

    chunksRef.current = [];
    chunksBytesRef.current = 0;
    speechChunksRef.current = 0;
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
      finalsRef.current = "";
      interimRef.current = "";
      setPartialText("");
      return;
    }

    stop();
    const session = sessionRef.current;
    setMicError("");
    finalsRef.current = "";
    interimRef.current = "";
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
          for (let i = 0; i < input.length; i++) sum += (input[i] ?? 0) * (input[i] ?? 0);
          const rms = Math.sqrt(sum / input.length);
          const pcm = floatTo16BitPCM(input);

          chunksRef.current.push(pcm);
          chunksBytesRef.current += pcm.byteLength;
          while (
            chunksRef.current.length > 1 &&
            chunksBytesRef.current > MAX_CHUNKS_BYTES
          ) {
            const dropped = chunksRef.current.shift();
            if (dropped) chunksBytesRef.current -= dropped.byteLength;
          }

          if (rms >= SILENCE_RMS_THRESHOLD) {
            speechChunksRef.current += 1;
            silenceStartRef.current = null;
          } else {
            if (!silenceStartRef.current) silenceStartRef.current = Date.now();
            else if (
              Date.now() - silenceStartRef.current > SILENCE_TRIGGER_MS &&
              chunksRef.current.length > MIN_CHUNKS_BEFORE_SILENCE &&
              (speechChunksRef.current >= MIN_SPEECH_CHUNKS || currentText())
            ) {
              emitSilenceRef.current();
            }
          }
        };

        source.connect(processor);
        const silent = ctx.createGain();
        silent.gain.value = 0;
        processor.connect(silent);
        silent.connect(ctx.destination);

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR && session === sessionRef.current) {
          const startRec = () => {
            if (session !== sessionRef.current) return;
            const rec = new SR();
            rec.lang = "zh-CN";
            rec.continuous = true;
            rec.interimResults = true;
            rec.onresult = (event) => {
              let interim = "";
              for (let i = event.resultIndex; i < event.results.length; i++) {
                const r = event.results[i];
                if (!r) continue;
                const piece = r[0]?.transcript ?? "";
                if (r.isFinal) {
                  finalsRef.current = `${finalsRef.current}${piece}`;
                } else {
                  interim += piece;
                }
              }
              interimRef.current = interim;
              const text = currentText();
              setPartialText(text);
              onPartialRef.current?.(text);
            };
            rec.onerror = () => {
              /* no-speech / aborted 等由 onend 重启 */
            };
            rec.onend = () => {
              if (session !== sessionRef.current) return;
              // Chrome continuous 常会自动停，需重启
              try {
                startRec();
              } catch {
                /* ignore */
              }
            };
            try {
              rec.start();
              recognitionRef.current = rec;
            } catch {
              /* already started */
            }
          };
          startRec();
        }

        if (session === sessionRef.current) {
          setIsRecording(true);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "麦克风不可用";
        setMicError(msg);
        console.warn("麦克风不可用", e);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        safeCloseAudioContext(ctxRef.current);
        ctxRef.current = null;
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
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: { [j: number]: { transcript: string }; isFinal: boolean };
  };
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}
