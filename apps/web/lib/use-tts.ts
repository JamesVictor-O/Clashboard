"use client";

import { useEffect, useRef, useState } from "react";

const VOICE_A = "af_sky";
const VOICE_B = "am_adam";
const TTS_CHUNK_CHARS = 900;

function sanitizeForSpeech(text: string): string {
  return text
    .replace(/[*_`#~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLongSegment(segment: string): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const word of segment.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= TTS_CHUNK_CHARS) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);
    current = word;
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitIntoSpeechChunks(text: string): string[] {
  const cleaned = sanitizeForSpeech(text);
  if (!cleaned) return [];

  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences.map((part) => part.trim()).filter(Boolean)) {
    if (sentence.length > TTS_CHUNK_CHARS) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...splitLongSegment(sentence));
      continue;
    }

    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length <= TTS_CHUNK_CHARS) {
      current = next;
    } else {
      if (current) chunks.push(current);
      current = sentence;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

// ─── Blob cache ───────────────────────────────────────────────────────────────
// Keyed by `${voice}::${text}`. Pre-fetched audio plays with zero latency.
// The cache is module-level (lives for the page session) and intentionally has
// no eviction — argument texts are short and a battle has at most ~12 arguments.
const blobCache = new Map<string, Blob[]>();

function cacheKey(text: string, voice: string): string {
  return `${voice}::${text}`;
}

/**
 * Pre-fetch TTS audio for a given text/side and store the blobs in the module
 * cache. Call this while the *previous* agent is still speaking so the next
 * agent's audio is ready to play the instant its turn arrives.
 *
 * Idempotent: if the key is already cached (or a fetch is in flight) this
 * returns immediately without a duplicate request.
 */
const inFlightPrefetch = new Set<string>();

export async function prefetchTTS(text: string, side: "A" | "B"): Promise<void> {
  const voice = side === "A" ? VOICE_A : VOICE_B;
  const key = cacheKey(sanitizeForSpeech(text), voice);

  if (blobCache.has(key) || inFlightPrefetch.has(key)) return;
  inFlightPrefetch.add(key);

  try {
    const chunks = splitIntoSpeechChunks(text);
    if (chunks.length === 0) return;

    const blobs: Blob[] = [];
    for (const chunk of chunks) {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chunk, voice }),
      });
      if (!res.ok) return; // don't cache partial failures
      blobs.push(await res.blob());
    }
    blobCache.set(key, blobs);
  } catch {
    // Non-fatal — if prefetch fails useTTS will fetch on demand
  } finally {
    inFlightPrefetch.delete(key);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseTTSOptions {
  enabled: boolean;
  side: "A" | "B";
  /** Called when the audio finishes playing naturally (not when aborted by new text). */
  onDone?: () => void;
}

/**
 * Speaks the full `text` whenever it changes to a new non-empty value.
 *
 * If the blobs for `text` were pre-fetched via `prefetchTTS`, they are played
 * immediately from cache — no API round-trip latency. Otherwise falls back to
 * fetching on demand (previous behaviour).
 *
 * `onDone` is called only on natural completion or error — not on abort.
 */
export function useTTS(
  text: string,
  { enabled, side, onDone }: UseTTSOptions
): { speaking: boolean } {
  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const lastRef     = useRef<string>("");
  const abortRef    = useRef<AbortController | null>(null);
  const onDoneRef   = useRef(onDone);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (!enabled || !text || text === lastRef.current) return;
    lastRef.current = text;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setSpeaking(false);

    const voice = side === "A" ? VOICE_A : VOICE_B;
    const chunks = splitIntoSpeechChunks(text);
    if (chunks.length === 0) {
      onDoneRef.current?.();
      return;
    }

    const playBlob = (blob: Blob) => new Promise<void>((resolve) => {
      if (controller.signal.aborted) { resolve(); return; }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = 0.82;
      audioRef.current = audio;

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        controller.signal.removeEventListener("abort", finish);
        URL.revokeObjectURL(url);
        resolve();
      };

      controller.signal.addEventListener("abort", finish, { once: true });
      audio.addEventListener("ended", finish, { once: true });
      audio.addEventListener("error", finish, { once: true });
      audio.play().catch(finish);
    });

    (async () => {
      try {
        setSpeaking(true);

        // Check if all blobs are already cached from a prefetch call.
        const key = cacheKey(sanitizeForSpeech(text), voice);
        const cached = blobCache.get(key);

        if (cached && cached.length === chunks.length) {
          // Play from cache — zero API latency
          for (const blob of cached) {
            if (controller.signal.aborted) return;
            await playBlob(blob);
          }
        } else {
          // Fetch on demand (first chunk starts playing as soon as it arrives)
          for (const chunk of chunks) {
            const res = await fetch("/api/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: chunk, voice }),
              signal: controller.signal,
            });

            if (controller.signal.aborted) return;

            if (!res.ok) {
              const message = await res.text().catch(() => res.statusText);
              console.warn(`[TTS] Request failed (${res.status}): ${message}`);
              break;
            }

            const blob = await res.blob();
            if (controller.signal.aborted) return;

            await playBlob(blob);
            if (controller.signal.aborted) return;
          }
        }

        setSpeaking(false);
        onDoneRef.current?.();
      } catch {
        if (!controller.signal.aborted) {
          setSpeaking(false);
          onDoneRef.current?.();
        }
      }
    })();

    return () => { controller.abort(); };
  }, [text, enabled, side]);

  useEffect(() => () => {
    abortRef.current?.abort();
    audioRef.current?.pause();
    setSpeaking(false);
  }, []);

  return { speaking };
}
