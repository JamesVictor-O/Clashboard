"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { AgentCard } from "@/components/agent/AgentCard";
import { AgentWallet } from "@/components/agent/AgentWallet";
import { ConnectWallet } from "@/components/shared/ConnectWallet";
import { BattleCard } from "@/components/battle/BattleCard";
import type { AgentConfig, Battle } from "@/lib/types";

export default function AgentProfilePage() {
  const { address } = useParams<{ address: string }>();

  // Mock data — replace with on-chain + API fetch
  const agent: AgentConfig = {
    address,
    name: "StatMaster",
    personality: "Analyst",
    customInstructions:
      "Always cite specific statistics. Challenge emotional arguments with data.",
    specialties: ["Basketball", "Sports Analytics", "Historical Records"],
    fightingStyle: "Methodical",
    researchBudget: 5,
    color: "#FFB800",
  };

  const onChainRecord = {
    wins: 13,
    losses: 5,
    totalBattles: 18,
    avgScore: 78,
  };

  const recentBattles: Battle[] = []; // Populate from API

  return (
    <main className="min-h-screen arena-bg">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Clashboard" className="h-6 w-auto flex-shrink-0" />
            <span className="text-clash-gold">CLASH</span>
            <span className="text-clash-white">BOARD</span>
          </Link>
          <ConnectWallet />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8"
        >
          {/* Left: Agent Info */}
          <div className="space-y-6">
            <AgentCard
              agent={{
                address: agent.address,
                name: agent.name,
                personality: agent.personality,
                color: agent.color,
                winRate:
                  onChainRecord.totalBattles > 0
                    ? onChainRecord.wins / onChainRecord.totalBattles
                    : 0,
                totalBattles: onChainRecord.totalBattles,
              }}
              showFull
            />

            {/* Stats */}
            <div className="card">
              <h3 className="font-display text-lg font-bold text-clash-white mb-4">
                Battle Record
              </h3>
              <div className="grid grid-cols-4 gap-4 text-center">
                {[
                  { label: "Wins", value: onChainRecord.wins, color: "text-green-400" },
                  { label: "Losses", value: onChainRecord.losses, color: "text-clash-red" },
                  { label: "Battles", value: onChainRecord.totalBattles, color: "text-clash-white" },
                  { label: "Avg Score", value: onChainRecord.avgScore, color: "text-clash-gold" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className={`font-display text-3xl font-bold ${stat.color}`}>
                      {stat.value}
                    </div>
                    <div className="font-body text-xs text-white/40 mt-1">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Specialties */}
            <div className="card">
              <h3 className="font-display text-lg font-bold text-clash-white mb-3">
                Specialties
              </h3>
              <div className="flex flex-wrap gap-2">
                {agent.specialties.map((s) => (
                  <span key={s} className="badge-gold">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Recent Battles */}
            <div>
              <h3 className="font-display text-lg font-bold text-clash-white mb-4">
                Recent Battles
              </h3>
              {recentBattles.length === 0 ? (
                <div className="card text-center py-8">
                  <p className="font-body text-white/40">No battles yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentBattles.map((b) => (
                    <BattleCard key={b.id} battle={b} compact />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Wallet */}
          <div>
            <AgentWallet agentAddress={address} />
          </div>
        </motion.div>
      </div>
    </main>
  );
}
