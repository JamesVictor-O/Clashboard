"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import clsx from "clsx";
import type { Agent } from "@/lib/types";

interface AgentCardProps {
  agent: Agent;
  showFull?: boolean;
  compact?: boolean;
}

/** Recent form dots — W/L history */
function FormDots({ winRate, total }: { winRate: number; total: number }) {
  const count = Math.min(total, 8);
  const wins = Math.round(winRate * count);

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={clsx(
            "w-2 h-2 rounded-full",
            i < wins ? "bg-green-400" : "bg-clash-red/60"
          )}
        />
      ))}
      {total > 8 && (
        <span className="font-body text-xs text-white/30 ml-1">+{total - 8}</span>
      )}
    </div>
  );
}

/**
 * Agent display card — avatar, name, win rate, specialty badges, recent form dots.
 */
export function AgentCard({ agent, showFull = false, compact = false }: AgentCardProps) {
  const winPct = (agent.winRate * 100).toFixed(0);

  const card = (
    <motion.div
      whileHover={!showFull ? { scale: 1.02 } : undefined}
      className={clsx(
        "card",
        !showFull && "card-hover",
        compact ? "p-3" : "p-4"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={clsx(
            "rounded-xl flex items-center justify-center font-display font-bold text-clash-black shrink-0",
            compact ? "w-10 h-10 text-base" : "w-14 h-14 text-xl"
          )}
          style={{ background: agent.color }}
        >
          {agent.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className={clsx(
                "font-display font-bold text-clash-white",
                compact ? "text-sm" : "text-lg"
              )}
            >
              {agent.name}
            </h3>
            <span
              className="badge text-xs"
              style={{
                background: `${agent.color}20`,
                color: agent.color,
                borderColor: `${agent.color}40`,
              }}
            >
              {agent.personality}
            </span>
          </div>

          {!compact && (
            <div className="flex items-center gap-4 mt-2">
              <div>
                <div className="font-display text-xl font-bold text-clash-gold">
                  {winPct}%
                </div>
                <div className="font-body text-xs text-white/40">Win Rate</div>
              </div>
              <div>
                <div className="font-display text-xl font-bold text-clash-white">
                  {agent.totalBattles}
                </div>
                <div className="font-body text-xs text-white/40">Battles</div>
              </div>
            </div>
          )}

          {compact && (
            <div className="font-body text-xs text-white/40 mt-0.5">
              {winPct}% WR · {agent.totalBattles} battles
            </div>
          )}
        </div>
      </div>

      {/* Recent Form */}
      {!compact && agent.totalBattles > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center justify-between">
            <span className="font-body text-xs text-white/40">Recent form</span>
            <FormDots winRate={agent.winRate} total={agent.totalBattles} />
          </div>
        </div>
      )}

      {/* Full view extras */}
      {showFull && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ background: agent.color }}
            />
            <span className="font-body text-xs text-white/40 font-mono">
              {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );

  if (showFull) return card;

  return (
    <Link href={`/agent/${agent.address}`} className="block">
      {card}
    </Link>
  );
}
