"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Mic, X } from "lucide-react";

const MAX_SECONDS = 120;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

interface VoiceRecorderProps {
  onSend: (blob: Blob) => void;
  onError?: (message: string) => void;
}

type State = "idle" | "starting" | "recording";

export default function VoiceRecorder({ onSend, onError }: VoiceRecorderProps) {
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const sendRef = useRef(false);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    sendRef.current = false;
    setSeconds(0);
    setState("idle");
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMimeType();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorderRef.current = recorder;
      streamRef.current = stream;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (sendRef.current) {
          const type = mime ?? recorder.mimeType ?? "audio/webm";
          const blob = new Blob(chunksRef.current, { type });
          if (blob.size > 0) onSend(blob);
        }
        cleanup();
      };
      startRef.current = Date.now();
      recorder.start();
      setState("recording");
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
        setSeconds(Math.min(elapsed, MAX_SECONDS));
        if (elapsed >= MAX_SECONDS) {
          sendRef.current = true;
          recorderRef.current?.stop();
        }
      }, 250);
    } catch {
      setState("idle");
      onError?.("Microphone unavailable or permission denied");
    }
  }, [state, onSend, onError, cleanup]);

  const stop = useCallback(() => {
    if (state !== "recording") return;
    sendRef.current = true;
    recorderRef.current?.stop();
  }, [state]);

  const cancel = useCallback(() => {
    if (state !== "recording") return;
    sendRef.current = false;
    recorderRef.current?.stop();
  }, [state]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  if (state === "recording") {
    return (
      <div className="flex items-center gap-2 rounded-full bg-ink px-2 py-1">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
        <span className="w-11 text-sm font-medium tabular-nums text-ghost">
          {mm}:{ss}
        </span>
        <button
          type="button"
          onClick={cancel}
          className="rounded-full p-1.5 text-soft transition hover:bg-white/5"
          aria-label="Cancel recording"
        >
          <X className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={stop}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-mint text-sm font-semibold text-white transition hover:bg-mint/90"
          aria-label="Send voice note"
        >
          <Check className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={state === "starting"}
      className="rounded-full p-2 text-xl text-soft transition hover:bg-white/5 disabled:opacity-40"
      aria-label="Record voice note"
      title="Record voice note"
    >
      <Mic className="h-6 w-6" />
    </button>
  );
}
