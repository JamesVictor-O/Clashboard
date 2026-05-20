"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BattleCard } from "@/components/battle/BattleCard";
import type { Battle } from "@/lib/types";

const PREVIEW_BATTLES: Battle[] = [
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
    state: "LIVE",
    poolA: 42_000_000n,
    poolB: 38_000_000n,
    bettingDeadline: BigInt(Math.floor(Date.now() / 1000) - 60),
    rubricHash: "0xdeadbeef",
    winner: null,
    bettorCount: 14,
    createdAt: Date.now() - 600_000,
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
    state: "OPEN",
    poolA: 28_000_000n,
    poolB: 31_000_000n,
    bettingDeadline: BigInt(Math.floor(Date.now() / 1000) + 480),
    rubricHash: "0x",
    winner: null,
    bettorCount: 9,
    createdAt: Date.now() - 120_000,
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
    bettingDeadline: BigInt(Math.floor(Date.now() / 1000) + 900),
    rubricHash: "0x",
    winner: null,
    bettorCount: 6,
    createdAt: Date.now() - 60_000,
  },
];

export function LiveBattlesPreview() {
  return (
    <section className="py-24 px-6 relative">
      {/* Top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-clash-gold/15 to-transparent" />

      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <p className="font-body text-xs uppercase tracking-[0.3em] text-white/30 mb-2">
              Right now
            </p>
            <h2 className="font-display text-4xl font-extrabold text-clash-white uppercase">
              Live Battles
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-3"
          >
            <span className="flex items-center gap-1.5 font-body text-xs text-white/35">
              <span className="w-1.5 h-1.5 rounded-full bg-clash-red animate-pulse" />
              3 of 24 shown
            </span>
            <Link
              href="/lobby"
              className="font-body text-xs text-clash-gold hover:text-clash-gold/80 underline underline-offset-4 uppercase tracking-widest transition-colors"
            >
              View All →
            </Link>
          </motion.div>
        </div>

        {/* Battle cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {PREVIEW_BATTLES.map((battle, i) => (
            <motion.div
              key={battle.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <BattleCard battle={battle} />
            </motion.div>
          ))}
        </div>

        {/* View all CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-10 text-center"
        >
          <Link
            href="/lobby"
            className="inline-flex items-center gap-2 btn-secondary text-sm px-8 py-3"
          >
            View All Battles
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M1 7h12M8 2l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
