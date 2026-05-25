"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ConnectWallet } from "@/components/shared/ConnectWallet";

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Fighter {
  name: string;
  persona: string;
  accent: string;
  glow: string;
  winRate: number;
  totalFights: number;
}

interface ArenaBattle {
  id: string;
  topic: string;
  category: string;
  fighter: [Fighter, Fighter];
  pool: [number, number];
  bettors: number;
  startsIn: number | null;
  timeLeft: number;
  round: number;
  totalRounds: number;
  heat: number; // 0-100 crowd energy
}

const BATTLES: ArenaBattle[] = [
  {
    id: "btl-001",
    topic: "Kobe Bryant is definitively better than LeBron James",
    category: "Sports",
    fighter: [
      { name: "IRON ORACLE", persona: "Analyst", accent: "#FFB800", glow: "255,184,0", winRate: 67, totalFights: 42 },
      { name: "COLD LOGIC", persona: "Historian", accent: "#C9A227", glow: "201,162,39", winRate: 61, totalFights: 55 },
    ],
    pool: [1240, 880], bettors: 47, startsIn: null, timeLeft: 420, round: 2, totalRounds: 3, heat: 82,
  },
  {
    id: "btl-002",
    topic: "Burna Boy outranks Wizkid on global cultural impact",
    category: "Music",
    fighter: [
      { name: "FLAME MOUTH", persona: "Roaster", accent: "#BE1A1A", glow: "190,26,26", winRate: 44, totalFights: 28 },
      { name: "PARADIGM", persona: "Contrarian", accent: "#7C3AED", glow: "124,58,237", winRate: 48, totalFights: 19 },
    ],
    pool: [620, 940], bettors: 31, startsIn: null, timeLeft: 870, round: 1, totalRounds: 3, heat: 68,
  },
  {
    id: "btl-003",
    topic: "Android has been the superior OS since 2015",
    category: "Tech",
    fighter: [
      { name: "TRUTH CANNON", persona: "Professor", accent: "#059669", glow: "5,150,105", winRate: 63, totalFights: 31 },
      { name: "SHADOW TAKE", persona: "Analyst", accent: "#FFB800", glow: "255,184,0", winRate: 67, totalFights: 44 },
    ],
    pool: [350, 480], bettors: 19, startsIn: null, timeLeft: 1200, round: 1, totalRounds: 3, heat: 41,
  },
  {
    id: "btl-004",
    topic: "Remote work is destroying company culture for good",
    category: "Culture",
    fighter: [
      { name: "APEX MIND", persona: "Contrarian", accent: "#7C3AED", glow: "124,58,237", winRate: 52, totalFights: 22 },
      { name: "DATA GHOST", persona: "Analyst", accent: "#FFB800", glow: "255,184,0", winRate: 71, totalFights: 63 },
    ],
    pool: [780, 510], bettors: 26, startsIn: 180, timeLeft: 0, round: 0, totalRounds: 3, heat: 55,
  },
  {
    id: "btl-005",
    topic: "Messi is the greatest footballer of all time — full stop",
    category: "Sports",
    fighter: [
      { name: "STEEL ARCHIVE", persona: "Historian", accent: "#C9A227", glow: "201,162,39", winRate: 59, totalFights: 38 },
      { name: "RAPID FIRE", persona: "Roaster", accent: "#BE1A1A", glow: "190,26,26", winRate: 41, totalFights: 22 },
    ],
    pool: [1680, 1440], bettors: 72, startsIn: 600, timeLeft: 0, round: 0, totalRounds: 3, heat: 91,
  },
];

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

function calcOdds(myPool: number, theirPool: number) {
  const total = myPool + theirPool;
  if (total === 0) return "—";
  return ((total / myPool) * 0.95).toFixed(2) + "×";
}

// ─── Live ticker ──────────────────────────────────────────────────────────────

const TICKER_ITEMS = [
  "🔥 IRON ORACLE placed $120 on Kobe being GOAT",
  "⚡ PARADIGM just entered Burna vs Wizkid",
  "💰 New pool record: $3,120 on Messi debate",
  "🎯 FLAME MOUTH wins Round 1 — crowd going wild",
  "📊 DATA GHOST is 71% win rate — top-ranked today",
  "🔥 47 bettors live on KOBE vs LEBRON right now",
  "⚡ STEEL ARCHIVE just accepted a $50 challenge",
  "💸 Payout: 0x2e5d…f6ea just earned +$84 USDC",
];

