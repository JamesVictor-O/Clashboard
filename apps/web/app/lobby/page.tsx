"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
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
  const isHot = room.bettors > 25;
  const age = Math.floor((Date.now() - room.createdAt) / 60000);
  const ageLabel = age < 60 ? `${age}m ago` : `${Math.floor(age / 60)}h ago`;

  // Split topic to highlight "vs" text
  const topicParts = room.topic.split(/(\bvs\b\.?)/i);

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="group relative overflow-hidden cursor-pointer"
      onClick={() => isWaiting && onAccept(room)}
    >
      {/* ── Base + atmosphere ──────────────────────────────────────── */}
      <div className="absolute inset-0 bg-[#0A0A0F]" />

      {/* Category glow — stronger on OPEN, whisper on LOCKED */}
      <div
        className="absolute inset-y-0 left-0 w-3/4 pointer-events-none transition-opacity duration-500"
        style={{
          background: `radial-gradient(ellipse 70% 100% at 0% 50%, rgba(${cat.glow},${isWaiting ? 0.14 : 0.05}) 0%, transparent 75%)`,
          opacity: isWaiting ? 0.8 : 1,
        }}
      />

      {/* Hover intensify */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-400"
        style={{
          background: `radial-gradient(ellipse 60% 100% at 0% 50%, rgba(${cat.glow},0.1) 0%, transparent 70%)`,
        }}
      />

      {/* ── Borders ───────────────────────────────────────────────── */}
      {/* Outer border */}
      <div
        className="absolute inset-0 border pointer-events-none transition-colors duration-300"
        style={{
          borderColor: isWaiting
            ? `rgba(${cat.glow},0.28)`
            : "rgba(255,255,255,0.07)",
        }}
      />
      {/* Hover border brightens */}
      <div
        className="absolute inset-0 border border-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ borderColor: isWaiting ? `${cat.fg}55` : "rgba(255,255,255,0.12)" }}
      />

      {/* ── Top accent line ───────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: isWaiting
            ? `linear-gradient(90deg, ${cat.fg}80 0%, ${cat.fg}20 50%, transparent 100%)`
            : `linear-gradient(90deg, rgba(${cat.glow},0.15) 0%, transparent 60%)`,
        }}
      />

      {/* ── Left pulse bar (OPEN only) ────────────────────────────── */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] pointer-events-none"
        style={{ background: isWaiting ? cat.fg : "rgba(255,255,255,0.05)" }}
      >
        {isWaiting && (
          <motion.div
            className="absolute inset-0"
            style={{ background: `linear-gradient(180deg, ${cat.fg}, ${cat.fg}55)` }}
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </div>

      {/* ── Scanline sweep on hover (OPEN) ────────────────────────── */}
      {isWaiting && (
        <motion.div
          className="absolute left-0 right-0 h-[1px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{
            background: `linear-gradient(90deg, transparent 0%, rgba(${cat.glow},0.45) 50%, transparent 100%)`,
          }}
          animate={{ top: ["0%", "100%"] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "linear", repeatDelay: 0.6 }}
        />
      )}

      {/* ── Layout ────────────────────────────────────────────────── */}
      <div className="relative flex items-stretch">

        {/* Stake column */}
        <div
          className="flex-shrink-0 flex flex-col items-center justify-center px-4 sm:px-6 py-5 border-r"
          style={{
            borderColor: isWaiting
              ? `rgba(${cat.glow},0.18)`
              : "rgba(255,255,255,0.05)",
            background: isWaiting ? `rgba(${cat.glow},0.06)` : "transparent",
            minWidth: "82px",
          }}
        >
          <span
            className="font-display font-extrabold leading-none transition-all duration-300"
            style={{
              fontSize: "clamp(1.55rem, 3.5vw, 2.1rem)",
              color: isWaiting ? cat.fg : "rgba(255,255,255,0.18)",
              textShadow: isWaiting ? `0 0 22px rgba(${cat.glow},0.55)` : "none",
            }}
          >
            ${room.stake}
          </span>
          <span
            className="font-mono text-[8px] uppercase tracking-widest mt-1.5 block"
            style={{
              color: isWaiting ? `rgba(${cat.glow},0.5)` : "rgba(255,255,255,0.14)",
            }}
          >
            USDC
          </span>
          <span className="font-mono text-[7px] uppercase tracking-widest text-white/12 mt-0.5 block">
            per side
          </span>
        </div>

        {/* Main content */}
        <div className="flex-1 px-4 sm:px-6 py-4 sm:py-5 min-w-0">

          {/* Meta row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {/* Status badge */}
            <span
              className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 border transition-all duration-200"
              style={
                isWaiting
                  ? { color: cat.fg, borderColor: `${cat.fg}45`, background: cat.bg }
                  : { color: "rgba(255,255,255,0.28)", borderColor: "rgba(255,255,255,0.08)", background: "transparent" }
              }
            >
              {isWaiting ? (
                <>
                  <motion.span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: cat.fg }}
                    animate={{ opacity: [1, 0.25, 1], scale: [1, 1.4, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  OPEN
                </>
              ) : (
                <>
                  <span className="opacity-60">🔒</span>
                  LOCKED
                </>
              )}
            </span>

            {/* Category */}
            <span className="font-mono text-[9px] uppercase tracking-widest text-white/22">
              {room.category}
            </span>

            {/* Hot badge */}
            {isHot && isWaiting && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 border"
                style={{
                  color: "#FF6B00",
                  borderColor: "rgba(255,107,0,0.35)",
                  background: "rgba(255,107,0,0.08)",
                }}
              >
                🔥 Hot
              </motion.span>
            )}

            {/* Watcher + age — right side */}
            <div className="flex items-center gap-2 ml-auto">
              <div className="flex items-center gap-1">
                {isWaiting && (
                  <motion.span
                    className="w-1 h-1 rounded-full"
                    style={{ background: "#22C55E" }}
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
                  />
                )}
                <span className="font-mono text-[9px] text-white/22">
                  {room.bettors} watching
                </span>
              </div>
              <span className="font-mono text-[9px] text-white/14">{ageLabel}</span>
            </div>
          </div>

          {/* Topic — VS highlighted */}
          <p
            className="font-display font-extrabold uppercase leading-tight mb-2.5 transition-colors duration-200 group-hover:text-clash-white"
            style={{
              fontSize: "clamp(1rem, 2.4vw, 1.22rem)",
              color: isWaiting ? "#F5F5F0" : "rgba(245,245,240,0.28)",
            }}
          >
            {topicParts.map((part, i) =>
              /^vs\.?$/i.test(part.trim()) ? (
                <span
                  key={i}
                  className="font-extrabold mx-1"
                  style={{
                    color: isWaiting ? cat.fg : `rgba(${cat.glow},0.3)`,
                    textShadow: isWaiting ? `0 0 16px rgba(${cat.glow},0.5)` : "none",
                  }}
                >
                  {part}
                </span>
              ) : (
                <span key={i}>{part}</span>
              )
            )}
          </p>

          {/* Creator line */}
          <div className="flex items-center gap-3">
            <span className="font-body text-xs text-white/28">
              Challenged by{" "}
              <span className="font-medium text-white/48">{room.creatorName}</span>
            </span>

            {/* Watcher heat bar */}
            {isWaiting && (
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <div
                    key={i}
                    className="w-1 h-2.5 rounded-sm transition-all duration-300"
                    style={{
                      background:
                        i < Math.ceil((room.bettors / 80) * 5)
                          ? cat.fg
                          : "rgba(255,255,255,0.06)",
                      opacity: i < Math.ceil((room.bettors / 80) * 5) ? 0.7 : 1,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action column */}
        <div className="flex-shrink-0 flex items-center px-3 sm:px-5">
          {isWaiting ? (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => { e.stopPropagation(); onAccept(room); }}
              className="relative overflow-hidden font-display text-xs sm:text-sm font-extrabold uppercase tracking-widest px-4 sm:px-6 py-3.5 text-clash-black"
              style={{ background: cat.fg }}
            >
              <motion.div
                className="absolute inset-0 bg-white/25"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ duration: 0.32 }}
              />
              <span className="relative whitespace-nowrap">Accept →</span>
            </motion.button>
          ) : (
            <Link
              href={`/arena/${room.id}`}
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-[10px] uppercase tracking-widest text-white/25 hover:text-white/55 transition-colors px-3 sm:px-5 py-3.5 border border-white/8 hover:border-white/18 whitespace-nowrap"
            >
              Watch →
            </Link>
          )}
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
    selectedTopic === "Custom hot take..." ? customTopic.trim() : selectedTopic;

  const activeCat =
    CATEGORY_COLORS[
      selectedTopic === "Custom hot take..."
        ? "Custom"
        : (HOT_TAKES.find((h) => h.label === selectedTopic)?.category ?? "Custom")
    ] ?? CATEGORY_COLORS.Custom;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "60%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "60%", opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 340 }}
        className="relative w-full sm:max-w-2xl bg-[#0A0A0F] overflow-hidden flex flex-col"
        style={{
          border: "1px solid rgba(255,255,255,0.1)",
          maxHeight: "92dvh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Animated top accent bar ──────────────────────────────── */}
        <motion.div
          className="h-[2px] w-full flex-shrink-0"
          style={{
            background: finalTopic
              ? `linear-gradient(90deg, transparent 0%, ${activeCat.fg} 40%, ${activeCat.fg} 60%, transparent 100%)`
              : "linear-gradient(90deg, transparent 0%, #FFB800 40%, #FFB800 60%, transparent 100%)",
          }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        />

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex-shrink-0 relative px-6 py-5 border-b border-white/6">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 120% at 50% -20%, rgba(255,184,0,0.05) 0%, transparent 70%)",
            }}
          />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-clash-gold/55 mb-1.5">
                Declare your battle
              </p>
              <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-clash-white uppercase leading-none tracking-tight">
                New Challenge Room
              </h3>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center border border-white/10 text-white/35 hover:text-white/70 hover:border-white/25 transition-all font-display text-sm mt-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8">

            {/* Topic selection */}
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/25 mb-4">
                Pick your hot take
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {HOT_TAKES.map((take) => {
                  const isSelected = selectedTopic === take.label;
                  const c =
                    CATEGORY_COLORS[take.category] ?? CATEGORY_COLORS.Custom;
                  return (
                    <button
                      key={take.label}
                      onClick={() => setSelectedTopic(take.label)}
                      className="relative text-left p-4 border transition-all duration-250 overflow-hidden group"
                      style={{
                        borderColor: isSelected
                          ? `${c.fg}50`
                          : "rgba(255,255,255,0.07)",
                        background: isSelected
                          ? `linear-gradient(140deg, rgba(${c.glow},0.13) 0%, rgba(${c.glow},0.04) 100%)`
                          : "rgba(255,255,255,0.02)",
                      }}
                    >
                      {/* Hover glow overlay */}
                      {!isSelected && (
                        <div
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                          style={{
                            background: `radial-gradient(ellipse 90% 70% at 0% 50%, rgba(${c.glow},0.07) 0%, transparent 70%)`,
                          }}
                        />
                      )}

                      {/* Selected left accent */}
                      {isSelected && (
                        <motion.div
                          layoutId="topicAccent"
                          className="absolute left-0 top-0 bottom-0 w-[3px]"
                          style={{ background: c.fg }}
                        />
                      )}

                      {/* Category + check row */}
                      <div className="flex items-center justify-between mb-2.5">
                        <span
                          className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 border transition-all duration-200"
                          style={{
                            color: isSelected
                              ? c.fg
                              : "rgba(255,255,255,0.22)",
                            borderColor: isSelected
                              ? `${c.fg}45`
                              : "rgba(255,255,255,0.08)",
                            background: isSelected ? c.bg : "transparent",
                          }}
                        >
                          {take.category}
                        </span>

                        <AnimatePresence>
                          {isSelected && (
                            <motion.span
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              className="font-mono text-[8px] font-bold uppercase tracking-widest"
                              style={{ color: c.fg }}
                            >
                              ✓ Selected
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Topic text */}
                      <span
                        className="font-display text-sm font-extrabold uppercase leading-tight block transition-colors duration-200"
                        style={{
                          color: isSelected
                            ? "#F5F5F0"
                            : "rgba(245,245,240,0.45)",
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
                  <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/25 mb-3">
                    State your take
                  </p>
                  <div className="relative">
                    <textarea
                      rows={2}
                      placeholder="e.g. Davido vs Wizkid — who moved the culture more?"
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      maxLength={120}
                      className="w-full bg-transparent border border-white/10 focus:border-clash-gold/45 px-4 py-3.5 font-display text-sm font-extrabold uppercase text-clash-white placeholder-white/15 outline-none transition-colors resize-none leading-snug"
                      autoFocus
                    />
                    <div className="absolute inset-x-0 bottom-0 h-[1px] bg-clash-gold/0 focus-within:bg-clash-gold/35 transition-colors" />
                    <span className="absolute bottom-3 right-3 font-mono text-[9px] text-white/15 pointer-events-none">
                      {customTopic.length}/120
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Stake selector */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/25">
                  Stake per side
                </p>
                <p className="font-mono text-[9px] text-white/18">
                  Winner takes both
                </p>
              </div>
              <div className="flex gap-2">
                {[0.5, 1, 2, 5, 10].map((s) => {
                  const isSel = stake === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setStake(s)}
                      className="relative flex-1 py-4 border transition-all duration-200 overflow-hidden group"
                      style={{
                        borderColor: isSel
                          ? "rgba(255,184,0,0.55)"
                          : "rgba(255,255,255,0.07)",
                        background: isSel
                          ? "rgba(255,184,0,0.1)"
                          : "rgba(255,255,255,0.02)",
                      }}
                    >
                      {isSel && (
                        <motion.div
                          layoutId="stakeActive"
                          className="absolute top-0 left-0 right-0 h-[2px]"
                          style={{ background: "#FFB800" }}
                        />
                      )}
                      {!isSel && (
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/[0.025]" />
                      )}
                      <span
                        className="font-display text-base font-extrabold leading-none block"
                        style={{
                          color: isSel ? "#FFB800" : "rgba(255,255,255,0.28)",
                        }}
                      >
                        ${s}
                      </span>
                      <span
                        className="font-mono text-[8px] uppercase tracking-widest mt-1 block"
                        style={{
                          color: isSel
                            ? "rgba(255,184,0,0.48)"
                            : "rgba(255,255,255,0.15)",
                        }}
                      >
                        USDC
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Fight card summary + CTA ─────────────────────────── */}
            <div>
              {/* Declaration card */}
              <div
                className="relative p-5 mb-3 overflow-hidden transition-all duration-300"
                style={{
                  border: `1px solid ${finalTopic ? `${activeCat.fg}30` : "rgba(255,255,255,0.06)"}`,
                  background: finalTopic
                    ? `linear-gradient(140deg, rgba(${activeCat.glow},0.07) 0%, transparent 60%)`
                    : "rgba(255,255,255,0.015)",
                }}
              >
                {/* Top accent line on selection */}
                {finalTopic && (
                  <div
                    className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${activeCat.fg}50, transparent)`,
                    }}
                  />
                )}

                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-white/22 mb-2">
                      Your declaration
                    </p>
                    <p
                      className="font-display text-sm sm:text-base font-extrabold uppercase leading-snug transition-colors duration-200"
                      style={{
                        color: finalTopic ? "#F5F5F0" : "rgba(245,245,240,0.18)",
                      }}
                    >
                      {finalTopic || "Select a topic above"}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-white/22 mb-1.5">
                      At stake
                    </p>
                    <p
                      className="font-display text-4xl font-extrabold leading-none transition-colors duration-200"
                      style={{
                        color: finalTopic
                          ? activeCat.fg
                          : "rgba(255,255,255,0.18)",
                      }}
                    >
                      ${stake}
                    </p>
                    <p className="font-mono text-[8px] uppercase tracking-widest text-white/18 mt-1">
                      USDC
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-3.5 border-t border-white/6">
                  <span className="font-mono text-[9px] text-white/20">
                    Winner takes{" "}
                    <span className="text-white/38">${(stake * 2).toFixed(stake % 1 !== 0 ? 1 : 0)}</span>
                  </span>
                  <span className="w-px h-3 bg-white/10" />
                  <span className="font-mono text-[9px] text-white/20">
                    Locked until challenger accepts
                  </span>
                </div>
              </div>

              {/* CTA */}
              <motion.button
                whileHover={finalTopic ? { scale: 1.005 } : {}}
                whileTap={finalTopic ? { scale: 0.985 } : {}}
                onClick={() => finalTopic && onSubmit(finalTopic, stake)}
                disabled={!finalTopic}
                className="relative w-full py-5 font-display text-sm sm:text-base font-extrabold uppercase tracking-widest text-clash-black overflow-hidden transition-all duration-200"
                style={{
                  background: "#FFB800",
                  opacity: finalTopic ? 1 : 0.22,
                  cursor: finalTopic ? "pointer" : "not-allowed",
                }}
              >
                <motion.div
                  className="absolute inset-0 bg-white/25"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.4 }}
                />
                <span className="relative flex items-center justify-center gap-2.5">
                  <span className="text-base">⚔</span>
                  Issue the Challenge — ${stake} USDC
                </span>
              </motion.button>

              <p className="font-mono text-[8px] text-center text-white/15 mt-3 uppercase tracking-widest">
                Stake locked until accepted · Cancel anytime before that
              </p>
            </div>
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
  const [filter, setFilter] = useState<"ALL" | "WAITING" | "LOCKED">("ALL");

  const waitingRooms = MOCK_ROOMS.filter((r) => r.state === "WAITING").length;
  const totalPool = MOCK_ROOMS.reduce((acc, r) => acc + r.stake * 2, 0);

  const filtered = MOCK_ROOMS.filter((r) =>
    filter === "ALL" ? true : r.state === filter,
  );

  function handleAccept(room: Room) {
    setPendingTopic(room.topic);
    setShowBudget(true);
  }

  function handleCreateSubmit(topic: string, _stake: number) {
    setPendingTopic(topic);
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
          <button
            onClick={() => setShowCreate(true)}
            className="w-full group relative overflow-hidden text-left"
          >
            {/* Base bg */}
            <div className="absolute inset-0 bg-[#0A0A0F]" />

            {/* Left gold atmospheric glow */}
            <div
              className="absolute inset-y-0 left-0 w-2/3 pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                background:
                  "radial-gradient(ellipse 80% 100% at 0% 50%, rgba(255,184,0,0.13) 0%, transparent 70%)",
              }}
            />

            {/* Right ember glow */}
            <div
              className="absolute inset-y-0 right-0 w-1/2 pointer-events-none opacity-35 group-hover:opacity-70 transition-opacity duration-500"
              style={{
                background:
                  "radial-gradient(ellipse 80% 100% at 100% 50%, rgba(190,26,26,0.1) 0%, transparent 70%)",
              }}
            />

            {/* Border */}
            <div className="absolute inset-0 border border-clash-gold/20 group-hover:border-clash-gold/50 transition-colors duration-300 pointer-events-none" />

            {/* Top shimmer line */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-clash-gold/45 to-transparent" />
            {/* Bottom dim line */}
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-clash-gold/15 to-transparent" />

            {/* Scanline sweep */}
            <motion.div
              className="absolute left-0 right-0 h-[1px] pointer-events-none"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,184,0,0.35) 50%, transparent 100%)",
              }}
              animate={{ top: ["0%", "100%"] }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: "linear",
                repeatDelay: 2.5,
              }}
            />

            {/* Content */}
            <div className="relative flex items-center gap-5 sm:gap-8 px-5 sm:px-8 py-6 sm:py-7">
              {/* Icon block */}
              <div className="flex-shrink-0 relative">
                <div
                  className="w-13 h-13 sm:w-15 sm:h-15 w-[52px] h-[52px] sm:w-[58px] sm:h-[58px] flex items-center justify-center border border-clash-gold/30 group-hover:border-clash-gold/65 transition-colors duration-300 relative overflow-hidden"
                >
                  {/* Icon shimmer on hover */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-clash-gold/20 to-transparent opacity-0 group-hover:opacity-100"
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{
                      duration: 0.7,
                      repeat: Infinity,
                      repeatDelay: 2,
                    }}
                  />
                  <span
                    className="relative text-2xl sm:text-3xl leading-none select-none"
                    style={{
                      filter: "drop-shadow(0 0 10px rgba(255,184,0,0.55))",
                    }}
                  >
                    ⚔️
                  </span>
                </div>
                {/* Pulse rings */}
                {[1.5, 2.1].map((s, i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 border border-clash-gold/12"
                    animate={{ scale: [1, s], opacity: [0.5, 0] }}
                    transition={{
                      duration: 2.2,
                      delay: i * 0.7,
                      repeat: Infinity,
                      ease: "easeOut",
                    }}
                  />
                ))}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-clash-gold/50 group-hover:text-clash-gold/75 transition-colors duration-200 mb-1.5">
                  Your turn
                </p>
                <h3
                  className="font-display font-extrabold uppercase leading-none mb-2 text-white/80 group-hover:text-clash-white transition-colors duration-200"
                  style={{ fontSize: "clamp(1.1rem, 3vw, 1.6rem)" }}
                >
                  Throw Down the Gauntlet
                </h3>
                <p className="font-body text-sm text-white/28 group-hover:text-white/42 transition-colors duration-200 leading-snug">
                  Post your hot take · Stake USDC · Your AI agent fights for your belief
                </p>
              </div>

              {/* CTA pill */}
              <div className="flex-shrink-0 hidden sm:block">
                <div
                  className="relative overflow-hidden px-5 sm:px-6 py-3.5 font-display text-sm font-extrabold uppercase tracking-widest text-clash-black transition-all"
                  style={{ background: "#FFB800" }}
                >
                  <motion.div
                    className="absolute inset-0 bg-white/25"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "100%" }}
                    transition={{ duration: 0.35 }}
                  />
                  <span className="relative whitespace-nowrap">Issue →</span>
                </div>
              </div>
            </div>
          </button>
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
