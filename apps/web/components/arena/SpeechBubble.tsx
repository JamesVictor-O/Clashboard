"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

interface SpeechBubbleProps {
  text: string;
  side: "A" | "B";
  agentColor: string;
}

/**
 * HTML overlay speech bubble positioned above the active agent.
 * Features:
 * - Typewriter text streaming in
 * - Fade-out wipe between rounds
 * - Positioned left or right based on active agent
 */
export function SpeechBubble({ text, side, agentColor }: SpeechBubbleProps) {
  const [displayText, setDisplayText] = useState("");
  const [isVisible, setIsVisible] = useState(true);
  const prevTextRef = useRef("");
  const charIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When text changes (new round), wipe out then type in new text
  useEffect(() => {
    if (text === prevTextRef.current) return;

    // If we already have text, wipe it out first
    if (displayText) {
      setIsVisible(false);
      setTimeout(() => {
        prevTextRef.current = text;
        charIndexRef.current = 0;
        setDisplayText("");
        setIsVisible(true);
      }, 400); // matches wipe-out duration
    } else {
      prevTextRef.current = text;
      charIndexRef.current = 0;
    }
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typewriter effect
  useEffect(() => {
    if (!isVisible || !text) return;

    const typeNext = () => {
      if (charIndexRef.current < text.length) {
        setDisplayText(text.slice(0, charIndexRef.current + 1));
        charIndexRef.current++;
        timerRef.current = setTimeout(typeNext, 18); // ~55 chars/sec
      }
    };

    timerRef.current = setTimeout(typeNext, 50);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isVisible, text]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key={`bubble-${side}`}
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, x: side === "A" ? -40 : 40 }}
          transition={{ duration: 0.25 }}
          className={clsx(
            "absolute top-8 max-w-[280px] pointer-events-none",
            side === "A" ? "left-4" : "right-4"
          )}
        >
          {/* Bubble */}
          <div
            className="relative bg-clash-dim/95 backdrop-blur-sm rounded-xl px-4 py-3 border"
            style={{ borderColor: `${agentColor}40` }}
          >
            {/* Glow border */}
            <div
              className="absolute inset-0 rounded-xl opacity-20 blur-sm"
              style={{ background: agentColor }}
            />

            {/* Text */}
            <p className="relative font-body text-sm text-clash-white leading-relaxed">
              {displayText}
              {/* Cursor */}
              {charIndexRef.current < text.length && (
                <span
                  className="inline-block w-0.5 h-4 ml-0.5 animate-pulse align-middle"
                  style={{ background: agentColor }}
                />
              )}
            </p>

            {/* Tail */}
            <div
              className={clsx(
                "absolute bottom-[-8px] w-4 h-4 rotate-45",
                side === "A" ? "left-6" : "right-6"
              )}
              style={{ background: "#1A1A28", borderRight: `1px solid ${agentColor}40`, borderBottom: `1px solid ${agentColor}40` }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
