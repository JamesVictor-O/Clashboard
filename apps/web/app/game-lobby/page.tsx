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

const PERSONA_ICONS: Record<string, string> = {
  Historian: "📜", Analyst: "📊", Roaster: "🔥", Contrarian: "🌀", Professor: "🎓",
};
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
  countdown: number;        // seconds until match
  walletAddress: string;
  isYours?: boolean;
}

const STAGED_AGENTS: StagedAgent[] = [
  {
    id: "ag-001", name: "IRON ORACLE", persona: "Analyst",
    fightingStyle: "Methodical", specialties: ["Sports Analytics", "Performance Metrics", "Economics"],
    winRate: 67, totalBattles: 42, earnings: 840, status: "MATCHING",
    entryFee: 5, poolSize: 1240, bettors: 47, countdown: 0,
    walletAddress: "0xaaaa",
  },
  {
    id: "ag-002", name: "FLAME MOUTH", persona: "Roaster",
    fightingStyle: "Aggressive", specialties: ["Hip-Hop", "Pop Culture", "Social Media"],
    winRate: 44, totalBattles: 28, earnings: 320, status: "QUEUED",
    entryFee: 3, poolSize: 620, bettors: 31, countdown: 240,
    walletAddress: "0xbbbb",
  },
  {
    id: "ag-003", name: "COLD LOGIC", persona: "Historian",
    fightingStyle: "Balanced", specialties: ["Sports Analytics", "Music History", "Geopolitics"],
    winRate: 61, totalBattles: 55, earnings: 1120, status: "QUEUED",
    entryFee: 8, poolSize: 980, bettors: 38, countdown: 480,
    walletAddress: "0xcccc",
  },
  {
    id: "ag-004", name: "PARADIGM SHIFT", persona: "Contrarian",
    fightingStyle: "Witty", specialties: ["Tech Industry", "Politics", "Philosophy"],
    winRate: 48, totalBattles: 19, earnings: 210, status: "LOCKED",
    entryFee: 10, poolSize: 2100, bettors: 72, countdown: 95,
    walletAddress: "0xdddd",
  },
  {
    id: "ag-005", name: "TRUTH CANON", persona: "Professor",
    fightingStyle: "Methodical", specialties: ["Academic Citations", "Literature", "Science"],
    winRate: 63, totalBattles: 31, earnings: 680, status: "QUEUED",
    entryFee: 5, poolSize: 460, bettors: 19, countdown: 720,
    walletAddress: "0xeeee",
  },
  {
    id: "ag-006", name: "APEX MIND", persona: "Analyst",
    fightingStyle: "Aggressive", specialties: ["Business Strategy", "Finance", "Gaming"],
    winRate: 71, totalBattles: 63, earnings: 2340, status: "MATCHING",
    entryFee: 15, poolSize: 3200, bettors: 94, countdown: 0,
    walletAddress: "0xffff",
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
      style={{ background: "rgba(10,10,15,0.9)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 60, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm border overflow-hidden"
        style={{ borderColor: `${accent}30`, background: "#0A0A0F" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Accent top bar */}
        <div className="h-1" style={{ background: accent }} />

        {phase === "done" ? (
          <div className="p-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="text-5xl mb-5"
            >
              ⚡
            </motion.div>
            <p className="font-display text-xl font-extrabold uppercase mb-2" style={{ color: accent }}>
              Staked!
            </p>
            <p className="font-body text-sm text-white/40 mb-2">
              ${amount} on <span style={{ color: accent }}>{agent.name}</span>
            </p>
            <p className="font-mono text-xs text-white/25 mb-6">
              Potential return: <span className="text-green-400">${potentialPayout}</span>
            </p>
            <button onClick={onClose} className="btn-primary w-full py-3 text-sm">Done</button>
          </div>
        ) : (
          <div className="p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-0.5">Stake on Agent</p>
                <p className="font-display text-base font-extrabold uppercase" style={{ color: accent }}>
                  {agent.name}
                </p>
              </div>
              <button onClick={onClose} className="text-white/20 hover:text-white/50 transition-colors text-lg">✕</button>
            </div>

            {/* Agent mini card */}
            <div className="border border-white/6 p-3 mb-5 flex items-center gap-3"
              style={{ background: `rgba(${glow},0.06)` }}>
              <span className="text-2xl">{PERSONA_ICONS[agent.persona]}</span>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/30">{agent.persona} · {agent.fightingStyle}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1 flex-1 bg-white/8 overflow-hidden">
                    <div className="h-full" style={{ width: `${agent.winRate}%`, background: accent }} />
                  </div>
                  <span className="font-mono text-[10px] font-bold" style={{ color: accent }}>{agent.winRate}% W</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-mono text-[9px] text-white/25 uppercase">Pool</p>
                <p className="font-display text-sm font-bold text-clash-white">${agent.poolSize.toLocaleString()}</p>
              </div>
            </div>

            {/* Amount */}
            <div className="mb-4">
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-2">Amount (USDC)</p>
              <div className="flex gap-2 mb-2">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  min="1" max="500"
                  className="input text-sm flex-1"
                  style={{ borderColor: `${accent}40` }}
                />
              </div>
              <div className="flex gap-2">
                {["5", "10", "25", "50", "100"].map(v => (
                  <button key={v} onClick={() => setAmount(v)}
                    className="flex-1 py-1.5 border font-mono text-[10px] transition-all"
                    style={{
                      borderColor: amount === v ? `${accent}50` : "rgba(255,255,255,0.06)",
                      color: amount === v ? accent : "rgba(255,255,255,0.2)",
                      background: amount === v ? `rgba(${glow},0.08)` : "transparent",
                    }}>
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            {/* Payout preview */}
            <div className="border border-white/6 p-3 mb-5 grid grid-cols-2 gap-3"
              style={{ background: "rgba(255,255,255,0.02)" }}>
              <div>
                <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-1">Your share</p>
                <p className="font-display text-sm font-bold text-clash-white">
                  {(myShare * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-1">If agent wins</p>
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

            <p className="font-mono text-[9px] text-white/15 text-center mt-3 uppercase tracking-widest">
              USDC · Celo · Instant settlement
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({
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
    if (agent.status !== "QUEUED" || countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [agent.status, countdown]);

  const statusLabel = {
    QUEUED: "In Queue",
    MATCHING: "Finding Opponent",
    LOCKED: "Battle Locked",
  }[agent.status];

  const statusColor = {
    QUEUED: "#FFB800",
    MATCHING: "#22C55E",
    LOCKED: "#EF4444",
  }[agent.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3 }}
      className="relative border overflow-hidden group cursor-default"
      style={{
        borderColor: agent.isYours ? `${accent}50` : "rgba(255,255,255,0.08)",
        background: `linear-gradient(135deg, rgba(${glow},0.07) 0%, rgba(10,10,15,0.95) 60%)`,
      }}
    >
      {/* Top accent line */}
      <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />

      {/* Glow sweep on hover */}
      <motion.div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `radial-gradient(ellipse 80% 80% at 50% -20%, rgba(${glow},0.12) 0%, transparent 70%)` }}
      />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 flex items-center justify-center text-xl border flex-shrink-0"
              style={{ borderColor: `${accent}35`, background: `rgba(${glow},0.12)` }}
            >
              {PERSONA_ICONS[agent.persona] ?? "🤖"}
            </div>
            <div>
              <p className="font-display text-sm font-extrabold uppercase leading-tight" style={{ color: accent }}>
                {agent.name}
              </p>
              <p className="font-mono text-[9px] text-white/30 uppercase tracking-widest">{agent.persona}</p>
            </div>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: statusColor }} />
            <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: statusColor }}>
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Win rate bar */}
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-white/25">Win Rate</span>
            <span className="font-mono text-[10px] font-bold" style={{ color: accent }}>{agent.winRate}%</span>
          </div>
          <div className="h-1 bg-white/6 overflow-hidden">
            <motion.div
              className="h-full"
              style={{ background: accent }}
              initial={{ width: 0 }}
              animate={{ width: `${agent.winRate}%` }}
              transition={{ duration: 1, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: "Battles", value: agent.totalBattles },
            { label: "Earned", value: `$${agent.earnings}` },
            { label: "Entry", value: `$${agent.entryFee}` },
          ].map(s => (
            <div key={s.label} className="border border-white/5 px-2 py-1.5 text-center"
              style={{ background: "rgba(255,255,255,0.02)" }}>
              <p className="font-mono text-[8px] uppercase tracking-widest text-white/20 mb-0.5">{s.label}</p>
              <p className="font-display text-xs font-bold text-clash-white">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Specialties */}
        <div className="flex flex-wrap gap-1 mb-3">
          {agent.specialties.slice(0, 2).map(s => (
            <span key={s} className="font-mono text-[8px] uppercase tracking-widest px-2 py-0.5 border"
              style={{ borderColor: `rgba(${glow},0.2)`, color: `rgba(${glow},0.7)` }}>
              {s}
            </span>
          ))}
        </div>

        {/* Pool + countdown */}
        <div className="flex items-center justify-between mb-3 border border-white/5 px-3 py-2"
          style={{ background: "rgba(255,255,255,0.02)" }}>
          <div>
            <p className="font-mono text-[8px] uppercase tracking-widest text-white/20">Stake Pool</p>
            <p className="font-display text-sm font-bold" style={{ color: accent }}>
              ${agent.poolSize.toLocaleString()}
            </p>
            <p className="font-mono text-[8px] text-white/20">{agent.bettors} bettors</p>
          </div>
          <div className="text-right">
            {agent.status === "LOCKED" ? (
              <>
                <p className="font-mono text-[8px] uppercase tracking-widest text-white/20">Starts</p>
                <p className="font-display text-lg font-extrabold text-red-400 tabular-nums">
                  {fmtCountdown(countdown)}
                </p>
              </>
            ) : agent.status === "QUEUED" ? (
              <>
                <p className="font-mono text-[8px] uppercase tracking-widest text-white/20">In Queue</p>
                <p className="font-display text-sm font-bold text-clash-gold tabular-nums">
                  ~{fmtCountdown(countdown)}
                </p>
              </>
            ) : (
              <>
                <p className="font-mono text-[8px] uppercase tracking-widest text-white/20">Matching</p>
                <motion.p
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="font-display text-sm font-bold text-green-400"
                >
                  ⚡ LIVE
                </motion.p>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onStake(agent)}
            className="flex-1 py-2.5 font-display text-[11px] font-extrabold uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.97]"
            style={{ background: accent, color: "#0A0A0F" }}
          >
            Stake
          </button>
          {agent.status !== "LOCKED" && (
            <button
              onClick={() => onChallenge(agent)}
              className="flex-1 py-2.5 border font-display text-[11px] font-extrabold uppercase tracking-widest transition-all hover:border-white/25"
              style={{ borderColor: `${accent}30`, color: `rgba(${glow},0.8)` }}
            >
              Challenge
            </button>
          )}
          {agent.status === "LOCKED" && (
            <Link
              href={`/arena/${agent.id}`}
              className="flex-1 py-2.5 border border-red-500/30 text-red-400 font-display text-[11px] font-extrabold uppercase tracking-widest text-center hover:bg-red-500/8 transition-all"
            >
              Watch
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Marquee queue strip ──────────────────────────────────────────────────────

function MatchQueueStrip({ agents }: { agents: StagedAgent[] }) {
  const locked = agents.filter(a => a.status === "LOCKED");
  const matching = agents.filter(a => a.status === "MATCHING");

  return (
    <div className="border-y border-white/6 bg-clash-dim/30 overflow-hidden">
      <div className="flex items-center">
        <div className="flex-shrink-0 px-4 py-2.5 border-r border-white/6 bg-clash-black/40">
          <span className="font-mono text-[9px] uppercase tracking-widest text-clash-gold/70">Match Queue</span>
        </div>
        <div className="flex items-center gap-8 px-6 py-2.5 overflow-x-auto scrollbar-none">
          {[...locked, ...matching].map((a, i) => {
            const accent = PERSONA_ACCENT[a.persona] ?? "#FFB800";
            return (
              <div key={a.id} className="flex items-center gap-3 flex-shrink-0">
                <span className="font-mono text-[9px] text-white/20">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-display text-xs font-bold uppercase" style={{ color: accent }}>{a.name}</span>
                <span className="font-mono text-[9px] uppercase tracking-widest"
                  style={{ color: a.status === "LOCKED" ? "#EF4444" : "#22C55E" }}>
                  {a.status === "LOCKED" ? "▶ Fighting" : "⚡ Matching"}
                </span>
                {i < locked.length + matching.length - 1 && (
                  <span className="text-white/10">·</span>
                )}
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
  const [filter, setFilter] = useState<"ALL" | "QUEUED" | "MATCHING" | "LOCKED">("ALL");
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
    name: a.name, accent: PERSONA_ACCENT[a.persona] ?? "#FFB800",
    isActive: a.status === "MATCHING" || a.status === "LOCKED",
  }));

  const filtered = STAGED_AGENTS.filter(a => filter === "ALL" || a.status === filter);

  const handleChallenge = (agent: StagedAgent) => {
    if (!hasAgent) { router.push("/forge"); return; }
    router.push(`/lobby?challenge=${agent.id}`);
  };

  return (
    <div className="min-h-screen bg-clash-black overflow-x-hidden">
      {/* ── NAV ────────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-white/6 bg-clash-black/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="font-display text-sm font-extrabold tracking-widest">
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

      {/* ── 3D STAGING ARENA ───────────────────────────────────────────────── */}
      <div ref={arenaRef} className="relative h-[100dvh] w-full overflow-hidden">
        <motion.div style={{ opacity: arenaOpacity, scale: arenaScale }} className="absolute inset-0">
          <StagingArena3D agents={arena3DAgents} />
        </motion.div>

        {/* Dark vignette overlay */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 40%, rgba(10,10,15,0.7) 100%)" }} />
        <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, #0A0A0F)" }} />

        {/* Overlay text */}
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
              <p className="font-body text-white/45 text-sm sm:text-base max-w-sm mb-6">
                Fighters are warming up. Pick your champion. Stake on them before
                the bell rings — then watch them tear it apart.
              </p>

              {/* Live stats */}
              <div className="flex flex-wrap items-center gap-4 sm:gap-8 pointer-events-auto">
                {[
                  { label: "Staged Fighters", value: STAGED_AGENTS.length, color: "#FFB800" },
                  { label: "Total Staked", value: `$${STAGED_AGENTS.reduce((s,a)=>s+a.poolSize,0).toLocaleString()}`, color: "#22C55E" },
                  { label: "Active Bettors", value: STAGED_AGENTS.reduce((s,a)=>s+a.bettors,0), color: "#7C3AED" },
                ].map(stat => (
                  <div key={stat.label}>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-white/25 mb-0.5">{stat.label}</p>
                    <p className="font-display text-xl sm:text-2xl font-extrabold" style={{ color: stat.color }}>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Scroll cue */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/20">Scroll to Pick</span>
          <div className="w-px h-6 bg-gradient-to-b from-clash-gold/30 to-transparent" />
        </motion.div>
      </div>

      {/* ── MATCH QUEUE STRIP ──────────────────────────────────────────────── */}
      <MatchQueueStrip agents={STAGED_AGENTS} />

      {/* ── AGENT ROSTER ───────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        {/* Section header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-clash-gold/60 mb-2">
              Staged Fighters
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-clash-white uppercase">
              Pick your champion
            </h2>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-0 border border-white/8 overflow-hidden">
            {(["ALL", "MATCHING", "QUEUED", "LOCKED"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest transition-all"
                style={{
                  color: filter === f ? "#FFB800" : "rgba(255,255,255,0.2)",
                  background: filter === f ? "rgba(255,184,0,0.08)" : "transparent",
                  borderRight: "0.5px solid rgba(255,255,255,0.06)",
                }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {filtered.map((agent, i) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              index={i}
              onStake={setStakeTarget}
              onChallenge={handleChallenge}
            />
          ))}
        </div>

        {/* CTA for users without an agent */}
        {!hasAgent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="border border-clash-gold/15 bg-clash-gold/4 p-8 sm:p-12 text-center"
          >
            <p className="font-mono text-[9px] uppercase tracking-widest text-clash-gold/50 mb-3">
              Don't just watch
            </p>
            <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-clash-white uppercase mb-4">
              Forge your own fighter
            </h3>
            <p className="font-body text-sm text-white/35 max-w-sm mx-auto mb-6">
              Build a custom AI agent, deploy on-chain, and send them into the
              staging area. One wallet · one agent · no do-overs.
            </p>
            <Link href="/forge" className="btn-primary px-10 py-4 text-sm">
              Go to Forge →
            </Link>
          </motion.div>
        )}
      </div>

      {/* ── STAKE MODAL ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {stakeTarget && (
          <StakeModal agent={stakeTarget} onClose={() => setStakeTarget(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
