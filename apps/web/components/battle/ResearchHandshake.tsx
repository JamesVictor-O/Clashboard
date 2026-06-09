"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ResearchPurchase, Battle } from "@/lib/types";

interface Props {
  purchase: ResearchPurchase | null;
  battle: Battle;
  onDone: () => void;
}

const SOURCE_ICONS: Record<string, string> = {
  "Sports Reference": "📊",
  "News Sentiment API": "📰",
  "Historical Records DB": "📜",
  "A2A Research Market": "🤖",
  "x402 Sports Research": "📊",
  "x402 News Research": "📰",
  "x402 History Research": "📜",
  "x402 Music Research": "🎵",
  "x402 Tech Research": "⚙️",
  "x402 Crypto Research": "₿",
  "x402 Culture Research": "🎭",
};

export function ResearchHandshake({ purchase, battle, onDone }: Props) {
  useEffect(() => {
    if (!purchase) return;
    const t = setTimeout(onDone, 3800);
    return () => clearTimeout(t);
  }, [purchase, onDone]);

  const agent = purchase
    ? purchase.agent === "A" ? battle.agentA : battle.agentB
    : null;

  return (
    <AnimatePresence>
      {purchase && agent && (
        <motion.div
          key={purchase.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center"
          style={{ background: "rgba(4,4,12,0.88)", backdropFilter: "blur(8px)" }}
        >
          {/* Header */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.08 }}
            className="text-center mb-10"
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.45em] text-white/35 mb-2">
              ⚡ A2A Research Economy ⚡
            </div>
            <div className="font-display text-3xl font-extrabold uppercase text-white tracking-tight">
              Data Deal Struck
            </div>
          </motion.div>

          {/* Main deal row */}
          <div className="flex items-center justify-center w-full max-w-2xl px-6">

            {/* ── Buyer (agent) ── */}
            <motion.div
              initial={{ x: -60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.18 }}
              className="flex flex-col items-center gap-3 w-40"
            >
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-extrabold border-2 select-none"
                style={{
                  borderColor: agent.color,
                  background: `${agent.color}1A`,
                  color: agent.color,
                  boxShadow: `0 0 28px ${agent.color}44`,
                }}
              >
                {agent.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-center">
                <div
                  className="font-display text-sm font-extrabold uppercase"
                  style={{ color: agent.color }}
                >
                  {agent.name}
                </div>
                <div className="font-mono text-[8px] uppercase tracking-widest text-white/30 mt-0.5">
                  Buyer · Agent {purchase.agent}
                </div>
              </div>
            </motion.div>

            {/* ── Left arm ── */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.44, duration: 0.22 }}
              className="h-[2px] w-16 shrink-0"
              style={{
                transformOrigin: "left center",
                background: `linear-gradient(90deg, ${agent.color}99, rgba(255,255,255,0.25))`,
              }}
            />

            {/* ── Handshake center ── */}
            <div className="flex flex-col items-center shrink-0 mx-1">
              <motion.div
                initial={{ scale: 0, rotate: -15 }}
                animate={{ scale: [0, 1.35, 1], rotate: 0 }}
                transition={{ delay: 0.66, duration: 0.5, type: "spring", stiffness: 300 }}
                className="text-5xl mb-3 select-none"
              >
                🤝
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.05 }}
                className="px-4 py-2 rounded-xl border text-center"
                style={{
                  borderColor: "rgba(255,184,0,0.35)",
                  background: "rgba(255,184,0,0.07)",
                }}
              >
                <div className="font-display text-lg font-extrabold text-clash-gold leading-none">
                  {purchase.cost}
                </div>
                <div className="font-mono text-[8px] uppercase tracking-widest text-white/30 mt-1">
                  x402 · paid on-chain
                </div>
              </motion.div>
            </div>

            {/* ── Right arm ── */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.44, duration: 0.22 }}
              className="h-[2px] w-16 shrink-0"
              style={{
                transformOrigin: "right center",
                background: "linear-gradient(90deg, rgba(255,255,255,0.25), rgba(100,200,255,0.6))",
              }}
            />

            {/* ── Seller (data source) ── */}
            <motion.div
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.18 }}
              className="flex flex-col items-center gap-3 w-40"
            >
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl border select-none"
                style={{
                  borderColor: "rgba(100,200,255,0.3)",
                  background: "rgba(100,200,255,0.06)",
                  boxShadow: "0 0 28px rgba(100,200,255,0.18)",
                }}
              >
                {SOURCE_ICONS[purchase.source] ?? "🔍"}
              </div>
              <div className="text-center">
                <div className="font-display text-sm font-extrabold uppercase text-white/85">
                  {purchase.source}
                </div>
                <div className="font-mono text-[8px] uppercase tracking-widest text-white/30 mt-0.5">
                  Provider · x402
                </div>
              </div>
            </motion.div>
          </div>

          {/* TX link */}
          {purchase.txHash && purchase.txHash !== "0x" + "0".repeat(64) && (
            <motion.a
              href={`https://sepolia.basescan.org/tx/${purchase.txHash}`}
              target="_blank"
              rel="noreferrer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="mt-10 font-mono text-[10px] text-white/22 hover:text-white/50 transition-colors"
            >
              tx: {purchase.txHash.slice(0, 20)}…{purchase.txHash.slice(-6)}
            </motion.a>
          )}

          {/* Progress bar — shows how long the overlay stays */}
          <motion.div
            className="absolute bottom-0 left-0 h-[2px]"
            style={{ background: `linear-gradient(90deg, ${agent.color}, rgba(100,200,255,0.6))` }}
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: 3.8, ease: "linear" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
