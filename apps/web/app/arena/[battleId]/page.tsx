"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { ResearchFeed } from "@/components/battle/ResearchFeed";
import { ResearchHandshake } from "@/components/battle/ResearchHandshake";
import { useTTS, prefetchTTS } from "@/lib/use-tts";
import type { Battle, BattlePhase, ResearchPurchase } from "@/lib/types";
import { CHAIN_ID } from "@/lib/contracts";

// ─── 3D Arena (no SSR) ───────────────────────────────────────────────────────

const ArenaScene = dynamic(
  () => import("@/components/arena/ArenaScene").then((m) => m.ArenaScene),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[360px] bg-[#0A0A0F] rounded-xl flex items-center justify-center border border-white/5">
        <div className="w-8 h-8 border-2 border-white/10 border-t-clash-gold/60 rounded-full animate-spin" />
      </div>
    ),
  }
);

// ─── Demo fallback content (used when battleId === "demo") ───────────────────

const DEMO_ROUNDS = [
  {
    a: "Kobe Bryant had something LeBron will never have — pure, uncut obsession. Five rings, 81 points in a single game, a work ethic that turned myths into milestones. He practiced at 4 AM while others slept. That relentless Mamba Mentality is what separates legends from mere statistics.",
    b: "Four MVPs. Four championships. Three different franchises. LeBron has been the best player on earth for two straight decades. Kobe was elite — but LeBron redefined what a basketball player can be: scorer, playmaker, defender, and franchise builder simultaneously. The numbers don't argue.",
  },
  {
    a: "Kobe dragged the Lakers to back-to-back titles in 2009 and 2010 when Pau Gasol was his only real support. He shouldered the full burden. LeBron fled to Miami because he couldn't win alone in Cleveland — that decision tells you everything about the difference between them.",
    b: "Joining forces isn't fleeing — it's intelligence. LeBron chose to maximize his career and delivered championships everywhere he went. Meanwhile, Kobe's 2004 Finals loss with Shaq proves even he needed elite teammates. Stop rewriting history with rose-tinted nostalgia.",
  },
  {
    a: "The Mamba Mentality isn't a catchphrase — it's a philosophy. Kobe's competitive DNA is what every athlete aspires to. He never needed analytics to know the right shot. Pure instinct, pure will, pure legend. That's what the GOAT looks like.",
    b: "The GOAT doesn't need mythology — he needs the data. LeBron leads in total points, assists, and win shares. All-time efficiency, all-time versatility, all-time longevity. You can love Kobe's story. But when the final ledger closes, the numbers crown LeBron James.",
  },
];

const DEMO_BATTLE: Battle = {
  id: "demo",
  topic: "Kobe Bryant vs LeBron James — Who is the GOAT?",
  agentA: {
    address: "0x1111111111111111111111111111111111111111",
    name: "StatMaster",
    personality: "Analyst",
    color: "#FFB800",
    winRate: 0.72,
    totalBattles: 18,
  },
  agentB: {
    address: "0x2222222222222222222222222222222222222222",
    name: "HoopHistorian",
    personality: "Historian",
    color: "#4466FF",
    winRate: 0.65,
    totalBattles: 23,
  },
  state: "LIVE",
  poolA: 42_000_000n,
  poolB: 38_000_000n,
  bettingDeadline: BigInt(Math.floor(Date.now() / 1000) + 300),
  roundDuration: 60,
  rubricHash: "0xdeadbeef",
  winner: null,
  bettorCount: 14,
  createdAt: Date.now() - 120_000,
};

function createLoadingBattle(id: string): Battle {
  return {
    id,
    topic: "Loading battle...",
    agentA: {
      address: "0x0000000000000000000000000000000000000000",
      name: "Agent A",
      personality: "Analyst",
      color: "#FFB800",
      winRate: 0,
      totalBattles: 0,
    },
    agentB: {
      address: "0x0000000000000000000000000000000000000000",
      name: "Agent B",
      personality: "Historian",
      color: "#4466FF",
      winRate: 0,
      totalBattles: 0,
    },
    state: "OPEN",
    poolA: 0n,
    poolB: 0n,
    bettingDeadline: 0n,
    roundDuration: 0,
    totalRounds: 2,
    rubricHash: "0x",
    winner: null,
    bettorCount: 0,
    createdAt: Date.now(),
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = "countdown" | "betting" | "live" | "verdict";
type StreamStatus =
  | "idle"
  | "research"
  | "debate"
  | "judging_ready"
  | "settled"
  | "error";

function isContractRoundPhase(phase: BattlePhase | null) {
  return phase === "ROUND_1" || phase === "ROUND_2" || phase === "ROUND_3";
}

function roundNumberFromPhase(phase: BattlePhase | null) {
  if (phase === "ROUND_1") return 0;
  if (phase === "ROUND_2") return 1;
  if (phase === "ROUND_3") return 2;
  return 0;
}

interface DebateRound { a: string; b: string }

interface FloatingEmoji {
  id: string;
  emoji: string;
  x: number;
  y: number;
}

// ─── Countdown Overlay ───────────────────────────────────────────────────────

function CountdownOverlay({ count }: { count: number }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-clash-black/95 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6 } }}
    >
      <motion.p
        className="font-body text-xs text-white/30 uppercase tracking-[0.35em] mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        Battle starting
      </motion.p>

      <AnimatePresence mode="wait">
        {count > 0 ? (
          <motion.span
            key={count}
            initial={{ scale: 2.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            className="font-display font-extrabold select-none"
            style={{
              fontSize: "clamp(7rem, 22vw, 16rem)",
              color: "#FFB800",
              textShadow: "0 0 120px rgba(255,184,0,0.45), 0 0 40px rgba(255,184,0,0.2)",
              lineHeight: 1,
            }}
          >
            {count}
          </motion.span>
        ) : (
          <motion.div
            key="fight"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.4, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <span
              className="font-display font-extrabold uppercase block select-none"
              style={{
                fontSize: "clamp(4rem, 14vw, 10rem)",
                color: "#F5F5F0",
                textShadow: "0 0 80px rgba(255,184,0,0.3)",
                letterSpacing: "0.05em",
              }}
            >
              FIGHT
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-clash-gold/40 to-transparent" />
    </motion.div>
  );
}

// ─── Rebuttal Badge ───────────────────────────────────────────────────────────

function RebuttalBadge() {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -12, opacity: 0 }}
      animate={{ scale: [0, 1.35, 1], rotate: [-12, 4, 0], opacity: 1 }}
      exit={{ scale: 0, opacity: 0, rotate: 8 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-none"
    >
      <div
        className="font-display font-extrabold uppercase tracking-wider text-clash-black px-6 py-2.5 rounded"
        style={{
          fontSize: "clamp(1rem, 3vw, 1.6rem)",
          background: "linear-gradient(135deg, #FFB800 0%, #FF6B00 100%)",
          boxShadow: "0 0 50px rgba(255,184,0,0.7), 0 6px 28px rgba(0,0,0,0.5)",
        }}
      >
        REBUTTAL!
      </div>
    </motion.div>
  );
}

// ─── Round Break Overlay ─────────────────────────────────────────────────────

function RoundBreakOverlay({
  round,
  totalRounds,
  scores,
  battle,
}: {
  round: number;
  totalRounds: number;
  scores: { A: number; B: number };
  battle: Battle;
}) {
  const isLast = round >= totalRounds;

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ background: "rgba(10,10,15,0.94)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="text-center max-w-sm w-full px-8"
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="font-body text-[10px] text-white/30 uppercase tracking-[0.35em] mb-4">
          {isLast ? "Final Round" : `End of Round ${round}`}
        </p>

        <h2
          className="font-display font-extrabold uppercase mb-8"
          style={{
            fontSize: "clamp(2.5rem, 9vw, 5.5rem)",
            color: "#F5F5F0",
            textShadow: "0 0 60px rgba(255,255,255,0.06)",
          }}
        >
          {isLast ? "FINAL" : `Round ${round}`}
        </h2>

        {(scores.A > 0 || scores.B > 0) && (
          <div className="grid grid-cols-2 gap-3 mb-8">
            {(["A", "B"] as const).map((side) => {
              const agent = side === "A" ? battle.agentA : battle.agentB;
              const score = scores[side];
              const isLeading = scores[side] > scores[side === "A" ? "B" : "A"];
              return (
                <motion.div
                  key={side}
                  className="rounded-xl p-4 border relative overflow-hidden"
                  style={{
                    borderColor: isLeading ? `${agent.color}50` : "rgba(255,255,255,0.07)",
                    background: isLeading ? `${agent.color}10` : "rgba(255,255,255,0.03)",
                  }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + (side === "B" ? 0.1 : 0) }}
                >
                  {isLeading && (
                    <div className="absolute top-2 right-2 text-xs">👑</div>
                  )}
                  <div
                    className="font-display text-[11px] font-bold uppercase tracking-widest mb-2"
                    style={{ color: agent.color }}
                  >
                    {agent.name}
                  </div>
                  <div className="font-display text-4xl font-extrabold text-white">
                    {score}
                  </div>
                  <div className="font-body text-[10px] text-white/25 mt-0.5">pts</div>
                </motion.div>
              );
            })}
          </div>
        )}

        <motion.p
          className="font-body text-xs text-white/25"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          {isLast ? "Calculating verdict..." : "Next round beginning shortly..."}
        </motion.p>
      </motion.div>

      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-clash-gold/30 to-transparent" />
    </motion.div>
  );
}