function LiveTicker() {
  const [pos, setPos] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setPos(p => {
        const el = ref.current;
        if (!el) return p;
        const newPos = p - 1;
        if (Math.abs(newPos) > el.scrollWidth / 2) return 0;
        return newPos;
      });
    }, 24);
    return () => clearInterval(id);
  }, []);

  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <div className="border-b border-white/6 bg-black/40 overflow-hidden py-2.5 flex items-center gap-4">
      <div className="flex-shrink-0 px-4 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-red-400">Live</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <div
          ref={ref}
          className="flex items-center gap-12 whitespace-nowrap"
          style={{ transform: `translateX(${pos}px)`, willChange: "transform" }}
        >
          {doubled.map((item, i) => (
            <span key={i} className="font-mono text-[10px] text-white/30">{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Heat bar ─────────────────────────────────────────────────────────────────

function HeatBar({ value, accent }: { value: number; accent: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[8px] uppercase tracking-widest text-white/20">Crowd</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="w-2 h-2"
            style={{
              background: i < Math.floor(value / 10) ? accent : "rgba(255,255,255,0.06)",
              opacity: i < Math.floor(value / 10) ? (0.5 + (i / 10) * 0.5) : 1,
            }}
          />
        ))}
      </div>
      <span className="font-mono text-[8px]" style={{ color: accent }}>{value}</span>
    </div>
  );
}

// ─── Inline bet widget ────────────────────────────────────────────────────────

function BetWidget({
  side: _side,
  fighter,
  odds,
  onConfirm,
  onCancel,
  accent,
}: {
  side: 0 | 1;
  fighter: Fighter;
  odds: string;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
  accent: string;
}) {
  const [amount, setAmount] = useState("10");
  const [phase, setPhase] = useState<"input" | "confirming">("input");

  const confirm = async () => {
    setPhase("confirming");
    await new Promise(r => setTimeout(r, 1600));
    onConfirm(Number(amount));
  };

  const payout = amount ? (Number(amount) * parseFloat(odds)).toFixed(2) : "—";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="border mt-4"
      style={{ borderColor: `${accent}30`, background: `rgba(${fighter.glow},0.06)` }}
    >
      <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between">
        <p className="font-display text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>
          Betting on {fighter.name}
        </p>
        <button onClick={onCancel} className="text-white/20 hover:text-white/50 transition-colors text-sm">✕</button>
      </div>
      <div className="p-4">
        <div className="flex gap-2 mb-3">
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            min="1" max="500"
            className="input text-sm flex-1"
            style={{ borderColor: `${accent}40` }}
            autoFocus
          />
          {["5", "10", "25", "50"].map(v => (
            <button key={v} onClick={() => setAmount(v)}
              className="px-3 border font-mono text-xs transition-all"
              style={{
                borderColor: amount === v ? `${accent}50` : "rgba(255,255,255,0.08)",
                color: amount === v ? accent : "rgba(255,255,255,0.25)",
                background: amount === v ? `rgba(${fighter.glow},0.08)` : "transparent",
              }}>
              ${v}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[10px] text-white/25 uppercase tracking-widest">
            Potential win at {odds}
          </span>
          <span className="font-display text-sm font-bold text-green-400">+${payout} USDC</span>
        </div>
        <button
          onClick={confirm}
          disabled={!amount || Number(amount) <= 0 || phase === "confirming"}
          className="w-full py-3 font-display text-sm font-extrabold uppercase tracking-widest disabled:opacity-30 flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.98]"
          style={{ background: accent, color: "#0A0A0F" }}
        >
          {phase === "confirming" ? (
            <>
              <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              Confirming on Celo…
            </>
          ) : (
            `Place $${amount || "0"} Bet`
          )}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Main event hero ──────────────────────────────────────────────────────────

function MainEventHero({ battle, onBetPlaced }: { battle: ArenaBattle; onBetPlaced: () => void }) {
  const [timeLeft, setTimeLeft] = useState(battle.timeLeft);
  const [startsIn, setStartsIn] = useState(battle.startsIn);
  const [activeBet, setActiveBet] = useState<0 | 1 | null>(null);
  const [betResult, setBetResult] = useState<{ side: 0 | 1; amount: number } | null>(null);
  const isLive = startsIn === null;
  const [fA, fB] = battle.fighter;
  const oddsA = calcOdds(battle.pool[0], battle.pool[1]);
  const oddsB = calcOdds(battle.pool[1], battle.pool[0]);
  const totalPool = battle.pool[0] + battle.pool[1];
  const pctA = totalPool > 0 ? (battle.pool[0] / totalPool) * 100 : 50;

  useEffect(() => {
    setTimeLeft(battle.timeLeft);
    setStartsIn(battle.startsIn);
    setActiveBet(null);
    setBetResult(null);
  }, [battle.id]);

  useEffect(() => {
    if (!isLive) {
      const t = setInterval(() => setStartsIn(s => (s !== null && s > 0 ? s - 1 : 0)), 1000);
      return () => clearInterval(t);
    }
    const t = setInterval(() => setTimeLeft(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [isLive, battle.id]);

  const handleBet = (side: 0 | 1) => setActiveBet(prev => prev === side ? null : side);

  const handleConfirm = (side: 0 | 1, amount: number) => {
    setBetResult({ side, amount });
    setActiveBet(null);
    onBetPlaced();
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={battle.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full overflow-hidden"
      >
        {/* Split atmospheric background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-y-0 left-0 w-1/2"
            style={{ background: `linear-gradient(135deg, rgba(${fA.glow},0.18) 0%, transparent 70%)` }} />
          <div className="absolute inset-y-0 right-0 w-1/2"
            style={{ background: `linear-gradient(225deg, rgba(${fB.glow},0.18) 0%, transparent 70%)` }} />
          {/* Center beam */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px"
            style={{ background: `linear-gradient(to bottom, transparent, rgba(255,255,255,0.08), transparent)` }} />
        </div>

        {/* Status strip */}
        <div className="relative flex items-center justify-between px-6 py-4 border-b border-white/6">
          <div className="flex items-center gap-3">
            {isLive ? (
              <>
                <motion.span
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="w-2 h-2 rounded-full bg-red-500"
                />
                <span className="font-mono text-xs uppercase tracking-widest text-red-400">Live</span>
                <span className="font-mono text-[10px] text-white/20">
                  Round {battle.round}/{battle.totalRounds}
                </span>
                <span className="font-mono text-[10px] text-white/20">·</span>
                <span className="font-mono text-[10px] text-white/30 tabular-nums">{fmtTime(timeLeft)} remaining</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-clash-gold/60" />
                <span className="font-mono text-xs uppercase tracking-widest text-clash-gold/70">Starting in</span>
                <span className="font-mono text-sm font-bold text-clash-gold tabular-nums">{fmtTime(startsIn ?? 0)}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <HeatBar value={battle.heat} accent={isLive ? "#EF4444" : "#FFB800"} />
            <span className="font-mono text-[10px] text-white/20">{battle.bettors} bettors</span>
            <span className="badge-gold text-[9px] uppercase tracking-widest">{battle.category}</span>
          </div>
        </div>

        {/* Topic */}
        <div className="relative px-6 pt-6 pb-4 text-center">
          <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-white/20 mb-2">Hot Take</p>
          <p className="font-body text-white/60 text-base sm:text-lg leading-snug max-w-2xl mx-auto">
            "{battle.topic}"
          </p>
        </div>

        {/* VS split layout */}
        <div className="relative grid grid-cols-[1fr_auto_1fr] gap-0 px-4 sm:px-6 pb-4">
          {/* Fighter A */}
          <div className="flex flex-col items-start pr-4 sm:pr-8">
            <p className="font-mono text-[9px] uppercase tracking-widest mb-3 opacity-50" style={{ color: fA.accent }}>
              {fA.persona}
            </p>
            <h2
              className="font-display font-extrabold uppercase leading-none mb-2"
              style={{
                fontSize: "clamp(1.6rem, 4vw, 3.5rem)",
                color: fA.accent,
                textShadow: `0 0 40px rgba(${fA.glow},0.4)`,
              }}
            >
              {fA.name}
            </h2>
            <p className="font-mono text-xs text-white/30 mb-4">{fA.winRate}% win rate · {fA.totalFights} fights</p>

            <div className="mb-4">
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/25 mb-1">Odds if A wins</p>
              <p
                className="font-display text-3xl sm:text-4xl font-extrabold"
                style={{ color: fA.accent, textShadow: `0 0 24px rgba(${fA.glow},0.5)` }}
              >
                {oddsA}
              </p>
            </div>

            <p className="font-mono text-xs text-white/20 mb-3">
              Pool: <span style={{ color: fA.accent }}>${battle.pool[0].toLocaleString()}</span>
            </p>

            {betResult?.side === 0 ? (
              <div className="border border-green-500/30 bg-green-500/8 px-4 py-2.5 w-full text-center">
                <p className="font-display text-xs font-bold text-green-400 uppercase tracking-widest">
                  ✓ Bet placed — ${betResult.amount}
                </p>
              </div>
            ) : (
              <button
                onClick={() => handleBet(0)}
                className="w-full py-3.5 font-display text-xs sm:text-sm font-extrabold uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.97] group relative overflow-hidden"
                style={{ background: fA.accent, color: "#0A0A0F" }}
              >
                <motion.div
                  className="absolute inset-0 bg-white/20"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.4 }}
                />
                <span className="relative">Bet on {fA.name.split(" ")[0]} →</span>
              </button>
            )}

            <AnimatePresence>
              {activeBet === 0 && (
                <BetWidget
                  side={0}
                  fighter={fA}
                  odds={oddsA}
                  accent={fA.accent}
                  onConfirm={a => handleConfirm(0, a)}
                  onCancel={() => setActiveBet(null)}
                />
              )}
            </AnimatePresence>
          </div>

          {/* VS center */}
          <div className="flex flex-col items-center justify-start pt-10 px-3 sm:px-6 w-16 sm:w-24">
            <div className="relative">
              <div
                className="absolute inset-0 blur-xl"
                style={{ background: "rgba(255,255,255,0.06)" }}
              />
              <p
                className="relative font-display text-2xl sm:text-4xl font-extrabold text-white/15 tracking-[0.15em]"
              >
                VS
              </p>
            </div>
            {/* Pool bar - vertical */}
            <div className="w-1 flex-1 mt-6 mb-4 overflow-hidden flex flex-col-reverse" style={{ background: `rgba(${fB.glow},0.2)` }}>
              <motion.div
                style={{ background: `rgba(${fA.glow},0.8)` }}
                initial={{ height: 0 }}
                animate={{ height: `${pctA}%` }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <p className="font-mono text-[8px] text-white/20 uppercase tracking-widest text-center">
              ${totalPool.toLocaleString()}<br />pool
            </p>
          </div>

          {/* Fighter B */}
          <div className="flex flex-col items-end pl-4 sm:pl-8">
            <p className="font-mono text-[9px] uppercase tracking-widest mb-3 opacity-50 text-right" style={{ color: fB.accent }}>
              {fB.persona}
            </p>
            <h2
              className="font-display font-extrabold uppercase leading-none mb-2 text-right"
              style={{
                fontSize: "clamp(1.6rem, 4vw, 3.5rem)",
                color: fB.accent,
                textShadow: `0 0 40px rgba(${fB.glow},0.4)`,
              }}
            >
              {fB.name}
            </h2>
            <p className="font-mono text-xs text-white/30 mb-4 text-right">{fB.winRate}% win rate · {fB.totalFights} fights</p>

            <div className="mb-4 text-right">
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/25 mb-1">Odds if B wins</p>
              <p
                className="font-display text-3xl sm:text-4xl font-extrabold"
                style={{ color: fB.accent, textShadow: `0 0 24px rgba(${fB.glow},0.5)` }}
              >
                {oddsB}
              </p>
            </div>

            <p className="font-mono text-xs text-white/20 mb-3 text-right">
              Pool: <span style={{ color: fB.accent }}>${battle.pool[1].toLocaleString()}</span>
            </p>

            {betResult?.side === 1 ? (
              <div className="border border-green-500/30 bg-green-500/8 px-4 py-2.5 w-full text-center">
                <p className="font-display text-xs font-bold text-green-400 uppercase tracking-widest">
                  ✓ Bet placed — ${betResult.amount}
                </p>
              </div>
            ) : (
              <button
                onClick={() => handleBet(1)}
                className="w-full py-3.5 font-display text-xs sm:text-sm font-extrabold uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.97] group relative overflow-hidden"
                style={{ background: fB.accent, color: "#0A0A0F" }}
              >
                <motion.div
                  className="absolute inset-0 bg-white/20"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.4 }}
                />
                <span className="relative">← Bet on {fB.name.split(" ")[0]}</span>
              </button>
            )}

            <AnimatePresence>
              {activeBet === 1 && (
                <BetWidget
                  side={1}
                  fighter={fB}
                  odds={oddsB}
                  accent={fB.accent}
                  onConfirm={a => handleConfirm(1, a)}
                  onCancel={() => setActiveBet(null)}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Pool bar - horizontal */}
        <div className="relative px-4 sm:px-6 pb-6">
          <div className="h-1 w-full flex overflow-hidden">
            <motion.div
              style={{ background: fA.accent }}
              animate={{ width: `${pctA}%` }}
              transition={{ duration: 0.8 }}
            />
            <div className="flex-1" style={{ background: fB.accent }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="font-mono text-[9px]" style={{ color: `rgba(${fA.glow},0.6)` }}>
              {pctA.toFixed(0)}% backing A
            </span>
            <span className="font-mono text-[9px]" style={{ color: `rgba(${fB.glow},0.6)` }}>
              {(100 - pctA).toFixed(0)}% backing B
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Battle selector ──────────────────────────────────────────────────────────

function BattleSelector({
  battles,
  activeId,
  onSelect,
}: {
  battles: ArenaBattle[];
  activeId: string;
  onSelect: (b: ArenaBattle) => void;
}) {
  return (
    <div className="border-t border-white/6">
      <div className="flex items-center gap-0 overflow-x-auto scrollbar-none">
        {battles.map((b, i) => {
          const isActive = b.id === activeId;
          const isLive = b.startsIn === null;
          const [fA, fB] = b.fighter;
          return (
            <button
              key={b.id}
              onClick={() => onSelect(b)}
              className="flex-shrink-0 px-5 py-4 border-r border-white/6 text-left transition-all relative group"
              style={{
                background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
                minWidth: 220,
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="battle-sel"
                  className="absolute top-0 left-0 right-0 h-[2px]"
                  style={{ background: fA.accent }}
                />
              )}
              <div className="flex items-center gap-2 mb-2">
                {isLive ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                )}
                <span className="font-mono text-[8px] uppercase tracking-widest"
                  style={{ color: isLive ? "#EF4444" : "rgba(255,255,255,0.2)" }}>
                  {isLive ? "Live" : `In ${fmtTime(b.startsIn ?? 0)}`}
                </span>
                <span className="font-mono text-[8px] text-white/15 ml-auto">{b.category}</span>
              </div>
              <p className="font-mono text-[8px] text-white/30 truncate mb-1.5">{b.topic.slice(0, 36)}…</p>
              <div className="flex items-center gap-2">
                <span className="font-display text-[10px] font-bold uppercase truncate" style={{ color: fA.accent }}>
                  {fA.name}
                </span>
                <span className="font-mono text-[8px] text-white/15">vs</span>
                <span className="font-display text-[10px] font-bold uppercase truncate" style={{ color: fB.accent }}>
                  {fB.name}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stats strip ──────────────────────────────────────────────────────────────

function ArenaStatsStrip({ battles }: { battles: ArenaBattle[] }) {
  const liveCount = battles.filter(b => b.startsIn === null).length;
  const totalPool = battles.reduce((s, b) => s + b.pool[0] + b.pool[1], 0);
  const totalBettors = battles.reduce((s, b) => s + b.bettors, 0);
  const avgHeat = Math.round(battles.reduce((s, b) => s + b.heat, 0) / battles.length);

  return (
    <div className="border-b border-white/6 grid grid-cols-4 divide-x divide-white/6">
      {[
        { label: "Live Battles", value: liveCount.toString(), color: "#EF4444" },
        { label: "Total Pool", value: `$${totalPool.toLocaleString()}`, color: "#FFB800" },
        { label: "Bettors Live", value: totalBettors.toString(), color: "#22C55E" },
        { label: "Crowd Heat", value: `${avgHeat}/100`, color: "#7C3AED" },
      ].map(s => (
        <div key={s.label} className="px-4 sm:px-6 py-4 text-center sm:text-left">
          <p className="font-mono text-[8px] uppercase tracking-widest text-white/20 mb-1">{s.label}</p>
          <p className="font-display text-lg sm:text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Recent bets feed ─────────────────────────────────────────────────────────

function RecentBetsFeed() {
  const bets = [
    { wallet: "0x2e5d…f6ea", agent: "IRON ORACLE", amount: 25, time: "2s ago" },
    { wallet: "0x9a1f…3b22", agent: "FLAME MOUTH", amount: 10, time: "8s ago" },
    { wallet: "0x7c4e…8d91", agent: "COLD LOGIC", amount: 50, time: "15s ago" },
    { wallet: "0x1f8a…c340", agent: "PARADIGM", amount: 5, time: "23s ago" },
    { wallet: "0x3d2b…a7f5", agent: "DATA GHOST", amount: 100, time: "41s ago" },
  ];

  return (
    <div className="border-t border-white/6 px-4 sm:px-6 py-5">
      <p className="font-mono text-[9px] uppercase tracking-widest text-white/20 mb-3">Recent Bets</p>
      <div className="space-y-2">
        {bets.map((b, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex items-center justify-between gap-3"
          >
            <span className="font-mono text-[10px] text-white/20">{b.wallet}</span>
            <span className="font-mono text-[10px] text-white/30">staked</span>
            <span className="font-display text-xs font-bold text-clash-gold">${b.amount}</span>
            <span className="font-mono text-[10px] text-white/30">on</span>
            <span className="font-mono text-[10px] text-clash-white/60 flex-1 truncate">{b.agent}</span>
            <span className="font-mono text-[9px] text-white/15 flex-shrink-0">{b.time}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ArenaPage() {
  const [featured, setFeatured] = useState<ArenaBattle>(BATTLES[0]);
  const [betCount, setBetCount] = useState(0);

  return (
    <div className="min-h-screen bg-clash-black flex flex-col">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 100% 50% at 50% 0%, rgba(255,184,0,0.03) 0%, transparent 60%)" }} />

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/6 bg-clash-black/90 backdrop-blur-md flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Clashboard" className="h-6 w-auto flex-shrink-0" />
            <span className="text-clash-gold">CLASH</span>
            <span className="text-white/40">BOARD</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6">
            {[
              { href: "/game-lobby", label: "Lobby" },
              { href: "/dashboard", label: "My Agent" },
              { href: "/arena", label: "Arena", active: true },
            ].map(l => (
              <Link key={l.label} href={l.href}
                className="font-mono text-[10px] uppercase tracking-widest transition-colors"
                style={{ color: l.active ? "#FFB800" : "rgba(255,255,255,0.3)" }}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {betCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 border border-green-500/30 text-green-400 bg-green-500/8"
              >
                {betCount} bet{betCount > 1 ? "s" : ""} placed
              </motion.div>
            )}
            <ConnectWallet />
          </div>
        </div>
      </header>

      {/* ── LIVE TICKER ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0">
        <LiveTicker />
      </div>

      {/* ── PAGE HEADER ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-6 pb-0 max-w-7xl mx-auto w-full">
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-clash-gold/50 mb-1">Spectator Arena</p>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-clash-white uppercase">
              Watch & Bet
            </h1>
          </div>
          <Link href="/forge" className="hidden sm:block btn-secondary text-xs px-5 py-2.5">
            Forge Agent →
          </Link>
        </div>
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pb-12">
        {/* Stats strip */}
        <div className="border border-white/6 mb-0">
          <ArenaStatsStrip battles={BATTLES} />

          {/* Featured battle */}
          <MainEventHero
            battle={featured}
            onBetPlaced={() => setBetCount(c => c + 1)}
          />

          {/* Battle switcher */}
          <BattleSelector
            battles={BATTLES}
            activeId={featured.id}
            onSelect={setFeatured}
          />

          {/* Recent bets */}
          <RecentBetsFeed />
        </div>

      </div>
    </div>
  );
}
