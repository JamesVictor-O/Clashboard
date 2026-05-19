"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import clsx from "clsx";
import type { Battle } from "@/lib/types";

interface BattleCardProps {
  battle: Battle;
  compact?: boolean;
}

function formatPool(micro: bigint): string {
  const usdc = Number(micro) / 1_000_000;
  return usdc.toFixed(2);
}

function useCountdown(deadline: bigint): string {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const remaining = Number(deadline - now);

  if (remaining <= 0) return "Closed";

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  if (mins > 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

/**
 * Lobby card showing topic, agents, prize pool, bettor count, countdown.
 */
export function BattleCard({ battle, compact = false }: BattleCardProps) {
  const countdown = useCountdown(battle.bettingDeadline);
  const totalPool = Number(battle.poolA + battle.poolB) / 1_000_000;
  const oddsA =
    battle.poolA + battle.poolB > 0n
      ? ((Number(battle.poolA) / Number(battle.poolA + battle.poolB)) * 100).toFixed(0)
      : "50";
  const oddsB = (100 - parseInt(oddsA)).toString();

  return (
    <Link href={`/arena/${battle.id}`}>
      <motion.div
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={clsx(
          "card-hover group",
          compact ? "p-3" : "p-4"
        )}
      >
        {/* State badge + countdown */}
        <div className="flex items-center justify-between mb-3">
          <span
            className={clsx("badge", {
              "badge-red": battle.state === "LIVE",
              "badge-gold": battle.state === "OPEN",
              "bg-white/10 text-white/40 border border-white/10":
                battle.state === "SETTLED",
            })}
          >
            {battle.state === "LIVE" && (
              <span className="w-1.5 h-1.5 rounded-full bg-clash-red animate-pulse" />
            )}
            {battle.state}
          </span>
          {battle.state !== "SETTLED" && (
            <span className="font-body text-xs text-white/40">
              {battle.state === "OPEN" ? `Betting closes in ${countdown}` : "Live now"}
            </span>
          )}
        </div>

        {/* Topic */}
        <h3
          className={clsx(
            "font-display font-bold text-clash-white mb-3 line-clamp-2",
            compact ? "text-sm" : "text-base"
          )}
        >
          {battle.topic}
        </h3>

        {/* Agents vs */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div
              className="font-display text-sm font-bold truncate"
              style={{ color: battle.agentA.color }}
            >
              {battle.agentA.name}
            </div>
            <div className="font-body text-xs text-white/40">
              {battle.agentA.personality} · {(battle.agentA.winRate * 100).toFixed(0)}% WR
            </div>
          </div>

          <div className="font-display text-xs font-bold text-white/30 shrink-0">
            VS
          </div>

          <div className="flex-1 min-w-0 text-right">
            <div
              className="font-display text-sm font-bold truncate"
              style={{ color: battle.agentB.color }}
            >
              {battle.agentB.name}
            </div>
            <div className="font-body text-xs text-white/40">
              {battle.agentB.personality} · {(battle.agentB.winRate * 100).toFixed(0)}% WR
            </div>
          </div>
        </div>

        {/* Odds bar */}
        <div className="mb-3">
          <div className="flex h-1.5 rounded-full overflow-hidden bg-clash-black">
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${oddsA}%`,
                background: battle.agentA.color,
              }}
            />
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${oddsB}%`,
                background: battle.agentB.color,
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-body text-xs text-white/40">{oddsA}%</span>
            <span className="font-body text-xs text-white/40">{oddsB}%</span>
          </div>
        </div>

        {/* Stats row */}
        {!compact && (
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <div className="flex items-center gap-1">
              <span className="font-body text-xs text-white/40">Prize pool</span>
              <span className="font-display text-sm font-bold text-clash-gold">
                ${totalPool.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-body text-xs text-white/40">
                {battle.bettorCount ?? 0} bettors
              </span>
            </div>
          </div>
        )}
      </motion.div>
    </Link>
  );
}
