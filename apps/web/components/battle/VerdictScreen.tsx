"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TxLink } from "@/components/shared/TxLink";
import { ScoreBar } from "./ScoreBar";
import type { Battle, Round, JudgeResult } from "@/lib/types";

interface VerdictScreenProps {
  battle: Battle;
  rounds: Round[];
  txHash: string | null;
}

/**
 * Verdict screen — judge reasoning streams in, scores, best line,
 * payout flash, tx link.
 */
export function VerdictScreen({ battle, rounds, txHash }: VerdictScreenProps) {
  const [verdict, setVerdict] = useState<JudgeResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reasoningText, setReasoningText] = useState("");
  const [showPayout, setShowPayout] = useState(false);
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    const fetchVerdict = async () => {
      try {
        const res = await fetch("/api/battle/verdict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ battleId: battle.id }),
        });

        if (!res.ok) return;
        const data = await res.json();
        setVerdict(data.judgeResult);
        setIsLoading(false);

        // Trigger payout flash
        setTimeout(() => setShowPayout(true), 1500);
        setTimeout(() => setShowPayout(false), 3000);
      } catch (err) {
        console.error("Verdict fetch failed:", err);
        setIsLoading(false);
      }
    };

    fetchVerdict();
  }, [battle.id]);

  // Typewriter for reasoning
  useEffect(() => {
    if (!verdict?.reasoning) return;

    const timer = setInterval(() => {
      setCharIndex((prev) => {
        if (prev >= verdict.reasoning.length) {
          clearInterval(timer);
          return prev;
        }
        setReasoningText(verdict.reasoning.slice(0, prev + 1));
        return prev + 1;
      });
    }, 20);

    return () => clearInterval(timer);
  }, [verdict?.reasoning]);

  const winner = verdict?.winner === "A" ? battle.agentA : battle.agentB;

  return (
    <div className="relative">
      {/* Payout Flash */}
      <AnimatePresence>
        {showPayout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-50"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(16, 185, 129, 0.25) 0%, transparent 70%)",
            }}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="card border-clash-gold/30 space-y-6"
      >
        {/* Header */}
        <div className="text-center">
          <div className="font-display text-xs text-white/40 uppercase tracking-widest mb-1">
            The Judge Has Spoken
          </div>
          <h2 className="font-display text-3xl font-bold text-clash-gold">
            VERDICT
          </h2>
        </div>

        {isLoading ? (
          <div className="text-center py-8">
            <div className="font-display text-lg text-white/40 animate-pulse">
              Judge deliberating...
            </div>
          </div>
        ) : verdict ? (
          <>
            {/* Winner */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, type: "spring" }}
              className="text-center py-4 bg-clash-gold/10 rounded-xl border border-clash-gold/30"
            >
              {/* Spotlight cone */}
              <div className="text-4xl mb-2">🏆</div>
              <div className="font-display text-xs text-white/40 uppercase tracking-widest mb-1">
                Winner
              </div>
              <div
                className="font-display text-2xl font-bold"
                style={{ color: winner.color }}
              >
                {winner.name}
              </div>
              <div className="font-body text-sm text-white/50 mt-1">
                {winner.personality} · Confidence{" "}
                {Math.round(verdict.confidence * 100)}%
              </div>
            </motion.div>

            {/* Scores */}
            <ScoreBar scores={verdict.scores} />

            {/* Best Line */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="bg-clash-black/50 rounded-xl p-4 border-l-2 border-clash-gold"
            >
              <div className="font-display text-xs text-clash-gold uppercase tracking-wider mb-2">
                Best Line of the Battle
              </div>
              <p className="font-body text-sm text-clash-white italic">
                &ldquo;{verdict.bestLine}&rdquo;
              </p>
            </motion.div>

            {/* Reasoning — typewriter */}
            <div>
              <div className="font-display text-xs text-white/40 uppercase tracking-wider mb-2">
                Judge&apos;s Reasoning
              </div>
              <p className="font-body text-sm text-white/70 leading-relaxed">
                {reasoningText}
                {charIndex < (verdict.reasoning?.length ?? 0) && (
                  <span className="inline-block w-0.5 h-4 ml-0.5 bg-clash-gold animate-pulse align-middle" />
                )}
              </p>
            </div>

            {/* Tx Link */}
            {txHash && (
              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <span className="font-body text-xs text-white/40">
                  Settlement transaction
                </span>
                <TxLink hash={txHash} />
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-4">
            <p className="font-body text-sm text-white/40">
              Verdict unavailable
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
