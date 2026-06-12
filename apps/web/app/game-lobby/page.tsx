"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
import { parseAbi, parseAbiItem } from "viem";
import { ConnectWallet } from "@/components/shared/ConnectWallet";
import { getConnectedWalletAccount, placeUserArenaStake } from "@/lib/wallet-contract";
import { executePlaceBet } from "@/lib/autonomy/executor";
import { getAnyActivePermissionContext } from "@/lib/permissions";
import { blockRanges, getEventScanStartBlock, mapWithConcurrency, withRpcRetry } from "@/lib/event-scan";
import { ARENA_CONTRACT, REGISTRY_CONTRACT } from "@/lib/contracts";

const StagingArena3D = dynamic(() => import("@/components/lobby/StagingArena3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-clash-gold/20 border-t-clash-gold/70 rounded-full animate-spin" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-white/20">Staging Arena…</span>
      </div>
    </div>
  ),
});

// ─── Staging queue data ────────────────────────────────────────────────────────

const PERSONA_ACCENT: Record<string, string> = {
  Historian: "#C9A227", Analyst: "#FFB800", Roaster: "#BE1A1A",
  Contrarian: "#7C3AED", Professor: "#059669",
};
const PERSONA_GLOW: Record<string, string> = {
  Historian: "201,162,39", Analyst: "255,184,0", Roaster: "190,26,26",
  Contrarian: "124,58,237", Professor: "5,150,105",
};

interface StagedAgent {
  id: string;
  topic: string;
  name: string;
  persona: string;
  agentBName: string;
  agentBAddress: string;
  agentBPersona: string;
  fightingStyle: string;
  specialties: string[];
  winRate: number;
  totalBattles: number;
  earnings: number;
  status: "QUEUED" | "MATCHING" | "LOCKED";
  entryFee: number;
  poolSize: number;
  poolA: number;
  poolB: number;
  bettors: number;
  countdown: number;
  walletAddress: string;
  isYours?: boolean;
}

// Staged agents are fetched live from on-chain BattleCreated events

// ─── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) { return n.toString().padStart(2, "0"); }
function fmtCountdown(s: number) {
  const m = Math.floor(s / 60);
  return `${pad(m)}:${pad(s % 60)}`;
}

const FALLBACK_HOT_TAKES = [
  "AI agents should be allowed to trade with their own wallets.",
  "Music fans overrate nostalgia more than actual talent.",
  "Remote work creates better builders than office culture.",
  "Crypto games need real stakes before anyone cares.",
  "Founders should ship ugly products faster.",
  "The best debater is usually the one with less popular opinions.",
];

function fallbackHotTake(id: string, agentAName: string, agentBName: string) {
  const seed = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const take = FALLBACK_HOT_TAKES[seed % FALLBACK_HOT_TAKES.length];
  return take ?? `${agentAName} and ${agentBName} are battling over tonight's hottest take.`;
}

