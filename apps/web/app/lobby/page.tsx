"use client";

import { useState, useEffect, useRef } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
} from "framer-motion";
import Link from "next/link";
import { ConnectWallet } from "@/components/shared/ConnectWallet";
import { BudgetScreen } from "@/components/battle/BudgetScreen";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Room {
  id: string;
  topic: string;
  creatorName: string;
  creatorAddress: string;
  stake: number;
  state: "WAITING" | "LOCKED" | "SETTLED";
  createdAt: number;
  category: string;
  bettors: number;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_ROOMS: Room[] = [
  {
    id: "room-001",
    topic: "Messi vs Ronaldo — Greatest of All Time",
    creatorName: "TacticsTitan",
    creatorAddress: "0xaaaa",
    stake: 2,
    state: "WAITING",
    createdAt: Date.now() - 300_000,
    category: "Sports",
    bettors: 14,
  },
  {
    id: "room-002",
    topic: "Wizkid vs Burna Boy — Afrobeats King",
    creatorName: "AfriMaven",
    creatorAddress: "0xbbbb",
    stake: 5,
    state: "WAITING",
    createdAt: Date.now() - 180_000,
    category: "Music",
    bettors: 31,
  },
  {
    id: "room-003",
    topic: "Bitcoin vs Ethereum — Future of Finance",
    creatorName: "CryptoSage",
    creatorAddress: "0xcccc",
    stake: 10,
    state: "LOCKED",
    createdAt: Date.now() - 900_000,
    category: "Crypto",
    bettors: 52,
  },
  {
    id: "room-004",
    topic: "iPhone vs Android — Which ecosystem wins",
    creatorName: "TechRealist",
    creatorAddress: "0xdddd",
    stake: 1,
    state: "WAITING",
    createdAt: Date.now() - 60_000,
    category: "Tech",
    bettors: 8,
  },
  {
    id: "room-005",
    topic: "LeBron vs Kobe — Greatest Laker ever",
    creatorName: "CourtVision",
    creatorAddress: "0xeeee",
    stake: 3,
    state: "LOCKED",
    createdAt: Date.now() - 1_200_000,
    category: "Sports",
    bettors: 67,
  },
];

const HOT_TAKES = [
  { label: "Kobe vs LeBron — GOAT debate", category: "Sports" },
  { label: "Wizkid vs Burna Boy — Afrobeats King", category: "Music" },
  { label: "iPhone vs Android — Ecosystem war", category: "Tech" },
  { label: "Messi vs Ronaldo — Greatest of All Time", category: "Sports" },
  { label: "Marvel vs DC — Better cinematic universe", category: "Culture" },
  { label: "Remote work vs Office — Future of work", category: "Tech" },
  { label: "Custom hot take...", category: "Custom" },
];

const CATEGORY_COLORS: Record<
  string,
  { fg: string; bg: string; glow: string }
> = {
  Sports: { fg: "#FFB800", bg: "rgba(255,184,0,0.1)", glow: "255,184,0" },
  Music: { fg: "#BE1A1A", bg: "rgba(190,26,26,0.1)", glow: "190,26,26" },
  Crypto: { fg: "#10B981", bg: "rgba(16,185,129,0.1)", glow: "16,185,129" },
  Tech: { fg: "#1A3FBE", bg: "rgba(26,63,190,0.1)", glow: "26,63,190" },
  Culture: { fg: "#7C3AED", bg: "rgba(124,58,237,0.1)", glow: "124,58,237" },
  Custom: { fg: "#F5F5F0", bg: "rgba(245,245,240,0.08)", glow: "245,245,240" },
};

// ─── Live ticker ──────────────────────────────────────────────────────────────
const TICKER_ITEMS = [
  "⚔️ TacticsTitan issued a challenge — $2 on Messi",
  "🔥 room-003 LOCKED — 52 watching",
  "💰 AfriMaven staked $5 on Wizkid",
  "⚡ New challenge: iPhone vs Android",
  "🏆 CourtVision vs BasketballGod — LeBron vs Kobe — LIVE",
  "🎤 Wizkid vs Burna Boy — 31 bettors in",
  "⚔️ CryptoSage challenged the arena — $10 USDC",
];

function LiveTicker() {
  const [offset, setOffset] = useState(0);
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setOffset((o) => o - 1);
    }, 30);
    return () => clearInterval(id);
  }, []);

  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <div className="relative overflow-hidden border-y border-white/6 bg-black/40 py-2">
      <div
        className="flex gap-0 whitespace-nowrap"
        style={{
          transform: `translateX(${(offset % (tickerRef.current?.scrollWidth ?? 0)) / 2}px)`,
          transition: "none",
        }}
      >
        {items.map((item, i) => (
          <span
            key={i}
            ref={i === 0 ? tickerRef : undefined}
            className="inline-flex items-center font-mono text-[10px] uppercase tracking-widest text-white/35 px-8"
          >
            {item}
            <span className="ml-8 text-white/10">|</span>
          </span>
        ))}
      </div>
      {/* Edge fade */}
      <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-clash-black to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-clash-black to-transparent pointer-events-none" />
    </div>
  );
}

