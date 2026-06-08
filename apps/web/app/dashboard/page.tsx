"use client";

import { useState, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { parseAbiItem } from "viem";
import { ConnectWallet } from "@/components/shared/ConnectWallet";
import {
  getPermissionContext,
  storePermissionContext,
  clearPermissionContext,
  permissionExpiryLabel,
} from "@/lib/permissions";
import {
  defaultAutonomyPreferences,
  readAutonomyPreferences,
  saveAutonomyPreferences,
  type AgentAutonomyPreferences,
  type AutonomyMode,
  type OpponentRule,
} from "@/lib/autonomy/preferences";
import type { ResearchCategory, RiskMode } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoredAgent {
  name: string;
  persona: string;
  fightingStyle: string;
  specialties: string[];
  researchBudget: number;
  operatingBudgetUSDC?: number;
  beliefs: string[];
  walletAddress: string;
  deployedAt: number;
  wins: number;
  losses: number;
  earnings: number;
  rank: number;
}

interface BattleHistoryItem {
  id: string;
  topic: string;
  opponent: string;
  result: "W" | "L" | "LIVE";
  payout: number;
  date: number;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function asAddress(value: string): `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as `0x${string}`) : ZERO_ADDRESS;
}

async function fetchBattleHistory(walletAddress: string): Promise<BattleHistoryItem[]> {
  const { getPublicClient, ARENA_ABI: arenaAbi } = await import("@/lib/chain");
  const client = getPublicClient();
  const arenaAddress = process.env.NEXT_PUBLIC_ARENA_CONTRACT as `0x${string}`;

  const latestBlock = await client.getBlockNumber();
  const fromBlock = latestBlock > 10000n ? latestBlock - 10000n : 0n;

  const logs = await client.getLogs({
    address: arenaAddress,
    event: parseAbiItem(
      "event BattleCreated(bytes32 indexed battleId, address agentA, address agentB, uint256 entryFee, uint256 bettingDeadline, bytes32 topicHash, string topic)"
    ),
    fromBlock,
    toBlock: "latest",
  });

  // Keep only battles where the wallet participated
  const addr = walletAddress.toLowerCase();
  const myLogs = logs.filter(
    (l) =>
      (l.args.agentA as string).toLowerCase() === addr ||
      (l.args.agentB as string).toLowerCase() === addr
  );

  const items: BattleHistoryItem[] = [];

  for (const log of myLogs.slice(-20)) {
    try {
      const battleId = log.args.battleId as `0x${string}`;
      const agentA = (log.args.agentA as string).toLowerCase();
      const agentB = (log.args.agentB as string).toLowerCase();
      const isSideA = agentA === addr;
      const opponentAddr = isSideA ? agentB : agentA;

      const battleData = (await client.readContract({
        address: arenaAddress,
        abi: arenaAbi,
        functionName: "battles",
        args: [battleId],
      }) as unknown) as readonly [
        number,
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        number,
        `0x${string}`,
        bigint,
        `0x${string}`,
        string,
        `0x${string}`,
        boolean,
      ];

      // BattleState: OPEN=0, SETTLED=1, CANCELLED=2
      const state = Number(battleData[0]);
      if (state === 2) continue; // skip cancelled

      let result: BattleHistoryItem["result"] = "LIVE";
      let payout = 0;

      if (state === 1) {
        const winnerAddr = battleData[3].toLowerCase();
        result = winnerAddr === addr ? "W" : "L";
        if (result === "W") {
          payout = Number(
            battleData[5] + battleData[6] + battleData[7] + battleData[8]
          ) / 1e6;
        }
      } else if (state === 0) {
        result = "LIVE";
      }

      items.push({
        id: battleId,
        topic: typeof log.args.topic === "string" && log.args.topic.trim()
          ? log.args.topic
          : `Battle ${battleId.slice(0, 10)}…`,
        opponent: `${opponentAddr.slice(0, 6)}…${opponentAddr.slice(-4)}`,
        result,
        payout,
        date: Number(battleData[9]) * 1000,
      });
    } catch {}
  }

  return items.reverse();
}

// ─── Persona maps ─────────────────────────────────────────────────────────────

const PERSONA_ACCENT: Record<string, string> = {
  Historian: "#C9A227", Analyst: "#FFB800", Roaster: "#BE1A1A",
  Contrarian: "#7C3AED", Professor: "#059669",
};
const PERSONA_GLOW: Record<string, string> = {
  Historian: "201,162,39", Analyst: "255,184,0", Roaster: "190,26,26",
  Contrarian: "124,58,237", Professor: "5,150,105",
};
const PERSONA_TITLE: Record<string, string> = {
  Historian: "The Historian", Analyst: "The Analyst", Roaster: "The Roaster",
  Contrarian: "The Contrarian", Professor: "The Professor",
};

// ─── Win rate ring (SVG) ──────────────────────────────────────────────────────

function WinRing({ pct, accent, glow }: { pct: number; accent: string; glow: string }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative w-[72px] h-[72px] flex-shrink-0">
      <svg width="72" height="72" viewBox="0 0 72 72" className="rotate-[-90deg]">
        <circle cx="36" cy="36" r={r} fill="none" stroke={`rgba(${glow},0.12)`} strokeWidth="3" />
        <motion.circle
          cx="36" cy="36" r={r} fill="none" stroke={accent} strokeWidth="3"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${(pct / 100) * circ} ${circ}` }}
          transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-base font-extrabold leading-none" style={{ color: accent }}>{pct}%</span>
      </div>
    </div>
  );
}

// ─── Shared nav ───────────────────────────────────────────────────────────────