async function fetchStoredBattleTopic(battleId: string) {
  if (typeof window === "undefined") return null;

  try {
    const res = await fetch(`/api/battle/${battleId}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { topic?: unknown };
    return typeof data.topic === "string" && data.topic.trim().length > 0
      ? data.topic.trim()
      : null;
  } catch {
    return null;
  }
}


// ─── Stake modal ───────────────────────────────────────────────────────────────

function StakeModal({
  agent,
  initialSide,
  onClose,
}: {
  agent: StagedAgent;
  initialSide: 1 | 2;
  onClose: () => void;
}) {
  const [side, setSide] = useState<1 | 2>(initialSide);
  const [amount, setAmount] = useState("10");
  const [phase, setPhase] = useState<"pick" | "amount" | "signing" | "done">("pick");

  const accentA = PERSONA_ACCENT[agent.persona] ?? "#FFB800";
  const glowA = PERSONA_GLOW[agent.persona] ?? "255,184,0";
  const accentB = PERSONA_ACCENT[agent.agentBPersona] ?? "#7C3AED";
  const glowB = PERSONA_GLOW[agent.agentBPersona] ?? "124,58,237";

  const accent = side === 1 ? accentA : accentB;
  const glow = side === 1 ? glowA : glowB;
  const chosenName = side === 1 ? agent.name : agent.agentBName;
  const chosenPool = side === 1 ? agent.poolA : agent.poolB;
  const sidePool = chosenPool + Number(amount || 0);
  const myShare = sidePool > 0 ? (Number(amount || 0) / sidePool) * 100 : 100;
  const opposingPool = side === 1 ? agent.poolB : agent.poolA;
  const potentialReturn = sidePool > 0
    ? ((Number(amount || 0) / sidePool) * (opposingPool + sidePool) * 0.95).toFixed(2)
    : (Number(amount || 0) * 1.95).toFixed(2);

  const stake = async () => {
    setPhase("signing");
    try {
      if (!agent.id.startsWith("0x")) {
        throw new Error("This battle does not accept on-chain stakes");
      }

      const activePermission = getAnyActivePermissionContext();
      const account = activePermission?.walletAddress ?? await getConnectedWalletAccount();
      const stakeAmount = Number(amount);
      const execution = await executePlaceBet({
        agentOwner: account,
        battleId: agent.id as `0x${string}`,
        side,
        amountUsdc: stakeAmount,
        isAgentTriggered: false,
      });

      if (execution.policyError) throw new Error(execution.policyError);

      if (execution.mode !== "autonomous_oneshot") {
        if (activePermission) {
          throw new Error("1Shot prediction failed. Renew your arena permission before retrying.");
        }
        await placeUserArenaStake({
          account,
          battleId: agent.id as `0x${string}`,
          side,
          amountUSDC: stakeAmount,
        });
      }

      setPhase("done");
    } catch (err) {
      console.error("placeUserArenaStake failed:", err);
      setPhase("amount");
      alert(err instanceof Error ? err.message : "Transaction failed");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-5"
      style={{
        background:
          "radial-gradient(ellipse at 50% 18%, rgba(255,184,0,0.10), transparent 32%), rgba(5,5,10,0.96)",
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 80, scale: 0.92, rotateX: 8 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
        exit={{ opacity: 0, y: 60 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={`relative w-full overflow-hidden ${phase === "pick" ? "max-w-5xl" : phase === "amount" || phase === "signing" ? "max-w-3xl" : "max-w-lg"}`}
        style={{
          background: "linear-gradient(180deg, #080810 0%, #050509 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 90px rgba(0,0,0,0.55)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Animated top bar that shifts color with selection */}
        <motion.div
          className="h-[3px]"
          animate={{ background: `linear-gradient(90deg, ${accentA}, ${accentB})` }}
          style={{ background: `linear-gradient(90deg, ${accentA}, ${accentB})` }}
        />

        {phase === "done" ? (
          /* ── Confirmation ──────────────────────────────────────────────── */
          <div className="p-10 text-center">
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="w-20 h-20 mx-auto mb-6 flex items-center justify-center border-2 rounded-full"
              style={{ borderColor: accent, background: `rgba(${glow},0.12)`, boxShadow: `0 0 40px rgba(${glow},0.35)` }}
            >
              <span className="text-3xl">⚡</span>
            </motion.div>
            <p className="font-display text-3xl font-extrabold uppercase mb-2" style={{ color: accent }}>Prediction Locked</p>
            <p className="font-mono text-sm text-white/50 mb-1">
              ${amount} predicting <span style={{ color: accent }}>{chosenName}</span> wins the debate
            </p>
            <p className="font-mono text-xs text-white/30 mb-8">
              If your fighter wins: <span className="text-green-400">+${potentialReturn} USDC</span> · settled on Base Sepolia
            </p>
            <button onClick={onClose} className="btn-primary w-full py-3.5">Watch The Fight</button>
          </div>
        ) : phase === "pick" ? (
          /* ── Fighter picker ───────────────────────────────────────────── */
          <div className="relative p-5 sm:p-8">
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <motion.div
                className="absolute left-1/2 top-[18%] h-[520px] w-[520px] -translate-x-1/2 rounded-full border border-clash-gold/10"
                animate={{ rotate: 360 }}
                transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                className="absolute left-1/2 top-[22%] h-[360px] w-[360px] -translate-x-1/2 rounded-full border border-white/5"
                animate={{ rotate: -360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                className="absolute left-[8%] top-0 h-full w-20 skew-x-[-18deg]"
                style={{ background: `linear-gradient(180deg, transparent, rgba(${glowA},0.16), transparent)` }}
                animate={{ x: [-80, 70, -80], opacity: [0.15, 0.55, 0.15] }}
                transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute right-[8%] top-0 h-full w-20 skew-x-[18deg]"
                style={{ background: `linear-gradient(180deg, transparent, rgba(${glowB},0.16), transparent)` }}
                animate={{ x: [80, -70, 80], opacity: [0.15, 0.55, 0.15] }}
                transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
              />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:34px_18px]" />
            </div>

            <div className="relative flex items-start justify-between gap-4 mb-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                  <p className="font-mono text-[9px] uppercase tracking-[0.36em] text-clash-gold/70">Spectator Predictions</p>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-white/25">Base Sepolia</span>
                </div>
                <p className="font-display text-3xl sm:text-5xl font-extrabold uppercase leading-[0.9] text-clash-white">
                  Predict The Winner
                </p>
                <p className="mt-3 max-w-2xl font-display text-base sm:text-xl font-extrabold uppercase leading-tight text-white/55">
                  {agent.topic}
                </p>
              </div>
              <button
                onClick={onClose}
                className="min-h-10 min-w-10 text-white/30 hover:text-white/70 transition-colors text-2xl leading-none focus-visible:ring-2 focus-visible:ring-clash-gold focus-visible:ring-offset-2 focus-visible:ring-offset-clash-black"
                aria-label="Close stake modal"
              >
                x
              </button>
            </div>

            <div
              className="relative grid grid-cols-1 md:grid-cols-[1fr_112px_1fr] gap-5 sm:gap-6 items-stretch"
              style={{ perspective: "1200px" }}
            >
              {[
                {
                  side: 1 as const,
                  name: agent.name,
                  persona: agent.persona,
                  pool: agent.poolA,
                  wins: agent.winRate,
                  accent: accentA,
                  glow: glowA,
                  rotate: -5,
                  label: "Side A",
                },
                {
                  side: 2 as const,
                  name: agent.agentBName,
                  persona: agent.agentBPersona,
                  pool: agent.poolB,
                  wins: 50,
                  accent: accentB,
                  glow: glowB,
                  rotate: 5,
                  label: "Side B",
                },
              ].map((fighter, fighterIndex) => (
                <motion.button
                  key={fighter.side}
                  initial={{
                    opacity: 0,
                    y: 26,
                    rotateY: fighter.rotate * 1.8,
                    rotateX: 7,
                  }}
                  animate={{
                    opacity: 1,
                    y: [0, -5, 0],
                    rotateY: fighter.rotate,
                    rotateX: 0,
                  }}
                  whileHover={{
                    y: -12,
                    rotateY: fighter.side === 1 ? -3 : 3,
                    rotateX: -3,
                    scale: 1.03,
                  }}
                  whileTap={{ scale: 0.97, rotateY: 0 }}
                  transition={{
                    opacity: { duration: 0.35, delay: fighterIndex * 0.1 },
                    y: { duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: fighterIndex * 0.35 },
                    rotateY: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
                  }}
                  onClick={() => { setSide(fighter.side); setPhase("amount"); }}
                  className={`group relative min-h-[288px] overflow-hidden border p-5 sm:p-6 text-left transition-colors focus-visible:ring-2 focus-visible:ring-clash-gold focus-visible:ring-offset-2 focus-visible:ring-offset-clash-black ${fighter.side === 1 ? "order-1 md:col-start-1 md:row-start-1" : "order-3 md:col-start-3 md:row-start-1"}`}
                  style={{
                    transformStyle: "preserve-3d",
                    borderColor: fighter.accent,
                    background:
                      `linear-gradient(145deg, rgba(${fighter.glow},0.22), rgba(8,8,14,0.96) 44%, rgba(${fighter.glow},0.08))`,
                    boxShadow: `0 18px 50px rgba(0,0,0,0.38), 0 0 34px rgba(${fighter.glow},0.18)`,
                  }}
                >
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: `linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.14) 45%, transparent 58%)`,
                    }}
                    animate={{ x: ["-130%", "130%"] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: fighterIndex * 0.65 }}
                  />
                  <div className="absolute inset-x-0 top-0 h-1" style={{ background: fighter.accent }} />
                  <div
                    className="absolute right-4 top-4 h-16 w-16 border opacity-20"
                    style={{ borderColor: fighter.accent, transform: "translateZ(26px) rotate(45deg)" }}
                  />
                  <div
                    className="absolute -bottom-10 -right-8 h-36 w-36 rounded-full border opacity-15"
                    style={{ borderColor: fighter.accent, transform: "translateZ(14px)" }}
                  />

                  <div className="relative h-full flex flex-col" style={{ transform: "translateZ(34px)" }}>
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <span
                        className="font-mono text-[9px] font-bold uppercase tracking-[0.32em] px-2 py-1 border"
                        style={{ borderColor: `rgba(${fighter.glow},0.34)`, color: fighter.accent, background: `rgba(${fighter.glow},0.08)` }}
                      >
                        {fighter.label}
                      </span>
                      <motion.span
                        className="h-2 w-2 rounded-full"
                        style={{ background: fighter.accent, boxShadow: `0 0 18px rgba(${fighter.glow},0.9)` }}
                        animate={{ scale: [1, 1.7, 1], opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 1.4, repeat: Infinity, delay: fighterIndex * 0.2 }}
                      />
                    </div>

                    <p className="font-mono text-[9px] uppercase tracking-[0.26em] mb-2" style={{ color: `rgba(${fighter.glow},0.78)` }}>
                      {fighter.persona}
                    </p>
                    <p className="font-display text-3xl sm:text-4xl font-extrabold uppercase leading-[0.92] mb-4" style={{ color: fighter.accent }}>
                      {fighter.name}
                    </p>

                    <div className="mb-5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-white/38">Form</span>
                        <span className="font-mono text-[10px] font-bold text-white/55">{fighter.wins}% wins</span>
                      </div>
                      <div className="h-2 bg-white/8 overflow-hidden">
                        <motion.div
                          className="h-full"
                          style={{ background: fighter.accent }}
                          initial={{ width: 0 }}
                          animate={{ width: `${fighter.wins}%` }}
                          transition={{ duration: 0.9, delay: 0.25 + fighterIndex * 0.18 }}
                        />
                      </div>
                    </div>

                    <div className="mt-auto grid grid-cols-2 gap-3">
                      <div className="border border-white/8 p-3 bg-black/20">
                        <p className="font-mono text-[8px] uppercase tracking-widest text-white/30 mb-1">Side Pool</p>
                        <p className="font-display text-xl font-extrabold" style={{ color: fighter.accent }}>
                          ${fighter.pool.toFixed(2)}
                        </p>
                      </div>
                      <div className="border border-white/8 p-3 bg-black/20">
                        <p className="font-mono text-[8px] uppercase tracking-widest text-white/30 mb-1">Tap To</p>
                        <p className="font-display text-xl font-extrabold uppercase text-white/80">Predict</p>
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}

              <div className="order-2 md:col-start-2 md:row-start-1 relative flex md:flex-col items-center justify-center gap-3 min-h-20">
                <motion.div
                  className="absolute hidden md:block h-full w-px"
                  style={{ background: `linear-gradient(to bottom, transparent, ${accentA}, ${accentB}, transparent)` }}
                  animate={{ opacity: [0.25, 0.9, 0.25] }}
                  transition={{ duration: 1.7, repeat: Infinity }}
                />
                <motion.div
                  className="relative z-10 h-24 w-24 rounded-full border flex items-center justify-center bg-black/55"
                  style={{ borderColor: "rgba(255,255,255,0.12)", boxShadow: "0 0 40px rgba(255,184,0,0.12)" }}
                  animate={{ rotate: [0, 3, -3, 0], scale: [1, 1.04, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <div className="absolute inset-2 rounded-full border border-white/6" />
                  <div className="text-center">
                    <p className="font-display text-3xl font-extrabold text-white/20 leading-none">VS</p>
                    <p className="font-mono text-[8px] uppercase tracking-widest text-clash-gold/70 mt-1">Lock In</p>
                  </div>
                </motion.div>
                <div className="relative z-10 flex md:flex-col gap-2">
                  {["$5", "$10", "$25"].map((chip, chipIndex) => (
                    <motion.div
                      key={chip}
                      className="h-10 min-w-10 rounded-full border border-clash-gold/45 bg-clash-gold/10 flex items-center justify-center px-3 font-mono text-[10px] font-bold text-clash-gold"
                      animate={{ y: [0, -6, 0], rotate: [0, chipIndex % 2 ? 8 : -8, 0] }}
                      transition={{ duration: 2.2, repeat: Infinity, delay: chipIndex * 0.18 }}
                    >
                      {chip}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-white/6 pt-4">
              {[
                ["Total Pot", `$${(agent.poolSize ?? 0).toFixed(2)}`],
                ["Battle Status", agent.status === "QUEUED" ? "Settling" : "Live"],
                ["Payout Token", "USDC"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 sm:block">
                  <p className="font-mono text-[8px] uppercase tracking-widest text-white/28">{label}</p>
                  <p className="font-display text-base font-extrabold uppercase text-white/62">{value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── Amount input ─────────────────────────────────────────────── */
          <div className="relative p-5 sm:p-7">
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <motion.div
                className="absolute -right-28 -top-28 h-64 w-64 rounded-full border"
                style={{ borderColor: `rgba(${glow},0.18)` }}
                animate={{ rotate: 360, scale: [1, 1.06, 1] }}
                transition={{ rotate: { duration: 18, repeat: Infinity, ease: "linear" }, scale: { duration: 2.6, repeat: Infinity } }}
              />
              <motion.div
                className="absolute -left-24 bottom-8 h-44 w-44 rounded-full border border-white/6"
                animate={{ rotate: -360 }}
                transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                className="absolute left-0 top-0 h-full w-28 skew-x-[-18deg]"
                style={{ background: `linear-gradient(180deg, transparent, rgba(${glow},0.18), transparent)` }}
                animate={{ x: [-140, 760], opacity: [0, 0.65, 0] }}
                transition={{ duration: 2.7, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:32px_18px]" />
            </div>

            {/* Header with back button */}
            <div className="relative flex items-center gap-3 mb-5">
              <button
                onClick={() => setPhase("pick")}
                className="min-h-10 px-2 text-white/35 hover:text-white/70 transition-colors text-sm font-mono focus-visible:ring-2 focus-visible:ring-clash-gold focus-visible:ring-offset-2 focus-visible:ring-offset-clash-black"
              >
                ← Back
              </button>
              <div className="flex-1 h-px bg-white/6" />
              <button
                onClick={onClose}
                className="min-h-10 min-w-10 text-white/30 hover:text-white/70 transition-colors text-2xl leading-none focus-visible:ring-2 focus-visible:ring-clash-gold focus-visible:ring-offset-2 focus-visible:ring-offset-clash-black"
                aria-label="Close stake modal"
              >
                x
              </button>
            </div>

            {/* Chosen fighter banner */}
            <div
              className="relative overflow-hidden p-4 sm:p-5 mb-5 flex flex-col sm:flex-row sm:items-center gap-4 border"
              style={{
                borderColor: `rgba(${glow},0.36)`,
                background: `linear-gradient(120deg, rgba(${glow},0.20), rgba(12,8,10,0.96) 48%, rgba(${glow},0.08))`,
                boxShadow: `0 0 34px rgba(${glow},0.14)`,
              }}
            >
              <motion.div
                className="absolute left-0 top-0 bottom-0 w-[3px]"
                style={{ background: accent }}
                animate={{ opacity: [0.45, 1, 0.45] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(110deg, transparent, rgba(255,255,255,0.16), transparent)" }}
                animate={{ x: ["-120%", "120%"] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative pl-2 min-w-0">
                <p className="font-mono text-[8px] uppercase tracking-[0.28em] mb-1" style={{ color: `rgba(${glow},0.78)` }}>
                  Your prediction · Side {side} · USDC lock
                </p>
                <p className="font-display text-3xl sm:text-4xl font-extrabold uppercase leading-none" style={{ color: accent }}>{chosenName}</p>
              </div>
              <div className="relative sm:ml-auto sm:text-right">
                <p className="font-mono text-[8px] text-white/30 uppercase mb-0.5">Pool</p>
                <p className="font-display text-2xl font-extrabold" style={{ color: accent }}>${chosenPool.toFixed(2)}</p>
              </div>
            </div>

            {/* Amount */}
            <div className="relative mb-5 grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/40 mb-2">Prediction Stake (USDC)</p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-display text-3xl font-extrabold" style={{ color: accent }}>$</span>
                  <input
                    type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    min="1" max="500"
                    className="input h-20 pl-10 pr-4 text-4xl font-display font-extrabold tracking-normal w-full"
                    style={{
                      borderColor: `rgba(${glow},0.48)`,
                      background: "rgba(0,0,0,0.28)",
                      boxShadow: `inset 0 0 22px rgba(${glow},0.08)`,
                    }}
                    autoFocus
                  />
                  <motion.div
                    className="absolute inset-x-0 bottom-0 h-[2px]"
                    style={{ background: accent }}
                    animate={{ opacity: [0.35, 1, 0.35] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-5 lg:grid-cols-1 gap-2">
                {["5", "10", "25", "50", "100"].map(v => (
                  <button key={v} onClick={() => setAmount(v)}
                    className="min-h-12 border font-mono text-[10px] sm:text-xs font-bold transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-clash-gold focus-visible:ring-offset-2 focus-visible:ring-offset-clash-black"
                    style={{
                      borderColor: amount === v ? `rgba(${glow},0.6)` : "rgba(255,255,255,0.07)",
                      color: amount === v ? accent : "rgba(255,255,255,0.3)",
                      background: amount === v ? `linear-gradient(90deg, rgba(${glow},0.22), rgba(${glow},0.06))` : "rgba(255,255,255,0.015)",
                      boxShadow: amount === v ? `0 0 24px rgba(${glow},0.16)` : "none",
                    }}>
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            {/* Payout preview */}
            <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <div
                className="relative overflow-hidden border p-4"
                style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}
              >
                <div className="absolute right-3 top-3 h-10 w-10 rotate-45 border border-white/8" />
                <p className="font-mono text-[8px] text-white/30 uppercase tracking-widest mb-2">Your Share</p>
                <p className="font-display text-3xl font-extrabold" style={{ color: accent }}>{myShare.toFixed(1)}%</p>
                <div className="mt-3 h-2 bg-white/8 overflow-hidden">
                  <motion.div
                    className="h-full"
                    style={{ background: accent }}
                    animate={{ width: `${Math.min(myShare, 100)}%` }}
                    transition={{ duration: 0.35 }}
                  />
                </div>
                <p className="font-mono text-[9px] text-white/30 mt-2">of prediction side {side}</p>
              </div>

              <div
                className="relative overflow-hidden border p-4"
                style={{ borderColor: "rgba(34,197,94,0.18)", background: "rgba(34,197,94,0.035)" }}
              >
                <motion.div
                  className="absolute -right-8 -top-8 h-24 w-24 rounded-full border border-green-400/20"
                  animate={{ scale: [1, 1.18, 1], opacity: [0.25, 0.65, 0.25] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                />
                <p className="font-mono text-[8px] text-white/30 uppercase tracking-widest mb-2">If {chosenName.split(" ")[0]} Wins The Debate</p>
                <p className="font-display text-3xl font-extrabold text-green-400">+${potentialReturn}</p>
                <p className="font-mono text-[9px] text-white/30">USDC · 95% payout</p>
              </div>
            </div>

            <button
              onClick={stake}
              disabled={!amount || Number(amount) <= 0 || phase === "signing"}
              className="relative w-full min-h-16 py-4 px-4 font-display text-sm sm:text-xl font-extrabold uppercase tracking-widest disabled:opacity-30 flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.98] overflow-hidden focus-visible:ring-2 focus-visible:ring-clash-gold focus-visible:ring-offset-2 focus-visible:ring-offset-clash-black"
              style={{
                background: `linear-gradient(90deg, ${accent}, #F5F5F0 46%, ${accent})`,
                color: "#050509",
                boxShadow: `0 0 42px rgba(${glow},0.28)`,
              }}
            >
              <motion.div
                className="absolute inset-y-0 left-0 w-24 skew-x-[-18deg] bg-white/35"
                animate={{ x: ["-140%", "860%"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute inset-x-0 bottom-0 h-[3px] bg-black/25"
                animate={{ opacity: [0.2, 0.65, 0.2] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
              <span className="relative flex items-center gap-2">
                {phase === "signing" ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    Locking Prediction...
                  </>
                ) : (
                  `Predict ${chosenName.split(" ")[0]} - $${amount || "0"}`
                )}
              </span>
            </button>

            <p className="relative font-mono text-[9px] text-white/25 text-center uppercase tracking-widest mt-5">
              You are predicting the debate winner, not trading the source market
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Featured fight card (VS layout) ──────────────────────────────────────────

function FeaturedFighterCard({
  agent,
  onStake,
  index,
}: {
  agent: StagedAgent;
  onStake: (a: StagedAgent, side: 1 | 2) => void;
  index: number;
}) {
  const accentA = PERSONA_ACCENT[agent.persona] ?? "#FFB800";
  const glowA = PERSONA_GLOW[agent.persona] ?? "255,184,0";
  const accentB = PERSONA_ACCENT[agent.agentBPersona] ?? "#7C3AED";
  const glowB = PERSONA_GLOW[agent.agentBPersona] ?? "124,58,237";
  const [countdown, setCountdown] = useState(agent.countdown);
  const [displayStatus, setDisplayStatus] = useState(agent.status);
  const liveDuration =
    agent.status === "LOCKED"
      ? agent.countdown
      : Math.max(1, (agent.countdown || 0) + 240);

  useEffect(() => {
    setCountdown(agent.countdown);
    setDisplayStatus(agent.status);
  }, [agent.countdown, agent.status]);

  useEffect(() => {
    if (displayStatus === "QUEUED") return;
    const t = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [displayStatus]);

  useEffect(() => {
    if (countdown > 0) return;
    if (displayStatus === "MATCHING") {
      setDisplayStatus("LOCKED");
      setCountdown(liveDuration);
    } else if (displayStatus === "LOCKED") {
      setDisplayStatus("QUEUED");
    }
  }, [countdown, displayStatus, liveDuration]);

  const isBetting = displayStatus === "MATCHING";
  const isLive = displayStatus === "LOCKED";
  const isSettling = displayStatus === "QUEUED";

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden"
      style={{ background: "#0A0A10", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      {/* Dual-color top bar */}
      <div className="h-[3px] flex">
        <div className="flex-1" style={{ background: accentA }} />
        <div className="flex-1" style={{ background: accentB }} />
      </div>

      {/* Scan line for betting phase */}
      {isBetting && (
        <motion.div
          className="absolute left-0 right-0 h-px pointer-events-none z-20"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }}
          animate={{ top: ["0%", "100%"] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
        />
      )}

      <div className="relative p-5 sm:p-6">
        {/* Status bar */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {isBetting ? (
              <>
                <motion.span
                  className="w-2 h-2 rounded-full bg-green-400"
                  animate={{ scale: [1, 1.6, 1], opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.0, repeat: Infinity }}
                />
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-green-400">Predictions Open</span>
                <span className="font-mono text-[10px] text-white/30">·</span>
                <motion.span
                  className="font-mono text-[10px] font-bold tabular-nums text-green-300"
                  animate={countdown < 60 ? { opacity: [1, 0.2, 1] } : {}}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  {fmtCountdown(countdown)} left
                </motion.span>
              </>
            ) : isLive ? (
              <>
                <motion.span
                  className="w-2 h-2 rounded-full bg-red-500"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                />
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-red-400">Battle Live</span>
                <span className="font-mono text-[10px] text-white/30">·</span>
                <span className="font-mono text-[10px] text-red-300/70">{fmtCountdown(countdown)} remaining</span>
              </>
            ) : (
              <>
                <motion.span
                  className="w-2 h-2 rounded-full bg-yellow-500"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-500/80">Settling</span>
              </>
            )}
          </div>
          {agent.entryFee > 0 && (
            <span className="font-mono text-[9px] uppercase tracking-widest px-2 py-1 border"
              style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}>
              Entry ${agent.entryFee} USDC
            </span>
          )}
        </div>

        {/* Hot take */}
        <div
          className="relative mb-6 overflow-hidden border px-4 py-3 sm:px-5 sm:py-4"
          style={{
            borderColor: "rgba(255,184,0,0.18)",
            background:
              "linear-gradient(90deg, rgba(255,184,0,0.075), rgba(255,255,255,0.018), rgba(124,58,237,0.055))",
          }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-clash-gold" />
          <p className="font-mono text-[8px] uppercase tracking-[0.32em] text-clash-gold/55 mb-1">
            Hot take
          </p>
          <p className="font-display text-base sm:text-xl font-extrabold uppercase leading-tight text-white/82">
            {agent.topic}
          </p>
        </div>

        {/* ── VS FIGHTERS ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-5 mb-5 items-center">
          {/* Fighter A */}
          <div>
            <p className="font-mono text-[8px] uppercase tracking-widest mb-1" style={{ color: `rgba(${glowA},0.6)` }}>{agent.persona}</p>
            <h3
              className="font-display font-extrabold uppercase leading-[0.9] mb-2"
              style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.2rem)", color: accentA, textShadow: `0 0 30px rgba(${glowA},0.45)` }}
            >
              {agent.name}
            </h3>
            <div className="h-[2px] bg-white/8 mb-1 overflow-hidden">
              <motion.div className="h-full" style={{ background: accentA }}
                initial={{ width: 0 }} animate={{ width: `${agent.winRate}%` }}
                transition={{ duration: 1.2, delay: index * 0.1 }} />
            </div>
            <p className="font-mono text-[9px] text-white/40">{agent.winRate}% wins · {agent.totalBattles} fights</p>
          </div>

          {/* VS */}
          <div className="flex flex-col items-center gap-1">
            <motion.div
              className="font-display text-base sm:text-xl font-extrabold select-none"
              style={{ color: "rgba(255,255,255,0.12)" }}
              animate={{ opacity: [0.12, 0.3, 0.12] }}
              transition={{ duration: 2, repeat: Infinity }}
            >VS</motion.div>
          </div>

          {/* Fighter B */}
          <div className="text-right">
            <p className="font-mono text-[8px] uppercase tracking-widest mb-1" style={{ color: `rgba(${glowB},0.6)` }}>{agent.agentBPersona}</p>
            <h3
              className="font-display font-extrabold uppercase leading-[0.9] mb-2"
              style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.2rem)", color: accentB, textShadow: `0 0 30px rgba(${glowB},0.45)` }}
            >
              {agent.agentBName}
            </h3>
            <div className="h-[2px] bg-white/8 mb-1 overflow-hidden">
              <motion.div className="h-full ml-auto" style={{ background: accentB, marginLeft: "auto" }}
                initial={{ width: 0 }} animate={{ width: "50%" }}
                transition={{ duration: 1.2, delay: index * 0.1 }} />
            </div>
            <p className="font-mono text-[9px] text-white/40">50% wins</p>
          </div>
        </div>

        {/* Pool stats */}
        <div className="grid grid-cols-3 gap-3 mb-5 py-3 border-y border-white/5">
          <div className="text-center">
            <p className="font-mono text-[8px] uppercase tracking-widest text-white/30 mb-1">A Predictions</p>
            <p className="font-display text-base font-extrabold" style={{ color: accentA }}>
              ${agent.poolA > 0 ? agent.poolA.toFixed(2) : "—"}
            </p>
          </div>
          <div className="text-center border-x border-white/5">
            <p className="font-mono text-[8px] uppercase tracking-widest text-white/30 mb-1">Prediction Pot</p>
            <p className="font-display text-base font-extrabold text-white/70">
              ${(agent.poolSize ?? 0) > 0 ? (agent.poolSize ?? 0).toFixed(2) : "No predictions yet"}
            </p>
          </div>
          <div className="text-center">
            <p className="font-mono text-[8px] uppercase tracking-widest text-white/30 mb-1">B Predictions</p>
            <p className="font-display text-base font-extrabold" style={{ color: accentB }}>
              ${agent.poolB > 0 ? agent.poolB.toFixed(2) : "—"}
            </p>
          </div>
        </div>

        {/* CTAs */}
        {isSettling ? (
          <div className="py-3 text-center border border-yellow-500/15">
            <p className="font-mono text-[10px] uppercase tracking-widest text-yellow-500/60">Battle complete · Awaiting settlement</p>
          </div>
        ) : isLive ? (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3">
            <div className="hidden sm:block border border-white/6 bg-white/[0.015]" />
            <Link href={`/arena/${agent.id}`}
              className="py-4 px-8 border font-display text-sm font-extrabold uppercase tracking-widest text-center transition-all hover:bg-red-500/8 flex items-center justify-center"
              style={{ borderColor: "rgba(239,68,68,0.3)", color: "#EF4444" }}>
              Watch Live →
            </Link>
            <div className="hidden sm:block border border-white/6 bg-white/[0.015]" />
          </div>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => onStake(agent, 1)}
              className="flex-1 py-4 font-display text-sm font-extrabold uppercase tracking-widest relative overflow-hidden transition-all hover:brightness-110 active:scale-[0.97]"
              style={{ background: accentA, color: "#0A0A0F" }}>
              <motion.div className="absolute inset-0 bg-white/15" initial={{ x: "-100%" }} whileHover={{ x: "100%" }} transition={{ duration: 0.4 }} />
              <span className="relative">Predict {agent.name.split(" ")[0]}</span>
            </button>
            <button onClick={() => onStake(agent, 2)}
              className="flex-1 py-4 font-display text-sm font-extrabold uppercase tracking-widest relative overflow-hidden transition-all hover:brightness-110 active:scale-[0.97]"
              style={{ background: accentB, color: "#0A0A0F" }}>
              <motion.div className="absolute inset-0 bg-white/15" initial={{ x: "-100%" }} whileHover={{ x: "100%" }} transition={{ duration: 0.4 }} />
              <span className="relative">Predict {agent.agentBName.split(" ")[0]}</span>
            </button>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, ${accentA}, transparent 30%, transparent 70%, ${accentB})` }} />
    </motion.div>
  );
}

// ─── Queue row (settling / completed) ─────────────────────────────────────────

function QueueRow({
  agent, rank, index,
}: {
  agent: StagedAgent;
  rank: number;
  index: number;
}) {
  const accentA = PERSONA_ACCENT[agent.persona] ?? "#FFB800";
  const glowA = PERSONA_GLOW[agent.persona] ?? "255,184,0";
  const accentB = PERSONA_ACCENT[agent.agentBPersona] ?? "#7C3AED";
  const glowB = PERSONA_GLOW[agent.agentBPersona] ?? "124,58,237";

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative group grid grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_auto_auto] gap-4 lg:gap-6 px-4 sm:px-5 py-4 sm:py-5 border border-white/8 hover:border-clash-gold/35 transition-colors overflow-hidden"
      style={{
        background:
          `linear-gradient(110deg, rgba(${glowA},0.16), rgba(10,10,16,0.92) 24%, rgba(10,10,16,0.96) 70%, rgba(${glowB},0.16))`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02)",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px opacity-70"
        style={{ background: `linear-gradient(90deg, ${accentA}, transparent 42%, ${accentB})` }}
      />
      <div
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: `linear-gradient(180deg, ${accentA}, ${accentB})` }}
      />
      <div
        className="absolute right-0 top-0 hidden h-full w-40 skew-x-[-18deg] opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:block"
        style={{ background: `linear-gradient(90deg, transparent, rgba(${glowB},0.16))` }}
      />
      <div
        className="absolute left-12 bottom-0 hidden h-8 w-52 skew-x-[-28deg] opacity-40 sm:block"
        style={{ background: `linear-gradient(90deg, rgba(${glowA},0.18), transparent)` }}
      />

      <div className="relative flex flex-col items-center justify-center gap-1 pl-1">
        <span
          className="font-display text-3xl sm:text-4xl font-extrabold tabular-nums leading-none select-none"
          style={{ color: "rgba(255,255,255,0.08)" }}
        >
          {String(rank).padStart(2, "0")}
        </span>
        <span className="h-1 w-7" style={{ background: `linear-gradient(90deg, ${accentA}, ${accentB})` }} />
      </div>

      {/* Hot take first */}
      <div className="relative min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className="font-mono text-[8px] font-bold uppercase tracking-[0.28em] px-2 py-1 border"
            style={{ borderColor: `rgba(${glowA},0.32)`, color: accentA, background: `rgba(${glowA},0.08)` }}
          >
            Hot Take
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-white/28">
            {agent.name} vs {agent.agentBName}
          </span>
        </div>
        <h3 className="font-display text-lg sm:text-xl lg:text-2xl font-extrabold uppercase leading-[1.02] text-white/90 pr-2">
          {agent.topic}
        </h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: `rgba(${glowA},0.75)` }}>
            {agent.persona}
          </span>
          <span className="font-mono text-[9px] text-white/15">vs</span>
          <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: `rgba(${glowB},0.75)` }}>
            {agent.agentBPersona}
          </span>
          <span className="font-mono text-[9px] text-white/15">·</span>
          <span className="font-mono text-[9px] text-white/35">{agent.winRate}% form</span>
          <span className="font-mono text-[9px] text-white/15 hidden sm:block">·</span>
          <span className="font-mono text-[9px] text-white/25 hidden sm:block">{agent.totalBattles} fights logged</span>
        </div>
      </div>

      {/* Pool */}
      <div className="relative hidden lg:block text-right self-center">
        <p className="font-mono text-[8px] uppercase tracking-widest text-white/30 mb-0.5">Total Pot</p>
        <p className="font-display text-xl font-extrabold text-white/72">
          {(agent.poolSize ?? 0) > 0 ? `$${(agent.poolSize ?? 0).toFixed(2)}` : "—"}
        </p>
      </div>

      {/* Status */}
      <div className="relative col-span-2 flex items-center justify-between gap-3 border-t border-white/6 pt-3 lg:col-span-1 lg:block lg:border-t-0 lg:pt-0 lg:text-right lg:self-center lg:w-40">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-widest text-white/30 mb-0.5">Status</p>
          <motion.p
            className="font-mono text-[10px] font-bold uppercase text-yellow-500/70"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          >
            Settling
          </motion.p>
        </div>
        <div className="lg:hidden text-right">
          <p className="font-mono text-[8px] uppercase tracking-widest text-white/30 mb-0.5">Total Pot</p>
          <p className="font-display text-base font-extrabold text-white/70">
            {(agent.poolSize ?? 0) > 0 ? `$${(agent.poolSize ?? 0).toFixed(2)}` : "—"}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="relative col-span-2 lg:col-span-1 flex lg:self-center">
        <div
          className="w-full lg:w-auto min-w-32 px-6 py-3 border font-display text-xs font-extrabold uppercase tracking-widest text-center"
          style={{
            borderColor: "rgba(255,255,255,0.09)",
            color: "rgba(255,255,255,0.34)",
            background: "rgba(255,255,255,0.018)",
          }}
        >
          Settled
        </div>
      </div>
    </motion.div>
  );
}

// ─── Match queue strip ─────────────────────────────────────────────────────────

function MatchQueueStrip({ agents }: { agents: StagedAgent[] }) {
  const active = agents.filter(a => a.status === "LOCKED" || a.status === "MATCHING");
  return (
    <div className="border-y border-white/6 bg-black/30 overflow-hidden">
      <div className="flex items-stretch">
        <div className="flex-shrink-0 px-5 py-3 border-r border-white/6 bg-black/20 flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="font-mono text-[9px] uppercase tracking-widest text-clash-gold/70">Live Queue</span>
          </div>
          <p className="font-mono text-[8px] text-white/30 mt-0.5">{active.length} active</p>
        </div>
        <div className="flex items-center gap-0 overflow-x-auto scrollbar-none">
          {active.map((a, i) => {
            const accentA = PERSONA_ACCENT[a.persona] ?? "#FFB800";
            const accentB = PERSONA_ACCENT[a.agentBPersona] ?? "#7C3AED";
            return (
              <div key={a.id} className="flex items-center gap-2.5 px-5 py-3 border-r border-white/5 flex-shrink-0">
                <span className="font-mono text-[9px] text-white/20">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-display text-xs font-bold uppercase" style={{ color: accentA }}>{a.name}</span>
                <span className="font-mono text-[8px] text-white/20">vs</span>
                <span className="font-display text-xs font-bold uppercase" style={{ color: accentB }}>{a.agentBName}</span>
                <span
                  className="font-mono text-[8px] uppercase tracking-widest font-bold ml-1"
                  style={{ color: a.status === "LOCKED" ? "#EF4444" : "#22C55E" }}
                >
                  {a.status === "LOCKED" ? "▶ Live" : "⚡ Betting"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const BATTLES_CACHE_KEY = "clashboard_game_lobby_battles";
const BATTLES_CACHE_VERSION = 3; // bump to invalidate stale positional-access caches
const BATTLES_CACHE_TTL = 45; // seconds — short enough for new battles, long enough to protect public RPC
const MAX_VISIBLE_BATTLES = 8;
const EVENT_SCAN_CONCURRENCY = 2;
const CONTRACT_READ_CONCURRENCY = 2;

type CachedAgentProfile = {
  name: string;
  persona: string;
  totalBattles: number;
  winRate: number;
  cachedAt: number;
};

const agentProfileCache = new Map<string, CachedAgentProfile>();
const AGENT_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
let liveBattlesRequest: Promise<StagedAgent[]> | null = null;

function loadBattlesCache(): StagedAgent[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BATTLES_CACHE_KEY);
    if (!raw) return null;
    const { ts, data, v } = JSON.parse(raw) as { ts: number; data: StagedAgent[]; v?: number };
    if (v !== BATTLES_CACHE_VERSION) return null; // stale version
    if (Date.now() / 1000 - ts > BATTLES_CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function saveBattlesCache(battles: StagedAgent[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BATTLES_CACHE_KEY, JSON.stringify({ ts: Math.floor(Date.now() / 1000), data: battles, v: BATTLES_CACHE_VERSION }));
  } catch {}
}

async function fetchLiveBattles(): Promise<StagedAgent[]> {
  if (liveBattlesRequest) return liveBattlesRequest;

  liveBattlesRequest = fetchLiveBattlesUncached().finally(() => {
    liveBattlesRequest = null;
  });

  return liveBattlesRequest;
}

async function fetchLiveBattlesUncached(): Promise<StagedAgent[]> {
  const { getPublicClient, ARENA_ABI: arenaAbi, REGISTRY_ABI: registryAbi } = await import("@/lib/chain");
  const client = getPublicClient();
  const arenaAddress = ARENA_CONTRACT;
  const registryAddress = REGISTRY_CONTRACT;

  const battleCreatedEvent = parseAbiItem(
    "event BattleCreated(bytes32 indexed battleId, address agentA, address agentB, uint256 entryFee, uint256 bettingDeadline, bytes32 topicHash, string topic)"
  );
  const legacyBattleCreatedEvent = parseAbiItem(
    "event BattleCreated(bytes32 indexed battleId, address agentA, address agentB, uint256 entryFee, uint256 bettingDeadline)"
  );
  const legacyArenaAbi = parseAbi([
    "function battles(bytes32) external view returns (uint8 state, address agentA, address agentB, address winner, uint256 entryFee, uint256 fighterPoolA, uint256 fighterPoolB, uint256 spectatorPoolA, uint256 spectatorPoolB, uint256 bettingDeadline, uint256 roundDuration, uint8 totalRounds, bytes32 rubricHash, uint256 maxResearch, bytes32 categoryHash, bool rubricCommitted)",
  ]);

  const latestBlock = await client.getBlockNumber();
  const ranges = blockRanges(getEventScanStartBlock(latestBlock), latestBlock);

  // Sequential chunked getLogs — avoids Base Sepolia public RPC rate limits
  type RawLog = {
    args: {
      battleId: `0x${string}`;
      agentA: `0x${string}`;
      agentB: `0x${string}`;
      entryFee: bigint;
      bettingDeadline: bigint;
      topicHash?: `0x${string}`;
      topic?: string;
    };
  };
  const chunks = await mapWithConcurrency(ranges, EVENT_SCAN_CONCURRENCY, async ({ fromBlock, toBlock }) => {
    try {
      const [currentChunk, legacyChunk] = await Promise.allSettled([
        withRpcRetry(() => client.getLogs({ address: arenaAddress, event: battleCreatedEvent, fromBlock, toBlock })),
        withRpcRetry(() => client.getLogs({ address: arenaAddress, event: legacyBattleCreatedEvent, fromBlock, toBlock })),
      ]);
      const logs: RawLog[] = [];
      if (currentChunk.status === "fulfilled") logs.push(...(currentChunk.value as unknown as RawLog[]));
      if (legacyChunk.status === "fulfilled") logs.push(...(legacyChunk.value as unknown as RawLog[]));
      return logs;
    } catch {
      return [];
    }
  });
  const allLogs = chunks.flat();

  const recent = [...allLogs]
    .reverse()
    .filter((log, index, logs) => logs.findIndex(l => l.args.battleId === log.args.battleId) === index)
    .slice(0, MAX_VISIBLE_BATTLES);
  const results: StagedAgent[] = [];

  async function readAgentProfile(address: `0x${string}`, fallbackPersona: string): Promise<CachedAgentProfile> {
    const key = address.toLowerCase();
    const cached = agentProfileCache.get(key);
    if (cached && Date.now() - cached.cachedAt < AGENT_PROFILE_CACHE_TTL_MS) return cached;

    const fallback: CachedAgentProfile = {
      name: `${address.slice(0, 6)}…${address.slice(-4)}`,
      persona: fallbackPersona,
      totalBattles: 0,
      winRate: 50,
      cachedAt: Date.now(),
    };

    try {
      const [onChain, rep] = (await withRpcRetry(() =>
        client.readContract({
          address: registryAddress,
          abi: registryAbi,
          functionName: "getAgent",
          args: [address],
        })
      ) as unknown) as [{ name: string; exists: boolean }, { totalBattles: bigint; wins: bigint }];

      const totalBattles = Number(rep?.totalBattles ?? 0n);
      const wins = Number(rep?.wins ?? 0n);
      const profile: CachedAgentProfile = {
        name: onChain?.exists && onChain.name ? onChain.name.toUpperCase() : fallback.name,
        persona: wins > totalBattles * 0.6 ? "Analyst" : fallbackPersona,
        totalBattles,
        winRate: totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 50,
        cachedAt: Date.now(),
      };
      agentProfileCache.set(key, profile);
      return profile;
    } catch {
      agentProfileCache.set(key, fallback);
      return fallback;
    }
  }

  await mapWithConcurrency(recent, CONTRACT_READ_CONCURRENCY, async (log) => {
    try {
      const battleId = log.args.battleId;
      const agentAAddr = log.args.agentA;
      const agentBAddr = log.args.agentB;
      const entryFee = log.args.entryFee;

      // viem returns the battles() public-mapping getter as a positional array,
      // not a named object — use index access even though ABI has names.
      // Layout: [state, agentA, agentB, winner, entryFee, fighterPoolA,
      //          fighterPoolB, spectatorPoolA, spectatorPoolB, bettingDeadline,
      //          roundDuration, totalRounds, phase, currentRound,
      //          debateStartedAt, currentRoundStartedAt, currentRoundDeadline,
      //          prepareDeadline, rubricHash, maxResearch, topicHash, topic,
      //          categoryHash, rubricCommitted]
      let battleData = [] as unknown as readonly [
        number,           // [0]  state
        `0x${string}`,    // [1]  agentA
        `0x${string}`,    // [2]  agentB
        `0x${string}`,    // [3]  winner
        bigint,           // [4]  entryFee
        bigint,           // [5]  fighterPoolA
        bigint,           // [6]  fighterPoolB
        bigint,           // [7]  spectatorPoolA
        bigint,           // [8]  spectatorPoolB
        bigint,           // [9]  bettingDeadline
        bigint,           // [10] roundDuration
        number,           // [11] totalRounds
        number,           // [12] phase
        number,           // [13] currentRound
        bigint,           // [14] debateStartedAt
        bigint,           // [15] currentRoundStartedAt
        bigint,           // [16] currentRoundDeadline
        bigint,           // [17] prepareDeadline
        `0x${string}`,    // [18] rubricHash
        bigint,           // [19] maxResearch
        `0x${string}`,    // [20] topicHash
        string,           // [21] topic
        `0x${string}`,    // [22] categoryHash
        boolean,          // [23] rubricCommitted
      ];
      let onChainTopic: string | null = null;
      let phaseNum = 0;

      try {
        const [battleRead, phaseRead] = await Promise.all([
          withRpcRetry(() => client.readContract({
            address: arenaAddress,
            abi: arenaAbi,
            functionName: "battles",
            args: [battleId],
          })),
          withRpcRetry(() => client.readContract({
            address: arenaAddress,
            abi: arenaAbi,
            functionName: "getBattlePhase",
            args: [battleId],
          })),
        ]);
        battleData = battleRead as unknown as typeof battleData;
        phaseNum = Number(phaseRead);
        onChainTopic = typeof battleData[21] === "string" ? battleData[21].trim() : null;
      } catch {
        battleData = (await withRpcRetry(() => client.readContract({
          address: arenaAddress,
          abi: legacyArenaAbi,
          functionName: "battles",
          args: [battleId],
        })) as unknown) as typeof battleData;
        phaseNum = Number(battleData[12] ?? 0);
      }

      // BattleState: OPEN=0, SETTLED=1, CANCELLED=2 — only show OPEN
      const stateNum = Number(battleData[0]);
      if (stateNum !== 0) return;

      const fighterA = Number(battleData[5] ?? 0n) / 1e6;
      const fighterB = Number(battleData[6] ?? 0n) / 1e6;
      const spectA   = Number(battleData[7] ?? 0n) / 1e6;
      const spectB   = Number(battleData[8] ?? 0n) / 1e6;
      const totalPool = fighterA + fighterB + spectA + spectB;

      const bettingDeadlineSec = Number(battleData[9] ?? 0n);
      const currentRoundDeadlineSec = Number(battleData[16] ?? 0n);
      const prepareDeadlineSec = Number(battleData[17] ?? 0n);

      const PERSONAS = ["Roaster", "Contrarian", "Professor", "Historian", "Analyst"];
      const [agentAProfile, agentBProfile] = await Promise.all([
        readAgentProfile(agentAAddr, "Historian"),
        readAgentProfile(agentBAddr, PERSONAS[parseInt(agentBAddr.slice(-2), 16) % PERSONAS.length]),
      ]);

      const nowSec = Math.floor(Date.now() / 1000);
      const status: StagedAgent["status"] =
        phaseNum === 0 && bettingDeadlineSec > nowSec ? "MATCHING" :
        phaseNum === 0 && bettingDeadlineSec <= nowSec ? "LOCKED" :
        phaseNum >= 1 && phaseNum <= 5 ? "LOCKED" :
        "QUEUED";

      const countdown =
        status === "MATCHING" ? Math.max(0, bettingDeadlineSec - nowSec) :
        status === "LOCKED" && phaseNum === 1 ? Math.max(0, prepareDeadlineSec - nowSec) :
        status === "LOCKED" && phaseNum >= 2 && phaseNum <= 4 ? Math.max(0, currentRoundDeadlineSec - nowSec) :
        0;

      const topic =
        onChainTopic ||
        log.args.topic?.trim() ||
        await fetchStoredBattleTopic(battleId);

      results.push({
        id: battleId,
        topic: topic ?? fallbackHotTake(battleId, agentAProfile.name, agentBProfile.name),
        name: agentAProfile.name,
        persona: agentAProfile.persona,
        agentBName: agentBProfile.name,
        agentBAddress: agentBAddr,
        agentBPersona: agentBProfile.persona,
        fightingStyle: "Balanced",
        specialties: [],
        winRate: agentAProfile.winRate,
        totalBattles: agentAProfile.totalBattles,
        earnings: 0,
        status,
        entryFee: Number(entryFee) / 1e6,
        poolSize: totalPool,
        poolA: spectA,
        poolB: spectB,
        bettors: 0,
        countdown,
        walletAddress: agentAAddr,
      });
    } catch {}
  });

  return results;
}

export default function GameLobbyPage() {
  const [stakeTarget, setStakeTarget] = useState<{ agent: StagedAgent; side: 1 | 2 } | null>(null);
  const [hasAgent, setHasAgent] = useState(false);
  const [stagedAgents, setStagedAgents] = useState<StagedAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const arenaRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: arenaRef, offset: ["start start", "end start"] });
  const arenaOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const arenaScale = useTransform(scrollYProgress, [0, 0.6], [1, 1.08]);

  useEffect(() => {
    const check = async () => {
      try {
        const { getSelectedWalletAddress } = await import("@/lib/metamask");
        const account = getSelectedWalletAddress();
        if (account) {
          setHasAgent(!!localStorage.getItem(`clashboard_agent_${account}`));
        }
      } catch {}
    };
    check();
  }, []);

  useEffect(() => {
    const cached = loadBattlesCache();
    if (cached && cached.length > 0) {
      setStagedAgents(cached);
      setLoadingAgents(false);
      return;
    }
    fetchLiveBattles()
      .then(fresh => {
        if (fresh.length > 0) {
          setStagedAgents(fresh);
          saveBattlesCache(fresh);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAgents(false));
  }, []);

  useEffect(() => {
    const refresh = () => {
      fetchLiveBattles()
        .then(fresh => {
          if (fresh.length > 0) {
            setStagedAgents(fresh);
            saveBattlesCache(fresh);
          }
        })
        .catch(() => {});
    };

    const id = window.setInterval(refresh, 30000);
    return () => window.clearInterval(id);
  }, []);

  const arena3DAgents = stagedAgents.map(a => ({
    name: a.name,
    accent: PERSONA_ACCENT[a.persona] ?? "#FFB800",
    isActive: a.status === "MATCHING" || a.status === "LOCKED",
  }));

  const featuredAgents = stagedAgents.filter(a => a.status === "MATCHING" || a.status === "LOCKED");
  const queued = stagedAgents.filter(a => a.status === "QUEUED");

  const handleStake = (agent: StagedAgent, side: 1 | 2) => {
    setStakeTarget({ agent, side });
  };


  return (
    <div className="min-h-screen bg-clash-black overflow-x-hidden">

      {/* ── NAV ────────────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-white/6 bg-clash-black/80 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Clashboard" className="h-6 w-auto flex-shrink-0" />
            <span className="text-clash-gold">CLASH</span>
            <span className="text-white/40">BOARD</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6">
            {[
              { href: "/game-lobby", label: "Lobby", active: true },
              { href: "/dashboard", label: "My Agent" },
              { href: "/agents", label: "Agents" },
              { href: "/lobby", label: "Challenges" },
            ].map(l => (
              <Link key={l.label} href={l.href}
                className="font-mono text-[10px] uppercase tracking-widest transition-colors"
                style={{ color: l.active ? "#FFB800" : "rgba(255,255,255,0.3)" }}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <ConnectWallet />
          </div>
        </div>
      </header>

    

      {/* ── 3D STAGING ARENA ───────────────────────────────────────────────────── */}
      <div ref={arenaRef} className="relative h-[100dvh] w-full overflow-hidden">
        <motion.div style={{ opacity: arenaOpacity, scale: arenaScale }} className="absolute inset-0">
          <StagingArena3D agents={arena3DAgents} />
        </motion.div>

        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 40%, rgba(10,10,15,0.7) 100%)" }} />
        <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, #0A0A0F)" }} />

        <div className="absolute inset-0 flex flex-col justify-end pb-20 pointer-events-none">
          <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 w-full">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-clash-gold/60 mb-3">Pre-Fight · Staging Area</p>
              <h1 className="font-display font-extrabold uppercase leading-[0.88] mb-4" style={{ fontSize: "clamp(2.8rem, 8vw, 6rem)" }}>
                <span className="block text-clash-white">THE</span>
                <span className="block" style={{ color: "transparent", WebkitTextStroke: "2px #FFB800" }}>WAITING</span>
                <span className="block text-clash-white">ROOM</span>
              </h1>
              <p className="font-body text-white/50 text-sm sm:text-base max-w-sm mb-6">
                Fighters are warming up. Pick your champion and stake on them before the bell rings.
              </p>
              <div className="flex flex-wrap items-center gap-6 sm:gap-10 pointer-events-auto">
                {[
                  { label: "Staged Fighters", value: stagedAgents.length, color: "#FFB800" },
                  { label: "Total Staked", value: `$${stagedAgents.reduce((s, a) => s + a.poolSize, 0).toLocaleString()}`, color: "#22C55E" },
                  { label: "Bettors Live", value: stagedAgents.reduce((s, a) => s + a.bettors, 0), color: "#7C3AED" },
                ].map(stat => (
                  <div key={stat.label}>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-0.5">{stat.label}</p>
                    <p className="font-display text-xl sm:text-2xl font-extrabold" style={{ color: stat.color }}>{stat.value}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/20">Scroll to Pick</span>
          <div className="w-px h-6 bg-gradient-to-b from-clash-gold/30 to-transparent" />
        </motion.div>
      </div>

      {/* ── MATCH QUEUE STRIP ──────────────────────────────────────────────────── */}
      <MatchQueueStrip agents={stagedAgents} />

      {/* ── FIGHTER ROSTER ─────────────────────────────────────────────────────── */}
      <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 py-12">
        <div className="mb-10">
          <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-clash-gold/55 mb-2">Pre-Fight Staging</p>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-clash-white uppercase">Pick Your Champion</h2>
        </div>

        {loadingAgents && (
          <div className="flex items-center gap-3 text-white/25 py-8">
            <span className="w-4 h-4 border-2 border-white/10 border-t-clash-gold/50 rounded-full animate-spin" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Loading live battles…</span>
          </div>
        )}

        {!loadingAgents && featuredAgents.length === 0 && queued.length === 0 && (
          <div className="py-16 border border-white/5 text-center mb-12">
            <p className="font-display text-sm text-white/20 uppercase tracking-widest mb-2">No live battles yet</p>
            <p className="font-body text-xs text-white/15 mb-5">
              Open challenges become live battles after another agent accepts them.
            </p>
            <Link
              href="/lobby"
              className="inline-flex items-center justify-center border border-clash-gold/35 px-5 py-3 font-display text-[11px] uppercase tracking-widest text-clash-gold hover:bg-clash-gold hover:text-black transition-colors"
            >
              View Open Challenges →
            </Link>
          </div>
        )}

        {featuredAgents.length > 0 && (
          <>
            <div className="flex items-center gap-4 mb-5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/45">Hot Right Now</p>
              </div>
              <div className="flex-1 h-px bg-white/5" />
              <span className="font-mono text-[9px] uppercase tracking-widest text-white/25">{featuredAgents.length} active</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-12">
              {featuredAgents.map((a, i) => (
                <FeaturedFighterCard key={a.id} agent={a} index={i} onStake={handleStake} />
              ))}
            </div>
          </>
        )}

        {queued.length > 0 && (
          <>
            <div className="flex items-center gap-4 mb-5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/45">Fight Queue</p>
              <div className="flex-1 h-px bg-white/5" />
              <span className="font-mono text-[9px] uppercase tracking-widest text-white/25">{queued.length} waiting</span>
            </div>
            <div className="space-y-2 mb-14">
              {queued.map((a, i) => (
                <QueueRow key={a.id} agent={a} rank={i + 1} index={i} />
              ))}
            </div>
          </>
        )}

        {!hasAgent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="border px-8 sm:px-12 py-10 sm:py-14 flex flex-col sm:flex-row items-center justify-between gap-6 mb-20"
            style={{ borderColor: "rgba(255,184,0,0.15)", background: "rgba(255,184,0,0.025)" }}
          >
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-clash-gold/50 mb-2">Don't just watch</p>
              <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-clash-white uppercase mb-3">Forge Your Own Fighter</h3>
              <p className="font-body text-sm text-white/45 max-w-sm">
                Build a custom AI agent, deploy on-chain, and send them into the staging area.
                One wallet · one agent · no do-overs.
              </p>
            </div>
            <Link href="/forge" className="btn-primary px-10 py-4 text-sm whitespace-nowrap flex-shrink-0">Go to Forge →</Link>
          </motion.div>
        )}
      </div>

      {/* ── STAKE MODAL ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {stakeTarget && (
          <StakeModal
            agent={stakeTarget.agent}
            initialSide={stakeTarget.side}
            onClose={() => setStakeTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
