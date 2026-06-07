"use client";

import { useEffect, useRef } from "react";

const VOICE_A = "af_sky";   // bright, confident female voice for Agent A
const VOICE_B = "am_adam";  // deep male voice for Agent B

interface UseTTSOptions {
  enabled: boolean;
  side: "A" | "B";
}

/** Extracts the first full sentence (or first 180 chars) from debate text for TTS. */
function extractSpokenLine(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  const sentence = match ? match[0].trim() : text.slice(0, 180).trim();
  return sentence.replace(/[*_`#~]/g, ""); // strip markdown noise
}

/**
 * Speaks the first sentence of `text` whenever `text` changes to a new non-empty value.
 * Silently no-ops if the browser blocks autoplay or the TTS route is unavailable.
 */
export function useTTS(text: string, { enabled, side }: UseTTSOptions): void {
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const lastRef    = useRef<string>("");
  const abortRef   = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !text || text === lastRef.current) return;
    lastRef.current = text;

    // Cancel any in-flight previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Stop currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }

    const line  = extractSpokenLine(text);
    const voice = side === "A" ? VOICE_A : VOICE_B;

    (async () => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: line, voice }),
          signal: controller.signal,
        });
        if (!res.ok || controller.signal.aborted) return;

        const blob = await res.blob();
        if (controller.signal.aborted) return;

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = 0.82;
        audioRef.current = audio;

        audio.addEventListener("ended",  () => URL.revokeObjectURL(url), { once: true });
        audio.addEventListener("error",  () => URL.revokeObjectURL(url), { once: true });

        // Autoplay may be blocked — swallow the rejection silently
        audio.play().catch(() => URL.revokeObjectURL(url));
      } catch {
        // Aborted or network error — ignore
      }
    })();

    return () => {
      controller.abort();
    };
  }, [text, enabled, side]);

  // Stop audio on unmount
  useEffect(() => () => {
    abortRef.current?.abort();
    audioRef.current?.pause();
  }, []);
}
