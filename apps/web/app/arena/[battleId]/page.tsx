"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { BettingPanel } from "@/components/battle/BettingPanel";
import { ScoreBar } from "@/components/battle/ScoreBar";
import { ResearchFeed } from "@/components/battle/ResearchFeed";
import { VerdictScreen } from "@/components/battle/VerdictScreen";
import { CrowdReactions } from "@/components/arena/CrowdReactions";
import { TxLink } from "@/components/shared/TxLink";
import type { Battle, BattlePhase, Round, ResearchPurchase } from "@/lib/types";

// Dynamically import Three.js scene to avoid SSR issues
const ArenaScene = dynamic(
  () =>
    import("@/components/arena/ArenaScene").then((m) => m.ArenaScene),
  { ssr: false, loading: () => <ArenaSkeleton /> }
);

function ArenaSkeleton() {
  return (
    <div className="w-full h-[480px] bg-clash-dim rounded-xl animate-pulse flex items-center justify-center">
      <span className="font-display text-white/30 text-lg">
        Loading Arena...
      </span>
    </div>
  );
}

export default function ArenaPage() {
  const { battleId } = useParams<{ battleId: string }>();

  const [phase, setPhase] = useState<BattlePhase>("BETTING");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [activeAgent, setActiveAgent] = useState<"A" | "B">("A");
  const [currentText, setCurrentText] = useState("");
  const [scores, setScores] = useState({ accuracy: 0, wit: 0, rebuttal: 0 });
  const [purchases, setPurchases] = useState<ResearchPurchase[]>([]);
  const [crowdEvents, setCrowdEvents] = useState<string[]>([]);
  const [verdictTxHash, setVerdictTxHash] = useState<string | null>(null);

  // Mock battle data — replace with real fetch
  const battle: Battle = {
    id: battleId,
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
      color: "#1A3FBE",
      winRate: 0.65,
      totalBattles: 23,
    },
    state: "LIVE",
    poolA: 42_000_000n,
    poolB: 38_000_000n,
    bettingDeadline: BigInt(Math.floor(Date.now() / 1000) + 300),
    rubricHash: "0xdeadbeef",
    winner: null,
    bettorCount: 14,
    createdAt: Date.now() - 120_000,
  };

  return (
    <main className="min-h-screen arena-bg">
      {/* Topic Banner */}
      <div className="border-b border-white/10 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <span className="font-display text-xs text-white/40 uppercase tracking-widest">
              Hot Take
            </span>
            <h1 className="font-display text-lg font-bold text-clash-white">
              {battle.topic}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {phase === "LIVE" && (
              <span className="badge-red">
                <span className="w-2 h-2 rounded-full bg-clash-red animate-pulse" />
                LIVE
              </span>
            )}
            {verdictTxHash && <TxLink hash={verdictTxHash} />}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        {/* Left: Arena + Battle */}
        <div className="space-y-4">
          {/* 3D Arena */}
          <ArenaScene
            battle={battle}
            activeAgent={activeAgent}
            currentText={currentText}
            phase={phase}
          />

          {/* Crowd Reactions */}
          <CrowdReactions events={crowdEvents} />

          {/* Score Bars */}
          <AnimatePresence>
            {(phase === "LIVE" || phase === "VERDICT") && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <ScoreBar scores={scores} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Research Feed */}
          <AnimatePresence>
            {phase === "RESEARCH" && purchases.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <ResearchFeed purchases={purchases} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Verdict */}
          <AnimatePresence>
            {phase === "VERDICT" && (
              <VerdictScreen
                battle={battle}
                rounds={rounds}
                txHash={verdictTxHash}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Right: Betting Panel */}
        <div>
          <BettingPanel
            battle={battle}
            phase={phase}
            onBetPlaced={(side, amount) => {
              console.log("Bet placed:", side, amount);
            }}
          />
        </div>
      </div>
    </main>
  );
}
