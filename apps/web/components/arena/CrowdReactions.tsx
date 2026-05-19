"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CrowdReactionsProps {
  events: string[]; // game event strings that trigger reactions
}

interface EmojiParticle {
  id: string;
  emoji: string;
  x: number;
}

const EVENT_EMOJI_MAP: Record<string, string[]> = {
  round_end: ["👏", "🔥", "💯", "⚡"],
  good_point: ["🎯", "💡", "🧠", "👆"],
  burn: ["🔥", "💀", "😭", "🤣"],
  verdict: ["🏆", "👑", "🎉", "🥇"],
  bet_placed: ["💰", "🤑", "💸", "🎲"],
  research: ["🔍", "📊", "📚", "🧪"],
  default: ["👏", "🔥", "💯", "⚡", "🎯", "💡"],
};

function getEmojisForEvent(event: string): string[] {
  for (const [key, emojis] of Object.entries(EVENT_EMOJI_MAP)) {
    if (event.includes(key)) return emojis;
  }
  return EVENT_EMOJI_MAP.default;
}

/**
 * Emoji burst strip below the arena canvas.
 * Reactions are triggered by game events and pop up with animation.
 */
export function CrowdReactions({ events }: CrowdReactionsProps) {
  const [particles, setParticles] = useState<EmojiParticle[]>([]);

  const spawnParticles = useCallback((event: string) => {
    const emojis = getEmojisForEvent(event);
    const count = 4 + Math.floor(Math.random() * 4);

    const newParticles: EmojiParticle[] = Array.from({ length: count }, (_, i) => ({
      id: `${Date.now()}-${i}`,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      x: 10 + Math.random() * 80, // % from left
    }));

    setParticles((prev) => [...prev, ...newParticles]);

    // Clean up after animation
    setTimeout(() => {
      setParticles((prev) =>
        prev.filter((p) => !newParticles.find((n) => n.id === p.id))
      );
    }, 1200);
  }, []);

  // React to new events
  useEffect(() => {
    if (events.length === 0) return;
    const latestEvent = events[events.length - 1];
    spawnParticles(latestEvent);
  }, [events, spawnParticles]);

  return (
    <div className="relative h-16 overflow-hidden bg-clash-dim/30 rounded-lg border border-white/5">
      {/* Static crowd emoji row */}
      <div className="absolute inset-0 flex items-center justify-center gap-3 opacity-20">
        {["👏", "🔥", "💯", "⚡", "🎯", "🏆", "💰", "🎉"].map((e, i) => (
          <span key={i} className="text-xl">
            {e}
          </span>
        ))}
      </div>

      {/* Animated particles */}
      <AnimatePresence>
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            initial={{ y: 60, opacity: 1, scale: 0.5 }}
            animate={{ y: -20, opacity: 0, scale: 1.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="absolute text-2xl pointer-events-none"
            style={{ left: `${particle.x}%` }}
          >
            {particle.emoji}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Label */}
      <div className="absolute bottom-1 right-2">
        <span className="font-body text-xs text-white/20">crowd</span>
      </div>
    </div>
  );
}
