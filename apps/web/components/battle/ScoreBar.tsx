"use client";

import { useEffect, useRef } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import type { DebateScores } from "@/lib/types";

interface ScoreBarProps {
  scores: DebateScores;
}

interface SingleBarProps {
  label: string;
  value: number; // 0–100
  color: string;
  delay?: number;
}

function SingleBar({ label, value, color, delay = 0 }: SingleBarProps) {
  const spring = useSpring(0, { stiffness: 80, damping: 20 });
  const width = useTransform(spring, (v) => `${v}%`);
  const displayValue = useTransform(spring, (v) => Math.round(v).toString());

  useEffect(() => {
    const timer = setTimeout(() => {
      spring.set(value);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, spring, delay]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-body text-xs text-white/50 uppercase tracking-wider">
          {label}
        </span>
        <motion.span
          className="font-display text-sm font-bold"
          style={{ color }}
        >
          {displayValue}
        </motion.span>
      </div>
      <div className="h-2 bg-clash-black rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ width, background: color }}
        />
      </div>
    </div>
  );
}

/**
 * Three animated score bars: Accuracy, Wit, Rebuttal.
 * Spring physics fill after each round.
 */
export function ScoreBar({ scores }: ScoreBarProps) {
  return (
    <div className="card space-y-3">
      <h4 className="font-display text-sm font-bold text-white/60 uppercase tracking-wider">
        Round Scores
      </h4>

      <SingleBar
        label="Accuracy"
        value={scores.accuracy}
        color="#10B981"
        delay={0}
      />
      <SingleBar
        label="Wit"
        value={scores.wit}
        color="#FFB800"
        delay={150}
      />
      <SingleBar
        label="Rebuttal"
        value={scores.rebuttal}
        color="#1A3FBE"
        delay={300}
      />

      {/* Total */}
      <div className="pt-2 border-t border-white/5 flex justify-between items-center">
        <span className="font-body text-xs text-white/40">Overall</span>
        <span className="font-display text-base font-bold text-clash-gold">
          {Math.round(
            (scores.accuracy * 0.4 + scores.wit * 0.3 + scores.rebuttal * 0.3)
          )}
          /100
        </span>
      </div>
    </div>
  );
}