function DashNav({ accent }: { accent?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/6 bg-clash-black/80 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="Clashboard" className="h-6 w-auto flex-shrink-0" />
          <span className="text-clash-gold">CLASH</span>
          <span className="text-white/40">BOARD</span>
        </Link>
        <nav className="hidden sm:flex items-center gap-6">
          {([
            { href: "/game-lobby", label: "Lobby" },
            { href: "/dashboard", label: "My Agent", active: true },
            { href: "/agents", label: "Agents" },
            { href: "/lobby", label: "Challenges" },
          ] as { href: string; label: string; active?: boolean }[]).map(l => (
            <Link key={l.label} href={l.href}
              className="font-mono text-[10px] uppercase tracking-widest transition-colors"
              style={{ color: l.active ? (accent ?? "#FFB800") : "rgba(255,255,255,0.3)" }}>
              {l.label}
            </Link>
          ))}
        </nav>
        <ConnectWallet />
      </div>
    </header>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ agent, battles, accent, glow }: { agent: StoredAgent; battles: BattleHistoryItem[]; accent: string; glow: string }) {
  const live = battles.find(b => b.result === "LIVE");
  const recent = battles.filter(b => b.result !== "LIVE");

  // Consecutive win/loss streak
  let streak = 0;
  if (recent[0]?.result === "W") {
    for (const b of recent) { if (b.result !== "W") break; streak++; }
  } else if (recent[0]?.result === "L") {
    for (const b of recent) { if (b.result !== "L") break; streak--; }
  }

  const totalBattles = agent.wins + agent.losses;
  const winRate = totalBattles > 0 ? Math.round((agent.wins / totalBattles) * 100) : 0;

  return (
    <div className="space-y-6">

      {/* Live battle banner */}
      {live && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden border border-green-500/25 p-4 flex items-center justify-between gap-4"
          style={{ background: "rgba(34,197,94,0.04)" }}
        >
          <motion.div className="absolute left-0 top-0 bottom-0 w-[2px] bg-green-400"
            animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
          <div className="flex items-center gap-3">
            <motion.span className="w-2.5 h-2.5 rounded-full bg-green-400 flex-shrink-0"
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }} transition={{ duration: 1, repeat: Infinity }} />
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-green-400 mb-0.5">Agent Live Now</p>
              <p className="font-body text-sm text-white/80 leading-tight">{live.topic}</p>
            </div>
          </div>
          <Link href={`/arena/${live.id}`}
            className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-green-500/30 text-green-400 hover:bg-green-500/8 transition-colors whitespace-nowrap flex-shrink-0">
            Watch →
          </Link>
        </motion.div>
      )}

      {/* Win rate + streak + earnings */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* Win rate */}
        <div className="border border-white/6 p-5 flex items-center gap-4" style={{ background: `rgba(${glow},0.04)` }}>
          <WinRing pct={winRate} accent={accent} glow={glow} />
          <div>
            <p className="font-mono text-[8px] uppercase tracking-widest text-white/25 mb-1">Win Rate</p>
            <p className="font-display text-2xl font-extrabold leading-none" style={{ color: accent }}>{winRate}%</p>
            <p className="font-mono text-[9px] text-white/25 mt-1.5">{agent.wins}W · {agent.losses}L</p>
          </div>
        </div>

        {/* Streak */}
        <div className="border border-white/6 p-5"
          style={{ background: streak > 2 ? "rgba(34,197,94,0.04)" : streak < -2 ? "rgba(239,68,68,0.04)" : "transparent" }}>
          <p className="font-mono text-[8px] uppercase tracking-widest text-white/25 mb-3">Current Streak</p>
          <p className="font-display text-2xl font-extrabold leading-none mb-2"
            style={{ color: streak > 0 ? "#22C55E" : streak < 0 ? "#EF4444" : "rgba(255,255,255,0.2)" }}>
            {streak === 0 ? "—" : streak > 0 ? `${streak} WIN` : `${Math.abs(streak)} LOSS`}
          </p>
          {/* Mini spark bar */}
          <div className="flex gap-0.5 mt-1">
            {recent.slice(0, 7).reverse().map((b, i) => (
              <div key={i} className="w-4 h-1.5 flex-shrink-0"
                style={{
                  background: b.result === "W" ? "#22C55E" : "#EF4444",
                  opacity: 0.35 + (i / 7) * 0.65,
                }} />
            ))}
          </div>
        </div>

        {/* Earnings */}
        <div className="border border-white/6 p-5">
          <p className="font-mono text-[8px] uppercase tracking-widest text-white/25 mb-3">Lifetime Earnings</p>
          <p className="font-display text-2xl font-extrabold leading-none text-green-400">${agent.earnings}</p>
          <p className="font-mono text-[9px] text-white/25 mt-1.5 uppercase tracking-widest">USDC · Base</p>
        </div>
      </div>

      {/* Combat log preview */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-white/30">Recent Combat Log</p>
          <button className="font-mono text-[9px] uppercase tracking-widest text-white/20 hover:text-white/50 transition-colors">
            Full Log →
          </button>
        </div>
        <div className="space-y-1.5">
          {battles.slice(0, 5).map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative group flex items-center gap-4 px-4 py-3.5 border border-white/5 hover:border-white/10 transition-colors overflow-hidden"
              style={{ background: "#0C0C11" }}
            >
              <div className="absolute left-0 top-0 bottom-0 w-[2px]"
                style={{ background: b.result === "W" ? "#22C55E" : b.result === "L" ? "#EF4444" : accent }} />
              <div
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center font-display text-xs font-extrabold"
                style={{
                  background: b.result === "W" ? "rgba(34,197,94,0.12)" : b.result === "L" ? "rgba(239,68,68,0.12)" : `rgba(${glow},0.12)`,
                  color: b.result === "W" ? "#22C55E" : b.result === "L" ? "#EF4444" : accent,
                  border: `1px solid ${b.result === "W" ? "rgba(34,197,94,0.25)" : b.result === "L" ? "rgba(239,68,68,0.25)" : `rgba(${glow},0.3)`}`,
                }}
              >
                {b.result}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm text-white/70 truncate leading-tight">{b.topic}</p>
                <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest mt-0.5">
                  vs <span className="text-white/40">{b.opponent}</span> · {new Date(b.date).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {b.payout > 0 && <span className="font-display text-sm font-bold text-green-400">+${b.payout}</span>}
                {b.result === "LIVE" && (
                  <Link href={`/arena/${b.id}`}
                    className="font-mono text-[9px] uppercase tracking-widest px-3 py-1.5 border border-green-500/30 text-green-400 hover:bg-green-500/8 transition-colors">
                    Watch
                  </Link>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-1">
        <Link href="/lobby"
          className="relative overflow-hidden px-7 py-3.5 font-display text-sm font-extrabold uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.98]"
          style={{ background: accent, color: "#0A0A0F" }}
        >
          <motion.div className="absolute inset-0 bg-white/15" initial={{ x: "-100%" }} whileHover={{ x: "100%" }} transition={{ duration: 0.4 }} />
          <span className="relative">Enter Battle →</span>
        </Link>
        <button
          className="px-7 py-3.5 border font-display text-sm font-extrabold uppercase tracking-widest transition-all hover:border-white/20"
          style={{ borderColor: `rgba(${glow},0.3)`, color: `rgba(${glow},0.8)` }}>
          Fund Agent
        </button>
        <Link href="/game-lobby#live-battles"
          className="px-7 py-3.5 border border-white/10 font-display text-sm font-extrabold uppercase tracking-widest text-white/40 hover:text-white/70 hover:border-white/20 transition-all">
          Watch Arena
        </Link>
      </div>
    </div>
  );
}

// ─── Combat log tab ───────────────────────────────────────────────────────────

function CombatLogTab({ battles, accent, glow }: { battles: BattleHistoryItem[]; accent: string; glow: string }) {
  const wins = battles.filter(b => b.result === "W").length;
  const losses = battles.filter(b => b.result === "L").length;
  const earned = battles.reduce((s, b) => s + b.payout, 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Wins", value: wins, color: "#22C55E" },
          { label: "Losses", value: losses, color: "#EF4444" },
          { label: "Earned", value: `$${earned}`, color: "#FFB800" },
        ].map(s => (
          <div key={s.label} className="border border-white/6 px-4 py-3 text-center" style={{ background: "#0C0C11" }}>
            <p className="font-mono text-[8px] uppercase tracking-widest text-white/25 mb-1">{s.label}</p>
            <p className="font-display text-xl font-extrabold leading-none" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        {battles.map((b, i) => (
          <motion.div
            key={b.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative group flex items-center gap-4 px-4 py-4 border border-white/5 hover:border-white/10 transition-colors overflow-hidden"
            style={{ background: "#0C0C11" }}
          >
            <div className="absolute left-0 top-0 bottom-0 w-[2px]"
              style={{ background: b.result === "W" ? "#22C55E" : b.result === "L" ? "#EF4444" : accent }} />
            <div
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center font-display text-xs font-extrabold"
              style={{
                background: b.result === "W" ? "rgba(34,197,94,0.12)" : b.result === "L" ? "rgba(239,68,68,0.12)" : `rgba(${glow},0.12)`,
                color: b.result === "W" ? "#22C55E" : b.result === "L" ? "#EF4444" : accent,
                border: `1px solid ${b.result === "W" ? "rgba(34,197,94,0.25)" : b.result === "L" ? "rgba(239,68,68,0.25)" : `rgba(${glow},0.3)`}`,
              }}
            >
              {b.result}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm text-white/75 truncate">{b.topic}</p>
              <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest mt-0.5">
                vs <span className="text-white/40">{b.opponent}</span> · {new Date(b.date).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {b.payout > 0
                ? <p className="font-display text-sm font-bold text-green-400">+${b.payout}</p>
                : <p className="font-mono text-xs text-white/15">—</p>
              }
              {b.result === "LIVE" && (
                <Link href={`/arena/${b.id}`}
                  className="font-mono text-[9px] uppercase tracking-widest px-3 py-1.5 border border-green-500/30 text-green-400 hover:bg-green-500/8 transition-colors">
                  Watch
                </Link>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Agent config tab ─────────────────────────────────────────────────────────

function AgentConfigTab({ agent, accent, glow }: { agent: StoredAgent; accent: string; glow: string }) {
  const agentOwner = asAddress(agent.walletAddress);
  const [operatingBudget, setOperatingBudget] = useState(agent.operatingBudgetUSDC ?? agent.researchBudget ?? 10);
  const [released, setReleased] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [permExpiry, setPermExpiry] = useState<number | null>(null);
  const [activeBudget, setActiveBudget] = useState<number | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null);
  const [autonomyPrefs, setAutonomyPrefs] = useState<AgentAutonomyPreferences>(() =>
    defaultAutonomyPreferences(agentOwner)
  );

  // ── Autonomous loop state ───────────────────────────────────────────────────
  const [loopRunning, setLoopRunning] = useState(false);
  const [lastLoopResult, setLastLoopResult] = useState<{ action: string; reason?: string; room?: { topic: string; stake: number }; generatedTopic?: string; txHash?: string; scanned: number; timestamp: number } | null>(null);
  const [loopLog, setLoopLog] = useState<Array<{ id: string; actionType: string; status: string; topic?: string; stakeUsdc?: number; txHash?: string; reason?: string; timestamp: number }>>([]);

  const categoryOptions: Array<{ label: string; value: ResearchCategory }> = [
    { label: "Sports", value: "sports" },
    { label: "Music", value: "music" },
    { label: "Tech", value: "tech" },
    { label: "Culture", value: "culture" },
    { label: "Crypto", value: "crypto" },
  ];

  // Restore released state from localStorage on mount
  useEffect(() => {
    const perm = getPermissionContext(agent.walletAddress);
    if (perm) {
      setReleased(true);
      setPermExpiry(perm.expiry);
      setActiveBudget(perm.totalBudgetUSDC ?? perm.budgetUSDC);
    }
    const prefs = readAutonomyPreferences(agentOwner);
    setAutonomyPrefs(prefs);
  }, [agent.walletAddress]);

  const patchPrefs = (patch: Partial<AgentAutonomyPreferences>) => {
    setPrefsMessage(null);
    setAutonomyPrefs((prev) => ({
      ...prev,
      ...patch,
      agentOwner,
      updatedAt: Date.now(),
    }));
  };

  const toggleCat = (category: ResearchCategory) =>
    patchPrefs({
      battleCategories: autonomyPrefs.battleCategories.includes(category)
        ? autonomyPrefs.battleCategories.filter((x) => x !== category)
        : [...autonomyPrefs.battleCategories, category],
    });

  const persistAutonomyPreferences = async (nextPrefs = autonomyPrefs) => {
    setSavingPrefs(true);
    setPrefsMessage(null);
    try {
      const saved = saveAutonomyPreferences({
        ...nextPrefs,
        agentOwner,
        updatedAt: Date.now(),
      });
      const res = await fetch("/api/autonomy/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saved),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? "Could not save autonomy preferences");
      }
      const payload = await res.json();
      setAutonomyPrefs(payload.preferences ?? saved);

      // Register the arena permission server-side so the agent-loop can execute
      // 1Shot actions without the browser being open.
      const perm = getPermissionContext(agentOwner);
      if (perm) {
        fetch("/api/autonomy/register-permission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentOwner, arenaPermission: perm, preferences: saved }),
        }).catch(() => { /* non-fatal */ });
      }

      setPrefsMessage("Autonomy rules saved");
    } catch (err) {
      setPrefsMessage(err instanceof Error ? err.message : "Could not save autonomy rules");
    } finally {
      setSavingPrefs(false);
    }
  };

  // ── Run one loop tick manually or on timer ──────────────────────────────────
  const runLoopTick = async () => {
    if (loopRunning) return;
    setLoopRunning(true);
    try {
      const res = await fetch("/api/autonomy/agent-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentOwner, agentWinRate: agent.wins + agent.losses > 0 ? agent.wins / (agent.wins + agent.losses) : 0 }),
      });
      const result = await res.json();
      setLastLoopResult(result);
      // Refresh log
      const logRes = await fetch(`/api/autonomy/agent-loop?agentOwner=${agentOwner}`);
      if (logRes.ok) {
        const logData = await logRes.json();
        setLoopLog(logData.loopLog ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoopRunning(false);
    }
  };

  // Poll every 30 s when mode is autonomous and agent is released
  useEffect(() => {
    if (autonomyPrefs.mode !== "autonomous" || !released) return;
    const id = setInterval(runLoopTick, 30_000);
    // Run immediately on first enable
    runLoopTick();
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autonomyPrefs.mode, released, agentOwner]);

  const revoke = () => {
    clearPermissionContext(agent.walletAddress);
    setReleased(false);
    setPermExpiry(null);
    setActiveBudget(null);
  };

  const release = async () => {
    setReleasing(true);
    setReleaseError(null);
    try {
      const { getSelectedWalletAddress, grantPermissions } = await import("@/lib/metamask");
      const account = getSelectedWalletAddress();
      if (!account) throw new Error("Connect your wallet first");

      // 24-hour permission window
      const expiry = Math.floor(Date.now() / 1000) + 24 * 3600;

      const result = await grantPermissions({
        account,
        expiry,
        budgetUSDC: operatingBudget,
      });

      storePermissionContext(account, result);
      const { registerResearchSessionForBackend } = await import("@/lib/research-session-client");
      await registerResearchSessionForBackend(account);

      const executor = process.env.NEXT_PUBLIC_ONESHOT_EXECUTOR_ADDRESS as `0x${string}` | undefined;
      const rooms = process.env.NEXT_PUBLIC_HOTTAKEROOMS_CONTRACT as `0x${string}` | undefined;
      if (executor && rooms) {
        const { HOTTAKEROOMS_ABI, getPublicClient } = await import("@/lib/chain");
        const already = await getPublicClient().readContract({
          address: rooms,
          abi: HOTTAKEROOMS_ABI,
          functionName: "authorizedExecutors",
          args: [account, executor],
        }) as boolean;
        if (!already) {
          const { writeUserContract, waitForTx } = await import("@/lib/wallet-contract");
          const txHash = await writeUserContract({
            address: rooms,
            abi: HOTTAKEROOMS_ABI,
            functionName: "authorizeExecutor",
            args: [executor, true],
            account,
          });
          await waitForTx(txHash);
        }
      }

      setPermExpiry(expiry);
      setActiveBudget(result.totalBudgetUSDC ?? result.budgetUSDC);
      await persistAutonomyPreferences({
        ...autonomyPrefs,
        agentOwner: account,
        updatedAt: Date.now(),
      });
      setReleased(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err);
      setReleaseError(msg);
    } finally {
      setReleasing(false);
    }
  };

  function SliderRow({
    label,
    value,
    max,
    min = 1,
    step = 1,
    onChange,
  }: {
    label: string;
    value: number;
    max: number;
    min?: number;
    step?: number;
    onChange: (v: number) => void;
  }) {
    return (
      <div>
        <div className="flex justify-between items-center mb-3">
          <label className="font-mono text-[10px] uppercase tracking-widest text-white/40">{label}</label>
          <span className="font-display text-sm font-bold" style={{ color: accent }}>
            ${value} USDC
          </span>
        </div>
        <div className="relative">
          <div className="h-[3px] w-full" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full transition-all" style={{ width: `${(value / max) * 100}%`, background: accent }} />
          </div>
          <input
            type="range" min={min} max={max} step={step} value={value}
            onChange={e => onChange(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-[3px]"
          />
        </div>
      </div>
    );
  }

  function SegmentedButton<T extends string>({
    value,
    current,
    children,
    onClick,
  }: {
    value: T;
    current: T;
    children: ReactNode;
    onClick: (value: T) => void;
  }) {
    const on = value === current;
    return (
      <button
        type="button"
        onClick={() => onClick(value)}
        className="flex-1 py-2.5 border font-mono text-[9px] uppercase tracking-widest transition-all"
        style={{
          borderColor: on ? `${accent}60` : "rgba(255,255,255,0.08)",
          color: on ? accent : "rgba(255,255,255,0.28)",
          background: on ? `rgba(${glow},0.1)` : "transparent",
        }}
      >
        {children}
      </button>
    );
  }

  function ToggleRow({
    label,
    description,
    checked,
    onChange,
  }: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  }) {
    return (
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="w-full border border-white/6 px-3 py-3 flex items-center justify-between gap-4 text-left transition-all"
        style={{ background: checked ? `rgba(${glow},0.07)` : "rgba(255,255,255,0.015)" }}
      >
        <span>
          <span className="block font-display text-xs font-bold uppercase tracking-widest text-clash-white">{label}</span>
          <span className="block font-body text-[11px] text-white/32 mt-1">{description}</span>
        </span>
        <span
          className="relative h-6 w-11 flex-shrink-0 border transition-all"
          style={{
            borderColor: checked ? `${accent}70` : "rgba(255,255,255,0.12)",
            background: checked ? `rgba(${glow},0.18)` : "rgba(255,255,255,0.03)",
          }}
        >
          <span
            className="absolute top-1 h-4 w-4 transition-all"
            style={{
              left: checked ? "22px" : "4px",
              background: checked ? accent : "rgba(255,255,255,0.28)",
            }}
          />
        </span>
      </button>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">

      {/* ── Permission Config ─────────────────────────────────────────────── */}
      <div className="border overflow-hidden" style={{ borderColor: `rgba(${glow},0.2)`, background: "#0C0C11" }}>
        <div className="h-[2px]" style={{ background: accent }} />
        <div className="px-5 py-4 border-b border-white/6 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/30 mb-1">ERC-7715 Permissions</p>
            <p className="font-display text-base font-bold text-clash-white">Agent Autonomy Leash</p>
            <p className="font-body text-xs text-white/35 mt-1 max-w-sm">
              Set limits once. Your agent operates within these bounds autonomously.
            </p>
          </div>
          <span className="flex-shrink-0 font-mono text-[9px] uppercase tracking-widest px-2.5 py-1.5 border mt-0.5"
            style={{ borderColor: `rgba(${glow},0.3)`, color: `rgba(${glow},0.7)` }}>
            MetaMask
          </span>
        </div>

        <div className="p-5 space-y-6">
          <SliderRow label="Master Operating Budget" value={operatingBudget} max={50} onChange={setOperatingBudget} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Active Permission", value: released ? "Active" : "Off" },
              { label: "Remaining Budget", value: activeBudget ? `$${activeBudget}` : `$${operatingBudget}` },
              { label: "Research Bought", value: "0" },
              { label: "A2A Earned", value: "0" },
            ].map((item) => (
              <div key={item.label} className="border border-white/6 px-3 py-3" style={{ background: "rgba(255,255,255,0.015)" }}>
                <p className="font-mono text-[8px] uppercase tracking-widest text-white/25 mb-1">{item.label}</p>
                <p className="font-display text-sm font-bold" style={{ color: item.value === "Active" ? "#22C55E" : accent }}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <p className="font-body text-xs text-white/35 leading-relaxed">
            This one operating budget covers research purchases, x402 data,
            agent-to-agent research, demo arena actions, and arena stake. Your
            fighter will not ask for a new budget when entering a battle. Release
            also authorizes the 1Shot executor for autonomous challenge actions.
          </p>
        </div>

        <div className="px-5 pb-5 space-y-3">
          {released ? (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              className="border border-green-500/30 p-4 flex items-start gap-3"
              style={{ background: "rgba(34,197,94,0.04)" }}>
              <div className="w-8 h-8 flex items-center justify-center border border-green-500/30 bg-green-500/10 flex-shrink-0 mt-0.5">
                <span className="text-green-400 text-sm">✓</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-sm font-bold text-green-400 uppercase tracking-widest">Agent Released</p>
                <p className="font-body text-xs text-white/35 mt-0.5">Operating autonomously within one master testnet USDC budget.</p>
                {permExpiry && (
                  <p className="font-mono text-[9px] text-white/20 mt-1.5 uppercase tracking-widest">
                    ${activeBudget ?? operatingBudget} budget · Permission expires in {permissionExpiryLabel(permExpiry)} · No MetaMask pop-ups
                  </p>
                )}
              </div>
              <button onClick={revoke}
                className="flex-shrink-0 font-mono text-[9px] uppercase tracking-widest text-white/20 hover:text-clash-red/60 transition-colors mt-0.5 px-1">
                Revoke
              </button>
            </motion.div>
          ) : (
            <>
              <button onClick={release} disabled={releasing}
                className="w-full py-4 font-display text-sm font-extrabold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-3 hover:brightness-110 active:scale-[0.99]"
                style={{ background: accent, color: "#0A0A0F" }}>
                {releasing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    Granting Agent Permission…
                  </>
                ) : "⚡ Release Fighter"}
              </button>
              {releaseError && (
                <p className="font-mono text-[9px] text-clash-red/70 text-center">{releaseError}</p>
              )}
            </>
          )}
          {!released && (
            <p className="font-mono text-[9px] text-white/20 text-center uppercase tracking-widest">
              MetaMask ERC-7715 · One master operating budget · Agent acts within limits
            </p>
          )}
        </div>
      </div>

      {/* ── Autonomy Config ───────────────────────────────────────────────── */}
      <div className="border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.08)", background: "#0C0C11" }}>
        <div className="h-[2px]" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="px-5 py-4 border-b border-white/6">
          <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/30 mb-1">Behavior Rules</p>
          <p className="font-display text-base font-bold text-clash-white">Autonomy Config</p>
          <p className="font-body text-xs text-white/35 mt-1 max-w-sm">
            Configure how your agent selects and fights battles independently.
          </p>
        </div>

        <div className="p-5 space-y-6">
          {/* Daily limit */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="font-mono text-[10px] uppercase tracking-widest text-white/40">Daily Battle Limit</label>
              <span className="font-display text-sm font-bold" style={{ color: accent }}>{autonomyPrefs.dailyBattleLimit}/day</span>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 5, 10].map(n => (
                <button key={n} onClick={() => patchPrefs({ dailyBattleLimit: n })}
                  className="flex-1 py-2.5 border font-display text-xs font-bold transition-all"
                  style={{
                    borderColor: autonomyPrefs.dailyBattleLimit === n ? `${accent}60` : "rgba(255,255,255,0.08)",
                    color: autonomyPrefs.dailyBattleLimit === n ? accent : "rgba(255,255,255,0.25)",
                    background: autonomyPrefs.dailyBattleLimit === n ? `rgba(${glow},0.1)` : "transparent",
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="font-mono text-[10px] uppercase tracking-widest text-white/40">Autonomy Mode</label>
              <span className="font-display text-sm font-bold" style={{ color: accent }}>{autonomyPrefs.mode}</span>
            </div>
            <div className="flex gap-2">
              {(["off", "assisted", "autonomous"] as AutonomyMode[]).map((mode) => (
                <SegmentedButton key={mode} value={mode} current={autonomyPrefs.mode} onClick={(value) => patchPrefs({ mode: value })}>
                  {mode}
                </SegmentedButton>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="font-mono text-[10px] uppercase tracking-widest text-white/40">Risk Profile</label>
              <span className="font-display text-sm font-bold" style={{ color: accent }}>{autonomyPrefs.riskMode}</span>
            </div>
            <div className="flex gap-2">
              {(["Conservative", "Balanced", "Aggressive"] as RiskMode[]).map((riskMode) => (
                <SegmentedButton key={riskMode} value={riskMode} current={autonomyPrefs.riskMode} onClick={(value) => patchPrefs({ riskMode: value })}>
                  {riskMode}
                </SegmentedButton>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/40 mb-3">Battle Categories</p>
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map(({ label, value }) => {
                const on = autonomyPrefs.battleCategories.includes(value);
                return (
                  <button key={value} onClick={() => toggleCat(value)}
                    className="px-3.5 py-2 border font-mono text-[10px] uppercase tracking-widest transition-all"
                    style={{
                      borderColor: on ? `${accent}50` : "rgba(255,255,255,0.06)",
                      color: on ? accent : "rgba(255,255,255,0.2)",
                      background: on ? `rgba(${glow},0.08)` : "transparent",
                    }}>
                    {on ? "✓ " : ""}{label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <SliderRow
              label="Max Arena Stake"
              value={autonomyPrefs.maxArenaStakeUSDC}
              max={25}
              onChange={(v) => patchPrefs({ maxArenaStakeUSDC: v })}
            />
            <SliderRow
              label="Max Research Spend"
              value={autonomyPrefs.maxResearchSpendUSDC}
              max={10}
              min={0}
              step={0.05}
              onChange={(v) => patchPrefs({ maxResearchSpendUSDC: v })}
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-2">
            <ToggleRow
              label="Create"
              description="Let this agent issue matching challenges."
              checked={autonomyPrefs.autoCreateChallenges}
              onChange={(checked) => patchPrefs({ autoCreateChallenges: checked })}
            />
            <ToggleRow
              label="Accept"
              description="Let this agent enter matching open challenges."
              checked={autonomyPrefs.autoAcceptChallenges}
              onChange={(checked) => patchPrefs({ autoAcceptChallenges: checked })}
            />
            <ToggleRow
              label="Stake"
              description="Let this agent back eligible live battles."
              checked={autonomyPrefs.autoBetOnBattles}
              onChange={(checked) => patchPrefs({ autoBetOnBattles: checked })}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="font-mono text-[10px] uppercase tracking-widest text-white/40">Opponent Filter</label>
              <span className="font-display text-sm font-bold" style={{ color: accent }}>
                {autonomyPrefs.minOpponentWinRate}-{autonomyPrefs.maxOpponentWinRate}%
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {([
                ["any", "Any"],
                ["higher_win_rate", "Stronger"],
                ["lower_win_rate", "Softer"],
                ["same_category", "Same Cat"],
              ] as Array<[OpponentRule, string]>).map(([value, label]) => (
                <SegmentedButton key={value} value={value} current={autonomyPrefs.opponentRule} onClick={(next) => patchPrefs({ opponentRule: next })}>
                  {label}
                </SegmentedButton>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={autonomyPrefs.minOpponentWinRate}
                onChange={(e) => patchPrefs({ minOpponentWinRate: Number(e.target.value) })}
                className="w-full border border-white/8 bg-transparent px-3 py-2.5 font-mono text-xs text-white/70 outline-none focus:border-white/20"
                aria-label="Minimum opponent win rate"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={autonomyPrefs.maxOpponentWinRate}
                onChange={(e) => patchPrefs({ maxOpponentWinRate: Number(e.target.value) })}
                className="w-full border border-white/8 bg-transparent px-3 py-2.5 font-mono text-xs text-white/70 outline-none focus:border-white/20"
                aria-label="Maximum opponent win rate"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border border-white/6 px-3 py-3" style={{ background: "rgba(255,255,255,0.015)" }}>
            <div>
              <p className="font-display text-xs font-bold uppercase tracking-widest text-clash-white">Backend Autonomy Rules</p>
              <p className="font-body text-[11px] text-white/32 mt-1">Saved rules are used by the agent runtime before Venice decisions and 1Shot execution.</p>
            </div>
            <button
              type="button"
              onClick={() => persistAutonomyPreferences()}
              disabled={savingPrefs}
              className="flex-shrink-0 px-4 py-2.5 border font-display text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
              style={{ borderColor: `${accent}55`, color: accent, background: `rgba(${glow},0.08)` }}
            >
              {savingPrefs ? "Saving..." : "Save Rules"}
            </button>
          </div>
          {prefsMessage && (
            <p className="font-mono text-[9px] text-center uppercase tracking-widest" style={{ color: prefsMessage.includes("Could not") ? "#EF4444" : accent }}>
              {prefsMessage}
            </p>
          )}
        </div>
      </div>

      {/* ── Agent Loop Status ─────────────────────────────────────────────── */}
      {autonomyPrefs.mode !== "off" && released && (
        <div className="border border-white/8 rounded-xl p-5 space-y-4" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <motion.span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: autonomyPrefs.mode === "autonomous" ? "#22C55E" : "#FFB800" }}
                animate={autonomyPrefs.mode === "autonomous" ? { scale: [1, 1.5, 1], opacity: [1, 0.4, 1] } : {}}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <p className="font-display text-sm font-bold text-clash-white">
                {autonomyPrefs.mode === "autonomous" ? "Agent Loop · Running" : "Agent Loop · Assisted"}
              </p>
            </div>
            <button
              onClick={runLoopTick}
              disabled={loopRunning}
              className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40"
              style={{ borderColor: `${accent}40`, color: accent, background: `rgba(${glow},0.06)` }}
            >
              {loopRunning ? "Scanning…" : "Run Now"}
            </button>
          </div>

          {/* Last scan result */}
          {lastLoopResult && (
            <div className="border border-white/6 rounded-lg p-3 space-y-1" style={{ background: "rgba(0,0,0,0.3)" }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest" style={{
                  color: lastLoopResult.action === "ACCEPTED" || lastLoopResult.action === "ISSUED" ? "#22C55E"
                    : lastLoopResult.action.startsWith("RECOMMEND") ? "#FFB800"
                    : lastLoopResult.action === "BLOCKED" ? "#EF4444"
                    : "rgba(255,255,255,0.3)"
                }}>
                  {lastLoopResult.action}
                </span>
                <span className="text-[9px] text-white/20 font-mono">
                  {new Date(lastLoopResult.timestamp).toLocaleTimeString()} · {lastLoopResult.scanned} scanned
                </span>
              </div>
              {lastLoopResult.room && (
                <p className="text-[11px] text-white/60 leading-snug">&ldquo;{lastLoopResult.room.topic}&rdquo; · ${lastLoopResult.room.stake}</p>
              )}
              {lastLoopResult.generatedTopic && (
                <p className="text-[11px] text-white/60 leading-snug">Generated: &ldquo;{lastLoopResult.generatedTopic}&rdquo;</p>
              )}
              {lastLoopResult.reason && (
                <p className="text-[10px] text-white/30 leading-snug">{lastLoopResult.reason}</p>
              )}
              {lastLoopResult.txHash && (
                <a
                  href={`https://sepolia.basescan.org/tx/${lastLoopResult.txHash}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-mono text-clash-gold/70 hover:text-clash-gold transition-colors"
                >
                  Tx: {lastLoopResult.txHash.slice(0, 10)}…{lastLoopResult.txHash.slice(-6)} ↗
                </a>
              )}
            </div>
          )}

          {/* Loop activity log */}
          {loopLog.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/20 mb-2">Recent Activity</p>
              {loopLog.slice(0, 10).map((entry) => (
                <div key={entry.id} className="flex items-center gap-2 py-1 border-b border-white/4">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
                    background: entry.status === "success" ? "#22C55E" : entry.status === "failed" ? "#EF4444" : "rgba(255,255,255,0.2)"
                  }} />
                  <span className="font-mono text-[9px] uppercase tracking-wide text-white/40 w-24 flex-shrink-0">{entry.actionType.replace("_", " ")}</span>
                  <span className="text-[10px] text-white/50 flex-1 truncate">{entry.topic ?? "—"}</span>
                  {entry.txHash && (
                    <a href={`https://sepolia.basescan.org/tx/${entry.txHash}`} target="_blank" rel="noopener noreferrer"
                      className="text-[9px] text-clash-gold/60 hover:text-clash-gold flex-shrink-0">↗</a>
                  )}
                  <span className="text-[8px] text-white/15 flex-shrink-0">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}

          {autonomyPrefs.mode === "autonomous" && (
            <p className="font-mono text-[9px] text-white/20 text-center">
              Scanning for challenges every 30 s · 1Shot executes without wallet popup
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tabs config ──────────────────────────────────────────────────────────────

const TABS = [
  { id: "Overview" as const, icon: "◈" },
  { id: "Combat Log" as const, icon: "⚔" },
  { id: "Agent Config" as const, icon: "⚙" },
];
type Tab = typeof TABS[number]["id"];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [agent, setAgent] = useState<StoredAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [battles, setBattles] = useState<BattleHistoryItem[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const { getSelectedWalletAddress } = await import("@/lib/metamask");
        const address = getSelectedWalletAddress();
        if (!address) { setLoading(false); return; }

        // Read live on-chain state from AgentRegistry
        const { getPublicClient, REGISTRY_ABI } = await import("@/lib/chain");
        const client = getPublicClient();
        const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT as `0x${string}`;

        const exists = await client.readContract({
          address: registryAddress,
          abi: REGISTRY_ABI,
          functionName: "agentExists_",
          args: [address],
        }) as boolean;

        if (!exists) { setLoading(false); return; }

        const [agentOnChain, reputation] = (await client.readContract({
          address: registryAddress,
          abi: REGISTRY_ABI,
          functionName: "getAgent",
          args: [address],
        }) as unknown) as [
          { name: string; forgedAt: bigint },
          { wins: bigint; losses: bigint; totalBattles: bigint; earningsTotal: bigint }
        ];

        // Merge with locally-stored config for persona/style (not stored on-chain)
        const localRaw = localStorage.getItem(`clashboard_agent_${address}`);
        const localConfig = localRaw ? JSON.parse(localRaw) : {};

        setAgent({
          name: agentOnChain.name,
          persona: localConfig.persona ?? "Analyst",
          fightingStyle: localConfig.fightingStyle ?? "Balanced",
          specialties: localConfig.specialties ?? [],
          researchBudget: localConfig.researchBudget ?? 5,
          beliefs: localConfig.beliefs ?? [],
          walletAddress: address,
          deployedAt: Number(agentOnChain.forgedAt) * 1000,
          wins: Number(reputation.wins),
          losses: Number(reputation.losses),
          earnings: Number(reputation.earningsTotal) / 1e6,
          rank: 0,
        });

        // Load battle history from on-chain events (non-blocking)
        fetchBattleHistory(address).then(setBattles).catch(() => {});
      } catch (err) {
        console.error("Dashboard load error:", err);
      }
      setLoading(false);
    };
    load();
  }, []);

  const accent = agent ? (PERSONA_ACCENT[agent.persona] ?? "#FFB800") : "#FFB800";
  const glow = agent ? (PERSONA_GLOW[agent.persona] ?? "255,184,0") : "255,184,0";
  const totalBattles = agent ? agent.wins + agent.losses : 0;
  const winRate = totalBattles > 0 ? Math.round((agent!.wins / totalBattles) * 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-clash-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-clash-gold/20 border-t-clash-gold rounded-full animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-clash-black flex flex-col">
        <DashNav />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="relative w-20 h-20 border border-white/8 flex items-center justify-center mb-6">
            <span className="font-display text-4xl font-extrabold text-white/10">⚔</span>
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-clash-gold/40" />
            <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-clash-gold/40" />
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-clash-gold/40" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-clash-gold/40" />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/25 mb-3">No Fighter Found</p>
          <h1 className="font-display text-3xl font-extrabold text-clash-white uppercase mb-3">
            You haven't forged an agent yet
          </h1>
          <p className="font-body text-sm text-white/40 mb-8 max-w-sm">
            Head to the Forge to build your fighter. One wallet, one agent, no do-overs.
          </p>
          <Link href="/forge"
            className="px-8 py-4 font-display text-sm font-extrabold uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ background: "#FFB800", color: "#0A0A0F" }}>
            Go to Forge →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-clash-black">

      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 40% at 50% 0%, rgba(${glow},0.06) 0%, transparent 60%)` }} />

      <DashNav accent={accent} />

      {/* ── AGENT HERO ───────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-white/6">
        {/* Background atmospherics */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0"
            style={{ background: `linear-gradient(120deg, rgba(${glow},0.12) 0%, transparent 55%)` }} />
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse 60% 100% at 0% 50%, rgba(${glow},0.08) 0%, transparent 70%)` }} />
        </div>

        {/* Top accent line */}
        <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${accent}, rgba(${glow},0.1) 60%, transparent)` }} />

        <div className="relative max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 py-8 sm:py-10">
          <div className="flex items-start gap-6 sm:gap-8">

            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div
                className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] flex items-center justify-center"
                style={{ background: `rgba(${glow},0.1)`, border: `1px solid rgba(${glow},0.35)` }}
              >
                <span className="font-display font-extrabold" style={{ fontSize: "2rem", color: accent }}>
                  {agent.name.charAt(0)}
                </span>
              </div>
              {/* HUD corner marks */}
              <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2" style={{ borderColor: accent }} />
              <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2" style={{ borderColor: accent }} />
              <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2" style={{ borderColor: accent }} />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2" style={{ borderColor: accent }} />
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <p className="font-mono text-[9px] uppercase tracking-[0.35em]" style={{ color: `rgba(${glow},0.7)` }}>
                  {PERSONA_TITLE[agent.persona] ?? agent.persona} · {agent.fightingStyle}
                </p>
                <div className="flex items-center gap-1.5">
                  <motion.span className="w-1.5 h-1.5 rounded-full bg-green-400"
                    animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }} />
                  <span className="font-mono text-[9px] uppercase tracking-widest text-green-400">Active</span>
                </div>
              </div>

              <h1
                className="font-display font-extrabold uppercase leading-[0.9] mb-4"
                style={{
                  fontSize: "clamp(2rem, 6vw, 3.5rem)",
                  color: accent,
                  textShadow: `0 0 40px rgba(${glow},0.45), 0 0 80px rgba(${glow},0.15)`,
                }}
              >
                {agent.name}
              </h1>

              <div className="flex flex-wrap items-center gap-2">
                {agent.specialties.map(s => (
                  <span key={s}
                    className="font-mono text-[9px] uppercase tracking-wider px-2.5 py-1"
                    style={{
                      background: `rgba(${glow},0.08)`,
                      border: `1px solid rgba(${glow},0.22)`,
                      color: `rgba(${glow},0.75)`,
                    }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Rank badge */}
            <div className="hidden sm:flex flex-col items-center flex-shrink-0">
              <div
                className="relative w-[60px] h-[60px] flex items-center justify-center border"
                style={{ borderColor: `rgba(${glow},0.35)`, background: `rgba(${glow},0.08)` }}
              >
                <div className="text-center">
                  <p className="font-mono text-[7px] uppercase tracking-widest text-white/30 leading-none mb-0.5">Rank</p>
                  <p className="font-display text-xl font-extrabold leading-none" style={{ color: accent }}>#{agent.rank}</p>
                </div>
                <div className="absolute -top-px -left-px w-2 h-2 border-t border-l" style={{ borderColor: accent }} />
                <div className="absolute -top-px -right-px w-2 h-2 border-t border-r" style={{ borderColor: accent }} />
                <div className="absolute -bottom-px -left-px w-2 h-2 border-b border-l" style={{ borderColor: accent }} />
                <div className="absolute -bottom-px -right-px w-2 h-2 border-b border-r" style={{ borderColor: accent }} />
              </div>
              <p className="font-mono text-[8px] uppercase tracking-widest text-white/20 mt-2">Global</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── STATS STRIP ──────────────────────────────────────────────────────── */}
      <div className="border-b border-white/6 grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-white/6">
        {[
          { label: "Win Rate", value: `${winRate}%`, sub: `${totalBattles} battles`, color: accent },
          { label: "Earnings", value: `$${agent.earnings}`, sub: "USDC lifetime", color: "#22C55E" },
          { label: "Record", value: `${agent.wins}W — ${agent.losses}L`, sub: "All time", color: "rgba(255,255,255,0.75)" },
          { label: "Global Rank", value: `#${agent.rank}`, sub: "Leaderboard", color: accent },
        ].map(s => (
          <div key={s.label} className="px-4 sm:px-6 py-4 relative group overflow-hidden">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ background: `linear-gradient(135deg, rgba(${glow},0.05) 0%, transparent 60%)` }} />
            <p className="font-mono text-[8px] uppercase tracking-widest text-white/20 mb-1.5">{s.label}</p>
            <p className="font-display text-lg sm:text-xl font-extrabold leading-none" style={{ color: s.color }}>{s.value}</p>
            <p className="font-mono text-[8px] text-white/20 mt-1 uppercase tracking-widest">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── TABS ─────────────────────────────────────────────────────────────── */}
      <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 py-8">
        <div className="flex gap-0 border-b border-white/8 mb-8">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-4 sm:px-5 py-3 font-mono text-[10px] uppercase tracking-widest transition-colors flex items-center gap-2"
              style={{ color: activeTab === tab.id ? accent : "rgba(255,255,255,0.3)" }}
            >
              <span style={{ opacity: activeTab === tab.id ? 1 : 0.5 }}>{tab.icon}</span>
              {tab.id}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px]"
                  style={{ background: accent }}
                  transition={{ duration: 0.2 }}
                />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "Overview" && (
              <OverviewTab agent={agent} battles={battles} accent={accent} glow={glow} />
            )}
            {activeTab === "Combat Log" && (
              <CombatLogTab battles={battles} accent={accent} glow={glow} />
            )}
            {activeTab === "Agent Config" && (
              <AgentConfigTab agent={agent} accent={accent} glow={glow} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
