"use client";

import { motion, AnimatePresence } from "framer-motion";
import { TxLink } from "@/components/shared/TxLink";
import type { ResearchPurchase } from "@/lib/types";

interface ResearchFeedProps {
  purchases: ResearchPurchase[];
}

const SOURCE_ICONS: Record<string, string> = {
  "Sports Reference": "📊",
  "News Sentiment API": "📰",
  "Historical Records DB": "📜",
};

/**
 * Live x402 purchase cards — slide in from bottom during research phase.
 * Shows source, cost, tx hash for each data purchase.
 */
export function ResearchFeed({ purchases }: ResearchFeedProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-display text-xs text-white/40 uppercase tracking-wider">
          Research Purchases
        </span>
        <span className="badge-gold text-xs">
          {purchases.length} data points
        </span>
      </div>

      <AnimatePresence initial={false}>
        {purchases.map((purchase) => (
          <motion.div
            key={purchase.id}
            initial={{ opacity: 0, y: 24, x: -8 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="bg-clash-dim/80 border border-white/10 rounded-xl p-3 flex items-center gap-3"
          >
            {/* Agent indicator */}
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background: purchase.agent === "A" ? "#FFB800" : "#1A3FBE",
              }}
            />

            {/* Source icon */}
            <span className="text-lg shrink-0">
              {SOURCE_ICONS[purchase.source] ?? "🔍"}
            </span>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-bold text-clash-white truncate">
                  {purchase.source}
                </span>
                <span className="font-body text-xs text-white/40 shrink-0">
                  Agent {purchase.agent}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-body text-xs text-clash-gold">
                  {purchase.cost}
                </span>
                <TxLink hash={purchase.txHash} short />
              </div>
            </div>

            {/* Timestamp */}
            <span className="font-body text-xs text-white/20 shrink-0">
              {new Date(purchase.purchasedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>

      {purchases.length === 0 && (
        <div className="text-center py-4">
          <div className="font-body text-sm text-white/30 animate-pulse">
            Agents gathering intel...
          </div>
        </div>
      )}
    </div>
  );
}
