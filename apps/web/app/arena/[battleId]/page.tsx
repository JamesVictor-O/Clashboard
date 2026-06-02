"use client";

import { useParams } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { BettingPanel } from "@/components/battle/BettingPanel";
import type { Battle, BattlePhase } from "@/lib/types";

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

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = "countdown" | "betting" | "live" | "verdict";

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

// ─── Winner Overlay ───────────────────────────────────────────────────────────

function WinnerOverlay({
  winner,
  battle,
  scores,
}: {
  winner: "A" | "B";
  battle: Battle;
  scores: { A: number; B: number };
}) {
  const agent = winner === "A" ? battle.agentA : battle.agentB;
  const loser = winner === "A" ? battle.agentB : battle.agentA;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{ background: "rgba(10,10,15,0.97)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
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
        className="relative z-10 text-center px-8 max-w-md"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", damping: 14, stiffness: 100 }}
      >
        <motion.div
          className="text-7xl mb-5"
          animate={{ rotate: [0, -8, 8, -4, 4, 0], scale: [1, 1.15, 1] }}
          transition={{ delay: 0.7, duration: 0.9 }}
        >
          🏆
        </motion.div>

        <p className="font-body text-[10px] text-white/30 uppercase tracking-[0.4em] mb-3">
          Winner
        </p>

        <motion.h2
          className="font-display font-extrabold uppercase mb-2"
          style={{
            fontSize: "clamp(3.2rem, 11vw, 6.5rem)",
            color: agent.color,
            textShadow: `0 0 120px ${agent.color}55, 0 0 40px ${agent.color}25`,
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {agent.name}
        </motion.h2>

        <p className="font-body text-white/40 text-sm mb-2">
          {agent.personality} · Victorious
        </p>

        <motion.div
          className="flex items-center justify-center gap-6 mt-6 mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          <div className="text-center">
            <div className="font-display text-2xl font-extrabold" style={{ color: agent.color }}>
              {scores[winner]}
            </div>
            <div className="font-body text-[10px] text-white/25 mt-0.5">{agent.name}</div>
          </div>
          <div className="font-body text-white/15 text-lg">vs</div>
          <div className="text-center">
            <div className="font-display text-2xl font-extrabold text-white/40">
              {scores[winner === "A" ? "B" : "A"]}
            </div>
            <div className="font-body text-[10px] text-white/25 mt-0.5">{loser.name}</div>
          </div>
        </motion.div>

        <motion.div
          className="font-body text-[11px] text-white/20 uppercase tracking-widest"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3 }}
        >
          Payouts settling on-chain...
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

  return (
    <motion.div
      className="relative rounded-xl p-4 border overflow-hidden"
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
      <div className="font-display font-extrabold text-xl leading-tight mb-0.5" style={{ color: agent.color }}>
        {agent.name}
      </div>
      <div className="font-body text-xs text-white/35">{agent.personality}</div>
      <div className="font-body text-[10px] text-white/20 mt-2">
        {(agent.winRate * 100).toFixed(0)}% win rate · {agent.totalBattles} battles
      </div>
    </motion.div>
  );
}

// ─── Argument Panel ───────────────────────────────────────────────────────────

function ArgumentPanel({
  turn,
  roundIndex,
  text,
  battle,
  onDone,
}: {
  turn: "A" | "B";
  roundIndex: number;
  text: string;
  battle: Battle;
  onDone: () => void;
}) {
  const agent = turn === "A" ? battle.agentA : battle.agentB;

  return (
    <motion.div
      key={`arg-${roundIndex}-${turn}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-xl p-5 sm:p-6 border overflow-hidden"
      style={{ borderColor: `${agent.color}28`, background: `${agent.color}06` }}
    >
      <div
        className="absolute left-0 top-5 bottom-5 w-[3px] rounded-full"
        style={{ background: `linear-gradient(180deg, ${agent.color}, ${agent.color}40)` }}
      />
      <div className="font-display text-xs font-bold uppercase tracking-widest mb-3 ml-1" style={{ color: agent.color }}>
        {agent.name}
      </div>
      <p className="font-body text-sm sm:text-[15px] leading-relaxed ml-1" style={{ color: `${agent.color}CC` }}>
        <TypewriterText key={`tw-${roundIndex}-${turn}`} text={text} onDone={onDone} speed={14} />
      </p>
      <div
        className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
        style={{ background: `linear-gradient(0deg, ${agent.color}08, transparent)` }}
      />
    </motion.div>
  );
}

// ─── Main Battle Page ─────────────────────────────────────────────────────────

export default function BattlePage() {
  const { battleId } = useParams<{ battleId: string }>();
  const isDemo = !battleId || battleId === "demo" || !battleId.startsWith("0x");

  const [phase, setPhase] = useState<Phase>("countdown");
  const [countdown, setCountdown] = useState(3);

  const [roundIndex, setRoundIndex] = useState(0);
  const [turn, setTurn] = useState<"A" | "B">("A");
  const [currentText, setCurrentText] = useState("");

  const [showRebuttal, setShowRebuttal] = useState(false);
  const [showRoundBreak, setShowRoundBreak] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const [winner, setWinner] = useState<"A" | "B" | null>(null);

  const [momentum, setMomentum] = useState(0);
  const [roundScores, setRoundScores] = useState({ A: 0, B: 0 });
  const [typingDone, setTypingDone] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);

  // Real battle data
  const [battle, setBattle] = useState<Battle>(DEMO_BATTLE);
  const [receivedRounds, setReceivedRounds] = useState<DebateRound[]>(
    isDemo ? DEMO_ROUNDS : []
  );
  const verdictCalledRef = useRef(false);

  // ─── Fetch battle metadata (non-demo) ────────────────────────────────────

  useEffect(() => {
    if (isDemo) return;

    fetch(`/api/battle/${battleId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
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
          rubricHash: "0x",
          winner: null,
          createdAt: data.createdAt,
        });
      })
      .catch(() => {});
  }, [battleId, isDemo]);

  // ─── Connect SSE stream (non-demo) ───────────────────────────────────────

  useEffect(() => {
    if (isDemo) return;

    const sse = new EventSource(
      `/api/battle/stream?battleId=${encodeURIComponent(battleId!)}`
    );

    sse.onmessage = (e) => {
      try {
        const { type, data } = JSON.parse(e.data) as {
          type: string;
          data: unknown;
        };

        if (type === "round") {
          const round = data as { agentAText: string; agentBText: string };
          setReceivedRounds((prev) => [
            ...prev,
            { a: round.agentAText, b: round.agentBText },
          ]);
        }
      } catch {}
    };

    sse.onerror = () => sse.close();

    return () => sse.close();
  }, [battleId, isDemo]);

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
            setTimeout(() => {
              setShowWinner(true);
              spawnEmojis(["🏆", "🎉", "👑", "🥇", "🔥", "💰"]);
            }, 600);
          } else if (!verdictCalledRef.current) {
            verdictCalledRef.current = true;
            fetch("/api/battle/verdict", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ battleId }),
            })
              .then((r) => r.json())
              .then((result: { winnerSide?: "A" | "B" }) => {
                setWinner(result.winnerSide ?? (newScores.A > newScores.B ? "A" : "B"));
                setTimeout(() => {
                  setShowWinner(true);
                  spawnEmojis(["🏆", "🎉", "👑", "🥇", "🔥", "💰"]);
                }, 600);
              })
              .catch(() => {
                const w: "A" | "B" = newScores.A > newScores.B ? "A" : "B";
                setWinner(w);
                setTimeout(() => {
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

  // ─── Derived ─────────────────────────────────────────────────────────────

  const activeRounds = isDemo ? DEMO_ROUNDS : receivedRounds;

  const bettingPhase: BattlePhase =
    phase === "betting" ? "BETTING" :
    phase === "live" ? "LIVE" :
    phase === "verdict" ? "VERDICT" : "BETTING";

  return (
    <div className="min-h-screen bg-clash-black flex flex-col">

      {/* ── Live ticker bar ───────────────────────────────────────────────── */}
      <div className="border-b border-white/8 bg-clash-black/80 sticky top-0 z-20 backdrop-blur-sm">
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {phase === "live" || phase === "verdict" ? (
              <span className="flex-shrink-0 flex items-center gap-1.5 bg-red-500/15 rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                <span className="font-display text-[10px] text-red-400 font-bold uppercase tracking-widest">LIVE</span>
              </span>
            ) : (
              <span className="flex-shrink-0 flex items-center gap-1.5 bg-clash-gold/15 rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-clash-gold animate-pulse" />
                <span className="font-display text-[10px] text-clash-gold font-bold uppercase tracking-widest">
                  {phase === "betting" ? "BETTING" : "LOADING"}
                </span>
              </span>
            )}
            <div className="min-w-0">
              <span className="font-body text-[10px] text-white/25 uppercase tracking-widest block">Hot Take</span>
              <h1 className="font-display text-sm sm:text-base font-bold text-clash-white truncate">
                {battle.topic}
              </h1>
            </div>
          </div>

          {phase === "live" && (
            <div className="flex-shrink-0 text-right">
              <div className="font-body text-[10px] text-white/25 uppercase tracking-widest">Round</div>
              <div className="font-display text-sm font-bold text-white">
                {roundIndex + 1} / {activeRounds.length || 3}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Main grid ─────────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-5
                      grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 sm:gap-5">

        {/* Left: Arena + debate */}
        <div className="space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <AgentCard side="A" agent={battle.agentA} isActive={turn === "A"} phase={phase} />
            <AgentCard side="B" agent={battle.agentB} isActive={turn === "B"} phase={phase} />
          </div>

          <ArenaScene
            battle={battle}
            activeAgent={turn}
            currentText={phase === "live" ? currentText : ""}
            phase={bettingPhase}
          />

          <div className="flex items-center justify-center h-12">
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
              ) : phase === "betting" ? (
                <motion.div
                  key="betting-indicator"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="font-display text-xs text-clash-gold/50 uppercase tracking-widest"
                >
                  Betting window open
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            {phase === "live" && currentText ? (
              <ArgumentPanel
                key={`${roundIndex}-${turn}`}
                turn={turn}
                roundIndex={roundIndex}
                text={currentText}
                battle={battle}
                onDone={() => setTypingDone(true)}
              />
            ) : phase === "betting" ? (
              <motion.div
                key="betting-msg"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-clash-gold/25 bg-clash-gold/05 p-6 text-center"
              >
                <div className="font-display text-xl font-extrabold text-clash-gold mb-2">
                  BETTING OPEN
                </div>
                <p className="font-body text-sm text-white/35 max-w-sm mx-auto">
                  Place your bets now. The battle begins in moments.
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {(phase === "live" || phase === "verdict") && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <MomentumBar momentum={momentum} battle={battle} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Betting panel + score */}
        <div className="space-y-4">
          <BettingPanel
            battle={battle}
            phase={bettingPhase}
            onBetPlaced={() => spawnEmojis(["💰", "🤑", "💸", "🎲"])}
          />

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
        {showWinner && winner && (
          <WinnerOverlay key="winner" winner={winner} battle={battle} scores={roundScores} />
        )}
      </AnimatePresence>

      <FloatingCrowd emojis={floatingEmojis} />
    </div>
  );
}