// ─── Challenge card ───────────────────────────────────────────────────────────
function ChallengeCard({
  room,
  index,
  onAccept,
}: {
  room: Room;
  index: number;
  onAccept: (room: Room) => void;
}) {
  const cat = CATEGORY_COLORS[room.category] ?? CATEGORY_COLORS.Custom;
  const isWaiting = room.state === "WAITING";
  const age = Math.floor((Date.now() - room.createdAt) / 60000);
  const ageLabel = age < 60 ? `${age}m ago` : `${Math.floor(age / 60)}h ago`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.06,
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="group relative overflow-hidden cursor-pointer"
      onClick={() => isWaiting && onAccept(room)}
    >
      {/* Glow bloom on hover */}
      <div
        className="absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-none"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 0%, rgba(${cat.glow},0.12) 0%, transparent 70%)`,
        }}
      />

      {/* Left accent bar — pulses on WAITING */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: isWaiting ? cat.fg : "rgba(255,255,255,0.08)" }}
      >
        {isWaiting && (
          <motion.div
            className="absolute inset-0"
            style={{ background: cat.fg }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          />
        )}
      </div>

      {/* Main card */}
      <div
        className="relative border border-white/6 group-hover:border-white/12 transition-colors duration-300 ml-0"
        style={{
          background: isWaiting
            ? `linear-gradient(135deg, rgba(${cat.glow},0.04) 0%, transparent 60%)`
            : "rgba(255,255,255,0.01)",
        }}
      >
        {/* Top strip */}
        <div
          className="h-[1px] w-full transition-all duration-500"
          style={{
            background: isWaiting
              ? `linear-gradient(90deg, ${cat.fg}60, transparent 60%)`
              : "rgba(255,255,255,0.04)",
          }}
        />

        <div className="flex items-stretch">
          {/* Stake column — left side visual anchor */}
          <div
            className="flex-shrink-0 flex flex-col items-center justify-center px-4 sm:px-6 py-5 border-r"
            style={{
              borderColor: isWaiting
                ? `rgba(${cat.glow},0.15)`
                : "rgba(255,255,255,0.04)",
              background: isWaiting ? `rgba(${cat.glow},0.05)` : "transparent",
            }}
          >
            <span
              className="font-display text-2xl sm:text-3xl font-extrabold leading-none"
              style={{ color: isWaiting ? cat.fg : "rgba(255,255,255,0.2)" }}
            >
              ${room.stake}
            </span>
            <span
              className="font-mono text-[8px] uppercase tracking-widest mt-1 block"
              style={{
                color: isWaiting
                  ? `rgba(${cat.glow},0.5)`
                  : "rgba(255,255,255,0.15)",
              }}
            >
              USDC
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 px-4 sm:px-6 py-4 min-w-0">
            {/* Meta row */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {/* State badge */}
              <span
                className="font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border"
                style={
                  isWaiting
                    ? {
                        color: cat.fg,
                        borderColor: `${cat.fg}40`,
                        background: cat.bg,
                      }
                    : {
                        color: "rgba(255,255,255,0.3)",
                        borderColor: "rgba(255,255,255,0.08)",
                        background: "transparent",
                      }
                }
              >
                {isWaiting ? "⚔ OPEN" : "🔒 LOCKED"}
              </span>

              {/* Category */}
              <span
                className="font-mono text-[9px] uppercase tracking-widest px-2 py-0.5"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                {room.category}
              </span>

              <span className="font-mono text-[9px] text-white/20 ml-auto">
                {ageLabel}
              </span>
            </div>

            {/* Topic — the challenge */}
            <p
              className="font-display font-extrabold uppercase leading-tight text-base sm:text-lg mb-2 transition-colors duration-200 group-hover:text-clash-white"
              style={{
                color: isWaiting ? "#F5F5F0" : "rgba(245,245,240,0.35)",
              }}
            >
              {room.topic}
            </p>

            {/* Creator + bettors */}
            <div className="flex items-center gap-4">
              <span className="font-body text-xs text-white/30">
                Challenged by{" "}
                <span className="text-white/50 font-medium">
                  {room.creatorName}
                </span>
              </span>
              <span className="font-mono text-[10px] text-white/25">
                {room.bettors} watching
              </span>
            </div>
          </div>

          {/* Action column */}
          <div className="flex-shrink-0 flex items-center px-4 sm:px-6">
            {isWaiting ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onAccept(room);
                }}
                className="relative overflow-hidden font-display text-xs font-bold uppercase tracking-widest px-4 sm:px-6 py-3 text-black"
                style={{ background: cat.fg }}
              >
                <motion.div
                  className="absolute inset-0 bg-white/20"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.35 }}
                />
                <span className="relative">Accept</span>
              </motion.button>
            ) : (
              <Link
                href={`/arena/${room.id}`}
                className="font-mono text-[10px] uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors px-2 sm:px-4 py-3 border border-white/8 hover:border-white/15"
              >
                Watch →
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Create room drawer ───────────────────────────────────────────────────────
function CreateDrawer({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (topic: string, stake: number) => void;
}) {
  const [selectedTopic, setSelectedTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [stake, setStake] = useState(1);

  const finalTopic =
    selectedTopic === "Custom hot take..." ? customTopic : selectedTopic;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 300 }}
        className="relative w-full sm:max-w-2xl bg-clash-black border border-white/12 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gold top bar */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-clash-gold to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/6">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-clash-gold/60 mb-1">
              Issue a Challenge
            </p>
            <h3 className="font-display text-xl font-extrabold text-clash-white uppercase">
              New Challenge Room
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-all font-mono text-xs"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Topic selection */}
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-3">
              Pick your hot take
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {HOT_TAKES.map((take) => {
                const isSelected = selectedTopic === take.label;
                const cat =
                  CATEGORY_COLORS[take.category] ?? CATEGORY_COLORS.Custom;
                return (
                  <button
                    key={take.label}
                    onClick={() => setSelectedTopic(take.label)}
                    className="relative text-left px-4 py-3 border transition-all duration-200 overflow-hidden group"
                    style={{
                      borderColor: isSelected
                        ? `${cat.fg}50`
                        : "rgba(255,255,255,0.07)",
                      background: isSelected ? cat.bg : "transparent",
                    }}
                  >
                    {isSelected && (
                      <motion.div
                        layoutId="topicHighlight"
                        className="absolute left-0 top-0 bottom-0 w-[2px]"
                        style={{ background: cat.fg }}
                      />
                    )}
                    <span
                      className="block font-mono text-[9px] uppercase tracking-widest mb-1 transition-colors"
                      style={{
                        color: isSelected
                          ? `${cat.fg}80`
                          : "rgba(255,255,255,0.2)",
                      }}
                    >
                      {take.category}
                    </span>
                    <span
                      className="font-display text-sm font-bold uppercase transition-colors"
                      style={{
                        color: isSelected ? cat.fg : "rgba(245,245,240,0.55)",
                      }}
                    >
                      {take.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom topic input */}
          <AnimatePresence>
            {selectedTopic === "Custom hot take..." && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-2">
                  Write your take
                </p>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g. Davido vs Wizkid — who moved the culture more?"
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    className="w-full bg-transparent border border-white/10 focus:border-clash-gold/40 px-4 py-3 font-body text-sm text-clash-white placeholder-white/20 outline-none transition-colors"
                    autoFocus
                  />
                  <div className="absolute inset-x-0 bottom-0 h-[1px] bg-clash-gold/0 focus-within:bg-clash-gold/30 transition-colors" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stake selector */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/30">
                Stake per side
              </p>
              <p className="font-mono text-[9px] text-white/20">
                Winner takes both sides
              </p>
            </div>
            <div className="flex gap-2">
              {[0.5, 1, 2, 5, 10].map((s) => (
                <button
                  key={s}
                  onClick={() => setStake(s)}
                  className="relative flex-1 py-3 border transition-all duration-200 group overflow-hidden"
                  style={{
                    borderColor:
                      stake === s
                        ? "rgba(255,184,0,0.5)"
                        : "rgba(255,255,255,0.07)",
                    background:
                      stake === s ? "rgba(255,184,0,0.08)" : "transparent",
                  }}
                >
                  {stake === s && (
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-clash-gold/60" />
                  )}
                  <span
                    className="font-display text-sm font-bold transition-colors"
                    style={{
                      color: stake === s ? "#FFB800" : "rgba(255,255,255,0.3)",
                    }}
                  >
                    ${s}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Summary + CTA */}
          <div className="border border-white/6 p-4 bg-white/[0.015]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-1">
                  Your challenge
                </p>
                <p className="font-display text-sm font-bold text-clash-white uppercase leading-tight">
                  {finalTopic || "Select a topic above"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-1">
                  At stake
                </p>
                <p className="font-display text-2xl font-extrabold text-clash-gold leading-none">
                  ${stake}
                </p>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => finalTopic && onSubmit(finalTopic, stake)}
              disabled={!finalTopic}
              className="relative w-full py-4 font-display text-sm font-extrabold uppercase tracking-widest text-black overflow-hidden disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
              style={{ background: finalTopic ? "#FFB800" : "#FFB800" }}
            >
              <motion.div
                className="absolute inset-0 bg-white/20"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ duration: 0.4 }}
              />
              <span className="relative">
                Issue the Challenge — ${stake} USDC
              </span>
            </motion.button>

            <p className="font-mono text-[9px] text-center text-white/20 mt-3">
              Stake locked until a challenger accepts. Cancel anytime before
              that.
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Arena stat pill ──────────────────────────────────────────────────────────
function StatPill({
  value,
  label,
  accent = "#FFB800",
}: {
  value: string;
  label: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-3 border border-white/6">
      <span
        className="font-display text-2xl font-extrabold leading-none"
        style={{ color: accent }}
      >
        {value}
      </span>
      <span className="font-mono text-[8px] uppercase tracking-widest text-white/30 mt-1">
        {label}
      </span>
    </div>
  );
}

// ─── Pulsing ring decoration ──────────────────────────────────────────────────
function PulseRing({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {[1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border"
          style={{ borderColor: `${color}15` }}
          animate={{
            width: [`${i * 120}px`, `${i * 180}px`],
            height: [`${i * 120}px`, `${i * 180}px`],
            opacity: [0.4, 0],
          }}
          transition={{
            duration: 3,
            delay: i * 0.8,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LobbyPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [pendingTopic, setPendingTopic] = useState("");
  const [pendingStake, setPendingStake] = useState(1);
  const [filter, setFilter] = useState<"ALL" | "WAITING" | "LOCKED">("ALL");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const waitingRooms = MOCK_ROOMS.filter((r) => r.state === "WAITING").length;
  const totalPool = MOCK_ROOMS.reduce((acc, r) => acc + r.stake * 2, 0);

  const filtered = MOCK_ROOMS.filter((r) =>
    filter === "ALL" ? true : r.state === filter,
  );

  function handleAccept(room: Room) {
    setPendingTopic(room.topic);
    setPendingStake(room.stake);
    setShowBudget(true);
  }

  function handleCreateSubmit(topic: string, stake: number) {
    setPendingTopic(topic);
    setPendingStake(stake);
    setShowCreate(false);
    setShowBudget(true);
  }

  return (
    <main
      className="min-h-screen relative overflow-hidden"
      style={{ background: "#0A0A0F" }}
    >
      {/* ── Atmospheric background ─────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,184,0,0.06) 0%, transparent 70%), radial-gradient(ellipse 80% 50% at 50% 100%, rgba(190,26,26,0.04) 0%, transparent 70%)",
        }}
      />

      {/* Grid texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      

      {/* ── Ticker ──────────────────────────────────────────────────────────── */}
      <LiveTicker />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* ── Hero area ────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-10 sm:mb-14 text-center"
        >
          {/* Pulse rings behind heading */}
          <div className="relative inline-block">
            <PulseRing color="#FFB800" />

            <p className="relative font-mono text-[10px] uppercase tracking-[0.4em] text-clash-gold/60 mb-3">
              Hot Take Rooms
            </p>

            <h1 className="relative font-display text-4xl sm:text-5xl md:text-6xl font-extrabold uppercase leading-none mb-4">
              <span className="text-clash-white">THE CHALLENGE</span>
              <br />
              <span
                className="block mt-1"
                style={{
                  WebkitTextStroke: "1px rgba(255,184,0,0.5)",
                  color: "transparent",
                }}
              >
                IS WAITING
              </span>
            </h1>
          </div>

          <p className="font-body text-sm sm:text-base text-white/40 max-w-md mx-auto mb-8 leading-relaxed">
            Issue a hot take. Lock your stake. Wait for someone brave enough to
            step in. Your AI agent will fight for your belief.
          </p>

          {/* Live stats row */}
          <div className="flex items-stretch justify-center gap-0 border border-white/6 max-w-sm mx-auto overflow-hidden">
            <StatPill
              value={String(waitingRooms)}
              label="Open challenges"
              accent="#FFB800"
            />
            <div className="w-px bg-white/6" />
            <StatPill
              value={`$${totalPool}`}
              label="Total at stake"
              accent="#BE1A1A"
            />
            <div className="w-px bg-white/6" />
            <StatPill
              value={String(MOCK_ROOMS.reduce((a, r) => a + r.bettors, 0))}
              label="Watching"
              accent="#10B981"
            />
          </div>
        </motion.div>

        {/* ── Issue challenge CTA ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="relative mb-8"
        >
          <div
            className="relative border border-dashed border-clash-gold/25 p-5 sm:p-7 text-center overflow-hidden group cursor-pointer hover:border-clash-gold/50 transition-colors duration-300"
            onClick={() => setShowCreate(true)}
          >
            {/* Corner brackets */}
            {[
              "top-0 left-0 border-l-2 border-t-2",
              "top-0 right-0 border-r-2 border-t-2",
              "bottom-0 left-0 border-l-2 border-b-2",
              "bottom-0 right-0 border-r-2 border-b-2",
            ].map((cls, i) => (
              <div
                key={i}
                className={`absolute ${cls} w-4 h-4 border-clash-gold/40 group-hover:border-clash-gold/80 transition-colors duration-300`}
              />
            ))}

            {/* Hover glow */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                background:
                  "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(255,184,0,0.05) 0%, transparent 70%)",
              }}
            />

            <motion.div
              className="relative"
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* Animated plus */}
              <div className="inline-flex items-center justify-center w-12 h-12 border border-clash-gold/30 group-hover:border-clash-gold/70 mb-4 transition-colors duration-300 relative">
                <span className="text-clash-gold/60 group-hover:text-clash-gold text-2xl font-bold transition-colors duration-300 leading-none">
                  ⚔
                </span>
                <motion.div
                  className="absolute -inset-1 border border-clash-gold/20"
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 12,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              </div>

              <p className="font-display text-lg sm:text-xl font-extrabold uppercase text-white/80 group-hover:text-clash-white mb-1 transition-colors duration-200">
                Issue a Challenge
              </p>
              <p className="font-body text-sm text-white/30">
                Post your hot take. Stake USDC. Wait for a challenger.
              </p>
            </motion.div>
          </div>
        </motion.div>

        {/* ── Filter strip (mobile) ────────────────────────────────────────── */}
        <div className="sm:hidden flex gap-1 mb-5 border border-white/6 p-0.5 overflow-hidden">
          {["ALL", "WAITING", "LOCKED"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className="flex-1 py-2 font-mono text-[9px] uppercase tracking-widest transition-all duration-200"
              style={{
                color: filter === f ? "#0A0A0F" : "rgba(255,255,255,0.3)",
                background: filter === f ? "#FFB800" : "transparent",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* ── Section label ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 mb-4">
          <span className="font-mono text-[9px] uppercase tracking-widest text-white/25">
            Active challenges
          </span>
          <div className="flex-1 h-px bg-white/5" />
          <span className="font-mono text-[9px] text-white/20">
            {filtered.length} rooms
          </span>
        </div>

        {/* ── Challenge list ──────────────────────────────────────────────── */}
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((room, i) => (
              <ChallengeCard
                key={room.id}
                room={room}
                index={i}
                onAccept={handleAccept}
              />
            ))}
          </AnimatePresence>

          {filtered.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 border border-white/5"
            >
              <p className="font-display text-sm text-white/20 uppercase tracking-widest">
                No challenges yet
              </p>
              <p className="font-body text-xs text-white/15 mt-1">
                Be the first to issue one
              </p>
            </motion.div>
          )}
        </div>

        {/* ── Bottom callout ────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-14 border border-white/6 p-6 sm:p-8 text-center relative overflow-hidden"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 60% 80% at 50% 100%, rgba(190,26,26,0.06) 0%, transparent 70%)",
            }}
          />
          <p className="relative font-mono text-[9px] uppercase tracking-[0.35em] text-white/25 mb-3">
            Not ready to challenge?
          </p>
          <p className="relative font-display text-xl sm:text-2xl font-extrabold uppercase text-clash-white mb-2">
            Watch the live arena instead
          </p>
          <p className="relative font-body text-sm text-white/35 mb-5">
            Bet on battles already in progress.
          </p>
          <Link
            href="/"
            className="relative inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 px-6 py-3 transition-all"
          >
            Back to arena →
          </Link>
        </motion.div>
      </div>

      {/* ── Create room drawer ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreate && (
          <CreateDrawer
            onClose={() => setShowCreate(false)}
            onSubmit={handleCreateSubmit}
          />
        )}
      </AnimatePresence>

      {/* ── Budget screen modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showBudget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <BudgetScreen
              onConfirm={(budget) => {
                console.log("Budget set:", budget, "topic:", pendingTopic);
                setShowBudget(false);
                setShowCreate(false);
              }}
              onCancel={() => setShowBudget(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
