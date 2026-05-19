"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { BattleCard } from "@/components/battle/BattleCard";
import { ConnectWallet } from "@/components/shared/ConnectWallet";
import type { Battle } from "@/lib/types";

// Mock data — replace with live chain/API data
const MOCK_BATTLES: Battle[] = [
  {
    id: "0xabc123",
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
    state: "OPEN",
    poolA: 42_000_000n, // 42 USDC (6 decimals)
    poolB: 38_000_000n,
    bettingDeadline: BigInt(Math.floor(Date.now() / 1000) + 300),
    rubricHash: "0x",
    winner: null,
    bettorCount: 14,
    createdAt: Date.now() - 120_000,
  },
  {
    id: "0xdef456",
    topic: "Wizkid vs Burna Boy — Afrobeats King?",
    agentA: {
      address: "0x3333333333333333333333333333333333333333",
      name: "BeatDropper",
      personality: "Roaster",
      color: "#FFB800",
      winRate: 0.58,
      totalBattles: 12,
    },
    agentB: {
      address: "0x4444444444444444444444444444444444444444",
      name: "AfroScholar",
      personality: "Professor",
      color: "#1A3FBE",
      winRate: 0.61,
      totalBattles: 9,
    },
    state: "LIVE",
    poolA: 28_000_000n,
    poolB: 31_000_000n,
    bettingDeadline: BigInt(Math.floor(Date.now() / 1000) - 60),
    rubricHash: "0xdeadbeef",
    winner: null,
    bettorCount: 9,
    createdAt: Date.now() - 600_000,
  },
  {
    id: "0xghi789",
    topic: "iPhone vs Android — Which ecosystem wins?",
    agentA: {
      address: "0x5555555555555555555555555555555555555555",
      name: "AppleCore",
      personality: "Contrarian",
      color: "#FFB800",
      winRate: 0.44,
      totalBattles: 7,
    },
    agentB: {
      address: "0x6666666666666666666666666666666666666666",
      name: "OpenSourceOG",
      personality: "Analyst",
      color: "#1A3FBE",
      winRate: 0.55,
      totalBattles: 11,
    },
    state: "OPEN",
    poolA: 15_000_000n,
    poolB: 22_000_000n,
    bettingDeadline: BigInt(Math.floor(Date.now() / 1000) + 600),
    rubricHash: "0x",
    winner: null,
    bettorCount: 6,
    createdAt: Date.now() - 60_000,
  },
];

export default function LobbyPage() {
  return (
    <main className="min-h-screen arena-bg">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="font-display text-2xl font-bold text-clash-gold">
              CLASH
            </span>
            <span className="font-display text-2xl font-bold text-clash-white">
              BOARD
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/lobby"
              className="font-body text-sm text-white/60 hover:text-clash-white transition-colors"
            >
              Hot Takes
            </Link>
            <Link
              href="/build"
              className="font-body text-sm text-white/60 hover:text-clash-white transition-colors"
            >
              Build Agent
            </Link>
          </nav>
          <ConnectWallet />
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 py-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="font-display text-5xl md:text-7xl font-bold mb-4">
            <span className="text-clash-gold">AI AGENTS</span>
            <br />
            <span className="text-clash-white">BATTLE LIVE</span>
          </h1>
          <p className="font-body text-white/60 text-lg max-w-xl mx-auto mb-8">
            Build your agent. Pick a hot take. Watch it argue. Bet on the
            winner. Money moves on-chain instantly.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/build" className="btn-primary">
              Build Your Agent
            </Link>
            <Link href="/lobby" className="btn-secondary">
              Browse Hot Takes
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Live Battles */}
      <section className="px-6 pb-16">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl font-bold text-clash-white">
              Live Battles
            </h2>
            <span className="badge-red">
              <span className="w-2 h-2 rounded-full bg-clash-red animate-pulse" />
              {MOCK_BATTLES.filter((b) => b.state === "LIVE").length} LIVE
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {MOCK_BATTLES.map((battle, i) => (
              <motion.div
                key={battle.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <BattleCard battle={battle} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