// ─── Judging Overlay ─────────────────────────────────────────────────────────

function JudgingOverlay({ battle }: { battle: Battle }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-clash-black/92 px-5 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.2 } }}
      transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeOut" }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-45"
        style={{
          background:
            `radial-gradient(circle at 28% 40%, ${battle.agentA.color}22 0%, transparent 28%), ` +
            `radial-gradient(circle at 72% 42%, ${battle.agentB.color}22 0%, transparent 30%)`,
        }}
      />
      <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-clash-gold/30 to-transparent" />

      <motion.div
        className="relative z-10 w-full max-w-xl text-center"
        initial={reduceMotion ? false : { y: 18, scale: 0.98, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-clash-gold/30 bg-clash-gold/10">
          <motion.span
            className="font-display text-3xl"
            animate={reduceMotion ? undefined : { scale: [1, 1.08, 1], rotate: [0, -4, 4, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          >
            🏆
          </motion.span>
        </div>

        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.36em] text-clash-gold/70">
          Battle Complete
        </p>

        <h2
          className="font-display font-extrabold uppercase leading-none text-white"
          style={{
            fontSize: "clamp(2.5rem, 10vw, 5.6rem)",
            textShadow: "0 0 70px rgba(255,184,0,0.18)",
          }}
        >
          To The Judge
        </h2>

        <p className="mx-auto mt-5 max-w-md font-body text-sm leading-relaxed text-white/55">
          The final argument landed. The judge is reviewing the transcript and preparing to crown the champion.
        </p>

        <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="min-w-0 text-right">
            <div className="truncate font-display text-sm font-bold uppercase" style={{ color: battle.agentA.color }}>
              {battle.agentA.name}
            </div>
            <div className="font-body text-[10px] uppercase tracking-widest text-white/25">Agent A</div>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] font-display text-xs font-extrabold text-white/55">
            VS
          </div>
          <div className="min-w-0 text-left">
            <div className="truncate font-display text-sm font-bold uppercase" style={{ color: battle.agentB.color }}>
              {battle.agentB.name}
            </div>
            <div className="font-body text-[10px] uppercase tracking-widest text-white/25">Agent B</div>
          </div>
        </div>

        <div className="mx-auto mt-8 flex w-full max-w-xs items-center gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 flex-1 rounded-full bg-clash-gold/50"
              animate={reduceMotion ? undefined : { opacity: [0.25, 1, 0.25] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.16, ease: "easeInOut" }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function deriveRecapSides(topic: string): { A: string; B: string; claim: string } {
  const cleaned = topic.replace(/\s+/g, " ").trim();
  const yesNoMatch = cleaned.match(/^Yes\s+vs\s+No\s+[—-]\s+(.+)$/i);
  if (yesNoMatch?.[1]) {
    const claim = yesNoMatch[1].replace(/\s*\(Polymarket Yes:\s*\d+%\)\s*$/i, "").trim();
    return { A: "YES", B: "NO", claim };
  }

  const vsIndex = cleaned.toLowerCase().indexOf(" vs ");
  if (vsIndex > 0) {
    const sideA = cleaned.slice(0, vsIndex).trim();
    const rest = cleaned.slice(vsIndex + 4);
    const dashIndex = rest.search(/\s+[—-]\s+/);
    if (dashIndex > 0) {
      return {
        A: sideA,
        B: rest.slice(0, dashIndex).trim(),
        claim: rest.slice(dashIndex).replace(/^[\s—-]+/, "").trim(),
      };
    }
    return { A: sideA, B: rest.trim(), claim: cleaned };
  }

  return { A: "Side A", B: "Side B", claim: cleaned };
}

function buildShareRecap({
  battle,
  winner,
  judgeScores,
  txHash,
}: {
  battle: Battle;
  winner: "A" | "B";
  judgeScores: { A: number; B: number } | null;
  txHash: string | null;
}) {
  const winningAgent = winner === "A" ? battle.agentA : battle.agentB;
  const losingAgent = winner === "A" ? battle.agentB : battle.agentA;
  const winnerScore = judgeScores?.[winner];
  const loserScore = judgeScores?.[winner === "A" ? "B" : "A"];
  const sides = deriveRecapSides(battle.topic);
  const winningSide = winner === "A" ? sides.A : sides.B;
  const losingSide = winner === "A" ? sides.B : sides.A;
  const pool = Number(battle.poolA + battle.poolB) / 1_000_000;
  const scoreLine =
    typeof winnerScore === "number" && typeof loserScore === "number"
      ? `Judge score: ${winningSide} ${winnerScore}-${losingSide} ${loserScore}.`
      : `Judge picked ${winningSide}.`;
  const txLine = txHash ? `Settlement: ${txHash.slice(0, 6)}...${txHash.slice(-4)}` : "Settlement: onchain";

  return [
    `Clashboard recap: ${battle.topic}`,
    "",
    `Winning side: ${winningSide}`,
    `Claim tested: ${sides.claim}`,
    `${scoreLine}`,
    `Agents: ${winningAgent.name} defeated ${losingAgent.name}`,
    `Prediction pool: $${pool.toFixed(2)} USDC`,
    `${txLine}`,
    "",
    "AI agents argued it. Venice judged it. Spectators picked sides.",
  ].join("\n");
}

// ─── Winner Overlay ───────────────────────────────────────────────────────────

function WinnerOverlay({
  winner,
  battle,
  judgeScores,
  txHash,
}: {
  winner: "A" | "B";
  battle: Battle;
  judgeScores: { A: number; B: number } | null;
  txHash: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const agent = winner === "A" ? battle.agentA : battle.agentB;
  const loser = winner === "A" ? battle.agentB : battle.agentA;

  // Total prize pool in USDC (1e6 decimals)
  const totalPool  = Number(battle.poolA + battle.poolB) / 1_000_000;
  const winnerPool = Number(winner === "A" ? battle.poolA : battle.poolB) / 1_000_000;
  const loserPool  = Number(winner === "A" ? battle.poolB : battle.poolA) / 1_000_000;

  // Determine block explorer URL
  const chainId   = String(CHAIN_ID);
  const explorerBase = chainId === "8453" ? "https://basescan.org" : "https://sepolia.basescan.org";
  const recap = buildShareRecap({ battle, winner, judgeScores, txHash });
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(recap)}`;

  const copyRecap = async () => {
    try {
      await navigator.clipboard.writeText(recap);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{ background: "rgba(10,10,15,0.97)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Rotating conic glow */}
      <motion.div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] pointer-events-none"
        style={{
          background: `conic-gradient(from 180deg at 50% 0%, transparent 25deg, ${agent.color}18 55deg, transparent 85deg, ${agent.color}14 115deg, transparent 145deg)`,
        }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 50% 60%, ${agent.color}12 0%, transparent 70%)`,
        }}
      />

      <motion.div
        className="relative z-10 text-center px-8 max-w-lg w-full"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", damping: 14, stiffness: 100 }}
      >
        <motion.div
          className="text-7xl mb-4"
          animate={{ rotate: [0, -8, 8, -4, 4, 0], scale: [1, 1.15, 1] }}
          transition={{ delay: 0.7, duration: 0.9 }}
        >
          🏆
        </motion.div>

        <p className="font-body text-[10px] text-white/30 uppercase tracking-[0.4em] mb-2">Winner</p>

        <motion.h2
          className="font-display font-extrabold uppercase mb-1"
          style={{
            fontSize: "clamp(3rem, 11vw, 6rem)",
            color: agent.color,
            textShadow: `0 0 120px ${agent.color}55, 0 0 40px ${agent.color}25`,
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {agent.name}
        </motion.h2>

        <p className="font-body text-white/40 text-sm mb-5">{agent.personality} · Victorious</p>

        {/* Pool / payout info */}
        <motion.div
          className="grid grid-cols-3 gap-3 mb-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85 }}
        >
          {([
            { label: agent.name,  val: winnerPool, color: agent.color },
            { label: "Total Pool", val: totalPool,  color: "#F5F5F0"  },
            { label: loser.name,  val: loserPool,  color: loser.color },
          ] as { label: string; val: number; color: string }[]).map(({ label, val, color }) => (
            <div key={label} className="border border-white/10 bg-white/[0.03] rounded-xl p-3 text-center">
              <div className="font-display text-xl font-extrabold" style={{ color }}>
                ${val.toFixed(2)}
              </div>
              <div className="font-body text-[10px] text-white/25 mt-0.5 truncate">{label}</div>
            </div>
          ))}
        </motion.div>

        {/* Judge scores (if available) */}
        {judgeScores && (
          <motion.div
            className="flex items-center justify-center gap-6 mb-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.05 }}
          >
            <div className="text-center">
              <div className="font-display text-2xl font-extrabold" style={{ color: agent.color }}>
                {judgeScores[winner]}
              </div>
              <div className="font-body text-[10px] text-white/25 mt-0.5">{agent.name}</div>
            </div>
            <div className="font-body text-white/15">vs</div>
            <div className="text-center">
              <div className="font-display text-2xl font-extrabold text-white/40">
                {judgeScores[winner === "A" ? "B" : "A"]}
              </div>
              <div className="font-body text-[10px] text-white/25 mt-0.5">{loser.name}</div>
            </div>
          </motion.div>
        )}

        {/* Settlement tx link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3 }}
          className="space-y-2"
        >
          {txHash ? (
            <a
              href={`${explorerBase}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-clash-gold/25 bg-clash-gold/08 px-4 py-2 rounded-lg text-clash-gold hover:bg-clash-gold/15 transition-colors"
            >
              <span className="font-mono text-[11px] uppercase tracking-widest">View Settlement Tx</span>
              <span className="font-mono text-[11px] text-clash-gold/60">
                {txHash.slice(0, 6)}…{txHash.slice(-4)}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
            </a>
          ) : (
            <p className="font-body text-[11px] text-white/20 uppercase tracking-widest">
              Payouts settling on-chain…
            </p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.45 }}
          className="mt-5 border border-white/8 bg-white/[0.025] p-4 text-left"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.32em] text-white/30">
              Shareable Recap
            </p>
            <span className="font-mono text-[8px] uppercase tracking-widest text-clash-gold/55">
              X ready
            </span>
          </div>
          <p className="whitespace-pre-line font-mono text-[10px] leading-relaxed text-white/45">
            {recap}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copyRecap}
              className="border border-white/10 px-3 py-2.5 font-mono text-[9px] uppercase tracking-widest text-white/45 transition-colors hover:border-clash-gold/30 hover:text-clash-gold"
            >
              {copied ? "Copied" : "Copy Recap"}
            </button>
            <a
              href={tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-clash-gold/25 bg-clash-gold/08 px-3 py-2.5 text-center font-mono text-[9px] uppercase tracking-widest text-clash-gold transition-colors hover:bg-clash-gold/15"
            >
              Post To X
            </a>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ─── Momentum Bar ─────────────────────────────────────────────────────────────

function MomentumBar({ momentum, battle }: { momentum: number; battle: Battle }) {
  const aFrac = Math.max(0.05, Math.min(0.95, 0.5 - momentum / 200));
  const bFrac = 1 - aFrac;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="font-display text-[11px] font-bold uppercase tracking-widest" style={{ color: battle.agentA.color }}>
          {battle.agentA.name}
        </span>
        <span className="font-body text-[10px] text-white/25 uppercase tracking-widest">Momentum</span>
        <span className="font-display text-[11px] font-bold uppercase tracking-widest" style={{ color: battle.agentB.color }}>
          {battle.agentB.name}
        </span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden flex bg-white/5 gap-[1px]">
        <motion.div
          className="h-full rounded-l-full"
          style={{ background: `linear-gradient(90deg, ${battle.agentA.color}80, ${battle.agentA.color})` }}
          animate={{ width: `${aFrac * 100}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.div
          className="h-full rounded-r-full"
          style={{ background: `linear-gradient(90deg, ${battle.agentB.color}, ${battle.agentB.color}80)` }}
          animate={{ width: `${bFrac * 100}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

// ─── Typewriter Text ──────────────────────────────────────────────────────────

function TypewriterText({
  text,
  onDone,
  speed = 16,
}: {
  text: string;
  onDone: () => void;
  speed?: number;
}) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
        onDoneRef.current();
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return (
    <>
      {displayed}
      {!done && (
        <span className="inline-block w-[2px] h-[1.1em] ml-0.5 bg-current align-middle animate-pulse opacity-80" />
      )}
    </>
  );
}

// ─── Floating Crowd Emojis ────────────────────────────────────────────────────

function FloatingCrowd({ emojis }: { emojis: FloatingEmoji[] }) {
  return (
    <div className="fixed inset-0 pointer-events-none z-30 overflow-hidden">
      <AnimatePresence>
        {emojis.map((e) => (
          <motion.div
            key={e.id}
            className="absolute text-2xl select-none"
            style={{ left: `${e.x}%`, top: `${e.y}%` }}
            initial={{ opacity: 1, scale: 0.6, y: 0 }}
            animate={{ opacity: 0, scale: 2, y: -90 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          >
            {e.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({
  side,
  agent,
  isActive,
  phase,
}: {
  side: "A" | "B";
  agent: Battle["agentA"];
  isActive: boolean;
  phase: Phase;
}) {
  const isLive = phase === "live";
  const pressure = Math.max(18, Math.min(94, Math.round(agent.winRate * 70 + agent.totalBattles * 1.5 + (isActive ? 18 : 0))));

  return (
    <motion.div
      className="relative min-w-0 rounded-xl p-4 border overflow-hidden"
      animate={{
        opacity: isLive ? (isActive ? 1 : 0.38) : 1,
        borderColor: isActive && isLive ? `${agent.color}55` : "rgba(255,255,255,0.07)",
        scale: isActive && isLive ? 1.01 : 1,
      }}
      style={{ background: `${agent.color}07` }}
      transition={{ duration: 0.45 }}
    >
      <AnimatePresence>
        {isActive && isLive && (
          <motion.div
            className="absolute top-2.5 right-2.5"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{ background: `${agent.color}20` }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: agent.color }} />
              <span className="font-display text-[9px] uppercase tracking-widest" style={{ color: agent.color }}>
                Speaking
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="font-body text-[10px] text-white/25 uppercase tracking-widest mb-1">Agent {side}</div>
      <div className="font-display font-extrabold text-xl leading-tight mb-0.5 truncate" style={{ color: agent.color }}>
        {agent.name}
      </div>
      <div className="font-body text-xs text-white/35">{agent.personality}</div>
      <div className="font-body text-[10px] text-white/20 mt-2">
        {(agent.winRate * 100).toFixed(0)}% win rate · {agent.totalBattles} battles
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/7">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${agent.color}55, ${agent.color})` }}
          animate={{ width: isLive ? `${pressure}%` : "28%" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      {isActive && isLive && (
        <motion.div
          className="absolute inset-x-0 bottom-0 h-[2px]"
          style={{ background: agent.color }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}

// ─── Argument Panel ───────────────────────────────────────────────────────────

function argumentMetrics(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const claims = Math.min(9, Math.max(1, Math.round(words / 18)));
  const heat = Math.min(99, Math.max(24, words + (text.match(/[!?]/g)?.length ?? 0) * 8));
  return { words, claims, heat };
}

function punchlineFromText(text: string): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const best = sentences.find((sentence) => sentence.length > 72) ?? sentences[0] ?? text;
  return best.length > 150 ? `${best.slice(0, 147)}...` : best;
}

function ArgumentPanel({
  turn,
  roundIndex,
  text,
  battle,
  onDone,
  liveStreaming = false,
}: {
  turn: "A" | "B";
  roundIndex: number;
  text: string;
  battle: Battle;
  onDone: () => void;
  liveStreaming?: boolean;
}) {
  const agent = turn === "A" ? battle.agentA : battle.agentB;
  const opponent = turn === "A" ? battle.agentB : battle.agentA;
  const metrics = argumentMetrics(text);
  const punchline = punchlineFromText(text);

  return (
    <motion.div
      key={`arg-${roundIndex}-${turn}`}
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.985 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-xl border"
      style={{ borderColor: `${agent.color}38`, background: `linear-gradient(135deg, ${agent.color}10, rgba(255,255,255,0.025))` }}
    >
      <div className="absolute inset-0 pointer-events-none opacity-35 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:100%_10px]" />
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${agent.color}, transparent)` }}
      />

      <div className="relative grid gap-0 lg:grid-cols-[260px_1fr]">
        <div className="border-b border-white/8 p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-white/28">
              Round {roundIndex + 1} Strike
            </span>
            <motion.span
              className="h-2 w-2 rounded-full"
              style={{ background: agent.color }}
              animate={{ scale: [1, 1.8, 1], opacity: [1, 0.4, 1] }}
              transition={{ duration: 0.85, repeat: Infinity }}
            />
          </div>

          <div className="mt-4">
            <div className="font-display text-2xl font-extrabold uppercase leading-none" style={{ color: agent.color }}>
              {agent.name}
            </div>
            <div className="mt-1 font-body text-xs text-white/35">
              attacking {opponent.name}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              ["Words", metrics.words],
              ["Claims", metrics.claims],
              ["Heat", metrics.heat],
            ].map(([label, value]) => (
              <div key={label} className="border border-white/8 bg-black/25 px-2 py-2 text-center">
                <div className="font-display text-lg font-extrabold text-white">{value}</div>
                <div className="font-mono text-[8px] uppercase tracking-widest text-white/25">{label}</div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <div className="mb-1 font-mono text-[8px] uppercase tracking-widest text-white/25">
              Pressure Meter
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/8">
              <motion.div
                className="h-full rounded-full"
                style={{ background: agent.color, boxShadow: `0 0 18px ${agent.color}` }}
                animate={{ width: `${Math.max(18, Math.min(100, metrics.heat))}%` }}
              />
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-4 border-l-2 pl-4" style={{ borderColor: agent.color }}>
            <div className="font-mono text-[9px] uppercase tracking-[0.32em] text-white/30">
              Thesis Shot
            </div>
            <div className="mt-1 font-display text-base font-extrabold uppercase leading-snug text-white">
              {punchline}
            </div>
          </div>

          <div className="rounded-lg border border-white/8 bg-black/28 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.32em]" style={{ color: agent.color }}>
                Live Transcript
              </span>
              <span className="font-mono text-[8px] uppercase tracking-widest text-white/22">
                {turn === "A" ? "Opening attack" : "Counterpunch"}
              </span>
            </div>
            <p className="font-body text-sm sm:text-[15px] leading-relaxed text-white/78">
              {liveStreaming ? (
                <>
                  {text}
                  <span
                    className="ml-1 inline-block h-[1.05em] w-[2px] animate-pulse align-middle"
                    style={{ background: agent.color }}
                  />
                </>
              ) : (
                <TypewriterText key={`tw-${roundIndex}-${turn}`} text={text} onDone={onDone} speed={12} />
              )}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Battle Page ─────────────────────────────────────────────────────────

export default function BattlePage() {
  const { battleId } = useParams<{ battleId: string }>();
  const router = useRouter();
  const isDemo = !battleId || battleId === "demo" || !battleId.startsWith("0x");

  const [phase, setPhase] = useState<Phase>(isDemo ? "countdown" : "betting");
  const [countdown, setCountdown] = useState(3);

  const [roundIndex, setRoundIndex] = useState(0);
  const [turn, setTurn] = useState<"A" | "B">("A");
  const [currentText, setCurrentText] = useState("");

  const [showRebuttal, setShowRebuttal] = useState(false);
  const [showRoundBreak, setShowRoundBreak] = useState(false);
  const [showJudgingOverlay, setShowJudgingOverlay] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const [winner, setWinner] = useState<"A" | "B" | null>(null);

  const [momentum, setMomentum] = useState(0);
  const [roundScores, setRoundScores] = useState({ A: 0, B: 0 });
  const [typingDone, setTypingDone] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [settleTxHash, setSettleTxHash] = useState<string | null>(null);
  const [judgeScores, setJudgeScores] = useState<{ A: number; B: number } | null>(null);

  // Called by TTS when the current speech finishes — used to release the arena driver.
  const ttsOnDoneRef = useRef<(() => void) | null>(null);

  // Speak each agent's full argument aloud; notify driver when done.
  const { speaking: ttsSpeaking } = useTTS(phase === "live" ? currentText : "", {
    enabled: true,
    side: turn,
    onDone: () => ttsOnDoneRef.current?.(),
  });

  // Real battle data
  const [battle, setBattle] = useState<Battle>(
    isDemo ? DEMO_BATTLE : createLoadingBattle(battleId ?? "unknown")
  );
  const [battleLoaded, setBattleLoaded] = useState(isDemo);
  const [battleLookupError, setBattleLookupError] = useState<string | null>(null);
  const [serverPhase, setServerPhase] = useState<BattlePhase | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>(
    isDemo ? "debate" : "idle"
  );
  const [streamError, setStreamError] = useState<string | null>(null);
  const [researchProgress, setResearchProgress] = useState<string | null>(null);
  const [researchSessionsReady, setResearchSessionsReady] = useState(isDemo);
  const [receivedRounds, setReceivedRounds] = useState<DebateRound[]>(
    isDemo ? DEMO_ROUNDS : []
  );
  const [researchPurchases, setResearchPurchases] = useState<ResearchPurchase[]>(
    isDemo ? [] : []
  );
  const [activeHandshake, setActiveHandshake] = useState<ResearchPurchase | null>(null);
  const shownHandshakesRef = useRef(new Set<string>());

  // Show handshake overlay for each new research purchase
  useEffect(() => {
    const latest = researchPurchases[researchPurchases.length - 1];
    if (!latest || shownHandshakesRef.current.has(latest.id)) return;
    shownHandshakesRef.current.add(latest.id);
    setActiveHandshake(latest);
  }, [researchPurchases]);

  const verdictCalledRef = useRef(false);
  const currentStreamingAgentRef = useRef<"A" | "B" | null>(null);
  const pendingNextTurnRef = useRef<{ text: string; turn: "A" | "B" } | null>(null);
  const driverStoppedRef = useRef(false);
  const driverInFlightRef = useRef(false);
  const lastSessionRegisterRef = useRef(0);
  const serverPhaseRef = useRef<BattlePhase | null>(serverPhase);
  const streamStatusRef = useRef<StreamStatus>(streamStatus);
  const ttsSpeakingRef = useRef(ttsSpeaking);

  const prefetchDebateTurnInBackground = useCallback((nextRoundIndex: number, nextSide: "A" | "B") => {
    if (isDemo) return;
    const agent = nextSide === "A" ? battle.agentA : battle.agentB;
    const copy =
      nextSide === "A"
        ? `${agent.name} is preparing a rebuttal.`
        : `${agent.name} is preparing a response.`;
    setResearchProgress(copy);
    void fetch("/api/battle/prefetch-round", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ battleId, roundIndex: nextRoundIndex, side: nextSide }),
    })
      .then((res) => {
        if (res.ok) setResearchProgress(`${agent.name}'s next turn is ready.`);
      })
      .catch((err) => {
        console.warn("[prefetch-round] request failed:", err);
      });
  }, [battle.agentA, battle.agentB, battleId, isDemo]);

  useEffect(() => {
    serverPhaseRef.current = serverPhase;
  }, [serverPhase]);

  useEffect(() => {
    streamStatusRef.current = streamStatus;
  }, [streamStatus]);

  useEffect(() => {
    ttsSpeakingRef.current = ttsSpeaking;
  }, [ttsSpeaking]);

  useEffect(() => {
    if (isDemo) return;
    setResearchSessionsReady(false);
    const allFighterAddresses = [battle.agentA.address, battle.agentB.address].filter(
      (address): address is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(address)
    );
    if (allFighterAddresses.length < 2) {
      return;
    }

    // In the hackathon A2A demo rail, Agent A is preloaded as the seller and
    // Agent B performs the real x402 purchase. Requiring Agent A's backend
    // research session here can block a valid buyer flow when the current
    // browser only owns Agent B.
    const addresses =
      process.env.NEXT_PUBLIC_ENABLE_A2A_SEEDED_INVENTORY !== "false"
        ? [allFighterAddresses[1]]
        : allFighterAddresses;

    let cancelled = false;
    import("@/lib/research-session-client")
      .then(async ({ registerResearchSessionForBackend }) => {
        for (const address of addresses) {
          if (cancelled) return;
          try {
            await registerResearchSessionForBackend(address);
          } catch (err) {
            // Non-fatal: missing session/permission means x402 marketplace is
            // unavailable for this agent. The orchestrator falls back to Venice
            // inline research automatically — the battle still runs.
            console.warn(
              "[x402] Session registration skipped for",
              address,
              "—",
              err instanceof Error ? err.message : err
            );
          }
        }
        if (!cancelled) setResearchSessionsReady(true);
      })
      .catch(() => {
        // Dynamic import itself failed — very unlikely, but still proceed.
        if (!cancelled) setResearchSessionsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [battle.agentA.address, battle.agentB.address, isDemo]);

  // ─── Fetch battle metadata (non-demo) ────────────────────────────────────

  useEffect(() => {
    if (isDemo) return;

    let alive = true;

    const loadSnapshot = () => {
      if (driverInFlightRef.current || ttsSpeakingRef.current || streamStatusRef.current === "research") {
        return;
      }

      fetch(`/api/battle/${battleId}`, { cache: "no-store" })
        .then(async (r) => {
          if (r.ok) return r.json();
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `Battle lookup failed (${r.status})`);
        })
        .then((data) => {
          if (!alive) return;
          if (!data) return;
          setBattleLoaded(true);
          setBattleLookupError(null);
          const bettingDeadlineSec = Number(data.bettingDeadline ?? 0);
          const bettingDeadlinePassed =
            bettingDeadlineSec > 0 &&
            Math.floor(Date.now() / 1000) >= bettingDeadlineSec;

          if (data.phase === "BETTING") {
            if (!bettingDeadlinePassed) {
              router.replace("/game-lobby");
              return;
            }
            setServerPhase("PREPARING");
            setStreamStatus("research");
            setPhase((current) => (current === "countdown" ? "betting" : current));
          } else {
            setServerPhase(data.phase ?? null);
          }
          if (data.phase === "SETTLED") {
            setStreamStatus("settled");
            setPhase("verdict");
            setShowJudgingOverlay(false);
          } else if (data.phase === "JUDGING_READY") {
            setStreamStatus("judging_ready");
            setPhase("verdict");
            setShowJudgingOverlay(true);
          } else if (data.phase === "PREPARING") {
            setStreamStatus("research");
            setPhase((current) => (current === "countdown" ? "betting" : current));
          } else if (isContractRoundPhase(data.phase) && receivedRounds.length === 0) {
            setPhase((current) => (current === "countdown" ? "betting" : current));
          }
          setBattle({
          id: data.id,
          topic: data.topic,
          agentA: data.agentA,
          agentB: data.agentB,
          state: data.state,
          poolA: BigInt(data.poolA),
          poolB: BigInt(data.poolB),
          bettingDeadline: BigInt(data.bettingDeadline),
          roundDuration: data.roundDuration,
          totalRounds: data.totalRounds,
          currentRound: data.currentRound,
          currentRoundDeadline: data.currentRoundDeadline ? BigInt(data.currentRoundDeadline) : undefined,
          prepareDeadline: data.prepareDeadline ? BigInt(data.prepareDeadline) : undefined,
          rubricHash: "0x",
          winner: null,
          createdAt: data.createdAt,
          researchPurchases: data.researchPurchases ?? [],
        });
          if (Array.isArray(data.researchPurchases)) {
            setResearchPurchases(data.researchPurchases);
          }
          if (Array.isArray(data.rounds) && data.rounds.length > 0) {
            setReceivedRounds(
              (data.rounds as { agentAText: string; agentBText: string }[])
                .map((r) => ({ a: r.agentAText, b: r.agentBText }))
            );
          }
        })
        .catch((err) => {
          if (!alive) return;
          setBattleLookupError(err instanceof Error ? err.message : "Battle lookup failed");
          setStreamStatus("error");
          setStreamError(err instanceof Error ? err.message : "Battle lookup failed");
          setPhase("verdict");
        });
    };

    loadSnapshot();
    const id = window.setInterval(loadSnapshot, 8000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [battleId, isDemo, router, receivedRounds.length]);

  // ─── Arena polling driver (non-demo) ────────────────────────────────────
  // Calls POST /api/battle/worker every 5–8 s, advancing the battle one step
  // at a time until SETTLED. Replaces the SSE-based lifecycle for hackathon.

  useEffect(() => {
    if (isDemo) return;
    if (!battleLoaded) return;
    if (!researchSessionsReady) return;

    const TERMINAL = new Set(["SETTLED", "CANCELLED", "EXPIRED"]);
    const POLL_MIN = 5_000;
    const POLL_MAX = 8_000;

    driverStoppedRef.current = false;
    driverInFlightRef.current = false;
    let timerId: ReturnType<typeof setTimeout>;

    const refreshSnapshot = async () => {
      try {
        const r = await fetch(`/api/battle/${battleId}`, { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json() as Record<string, unknown>;
        if (data.phase) setServerPhase(data.phase as BattlePhase);
        if (Array.isArray(data.rounds) && (data.rounds as unknown[]).length > 0) {
          setReceivedRounds(
            (data.rounds as { agentAText: string; agentBText: string }[])
              .map((r) => ({ a: r.agentAText, b: r.agentBText }))
          );
        }
        if (Array.isArray(data.researchPurchases)) {
          setResearchPurchases(data.researchPurchases as ResearchPurchase[]);
          if ((data.researchPurchases as unknown[]).length > 0) {
            setResearchProgress("Research purchase settled. Preparing the arena arguments.");
          }
        }
      } catch {}
    };

    // Re-register x402 sessions before each tick so server hot-reloads
    // (which wipe the in-memory session Map) don't silently lose the session.
    const sessionAddresses = [battle.agentA.address, battle.agentB.address].filter(
      (a): a is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(a)
    ).slice(process.env.NEXT_PUBLIC_ENABLE_A2A_SEEDED_INVENTORY !== "false" ? 1 : 0);

    const reRegisterSessions = async () => {
      const now = Date.now();
      if (now - lastSessionRegisterRef.current < 60_000) return;

      try {
        const { registerResearchSessionForBackend } = await import("@/lib/research-session-client");
        for (const address of sessionAddresses) {
          try { await registerResearchSessionForBackend(address); } catch { /* non-fatal */ }
        }
        lastSessionRegisterRef.current = Date.now();
      } catch { /* dynamic import failure — ignore */ }
    };

    const tick = async () => {
      if (driverStoppedRef.current || driverInFlightRef.current) return;
      driverInFlightRef.current = true;
      console.log("[Arena Driver] worker tick started");

      await reRegisterSessions();

      try {
        if (serverPhaseRef.current === "PREPARING" || streamStatusRef.current === "research") {
          setStreamStatus("research");
          setResearchProgress("Agents are deciding what research is worth buying. x402 payments may settle in the background.");
        }

        const r = await fetch("/api/battle/worker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ battleId }),
        });

        if (!r.ok) {
          const body = await r.json().catch(() => ({})) as Record<string, unknown>;
          const error = typeof body.error === "string" ? body.error : "";
          if (r.status === 409 && error.includes("Step already in progress")) {
            console.log("[Arena Driver] worker already running — waiting before next poll");
            if (streamStatusRef.current === "research") {
              setResearchProgress("Research purchase or settlement is still running. Keeping the arena synced.");
            }
            await refreshSnapshot();
            if (!driverStoppedRef.current) {
              timerId = setTimeout(tick, 18_000);
            }
            return;
          }

          console.warn("[Arena Driver] worker error:", body.error);
          // Retry after backoff
          if (!driverStoppedRef.current) {
            timerId = setTimeout(tick, POLL_MAX);
          }
          return;
        }

        const { step } = await r.json() as { step: { action: string; phase: string; roundIndex?: number; txHash?: string; agentAText?: string; agentBText?: string; winnerSide?: "A" | "B"; judgeScores?: { A: number; B: number } } };
        console.log(`[Arena Driver] action=${step.action} phase=${step.phase}`);

        if (typeof step.roundIndex === "number") setRoundIndex(step.roundIndex);
        setServerPhase(step.phase as BattlePhase);

        let waitForTTS = false;
        let speechCharCount = 0;
        let nextTickDelayMs: number | null = null;

        switch (step.action) {
          case "WAITING":
            break;

          case "CLOSE_BETTING":
            setStreamStatus("research");
            setResearchProgress("Betting is closed. Agents are shopping for useful research artifacts.");
            setPhase((p) => (p === "countdown" ? "betting" : p));
            break;

          case "START_DEBATE":
            setStreamStatus("debate");
            setResearchProgress(null);
            setPhase("live");
            break;

          case "SUBMITTED_A":
            currentStreamingAgentRef.current = "A";
            setTurn("A");
            setStreamStatus("debate");
            setResearchProgress(null);
            setPhase("live");
            if (step.agentAText) {
              if ((step.roundIndex ?? 0) > 0) {
                prefetchDebateTurnInBackground(step.roundIndex ?? 1, "B");
              }
              setCurrentText(step.agentAText);
              setTypingDone(false);
              waitForTTS = true;
              speechCharCount = step.agentAText.length;
            }
            break;

          case "SUBMITTED_B":
            currentStreamingAgentRef.current = "B";
            setTurn("B");
            setStreamStatus("debate");
            setResearchProgress(null);
            setPhase("live");
            if (step.agentBText) {
              setCurrentText(step.agentBText);
              setTypingDone(false);
              waitForTTS = true;
              speechCharCount = step.agentBText.length;
            }
            break;

          case "SUBMITTED_BOTH":
            currentStreamingAgentRef.current = "A";
            setTurn("A");
            setStreamStatus("debate");
            setResearchProgress(null);
            setPhase("live");
            if (step.agentAText && step.agentBText) {
              // Pre-warm B's TTS audio while A is speaking so the A→B switch is instant
              void prefetchTTS(step.agentBText, "B");
              pendingNextTurnRef.current = { text: step.agentBText, turn: "B" };
              setCurrentText(step.agentAText);
              setTypingDone(false);
              waitForTTS = true;
              speechCharCount = step.agentAText.length;
            }
            break;

          case "ADVANCED_ROUND":
            setStreamStatus("debate");
            setResearchProgress(null);
            await refreshSnapshot();
            if (step.phase === "ROUND_2" || step.phase === "ROUND_3" || step.phase === "JUDGING_READY") {
              nextTickDelayMs = 500;
            }
            if (step.phase === "JUDGING_READY") {
              setStreamStatus("judging_ready");
              setPhase("verdict");
              setShowRoundBreak(false);
              setShowJudgingOverlay(true);
              spawnEmojis(["🏆", "👑", "🔥", "💰"]);
            }
            break;

          case "SETTLED":
            setStreamStatus("settled");
            setResearchProgress(null);
            setPhase("verdict");
            setShowJudgingOverlay(false);
            verdictCalledRef.current = true;
            if (step.txHash) setSettleTxHash(step.txHash);
            if (step.judgeScores) setJudgeScores(step.judgeScores);
            if (step.winnerSide) {
              setWinner(step.winnerSide);
              setTimeout(() => {
                setShowWinner(true);
                spawnEmojis(["🏆", "🎉", "👑", "🥇", "🔥", "💰"]);
              }, 600);
            }
            driverStoppedRef.current = true;
            console.log("[Arena Driver] stopped: SETTLED");
            return;

          case "NO_OP":
            if (step.phase === "SETTLED") setShowJudgingOverlay(false);
            driverStoppedRef.current = true;
            console.log(`[Arena Driver] stopped: ${step.phase}`);
            return;
        }

        if (TERMINAL.has(step.phase)) {
          setShowJudgingOverlay(false);
          driverStoppedRef.current = true;
          console.log(`[Arena Driver] stopped: ${step.phase}`);
          return;
        }

        if (waitForTTS) {
          // Hold the driver until TTS finishes so the agent's full speech plays
          // before we poll for the next argument. Fallback protects against stuck audio.
          const fallbackMs = Math.min(180_000, Math.max(45_000, speechCharCount * 85));
          let resolved = false;
          const proceed = () => {
            if (resolved || driverStoppedRef.current) return;
            resolved = true;
            ttsOnDoneRef.current = null;
            clearTimeout(timerId);

            // SUBMITTED_BOTH: B's text was queued while A was speaking.
            // B's audio should already be cached from the prefetch — switch immediately.
            const pending = pendingNextTurnRef.current;
            if (pending) {
              pendingNextTurnRef.current = null;
              console.log(`[Arena Driver] SUBMITTED_BOTH: switching to agent ${pending.turn}`);
              currentStreamingAgentRef.current = pending.turn;
              setTurn(pending.turn);
              setCurrentText(pending.text);
              setTypingDone(false);
              if ((step.roundIndex ?? 0) === 0 && pending.turn === "B") {
                prefetchDebateTurnInBackground(1, "A");
              }

              let bResolved = false;
              const bFallbackMs = Math.min(180_000, Math.max(45_000, pending.text.length * 85));
              const proceedAfterB = () => {
                if (bResolved || driverStoppedRef.current) return;
                bResolved = true;
                ttsOnDoneRef.current = null;
                clearTimeout(timerId);
                console.log("[Arena Driver] TTS done (B from SUBMITTED_BOTH) — scheduling next tick");
                timerId = setTimeout(tick, 800);
              };
              ttsOnDoneRef.current = proceedAfterB;
              timerId = setTimeout(proceedAfterB, bFallbackMs);
              return;
            }

            console.log("[Arena Driver] TTS done — scheduling next tick");
            timerId = setTimeout(tick, 800);
          };
          ttsOnDoneRef.current = proceed;
          timerId = setTimeout(proceed, fallbackMs);
          console.log("[Arena Driver] waiting for TTS to finish");
        } else {
          const delay = nextTickDelayMs ?? (POLL_MIN + Math.random() * (POLL_MAX - POLL_MIN));
          console.log(`[Arena Driver] next tick in ${Math.round(delay)}ms`);
          timerId = setTimeout(tick, delay);
        }
      } catch (err) {
        console.warn("[Arena Driver] tick error:", err);
        if (!driverStoppedRef.current) {
          timerId = setTimeout(tick, POLL_MAX);
        }
      } finally {
        driverInFlightRef.current = false;
      }
    };

    // Start immediately if past betting deadline, otherwise wait for it.
    const bettingDeadlineSec = Number(battle.bettingDeadline ?? 0n);
    const nowSec = Math.floor(Date.now() / 1000);
    if (bettingDeadlineSec === 0 || nowSec >= bettingDeadlineSec) {
      tick();
    } else {
      const waitMs = Math.max(1_000, (bettingDeadlineSec - nowSec) * 1000 + 500);
      timerId = setTimeout(tick, waitMs);
    }

    return () => {
      driverStoppedRef.current = true;
      clearTimeout(timerId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId, isDemo, battleLoaded, researchSessionsReady]);

  // ─── Spawn floating crowd emojis ─────────────────────────────────────────

  const spawnEmojis = useCallback((set: string[]) => {
    const count = 3 + Math.floor(Math.random() * 4);
    const news: FloatingEmoji[] = Array.from({ length: count }, (_, i) => ({
      id: `${Date.now()}-${i}`,
      emoji: set[Math.floor(Math.random() * set.length)],
      x: 8 + Math.random() * 84,
      y: 15 + Math.random() * 65,
    }));
    setFloatingEmojis((p) => [...p, ...news]);
    setTimeout(
      () => setFloatingEmojis((p) => p.filter((e) => !news.some((n) => n.id === e.id))),
      1500
    );
  }, []);

  // ─── Phase: countdown ────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPhase("betting"), 900);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // ─── Phase: betting → live ───────────────────────────────────────────────
  // Demo: use a fixed 7s timer. Real battles: triggered by first SSE round.

  useEffect(() => {
    if (phase !== "betting") return;

    if (isDemo) {
      const t = setTimeout(() => {
        setPhase("live");
        setCurrentText(DEMO_ROUNDS[0].a);
        setTurn("A");
      }, 7000);
      return () => clearTimeout(t);
    }
  }, [phase, isDemo]);

  // For real battles: switch to live when the first round arrives
  useEffect(() => {
    if (isDemo || phase !== "betting" || receivedRounds.length === 0) return;
    setPhase("live");
    setCurrentText(receivedRounds[0].a);
    setTurn("A");
  }, [receivedRounds.length, phase, isDemo]);

  // ─── Phase: live — handle typing done ────────────────────────────────────

  useEffect(() => {
    if (!typingDone || phase !== "live") return;
    if (!isDemo) return;
    setTypingDone(false);
    spawnEmojis(["🔥", "💯", "🎯", "👏", "💡"]);

    if (turn === "A") {
      const t1 = setTimeout(() => {
        setShowRebuttal(true);
        setMomentum((m) => m + (10 + Math.floor(Math.random() * 18)));
      }, 800);

      const t2 = setTimeout(() => {
        setShowRebuttal(false);
        setTurn("B");
        const rounds = isDemo ? DEMO_ROUNDS : receivedRounds;
        setCurrentText(rounds[roundIndex].b);
      }, 2400);

      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else {
      const scoreA = roundScores.A + 28 + Math.floor(Math.random() * 24);
      const scoreB = roundScores.B + 24 + Math.floor(Math.random() * 24);
      const newScores = { A: scoreA, B: scoreB };
      setRoundScores(newScores);
      setMomentum((m) => m - (8 + Math.floor(Math.random() * 16)));
      spawnEmojis(["👏", "🔥", "⚡", "💥", "😤"]);

      const totalRounds = isDemo ? DEMO_ROUNDS.length : receivedRounds.length;
      const t1 = setTimeout(() => setShowRoundBreak(true), 600);

      const t2 = setTimeout(() => {
        setShowRoundBreak(false);
        const nextRound = roundIndex + 1;

        if (nextRound < totalRounds) {
          const rounds = isDemo ? DEMO_ROUNDS : receivedRounds;
          setRoundIndex(nextRound);
          setTurn("A");
          setCurrentText(rounds[nextRound].a);
        } else {
          // All rounds done
          setPhase("verdict");
          if (isDemo) {
            const w: "A" | "B" = newScores.A > newScores.B ? "A" : "B";
            setWinner(w);
            setShowJudgingOverlay(true);
            setTimeout(() => {
              setShowJudgingOverlay(false);
              setShowWinner(true);
              spawnEmojis(["🏆", "🎉", "👑", "🥇", "🔥", "💰"]);
            }, 600);
          } else if (!verdictCalledRef.current) {
            verdictCalledRef.current = true;
            setShowJudgingOverlay(true);
            fetch("/api/battle/verdict", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ battleId }),
            })
              .then((r) => r.json())
              .then((result: { winnerSide?: "A" | "B" }) => {
                setWinner(result.winnerSide ?? (newScores.A > newScores.B ? "A" : "B"));
                setTimeout(() => {
                  setShowJudgingOverlay(false);
                  setShowWinner(true);
                  spawnEmojis(["🏆", "🎉", "👑", "🥇", "🔥", "💰"]);
                }, 600);
              })
              .catch(() => {
                const w: "A" | "B" = newScores.A > newScores.B ? "A" : "B";
                setWinner(w);
                setTimeout(() => {
                  setShowJudgingOverlay(false);
                  setShowWinner(true);
                  spawnEmojis(["🏆", "🎉", "👑", "🥇", "🔥", "💰"]);
                }, 600);
              });
          }
        }
      }, 4100);

      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [typingDone, phase, turn, roundIndex, roundScores, spawnEmojis, isDemo, receivedRounds, battleId]);

  // Settlement is handled by the polling driver (JUDGING_READY → SETTLED tick).

  // ─── Derived ─────────────────────────────────────────────────────────────

  const activeRounds = isDemo ? DEMO_ROUNDS : receivedRounds;
  const displayedRound = isContractRoundPhase(serverPhase)
    ? roundNumberFromPhase(serverPhase) + 1
    : serverPhase === "JUDGING_READY" || serverPhase === "SETTLED"
      ? battle.totalRounds ?? Math.max(activeRounds.length, 2)
      : roundIndex + 1;
  const displayedTotalRounds = battle.totalRounds ?? (activeRounds.length || 2);
  const hasLiveText = phase === "live" && currentText.trim().length > 0;
  const isTerminalPhase =
    serverPhase === "JUDGING_READY" ||
    serverPhase === "SETTLED" ||
    streamStatus === "judging_ready" ||
    streamStatus === "settled";
  const arenaStatusLabel =
    streamStatus === "error" ? "Needs Review" :
    streamStatus === "settled" || serverPhase === "SETTLED" ? "Settled" :
    streamStatus === "judging_ready" || serverPhase === "JUDGING_READY" ? "Judging Ready" :
    phase === "live" ? "Live Round" :
    streamStatus === "research" ? "Researching" :
    "Syncing";
  const waitingTitle =
    streamStatus === "error" ? "BATTLE NEEDS REVIEW" :
    !battleLoaded ? "LOADING BATTLE" :
    isTerminalPhase ? "WAITING FOR VERDICT" :
    streamStatus === "research" ? "AGENTS BUYING RESEARCH" :
    "SYNCING ARENA";
  const waitingCopy =
    streamStatus === "error"
      ? streamError ?? "The battle stream failed. Funds remain locked until the verdict is retried or a contract cancellation path is used."
      : !battleLoaded
        ? "Reading the on-chain battle state and preparing the live arena."
        : isTerminalPhase
        ? "All on-chain rounds are complete. Venice judging is being requested; no funds are released until settleBattle succeeds."
        : streamStatus === "research"
          ? researchProgress ?? "Agents are buying research artifacts before arguments begin."
          : "Loading the battle stream and contract state.";

  const arenaVisualPhase: BattlePhase =
    streamStatus === "error" ? "PREPARING" :
    streamStatus === "research" ? "RESEARCH" :
    phase === "live" ? "LIVE" :
    phase === "verdict" ? "VERDICT" :
    serverPhase === "BETTING" ? "BETTING" :
    serverPhase === "PREPARING" ? "RESEARCH" :
    isContractRoundPhase(serverPhase) ? serverPhase :
    "PREPARING";

  return (
    <div className="min-h-screen bg-clash-black flex flex-col">

      {/* ── Main grid ─────────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-5
                      grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 sm:gap-5">

        {/* Left: Arena + debate */}
        <div className="space-y-4">

          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
            <AgentCard side="A" agent={battle.agentA} isActive={turn === "A"} phase={phase} />
            <div className="flex min-w-[76px] flex-col items-center justify-center border border-white/8 bg-white/[0.025] px-3">
              <div className="font-mono text-[8px] uppercase tracking-widest text-white/22">
                Clash
              </div>
              <motion.div
                className="font-display text-2xl font-extrabold text-white"
                animate={phase === "live" ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={{ duration: 0.9, repeat: phase === "live" ? Infinity : 0 }}
              >
                VS
              </motion.div>
              <div className="font-mono text-[8px] uppercase tracking-widest text-clash-gold/60">
                R{displayedRound}
              </div>
            </div>
            <AgentCard side="B" agent={battle.agentB} isActive={turn === "B"} phase={phase} />
          </div>

          <ArenaScene
            battle={battle}
            activeAgent={turn}
            currentText={phase === "live" ? currentText : ""}
            phase={arenaVisualPhase}
            liveStreaming={!isDemo}
            roundIndex={roundIndex}
            onTextDone={() => setTypingDone(true)}
          />

          {/* Round indicator dots */}
          <div className="flex items-center justify-center h-10">
            <AnimatePresence mode="wait">
              {showRebuttal ? (
                <RebuttalBadge key="rebuttal" />
              ) : phase === "live" ? (
                <motion.div
                  key={`round-${roundIndex}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2"
                >
                  {Array.from({ length: activeRounds.length || 3 }, (_, i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full transition-all duration-300"
                      style={{
                        background: i === roundIndex ? "#FFB800" : i < roundIndex ? "#FFB80050" : "rgba(255,255,255,0.12)",
                      }}
                    />
                  ))}
                  <span className="font-body text-[10px] text-white/25 ml-1 uppercase tracking-widest">
                    Round {roundIndex + 1} of {activeRounds.length || 3}
                  </span>
                </motion.div>
              ) : phase === "betting" || phase === "verdict" ? (
                <motion.div
                  key="sync-indicator"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="font-display text-xs text-clash-gold/50 uppercase tracking-widest"
                >
                  {arenaStatusLabel}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Waiting state — shown only when not in live combat */}
          <AnimatePresence mode="wait">
            {!hasLiveText && (phase === "betting" || phase === "verdict") && (
              <motion.div
                key={`waiting-${streamStatus}-${serverPhase}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`rounded-xl border p-6 text-center ${
                  streamStatus === "error"
                    ? "border-red-500/25 bg-red-500/05"
                    : "border-clash-gold/25 bg-clash-gold/05"
                }`}
              >
                <div className={`font-display text-xl font-extrabold mb-2 ${
                  streamStatus === "error" ? "text-red-400" : "text-clash-gold"
                }`}>
                  {waitingTitle}
                </div>
                <p className="font-body text-sm text-white/35 max-w-sm mx-auto">
                  {waitingCopy}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {(phase === "live" || phase === "verdict") && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <MomentumBar momentum={momentum} battle={battle} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Live show panel + score */}
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            className="relative overflow-hidden rounded-xl border border-red-500/20 bg-white/[0.025] p-4"
          >
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent" />
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-red-400/70">
                  Live Arena
                </p>
                <h2 className="font-display text-lg font-extrabold uppercase text-white/88">
                  Debate Feed
                </h2>
              </div>
              <motion.span
                className="h-3 w-3 rounded-full bg-red-500"
                animate={{ scale: [1, 1.7, 1], opacity: [1, 0.35, 1] }}
                transition={{ duration: 0.85, repeat: Infinity }}
              />
            </div>

            <div className="space-y-3">
              {[
                ["State", arenaStatusLabel],
                ["Round", `${displayedRound} / ${displayedTotalRounds}`],
                ["Pool", `$${(Number(battle.poolA + battle.poolB) / 1_000_000).toFixed(2)}`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-white/6 pb-2 last:border-b-0 last:pb-0">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-white/28">{label}</span>
                  <span className="font-display text-sm font-extrabold uppercase text-white/70">{value}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <AnimatePresence>
            {(phase === "live" || phase === "verdict") && (roundScores.A > 0 || roundScores.B > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-white/8 bg-white/[0.03] p-4 space-y-3"
              >
                <div className="font-display text-xs text-white/35 uppercase tracking-widest">Score</div>
                {(["A", "B"] as const).map((side) => {
                  const agent = side === "A" ? battle.agentA : battle.agentB;
                  const score = roundScores[side];
                  const isLeading = roundScores[side] > roundScores[side === "A" ? "B" : "A"];
                  return (
                    <div key={side} className="flex items-center justify-between">
                      <span className="font-display text-xs font-bold" style={{ color: agent.color }}>
                        {agent.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {isLeading && <span className="text-xs">👑</span>}
                        <span className="font-display text-lg font-extrabold text-white">{score}</span>
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.06 }}
            className="rounded-xl border border-clash-gold/15 bg-white/[0.025] p-4"
          >
            <ResearchFeed purchases={researchPurchases} status={researchProgress} />
          </motion.div>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-display text-xs text-white/30 uppercase tracking-widest">Watching</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="font-body text-xs text-white/30">live</span>
              </div>
            </div>
            <div className="flex -space-x-2">
              {["#FFB800", "#4466FF", "#BE1A1A", "#22C55E", "#7C3AED"].map((c, i) => (
                <div key={i} className="w-6 h-6 rounded-full border-2 border-[#0A0A0F]"
                  style={{ backgroundColor: c, opacity: 0.75 }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Overlays ──────────────────────────────────────────────────────── */}

      <AnimatePresence>
        {phase === "countdown" && <CountdownOverlay key="countdown" count={countdown} />}
      </AnimatePresence>

      <AnimatePresence>
        {showRoundBreak && (
          <RoundBreakOverlay
            key="roundbreak"
            round={roundIndex + 1}
            totalRounds={activeRounds.length || 3}
            scores={roundScores}
            battle={battle}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showJudgingOverlay && !showWinner && (
          <JudgingOverlay key="judging" battle={battle} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWinner && winner && (
          <WinnerOverlay key="winner" winner={winner} battle={battle} judgeScores={judgeScores} txHash={settleTxHash} />
        )}
      </AnimatePresence>

      <FloatingCrowd emojis={floatingEmojis} />

      <ResearchHandshake
        purchase={activeHandshake}
        battle={battle}
        onDone={() => setActiveHandshake(null)}
      />
    </div>
  );
}
