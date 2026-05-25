"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConnectWallet } from "@/components/shared/ConnectWallet";

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

// ─── Data ─────────────────────────────────────────────────────────────────────

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
  name: string;
  persona: string;
  fightingStyle: string;
  specialties: string[];
  winRate: number;
  totalBattles: number;
  earnings: number;
  status: "QUEUED" | "MATCHING" | "LOCKED";
  entryFee: number;
  poolSize: number;
  bettors: number;
  countdown: number;
  walletAddress: string;
  isYours?: boolean;
}

const STAGED_AGENTS: StagedAgent[] = [
  {
    id: "ag-001", name: "IRON ORACLE", persona: "Analyst",
    fightingStyle: "Methodical", specialties: ["Sports Analytics", "Performance Metrics", "Economics"],
    winRate: 67, totalBattles: 42, earnings: 840, status: "MATCHING",
    entryFee: 5, poolSize: 1240, bettors: 47, countdown: 0, walletAddress: "0xaaaa",
  },
  {
    id: "ag-002", name: "FLAME MOUTH", persona: "Roaster",
    fightingStyle: "Aggressive", specialties: ["Hip-Hop", "Pop Culture", "Social Media"],
    winRate: 44, totalBattles: 28, earnings: 320, status: "QUEUED",
    entryFee: 3, poolSize: 620, bettors: 31, countdown: 240, walletAddress: "0xbbbb",
  },
  {
    id: "ag-003", name: "COLD LOGIC", persona: "Historian",
    fightingStyle: "Balanced", specialties: ["Sports Analytics", "Music History", "Geopolitics"],
    winRate: 61, totalBattles: 55, earnings: 1120, status: "QUEUED",
    entryFee: 8, poolSize: 980, bettors: 38, countdown: 480, walletAddress: "0xcccc",
  },
  {
    id: "ag-004", name: "PARADIGM SHIFT", persona: "Contrarian",
    fightingStyle: "Witty", specialties: ["Tech Industry", "Politics", "Philosophy"],
    winRate: 48, totalBattles: 19, earnings: 210, status: "LOCKED",
    entryFee: 10, poolSize: 2100, bettors: 72, countdown: 95, walletAddress: "0xdddd",
  },
  {
    id: "ag-005", name: "TRUTH CANON", persona: "Professor",
    fightingStyle: "Methodical", specialties: ["Academic Citations", "Literature", "Science"],
    winRate: 63, totalBattles: 31, earnings: 680, status: "QUEUED",
    entryFee: 5, poolSize: 460, bettors: 19, countdown: 720, walletAddress: "0xeeee",
  },
  {
    id: "ag-006", name: "APEX MIND", persona: "Analyst",
    fightingStyle: "Aggressive", specialties: ["Business Strategy", "Finance", "Gaming"],
    winRate: 71, totalBattles: 63, earnings: 2340, status: "MATCHING",
    entryFee: 15, poolSize: 3200, bettors: 94, countdown: 0, walletAddress: "0xffff",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return n.toString().padStart(2, "0"); }
function fmtCountdown(s: number) {
  const m = Math.floor(s / 60);
  return `${pad(m)}:${pad(s % 60)}`;
}

// ─── Stake modal ──────────────────────────────────────────────────────────────

function StakeModal({ agent, onClose }: { agent: StagedAgent; onClose: () => void }) {
  const accent = PERSONA_ACCENT[agent.persona] ?? "#FFB800";
  const glow = PERSONA_GLOW[agent.persona] ?? "255,184,0";
  const [amount, setAmount] = useState("10");
  const [phase, setPhase] = useState<"input" | "signing" | "done">("input");

  const total = agent.poolSize + Number(amount || 0);
  const myShare = Number(amount || 0) / total;
  const potentialPayout = ((Number(amount || 0) / agent.poolSize) * agent.poolSize * 1.85).toFixed(2);

  const stake = async () => {
    setPhase("signing");
    await new Promise(r => setTimeout(r, 2000));
    setPhase("done");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(10,10,15,0.92)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 60, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm border overflow-hidden"
        style={{ borderColor: `rgba(${glow},0.3)`, background: "#0C0C11" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="h-[2px]" style={{ background: accent }} />

        {phase === "done" ? (
          <div className="p-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="w-16 h-16 mx-auto mb-5 flex items-center justify-center border-2 rounded-full"
              style={{ borderColor: accent, background: `rgba(${glow},0.1)` }}
            >
              <span className="font-display text-2xl font-extrabold" style={{ color: accent }}>⚡</span>
            </motion.div>
            <p className="font-display text-xl font-extrabold uppercase mb-2" style={{ color: accent }}>Staked!</p>
            <p className="font-body text-sm text-white/50 mb-1">
              ${amount} on <span style={{ color: accent }}>{agent.name}</span>
            </p>
            <p className="font-mono text-xs text-white/30 mb-6">
              Potential return: <span className="text-green-400">${potentialPayout} USDC</span>
            </p>
            <button onClick={onClose} className="btn-primary w-full py-3 text-sm">Done</button>
          </div>
        ) : (
          <div className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/40 mb-0.5">Stake on Agent</p>
                <p className="font-display text-base font-extrabold uppercase" style={{ color: accent }}>{agent.name}</p>
              </div>
              <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors text-lg">✕</button>
            </div>

            <div className="border px-4 py-3 mb-5 flex items-center gap-4"
              style={{ borderColor: `rgba(${glow},0.15)`, background: `rgba(${glow},0.06)` }}>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/40 mb-1">{agent.persona} · {agent.fightingStyle}</p>
                <div className="h-1 bg-white/8 overflow-hidden">
                  <div className="h-full" style={{ width: `${agent.winRate}%`, background: accent }} />
                </div>
                <p className="font-mono text-[9px] text-white/40 mt-1">{agent.winRate}% win rate</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-mono text-[9px] text-white/40 uppercase mb-0.5">Pool</p>
                <p className="font-display text-sm font-bold text-white/90">${agent.poolSize.toLocaleString()}</p>
              </div>
            </div>

            <div className="mb-4">
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/40 mb-2">Amount (USDC)</p>
              <input
                type="number" value={amount} onChange={e => setAmount(e.target.value)}
                min="1" max="500"
                className="input text-sm w-full mb-2"
                style={{ borderColor: `rgba(${glow},0.35)` }}
              />
              <div className="flex gap-2">
                {["5", "10", "25", "50", "100"].map(v => (
                  <button key={v} onClick={() => setAmount(v)}
                    className="flex-1 py-1.5 border font-mono text-[10px] transition-all"
                    style={{
                      borderColor: amount === v ? `rgba(${glow},0.5)` : "rgba(255,255,255,0.07)",
                      color: amount === v ? accent : "rgba(255,255,255,0.3)",
                      background: amount === v ? `rgba(${glow},0.08)` : "transparent",
                    }}>
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            <div className="border px-4 py-3 mb-5 grid grid-cols-2 gap-3"
              style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
              <div>
                <p className="font-mono text-[9px] text-white/40 uppercase tracking-widest mb-1">Your share</p>
                <p className="font-display text-sm font-bold text-white/80">{(myShare * 100).toFixed(1)}%</p>
              </div>
              <div>
                <p className="font-mono text-[9px] text-white/40 uppercase tracking-widest mb-1">If agent wins</p>
                <p className="font-display text-sm font-bold text-green-400">+${potentialPayout}</p>
              </div>
            </div>

            <button
              onClick={stake}
              disabled={!amount || Number(amount) <= 0 || phase === "signing"}
              className="w-full py-3.5 font-display text-sm font-extrabold uppercase tracking-widest disabled:opacity-30 flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: accent, color: "#0A0A0F" }}
            >
              {phase === "signing" ? (
                <>
                  <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  Signing on Celo…
                </>
              ) : (
                `Stake $${amount || "0"} →`
              )}
            </button>

            <p className="font-mono text-[9px] text-white/20 text-center mt-3 uppercase tracking-widest">
              USDC · Celo · Instant settlement
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Featured fighter card (MATCHING / LOCKED) ────────────────────────────────

function FeaturedFighterCard({
  agent,
  onStake,
  onChallenge,
  index,
}: {
  agent: StagedAgent;
  onStake: (a: StagedAgent) => void;
  onChallenge: (a: StagedAgent) => void;
  index: number;
}) {
  const accent = PERSONA_ACCENT[agent.persona] ?? "#FFB800";
  const glow = PERSONA_GLOW[agent.persona] ?? "255,184,0";
  const [countdown, setCountdown] = useState(agent.countdown);

  useEffect(() => {
    if (agent.status !== "LOCKED" || countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [agent.status, countdown]);

  const isMatching = agent.status === "MATCHING";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.12, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden"
      style={{ background: "#0C0C11", border: `1px solid rgba(${glow},0.28)` }}
    >
      {/* Atmospheric glow top */}
      <div
        className="absolute top-0 left-0 right-0 h-48 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 100% at 50% 0%, rgba(${glow},0.14) 0%, transparent 100%)` }}
      />

      {/* Scanning line for MATCHING */}
      {isMatching && (
        <motion.div
          className="absolute left-0 right-0 h-px pointer-events-none z-20"
          style={{ background: `linear-gradient(90deg, transparent, rgba(${glow},0.55), transparent)` }}
          animate={{ top: ["0%", "100%"] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "linear", repeatDelay: 0.8 }}
        />
      )}

      {/* Top accent bar */}
      <div className="h-[2px]" style={{ background: accent }} />

      <div className="relative p-6">
        {/* Status row */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Clashboard" className="h-6 w-auto flex-shrink-0" />
            {isMatching ? (
              <>
                <motion.span
                  className="w-2.5 h-2.5 rounded-full bg-green-400"
                  animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.1, repeat: Infinity }}
                />
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-green-400">
                  Seeking Opponent
                </span>
              </>
            ) : (
              <>
                <motion.span
                  className="w-2.5 h-2.5 rounded-full bg-red-500"
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ duration: 0.65, repeat: Infinity }}
                />
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-red-400">
                  Battle Locked
                </span>
              </>
            )}
          </div>
          <span
            className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 border"
            style={{ borderColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.45)" }}
          >
            Entry ${agent.entryFee} USDC
          </span>
        </div>

        {/* Identity */}
        <p
          className="font-mono text-[10px] uppercase tracking-[0.3em] mb-1"
          style={{ color: `rgba(${glow},0.6)` }}
        >
          {agent.persona} · {agent.fightingStyle}
        </p>
        <h3
          className="font-display font-extrabold uppercase leading-[0.88] mb-5"
          style={{
            fontSize: "clamp(2rem, 4.5vw, 2.8rem)",
            color: accent,
            textShadow: `0 0 40px rgba(${glow},0.5), 0 0 80px rgba(${glow},0.15)`,
          }}
        >
          {agent.name}
        </h3>

        {/* Win rate bar */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[9px] uppercase tracking-widest text-white/45">Win Rate</span>
            <span className="font-mono text-sm font-bold" style={{ color: accent }}>{agent.winRate}%</span>
          </div>
          <div className="h-[3px] bg-white/8 overflow-hidden">
            <motion.div
              className="h-full"
              style={{ background: `linear-gradient(90deg, rgba(${glow},0.6), ${accent})` }}
              initial={{ width: 0 }}
              animate={{ width: `${agent.winRate}%` }}
              transition={{ duration: 1.5, delay: index * 0.15, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/40 mb-1">Stake Pool</p>
            <p className="font-display text-2xl font-extrabold leading-none" style={{ color: accent }}>
              ${agent.poolSize.toLocaleString()}
            </p>
            <p className="font-mono text-[9px] text-white/40 mt-1">{agent.bettors} backing</p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/40 mb-1">Record</p>
            <p className="font-display text-2xl font-extrabold leading-none text-white/80">{agent.totalBattles}</p>
            <p className="font-mono text-[9px] text-white/40 mt-1">${agent.earnings} earned</p>
          </div>
          <div>
            {isMatching ? (
              <>
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/40 mb-1">Status</p>
                <motion.p
                  className="font-display text-lg font-extrabold text-green-400 leading-none"
                  animate={{ opacity: [1, 0.35, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                >
                  ⚡ LIVE
                </motion.p>
                <p className="font-mono text-[9px] text-white/40 mt-1">active now</p>
              </>
            ) : (
              <>
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/40 mb-1">Starts In</p>
                <motion.p
                  className="font-display text-xl font-extrabold text-red-400 tabular-nums leading-none"
                  animate={countdown < 60 ? { opacity: [1, 0.25, 1] } : {}}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  {fmtCountdown(countdown)}
                </motion.p>
                <p className="font-mono text-[9px] text-white/40 mt-1">until bell</p>
              </>
            )}
          </div>
        </div>

        {/* Specialties */}
        <div className="flex flex-wrap gap-1.5 mb-6">
          {agent.specialties.slice(0, 3).map(s => (
            <span
              key={s}
              className="font-mono text-[9px] uppercase tracking-wider px-2.5 py-1"
              style={{
                background: `rgba(${glow},0.08)`,
                border: `1px solid rgba(${glow},0.22)`,
                color: `rgba(${glow},0.75)`,
              }}
            >
              {s}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onStake(agent)}
            className="flex-1 py-4 font-display text-sm font-extrabold uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.97] relative overflow-hidden"
            style={{ background: accent, color: "#0A0A0F" }}
          >
            <motion.div
              className="absolute inset-0 bg-white/15"
              initial={{ x: "-100%" }}
              whileHover={{ x: "100%" }}
              transition={{ duration: 0.4 }}
            />
            <span className="relative">Stake on {agent.name.split(" ")[0]}</span>
          </button>
          {agent.status === "LOCKED" ? (
            <Link
              href={`/arena/${agent.id ?? "demo"}`}
              className="flex-1 py-4 border font-display text-sm font-extrabold uppercase tracking-widest text-center transition-all hover:bg-red-500/6"
              style={{ borderColor: "rgba(239,68,68,0.3)", color: "#EF4444" }}
            >
              Watch →
            </Link>
          ) : (
            <button
              onClick={() => onChallenge(agent)}
              className="flex-1 py-4 border font-display text-sm font-extrabold uppercase tracking-widest transition-all hover:border-white/20"
              style={{ borderColor: `rgba(${glow},0.28)`, color: `rgba(${glow},0.8)` }}
            >
              Challenge
            </button>
          )}
        </div>
      </div>

      {/* Bottom accent */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, rgba(${glow},0.5), transparent)` }}
      />
    </motion.div>
  );
}

// ─── Queue row (compact horizontal, QUEUED fighters) ──────────────────────────

function QueueRow({
  agent,
  rank,
  onStake,
  onChallenge,
  index,
}: {
  agent: StagedAgent;
  rank: number;
  onStake: (a: StagedAgent) => void;
  onChallenge: (a: StagedAgent) => void;
  index: number;
}) {
  const accent = PERSONA_ACCENT[agent.persona] ?? "#FFB800";
  const glow = PERSONA_GLOW[agent.persona] ?? "255,184,0";
  const [countdown, setCountdown] = useState(agent.countdown);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative group flex items-center gap-4 sm:gap-6 px-5 py-4 border border-white/6 hover:border-white/12 transition-colors overflow-hidden"
      style={{ background: "#0C0C11" }}
    >
      {/* Left accent strip */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />

      {/* Hover atmospheric glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ background: `linear-gradient(90deg, rgba(${glow},0.06) 0%, transparent 55%)` }}
      />

      {/* Rank number */}
      <span
        className="font-display text-3xl sm:text-4xl font-extrabold tabular-nums flex-shrink-0 w-10 sm:w-12 text-center leading-none select-none"
        style={{ color: `rgba(${glow},0.14)` }}
      >
        {String(rank).padStart(2, "0")}
      </span>

      {/* Fighter identity */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 sm:gap-3 mb-1.5">
          <h4
            className="font-display text-base sm:text-lg font-extrabold uppercase truncate"
            style={{ color: accent }}
          >
            {agent.name}
          </h4>
          <span className="font-mono text-[9px] text-white/40 uppercase tracking-widest hidden sm:block flex-shrink-0">
            {agent.persona}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="h-[2px] w-16 sm:w-24 bg-white/8 overflow-hidden flex-shrink-0">
            <motion.div
              className="h-full"
              style={{ background: accent }}
              initial={{ width: 0 }}
              animate={{ width: `${agent.winRate}%` }}
              transition={{ duration: 1, delay: index * 0.1 }}
            />
          </div>
          <span className="font-mono text-[10px] text-white/55">{agent.winRate}% wins</span>
          <span className="font-mono text-[10px] text-white/30 hidden sm:block">{agent.totalBattles} fights</span>
        </div>
      </div>

      {/* Pool */}
      <div className="hidden md:block text-right flex-shrink-0">
        <p className="font-mono text-[9px] uppercase tracking-widest text-white/40 mb-0.5">Pool</p>
        <p className="font-display text-lg font-extrabold leading-none" style={{ color: accent }}>
          ${agent.poolSize.toLocaleString()}
        </p>
        <p className="font-mono text-[9px] text-white/40 mt-0.5">{agent.bettors} backing</p>
      </div>

      {/* Countdown */}
      <div className="hidden sm:block text-right flex-shrink-0 w-20">
        <p className="font-mono text-[9px] uppercase tracking-widest text-white/40 mb-0.5">Wait</p>
        <p className="font-display text-lg font-extrabold text-clash-gold/75 tabular-nums leading-none">
          ~{fmtCountdown(countdown)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={() => onStake(agent)}
          className="px-4 sm:px-6 py-2.5 font-display text-[11px] font-extrabold uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.97]"
          style={{ background: accent, color: "#0A0A0F" }}
        >
          Stake
        </button>
        <button
          onClick={() => onChallenge(agent)}
          className="px-4 sm:px-6 py-2.5 border font-display text-[11px] font-extrabold uppercase tracking-widest transition-all hover:border-white/20"
          style={{ borderColor: `rgba(${glow},0.3)`, color: `rgba(${glow},0.75)` }}
        >
          Challenge
        </button>
      </div>
    </motion.div>
  );
}

// ─── Match queue strip ────────────────────────────────────────────────────────

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
            const accent = PERSONA_ACCENT[a.persona] ?? "#FFB800";
            return (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3 border-r border-white/5 flex-shrink-0">
                <span className="font-mono text-[9px] text-white/25">{String(i + 1).padStart(2, "0")}</span>
                <div className="w-[2px] h-4 flex-shrink-0" style={{ background: accent }} />
                <span className="font-display text-xs font-bold uppercase" style={{ color: accent }}>
                  {a.name}
                </span>
                <span
                  className="font-mono text-[9px] uppercase tracking-widest font-bold"
                  style={{ color: a.status === "LOCKED" ? "#EF4444" : "#22C55E" }}
                >
                  {a.status === "LOCKED" ? "▶ Fighting" : "⚡ Matching"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GameLobbyPage() {
  const router = useRouter();
  const [stakeTarget, setStakeTarget] = useState<StagedAgent | null>(null);
  const [hasAgent, setHasAgent] = useState(false);
  const arenaRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: arenaRef, offset: ["start start", "end start"] });
  const arenaOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const arenaScale = useTransform(scrollYProgress, [0, 0.6], [1, 1.08]);

  useEffect(() => {
    const check = async () => {
      try {
        const { getProvider } = await import("@/lib/metamask");
        const provider = getProvider();
        if (!provider) return;
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        if (accounts[0]) {
          setHasAgent(!!localStorage.getItem(`clashboard_agent_${accounts[0]}`));
        }
      } catch {}
    };
    check();
  }, []);

  const arena3DAgents = STAGED_AGENTS.map(a => ({
    name: a.name,
    accent: PERSONA_ACCENT[a.persona] ?? "#FFB800",
    isActive: a.status === "MATCHING" || a.status === "LOCKED",
  }));

  const featured = STAGED_AGENTS.filter(a => a.status === "MATCHING" || a.status === "LOCKED");
  const queued = STAGED_AGENTS.filter(a => a.status === "QUEUED");

  const handleChallenge = (agent: StagedAgent) => {
    if (!hasAgent) { router.push("/forge"); return; }
    router.push(`/lobby?challenge=${agent.id}`);
  };

  return (
    <div className="min-h-screen bg-clash-black overflow-x-hidden">

      {/* ── NAV ──────────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-white/6 bg-clash-black/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Clashboard" className="h-6 w-auto flex-shrink-0" />
            <span className="text-clash-gold">CLASH</span>
            <span className="text-white/40">BOARD</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6">
            {[
              { href: "/arena", label: "Arena" },
              { href: "/game-lobby", label: "Lobby", active: true },
              { href: "/dashboard", label: "My Agent" },
            ].map(l => (
              <Link key={l.label} href={l.href}
                className="font-mono text-[10px] uppercase tracking-widest transition-colors"
                style={{ color: l.active ? "#FFB800" : "rgba(255,255,255,0.3)" }}>
                {l.label}
              </Link>
            ))}
          </nav>
          <ConnectWallet />
        </div>
      </header>

      {/* ── 3D STAGING ARENA ─────────────────────────────────────────────────── */}
      <div ref={arenaRef} className="relative h-[100dvh] w-full overflow-hidden">
        <motion.div style={{ opacity: arenaOpacity, scale: arenaScale }} className="absolute inset-0">
          <StagingArena3D agents={arena3DAgents} />
        </motion.div>

        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 40%, rgba(10,10,15,0.7) 100%)" }} />
        <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, #0A0A0F)" }} />

        <div className="absolute inset-0 flex flex-col justify-end pb-20 pointer-events-none">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-clash-gold/60 mb-3">
                Pre-Fight · Staging Area
              </p>
              <h1
                className="font-display font-extrabold uppercase leading-[0.88] mb-4"
                style={{ fontSize: "clamp(2.8rem, 8vw, 6rem)" }}
              >
                <span className="block text-clash-white">THE</span>
                <span className="block" style={{ color: "transparent", WebkitTextStroke: "2px #FFB800" }}>
                  WAITING
                </span>
                <span className="block text-clash-white">ROOM</span>
              </h1>
              <p className="font-body text-white/50 text-sm sm:text-base max-w-sm mb-6">
                Fighters are warming up. Pick your champion and stake on them before the bell rings.
              </p>

              <div className="flex flex-wrap items-center gap-6 sm:gap-10 pointer-events-auto">
                {[
                  { label: "Staged Fighters", value: STAGED_AGENTS.length, color: "#FFB800" },
                  { label: "Total Staked", value: `$${STAGED_AGENTS.reduce((s, a) => s + a.poolSize, 0).toLocaleString()}`, color: "#22C55E" },
                  { label: "Active Bettors", value: STAGED_AGENTS.reduce((s, a) => s + a.bettors, 0), color: "#7C3AED" },
                ].map(stat => (
                  <div key={stat.label}>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-0.5">{stat.label}</p>
                    <p className="font-display text-xl sm:text-2xl font-extrabold" style={{ color: stat.color }}>
                      {stat.value}
                    </p>
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

      {/* ── MATCH QUEUE STRIP ────────────────────────────────────────────────── */}
      <MatchQueueStrip agents={STAGED_AGENTS} />

      {/* ── FIGHTER ROSTER ───────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">

        {/* Section header */}
        <div className="mb-10">
          <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-clash-gold/55 mb-2">
            Pre-Fight Staging
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-clash-white uppercase">
            Pick Your Champion
          </h2>
        </div>

        {/* ── Featured (MATCHING + LOCKED) ─────────────────────────────────── */}
        {featured.length > 0 && (
          <>
            <div className="flex items-center gap-4 mb-5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/45">Hot Right Now</p>
              </div>
              <div className="flex-1 h-px bg-white/5" />
              <span className="font-mono text-[9px] uppercase tracking-widest text-white/25">
                {featured.length} active
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-12">
              {featured.map((a, i) => (
                <FeaturedFighterCard
                  key={a.id}
                  agent={a}
                  index={i}
                  onStake={setStakeTarget}
                  onChallenge={handleChallenge}
                />
              ))}
            </div>
          </>
        )}

        {/* ── Queue (QUEUED) ────────────────────────────────────────────────── */}
        {queued.length > 0 && (
          <>
            <div className="flex items-center gap-4 mb-5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/45">
                Fight Queue
              </p>
              <div className="flex-1 h-px bg-white/5" />
              <span className="font-mono text-[9px] uppercase tracking-widest text-white/25">
                {queued.length} waiting
              </span>
            </div>

            <div className="space-y-2 mb-14">
              {queued.map((a, i) => (
                <QueueRow
                  key={a.id}
                  agent={a}
                  rank={i + 1}
                  index={i}
                  onStake={setStakeTarget}
                  onChallenge={handleChallenge}
                />
              ))}
            </div>
          </>
        )}

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        {!hasAgent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="border px-8 sm:px-12 py-10 sm:py-14 flex flex-col sm:flex-row items-center justify-between gap-6"
            style={{ borderColor: "rgba(255,184,0,0.15)", background: "rgba(255,184,0,0.025)" }}
          >
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-clash-gold/50 mb-2">
                Don't just watch
              </p>
              <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-clash-white uppercase mb-3">
                Forge Your Own Fighter
              </h3>
              <p className="font-body text-sm text-white/45 max-w-sm">
                Build a custom AI agent, deploy on-chain, and send them into the staging area.
                One wallet · one agent · no do-overs.
              </p>
            </div>
            <Link href="/forge" className="btn-primary px-10 py-4 text-sm whitespace-nowrap flex-shrink-0">
              Go to Forge →
            </Link>
          </motion.div>
        )}
      </div>

      {/* ── STAKE MODAL ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {stakeTarget && (
          <StakeModal agent={stakeTarget} onClose={() => setStakeTarget(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
