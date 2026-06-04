"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keccak256, encodeAbiParameters, parseAbiParameters, parseAbiItem } from "viem";
import { ConnectWallet } from "@/components/shared/ConnectWallet";
import { AutonomyLog } from "@/components/autonomy/AutonomyLog";
import { HOTTAKEROOMS_ABI } from "@/lib/chain";
import { inferChallengeCategory, type Room } from "@/lib/challenges";
import { blockRanges, getEventScanStartBlock, mapWithConcurrency } from "@/lib/event-scan";
import {
  sendUserBatch,
  buildUSDCApprovalCall,
  waitForTx,
} from "@/lib/wallet-contract";

// Rooms are fetched live from on-chain RoomCreated events

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
  hasAgent,
  walletAddress,
}: {
  room: Room;
  index: number;
  onAccept: (room: Room) => void;
  hasAgent?: boolean | null;
  walletAddress?: string | null;
}) {
  const cat = CATEGORY_COLORS[room.category] ?? CATEGORY_COLORS.Custom;
  const isWaiting = room.state === "WAITING";
  const isCreator =
    !!walletAddress &&
    room.creatorAddress.toLowerCase() === walletAddress.toLowerCase();
  const canAccept = isWaiting && !isCreator && hasAgent !== false;
  const isHot = room.bettors > 25;
  const age = Math.floor((Date.now() - room.createdAt) / 60000);
  const ageLabel = age < 60 ? `${age}m ago` : `${Math.floor(age / 60)}h ago`;

  // Split topic to highlight "vs" text
  const topicParts = room.topic.split(/(\bvs\b\.?)/i);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.045, duration: 0.24, ease: [0, 0, 0.2, 1] }}
      whileHover={canAccept ? { y: -2 } : undefined}
      className={`group relative overflow-hidden ${canAccept ? "cursor-pointer" : "cursor-default"}`}
      onClick={() => canAccept && onAccept(room)}
    >
      {/* ── Base + atmosphere ──────────────────────────────────────── */}
      <div
        className="absolute inset-0 bg-[#0A0A0F]"
        style={{
          background: "#09090F",
        }}
      />

      {/* Category glow — stronger on OPEN, whisper on LOCKED */}
      <div
        className="absolute inset-y-0 left-0 w-3/4 pointer-events-none transition-opacity duration-500"
        style={{
          background: `radial-gradient(ellipse 52% 95% at 0% 50%, rgba(${cat.glow},${isWaiting ? 0.048 : 0.018}) 0%, transparent 74%)`,
          opacity: 1,
        }}
      />

      {/* Hover intensify */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-400"
        style={{
          background: `radial-gradient(ellipse 55% 100% at 0% 50%, rgba(${cat.glow},0.055) 0%, transparent 70%)`,
        }}
      />

      {/* ── Borders ───────────────────────────────────────────────── */}
      {/* Outer border */}
      <div
        className="absolute inset-0 border pointer-events-none transition-colors duration-300"
        style={{
          borderColor: isWaiting
            ? `rgba(${cat.glow},0.22)`
            : "rgba(255,255,255,0.07)",
        }}
      />
      {/* Hover border brightens */}
      <div
        className="absolute inset-0 border border-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ borderColor: isWaiting ? `rgba(${cat.glow},0.36)` : "rgba(255,255,255,0.12)" }}
      />

      {/* ── Top accent line ───────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: isWaiting
            ? `rgba(${cat.glow},0.32)`
            : "rgba(255,255,255,0.05)",
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

      {/* ── Quiet hover sheen (OPEN) ──────────────────────────────── */}
      {isWaiting && (
        <motion.div
          className="absolute inset-y-0 left-0 w-10 skew-x-[-16deg] pointer-events-none opacity-0 group-hover:opacity-100"
          style={{
            background: "rgba(255,255,255,0.045)",
          }}
          animate={{ x: [-80, 1380] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
        />
      )}

      {/* ── Layout ────────────────────────────────────────────────── */}
      <div className="relative grid grid-cols-1 md:grid-cols-[128px_1fr_auto] items-stretch">

        {/* Stake column */}
        <div
          className="relative flex min-h-24 flex-row md:flex-col items-center justify-between md:justify-center gap-4 px-5 py-5 border-b md:border-b-0 md:border-r overflow-hidden"
          style={{
            borderColor: isWaiting
              ? `rgba(${cat.glow},0.16)`
              : "rgba(255,255,255,0.05)",
            background: isWaiting ? `rgba(${cat.glow},0.045)` : "transparent",
          }}
        >
          <div className="relative md:text-center">
            <span
              className="font-display font-bold leading-none transition-all duration-300"
              style={{
                fontSize: "clamp(1.65rem, 3.6vw, 2.2rem)",
                color: isWaiting ? cat.fg : "rgba(255,255,255,0.18)",
                textShadow: isWaiting ? `0 0 10px rgba(${cat.glow},0.20)` : "none",
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
        </div>

        {/* Main content */}
        <div className="relative px-5 sm:px-7 py-5 sm:py-6 min-w-0">

          {/* Meta row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {/* Status badge */}
            <span
              className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 border transition-colors duration-150"
              style={
                isWaiting
                  ? { color: cat.fg, borderColor: `rgba(${cat.glow},0.25)`, background: "rgba(255,255,255,0.015)" }
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
                  background: "rgba(255,107,0,0.06)",
                }}
              >
                🔥 Hot
              </motion.span>
            )}

            {/* Watcher + age — right side */}
            <div className="flex items-center gap-2 sm:ml-auto">
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
            className="font-display font-bold uppercase leading-tight mb-2.5 transition-colors duration-200 group-hover:text-clash-white"
            style={{
              fontSize: "clamp(1.02rem, 2.45vw, 1.42rem)",
              color: isWaiting ? "rgba(245,245,240,0.86)" : "rgba(245,245,240,0.30)",
              textShadow: "none",
              letterSpacing: "0",
            }}
          >
            {topicParts.map((part, i) =>
              /^vs\.?$/i.test(part.trim()) ? (
                <span
                  key={i}
                  className="font-bold mx-1"
                  style={{
                    color: isWaiting ? cat.fg : `rgba(${cat.glow},0.3)`,
                    textShadow: "none",
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
          <div className="flex flex-wrap items-center gap-3">
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
        <div className="relative flex items-center justify-stretch md:justify-center px-5 sm:px-6 pb-5 md:py-5">
          {isWaiting ? (
            isCreator ? (
              <div
                className="w-full md:w-[156px] min-h-12 inline-flex items-center justify-center gap-2 border font-mono text-[10px] uppercase tracking-widest px-5 sm:px-6 py-3 whitespace-nowrap"
                style={{
                  background: "rgba(255,255,255,0.018)",
                  borderColor: `rgba(${cat.glow},0.20)`,
                  color: `rgba(${cat.glow},0.58)`,
                }}
              >
                <motion.span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: cat.fg }}
                  animate={{ opacity: [1, 0.25, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
                Waiting
              </div>
            ) : hasAgent === false ? (
              <Link
                href="/forge"
                onClick={(e) => e.stopPropagation()}
                className="w-full md:w-auto min-h-12 inline-flex items-center justify-center font-display text-xs font-semibold uppercase tracking-widest px-5 sm:px-7 py-3 border border-white/15 text-white/40 hover:text-white/70 hover:border-white/30 transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-clash-gold focus-visible:ring-offset-2 focus-visible:ring-offset-clash-black"
              >
                Forge Agent →
              </Link>
            ) : (
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={(e) => { e.stopPropagation(); onAccept(room); }}
                className="relative min-h-12 w-full md:w-[156px] overflow-hidden border font-display text-xs font-semibold uppercase tracking-widest px-5 sm:px-6 py-3 text-clash-white focus-visible:ring-2 focus-visible:ring-clash-gold focus-visible:ring-offset-2 focus-visible:ring-offset-clash-black"
                style={{
                  background: `rgba(${cat.glow},0.075)`,
                  borderColor: `rgba(${cat.glow},0.30)`,
                  color: cat.fg,
                }}
              >
                <motion.div
                  className="absolute inset-y-0 left-0 w-10 skew-x-[-18deg] bg-white/10 opacity-0 group-hover:opacity-100"
                  animate={{ x: ["-140%", "420%"] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.8 }}
                />
                <span className="relative whitespace-nowrap">Accept →</span>
              </motion.button>
            )
          ) : (
            <Link
              href={`/arena/${room.id}`}
              onClick={(e) => e.stopPropagation()}
              className="w-full md:w-auto min-h-12 inline-flex items-center justify-center font-mono text-[10px] uppercase tracking-widest text-white/25 hover:text-white/55 transition-colors px-5 py-3 border border-white/8 hover:border-white/18 whitespace-nowrap"
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
  onSubmit: (topic: string, stake: number) => Promise<void>;
}) {
  const [selectedTopic, setSelectedTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [stake, setStake] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const finalTopic =
    selectedTopic === "Custom hot take..." ? customTopic.trim() : selectedTopic;

  const handleSubmit = async () => {
    if (!finalTopic || submitting) return;
    setSubmitting(true);
    setTxError(null);
    try {
      await onSubmit(finalTopic, stake);
      // parent closes the drawer on success
    } catch (err) {
      let msg = "Transaction failed";
      if (err instanceof Error) {
        msg = err.message;
      } else if (typeof err === "object" && err !== null) {
        const e = err as Record<string, unknown>;
        msg = String(e.message ?? e.reason ?? e.shortMessage ?? JSON.stringify(err));
      }
      setTxError(msg);
      setSubmitting(false);
    }
  };

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
      onClick={submitting ? undefined : onClose}
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
                whileHover={finalTopic && !submitting ? { scale: 1.005 } : {}}
                whileTap={finalTopic && !submitting ? { scale: 0.985 } : {}}
                onClick={handleSubmit}
                disabled={!finalTopic || submitting}
                className="relative w-full py-5 font-display text-sm sm:text-base font-extrabold uppercase tracking-widest text-clash-black overflow-hidden transition-all duration-200"
                style={{
                  background: "#FFB800",
                  opacity: finalTopic && !submitting ? 1 : 0.5,
                  cursor: finalTopic && !submitting ? "pointer" : "not-allowed",
                }}
              >
                {!submitting && (
                  <motion.div
                    className="absolute inset-0 bg-white/25"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "100%" }}
                    transition={{ duration: 0.4 }}
                  />
                )}
                <span className="relative flex items-center justify-center gap-2.5">
                  {submitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-black/25 border-t-black/70 rounded-full animate-spin flex-shrink-0" />
                      Creating challenge…
                    </>
                  ) : (
                    <>
                      <span className="text-base">⚔</span>
                      Create Challenge — ${stake} USDC
                    </>
                  )}
                </span>
              </motion.button>

              {txError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 px-4 py-3 border border-red-500/30 bg-red-500/8 flex items-start gap-2"
                >
                  <span className="text-red-400 text-xs mt-0.5 flex-shrink-0">✕</span>
                  <p className="font-mono text-[10px] text-red-400/80 leading-relaxed">{txError}</p>
                </motion.div>
              )}

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

// ─── Rooms cache ──────────────────────────────────────────────────────────────
const ROOMS_CACHE_KEY = "clashboard_lobby_rooms";
const ROOMS_CACHE_TTL = 60; // seconds

function loadRoomsCache(): Room[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ROOMS_CACHE_KEY);
    if (!raw) return null;
    const { rooms, cachedAt } = JSON.parse(raw) as { rooms: Room[]; cachedAt: number };
    if (Math.floor(Date.now() / 1000) - cachedAt > ROOMS_CACHE_TTL) return null;
    return rooms;
  } catch { return null; }
}

function saveRoomsCache(rooms: Room[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ROOMS_CACHE_KEY, JSON.stringify({ rooms, cachedAt: Math.floor(Date.now() / 1000) }));
  } catch {}
}

async function fetchRooms(): Promise<Room[]> {
  const { getPublicClient, HOTTAKEROOMS_ABI: roomsAbi } = await import("@/lib/chain");
  const client = getPublicClient();
  const roomsAddress = process.env.NEXT_PUBLIC_HOTTAKEROOMS_CONTRACT as `0x${string}`;

  const latestBlock = await client.getBlockNumber();
  const ranges = blockRanges(getEventScanStartBlock(latestBlock), latestBlock);
  const event = parseAbiItem(
    "event RoomCreated(bytes32 indexed roomId, address indexed creator, uint256 stake, string topicPreview, uint256 expiresAt)"
  );

  const chunks = await mapWithConcurrency(ranges, 4, async ({ fromBlock, toBlock }) => {
    try {
      return await client.getLogs({ address: roomsAddress, event, fromBlock, toBlock });
    } catch {
      return [];
    }
  });
  const allLogs = chunks.flat();

  const topLogs = [...allLogs].reverse().slice(0, 30);

  // Fetch all room states in parallel (eth_call, not eth_getLogs — fine to batch)
  const roomResults = await Promise.allSettled(
    topLogs.map(async (log) => {
      const roomId = log.args.roomId as `0x${string}`;
      const creator = log.args.creator as `0x${string}`;
      const stakeWei = log.args.stake as bigint;
      const topicPreview = (log.args.topicPreview as string) ?? "";

      const roomData = (await client.readContract({
        address: roomsAddress,
        abi: roomsAbi,
        functionName: "getRoom",
        args: [roomId],
      }) as unknown) as { state: number; createdAt: bigint; expiresAt: bigint };

      // 0=OPEN, 1=LOCKED, 2=SETTLED, 3=CANCELLED — skip finished rooms
      if (roomData.state === 2 || roomData.state === 3) return null;

      const state: Room["state"] = roomData.state === 1 ? "LOCKED" : "WAITING";
      const topic = topicPreview;
      const categoryGuess =
        /sport|football|soccer|basketball|nba|nfl|kobe|lebron|messi|ronaldo/i.test(topic) ? "Sports" :
        /music|rap|hip.?hop|wizkid|burna|singer|song/i.test(topic) ? "Music" :
        /crypto|bitcoin|eth|web3|defi/i.test(topic) ? "Crypto" :
        /tech|iphone|android|ai|apple|google/i.test(topic) ? "Tech" : "Culture";

      return {
        id: roomId,
        topic,
        creatorName: `${creator.slice(0, 6)}…${creator.slice(-4)}`,
        creatorAddress: creator,
        stake: Number(stakeWei) / 1e6,
        state,
        createdAt: Number(roomData.createdAt) * 1000,
        category: categoryGuess,
        bettors: 0,
      } as Room;
    })
  );

  return roomResults.flatMap((r) => r.status === "fulfilled" && r.value !== null ? [r.value] : []);
}

// ─── My open challenges (cancel + refund) ────────────────────────────────────

function MyOpenChallenges({
  rooms,
  walletAddress,
  onCancel,
}: {
  rooms: Room[];
  walletAddress: string | null;
  onCancel: (roomId: string) => void;
}) {
  if (!walletAddress) return null;
  const mine = rooms.filter(
    (r) => r.state === "WAITING" && r.creatorAddress.toLowerCase() === walletAddress.toLowerCase()
  );
  if (mine.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 border border-clash-gold/20 overflow-hidden"
      style={{ background: "rgba(255,184,0,0.03)" }}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-clash-gold/10">
        <div className="flex items-center gap-2">
          <motion.span
            className="w-1.5 h-1.5 rounded-full bg-clash-gold"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          <span className="font-mono text-[9px] uppercase tracking-widest text-clash-gold/70">
            Your Open Challenges
          </span>
        </div>
        <span className="font-mono text-[9px] text-white/25">{mine.length} active</span>
      </div>
      <div className="divide-y divide-white/5">
        {mine.map((r) => (
          <div key={r.id} className="flex items-center gap-4 px-5 py-3">
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-bold text-white/80 uppercase truncate leading-tight">
                {r.topic}
              </p>
              <p className="font-mono text-[9px] text-white/30 mt-0.5">
                ${r.stake} staked · waiting for opponent
              </p>
            </div>
            <CancelChallengeButton roomId={r.id} stake={r.stake} onSuccess={() => onCancel(r.id)} />
          </div>
        ))}
      </div>
      <div className="px-5 py-2.5 border-t border-clash-gold/10">
        <p className="font-mono text-[8px] text-white/20 uppercase tracking-widest">
          Cancel any time before someone accepts to get your USDC back
        </p>
      </div>
    </motion.div>
  );
}

function CancelChallengeButton({
  roomId,
  stake,
  onSuccess,
}: {
  roomId: string;
  stake: number;
  onSuccess: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelling(true);
    setError(null);
    try {
      const { getProvider } = await import("@/lib/metamask");
      const provider = getProvider();
      if (!provider) throw new Error("Wallet not connected");
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      if (!accounts[0]) throw new Error("No wallet connected");

      const { HOTTAKEROOMS_ABI: abi } = await import("@/lib/chain");
      const { writeUserContract, waitForTx } = await import("@/lib/wallet-contract");

      const txHash = await writeUserContract({
        address: process.env.NEXT_PUBLIC_HOTTAKEROOMS_CONTRACT as `0x${string}`,
        abi,
        functionName: "cancelChallenge",
        args: [roomId as `0x${string}`],
        account: accounts[0] as `0x${string}`,
      });
      await waitForTx(txHash);
      onSuccess();
    } catch (err) {
      let msg = "Cancel failed";
      if (err instanceof Error) {
        msg = err.message;
      } else if (typeof err === "object" && err !== null) {
        const e = err as Record<string, unknown>;
        msg = String(e.message ?? e.reason ?? e.shortMessage ?? JSON.stringify(err));
      }
      setError(msg);
      setCancelling(false);
    }
  };

  return (
    <div className="flex-shrink-0 flex flex-col items-end gap-1">
      <button
        onClick={handleCancel}
        disabled={cancelling}
        className="font-mono text-[9px] uppercase tracking-widest px-3 py-2 border transition-colors disabled:opacity-40"
        style={{ borderColor: "rgba(239,68,68,0.3)", color: "rgba(239,68,68,0.7)" }}
      >
        {cancelling ? (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 border border-red-400/40 border-t-red-400 rounded-full animate-spin" />
            Cancelling…
          </span>
        ) : (
          `Cancel +$${stake} back`
        )}
      </button>
      {error && <p className="font-mono text-[8px] text-red-400/70 max-w-[180px] text-right">{error}</p>}
    </div>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────
function SkeletonCard({ index }: { index: number }) {
  const titleWidths = ["72%", "85%", "60%"];
  const creatorWidths = ["44%", "52%", "38%"];
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden border border-white/5 bg-[#0A0A0F]"
    >
      {/* Golden shimmer sweep */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute inset-y-0 w-[200%]"
          style={{ background: "linear-gradient(105deg, transparent 30%, rgba(255,184,0,0.04) 50%, transparent 70%)" }}
          animate={{ x: ["-50%", "50%"] }}
          transition={{ duration: 2.4, delay: index * 0.55, repeat: Infinity, ease: "linear" }}
        />
      </div>
      <div className="flex items-stretch">
        {/* Stake column */}
        <div className="flex-shrink-0 flex flex-col items-center justify-center px-4 sm:px-6 py-5 border-r border-white/5 min-w-[82px]">
          <div className="w-12 h-7 rounded-sm bg-white/6" />
          <div className="w-7 h-2 rounded-sm bg-white/4 mt-2" />
          <div className="w-10 h-1.5 rounded-sm bg-white/3 mt-1" />
        </div>
        {/* Content */}
        <div className="flex-1 px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-3.5 rounded-sm bg-white/6" />
            <div className="w-14 h-3.5 rounded-sm bg-white/4" />
            <div className="ml-auto w-16 h-2.5 rounded-sm bg-white/3" />
          </div>
          <div className="h-5 rounded-sm bg-white/8 mb-2.5" style={{ width: titleWidths[index] }} />
          <div className="h-2.5 rounded-sm bg-white/4" style={{ width: creatorWidths[index] }} />
        </div>
        {/* Button */}
        <div className="flex-shrink-0 flex items-center px-3 sm:px-5">
          <div className="w-[88px] h-11 rounded-sm bg-white/5" />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Challenges loader ────────────────────────────────────────────────────────
const LOADER_MSGS = [
  "Scanning the arena",
  "Summoning challengers",
  "Finding worthy opponents",
  "Loading battle rooms",
  "Preparing the gauntlet",
  "Searching for fighters",
];

function ChallengesLoader() {
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMsgIdx(i => (i + 1) % LOADER_MSGS.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      key="challenges-loader"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3 }}
      className="space-y-2"
    >
      {/* Arena scanner */}
      <div className="relative overflow-hidden border border-white/6 bg-[#0A0A0F] flex flex-col items-center py-10 mb-2">
        {/* Atmospheric glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 80% at 50% 50%, rgba(255,184,0,0.06) 0%, transparent 70%)" }}
        />
        {/* Horizontal scan line sweeping top to bottom */}
        <motion.div
          className="absolute inset-x-0 h-[1px] pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,184,0,0.55) 50%, transparent 100%)" }}
          animate={{ top: ["5%", "95%"] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "linear", repeatDelay: 0.4 }}
        />
        {/* Central icon + rings */}
        <div className="relative z-10 flex items-center justify-center" style={{ width: 80, height: 80 }}>
          {/* Expanding pulse rings */}
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-clash-gold/18"
              animate={{ scale: [1, 2.8 + i * 0.7], opacity: [0.6, 0] }}
              transition={{ duration: 2.2, delay: i * 0.65, repeat: Infinity, ease: "easeOut" }}
              style={{ width: 46, height: 46 }}
            />
          ))}
          {/* Icon box */}
          <motion.div
            className="relative z-10 w-16 h-16 flex items-center justify-center border"
            animate={{ borderColor: ["rgba(255,184,0,0.28)", "rgba(255,184,0,0.72)", "rgba(255,184,0,0.28)"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Corner accents */}
            {[
              "top-0 left-0 border-t border-l",
              "top-0 right-0 border-t border-r",
              "bottom-0 left-0 border-b border-l",
              "bottom-0 right-0 border-b border-r",
            ].map((cls, i) => (
              <div key={i} className={`absolute w-2.5 h-2.5 border-clash-gold/55 ${cls}`} />
            ))}
            <motion.span
              className="text-2xl select-none"
              style={{ filter: "drop-shadow(0 0 16px rgba(255,184,0,0.7))" }}
              animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.14, 1] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            >
              ⚔️
            </motion.span>
          </motion.div>
        </div>
        {/* Cycling battle message */}
        <div className="mt-8 h-4 flex items-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={msgIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28 }}
              className="font-mono text-[10px] uppercase tracking-[0.4em] text-clash-gold/60"
            >
              {LOADER_MSGS[msgIdx]}
            </motion.p>
          </AnimatePresence>
        </div>
        {/* Pulsing dots */}
        <div className="flex gap-1.5 mt-3.5">
          {[0, 1, 2].map(i => (
            <motion.span
              key={i}
              className="w-1 h-1 rounded-full bg-clash-gold/45"
              animate={{ opacity: [0.15, 1, 0.15] }}
              transition={{ duration: 1.1, delay: i * 0.22, repeat: Infinity }}
            />
          ))}
        </div>
      </div>
      {/* Skeleton cards */}
      {[0, 1, 2].map(i => <SkeletonCard key={i} index={i} />)}
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LobbyPage() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "WAITING" | "LOCKED">("ALL");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [hasAgent, setHasAgent] = useState<boolean | null>(null);
  const [noAgentToast, setNoAgentToast] = useState(false);
  const [acceptTxState, setAcceptTxState] = useState<"idle" | "approving" | "accepting" | "error">("idle");
  const [acceptTxError, setAcceptTxError] = useState<string | null>(null);

  useEffect(() => {
    // Show cached rooms immediately for instant UX, then refresh in background
    const cached = loadRoomsCache();
    if (cached && cached.length > 0) {
      setRooms(cached);
      setLoadingRooms(false);
    }

    fetchRooms()
      .then((fresh) => {
        // Only update state if we actually received rooms — prevents an RPC failure
        // returning [] from wiping rooms that were already shown from cache.
        if (fresh.length > 0) {
          setRooms(fresh);
          saveRoomsCache(fresh);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRooms(false));

    const checkAgent = async (addr: string) => {
      try {
        const { getPublicClient, REGISTRY_ABI } = await import("@/lib/chain");
        const client = getPublicClient();
        const exists = await client.readContract({
          address: process.env.NEXT_PUBLIC_REGISTRY_CONTRACT as `0x${string}`,
          abi: REGISTRY_ABI,
          functionName: "agentExists_",
          args: [addr as `0x${string}`],
        });
        setHasAgent(exists as boolean);
      } catch {
        // If registry is unreachable, assume no agent so the gate blocks correctly.
        // The user can refresh to retry once network recovers.
        setHasAgent(false);
      }
    };

    let cleanup: void | (() => void);
    const initWallet = async () => {
      const { getProvider, getSelectedWalletAddress } = await import("@/lib/metamask");
      const eth = getProvider();
      if (!eth) return;

      const selected = getSelectedWalletAddress();
      if (selected) {
        setWalletAddress(selected);
        checkAgent(selected);
      }

      // Keep wallet state in sync — account switch or disconnect in MetaMask
      const onAccountsChanged = (accs: unknown) => {
        const list = accs as string[];
        const addr = list[0] ?? null;
        setWalletAddress(addr);
        setHasAgent(null);
        if (addr) checkAgent(addr);
      };
      eth.on?.("accountsChanged", onAccountsChanged);
      return () => eth.removeListener?.("accountsChanged", onAccountsChanged);
    };

    initWallet().then((fn) => { cleanup = fn; }).catch(() => {});
    return () => cleanup?.();
  }, []);

  const waitingRooms = rooms.filter((r) => r.state === "WAITING").length;
  const totalPool = rooms.reduce((acc, r) => acc + r.stake * 2, 0);

  const filtered = rooms.filter((r) =>
    filter === "ALL" ? true : r.state === filter,
  );

  function handleAccept(room: Room) {
    if (hasAgent === false) {
      setNoAgentToast(true);
      setTimeout(() => setNoAgentToast(false), 5000);
      return;
    }
    void handleAcceptChallenge(room);
  }

  async function handleAcceptChallenge(room: Room) {
    setAcceptTxState("approving");
    setAcceptTxError(null);
    try {
      const { getProvider } = await import("@/lib/metamask");
      const provider = getProvider();
      if (!provider) throw new Error("Connect your wallet first");
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      if (!accounts[0]) throw new Error("No wallet connected");
      const account = accounts[0] as `0x${string}`;

      const battleId = keccak256(
        encodeAbiParameters(parseAbiParameters("bytes32,address,uint256"), [
          room.id as `0x${string}`, account, BigInt(Date.now()),
        ])
      ) as `0x${string}`;

      const roomsAddress = process.env.NEXT_PUBLIC_HOTTAKEROOMS_CONTRACT as `0x${string}`;
      const stakeWei = BigInt(Math.round(room.stake * 1_000_000));

      // Route: autonomous (1Shot) vs manual (EIP-5792 batch)
      const { executeAcceptChallenge } = await import("@/lib/autonomy/executor");
      const execution = await executeAcceptChallenge({
        agentOwner: account,
        roomId: room.id as `0x${string}`,
        battleId,
        stakeUsdc: room.stake,
        bettingDuration: 300n,
        roundDuration: 120n,
        maxResearch: 1_000_000n,
        isAgentTriggered: false,
      });

      if (execution.policyError) throw new Error(execution.policyError);

      if (execution.mode === "autonomous_oneshot") {
        // 1Shot executed — no wallet popup.
        setAcceptTxState("accepting");
        router.push("/game-lobby");
        return;
      }

      // No active permission: EIP-5792 batch fallback requires a wallet popup.
      setAcceptTxState("accepting");
      const approvalCall = await buildUSDCApprovalCall(account, roomsAddress, stakeWei);
      const acceptCall = {
        address: roomsAddress,
        abi: HOTTAKEROOMS_ABI,
        functionName: "acceptChallenge",
        args: [room.id as `0x${string}`, battleId, 300n, 120n, 1000000n] as readonly unknown[],
      };
      const calls = approvalCall ? [approvalCall, acceptCall] : [acceptCall];
      const txHash = await sendUserBatch(account, calls);
      await waitForTx(txHash);
      router.push("/game-lobby");
    } catch (err) {
      let msg = "Accept failed";
      if (err instanceof Error) {
        msg = err.message;
      } else if (typeof err === "object" && err !== null) {
        const e = err as Record<string, unknown>;
        msg = String(e.message ?? e.reason ?? e.shortMessage ?? JSON.stringify(err));
      }
      setAcceptTxError(msg);
      setAcceptTxState("error");
    }
  }

  async function handleCreateSubmit(topic: string, stakeUsdc: number): Promise<void> {
    const { getProvider } = await import("@/lib/metamask");
    const provider = getProvider();
    if (!provider) throw new Error("Connect your wallet first");

    const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
    if (!accounts[0]) throw new Error("No wallet connected");
    const account = accounts[0] as `0x${string}`;

    const roomsAddress = process.env.NEXT_PUBLIC_HOTTAKEROOMS_CONTRACT as `0x${string}`;
    const stakeWei = BigInt(Math.round(stakeUsdc * 1_000_000));
    const onChainTopic = topic.slice(0, 280);

    const roomId = keccak256(
      encodeAbiParameters(parseAbiParameters("address,string,uint256"), [
        account, onChainTopic, BigInt(Date.now()),
      ])
    ) as `0x${string}`;

    const topicHash = keccak256(
      encodeAbiParameters(parseAbiParameters("string"), [onChainTopic])
    ) as `0x${string}`;

    const categoryHash = keccak256(
      encodeAbiParameters(parseAbiParameters("string"), ["general"])
    ) as `0x${string}`;

    const { executeIssueChallenge } = await import("@/lib/autonomy/executor");
    const execution = await executeIssueChallenge({
      agentOwner: account,
      roomId,
      topicHash,
      topicPreview: onChainTopic,
      categoryHash,
      stakeUsdc,
      isAgentTriggered: false,
    });

    if (execution.policyError) throw new Error(execution.policyError);

    if (execution.mode !== "autonomous_oneshot") {
      const challengeCall = {
        address: roomsAddress,
        abi: HOTTAKEROOMS_ABI,
        functionName: "issueChallenge",
        args: [roomId, topicHash, onChainTopic, categoryHash, stakeWei] as readonly unknown[],
      };

      // No active permission: EIP-5792 fallback asks the user to sign once.
      const approvalCall = await buildUSDCApprovalCall(account, roomsAddress, stakeWei);
      const calls = approvalCall ? [approvalCall, challengeCall] : [challengeCall];
      const txHash = await sendUserBatch(account, calls);
      await waitForTx(txHash);
    }

    // Only reach here on success — optimistically add the new room immediately so
    // it appears in "My Open Challenges" without waiting for RPC event indexing.
    setRooms((prev) => [
      {
        id: roomId,
        topic,
        creatorName: `${account.slice(0, 6)}…${account.slice(-4)}`,
        creatorAddress: account,
        stake: stakeUsdc,
        state: "WAITING" as const,
        createdAt: Date.now(),
        category: inferChallengeCategory(topic),
        bettors: 0,
      },
      ...prev,
    ]);
    setWalletAddress(account);

    setShowCreate(false);
    setTimeout(() => fetchRooms().then((fresh) => { setRooms(fresh); saveRoomsCache(fresh); }).catch(() => {}), 4000);
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

      

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-white/6 bg-clash-black/80 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Clashboard" className="h-6 w-auto flex-shrink-0" />
            <span className="text-clash-gold">CLASH</span>
            <span className="text-white/40">BOARD</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6">
            {([
              { href: "/game-lobby", label: "Lobby" },
              { href: "/dashboard", label: "My Agent" },
              { href: "/agents", label: "Agents" },
              { href: "/lobby", label: "Challenges", active: true },
            ] as { href: string; label: string; active?: boolean }[]).map(l => (
              <Link
                key={l.label}
                href={l.href}
                className="font-mono text-[10px] uppercase tracking-widest transition-colors"
                style={{ color: l.active ? "#FFB800" : "rgba(255,255,255,0.3)" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <ConnectWallet />
        </div>
      </header>

      {/* ── Ticker ──────────────────────────────────────────────────────────── */}
      <div className="pt-[57px]">
        <LiveTicker />
      </div>

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
              value={String(rooms.reduce((a, r) => a + r.bettors, 0))}
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
            onClick={() => {
              if (hasAgent === false) {
                router.push("/forge");
                return;
              }
              setShowCreate(true);
            }}
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
                  Pick a topic · Stake USDC · Your AI agent fights for your belief
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
                  <span className="relative whitespace-nowrap">Create Challenge →</span>
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
        <div>
          <AnimatePresence mode="wait">
            {loadingRooms ? (
              <ChallengesLoader key="loader" />
            ) : (
              <motion.div
                key="rooms"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35 }}
                className="space-y-4"
              >
                <AnimatePresence mode="popLayout">
                  {filtered.map((room, i) => (
                    <ChallengeCard
                      key={room.id}
                      room={room}
                      index={i}
                      onAccept={handleAccept}
                      hasAgent={hasAgent}
                      walletAddress={walletAddress}
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
                      Be the first to create one
                    </p>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
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

      {/* ── No-agent toast ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {noAgentToast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-5 py-4 border w-[calc(100%-2rem)] max-w-sm"
            style={{ background: "#0A0A0F", borderColor: "rgba(239,68,68,0.4)" }}
          >
            <span className="text-red-400 text-base flex-shrink-0">⚔</span>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-red-400/90">No Agent Forged</p>
              <p className="font-body text-xs text-white/50 mt-0.5 leading-snug">
                You need a forged agent to fight.{" "}
                <Link href="/forge" className="text-clash-gold underline">Forge one →</Link>
              </p>
            </div>
            <button onClick={() => setNoAgentToast(false)} className="text-white/20 hover:text-white/50 font-mono text-xs flex-shrink-0 pl-2">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Accept challenge tx overlay ─────────────────────────────────────── */}
      <AnimatePresence>
        {acceptTxState !== "idle" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[55] flex items-center justify-center p-6"
          >
            <div className="w-full max-w-sm border border-white/10 bg-[#0A0A0F] p-8 text-center">
              {acceptTxState === "error" ? (
                <>
                  <p className="font-display text-lg font-bold uppercase text-red-400 mb-3">Transaction Failed</p>
                  <p className="font-mono text-[10px] text-red-400/70 mb-6 leading-relaxed break-words">{acceptTxError}</p>
                  <button
                    onClick={() => { setAcceptTxState("idle"); setAcceptTxError(null); }}
                    className="font-mono text-[10px] uppercase tracking-widest px-6 py-3 border border-white/15 text-white/50 hover:text-white/80 transition-colors"
                  >
                    Dismiss
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center mb-5">
                    <span className="w-10 h-10 border-2 border-white/10 border-t-clash-gold/70 rounded-full animate-spin" />
                  </div>
                  <p className="font-display text-lg font-bold uppercase text-clash-white mb-2">
                    {acceptTxState === "approving" ? "Checking Arena Budget…" : "Locking Your Stake…"}
                  </p>
                  <p className="font-mono text-[10px] text-white/35 uppercase tracking-widest">
                    {acceptTxState === "approving" ? "1Shot will execute if permission is active" : "No extra wallet popup when budget is active"}
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Autonomous execution log — shows 1Shot actions with no wallet popup */}
      <AutonomyLog />

    </main>
  );
}
