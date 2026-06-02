"use client";

/**
 * AutonomyLog — demo visibility component showing autonomous 1Shot executions.
 *
 * Renders as a fixed bottom-right panel. Appears when there are log entries.
 * Critical for hackathon demo: shows that actions executed with no wallet popup.
 *
 * Usage:
 *   import { AutonomyLog } from "@/components/autonomy/AutonomyLog";
 *   <AutonomyLog />   // place anywhere in the page, renders fixed
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ExecutionLogEntry } from "@/lib/autonomy/executor";

const ACTION_LABELS: Record<string, string> = {
  ISSUE_CHALLENGE:  "Challenge Issued",
  ACCEPT_CHALLENGE: "Challenge Accepted",
  PLACE_BET:        "Bet Placed",
  BUY_RESEARCH:     "Research Purchased",
  AGENT_RESEARCH:   "Agent Research",
};

const MODE_BADGE: Record<string, { label: string; color: string }> = {
  autonomous_oneshot:    { label: "1Shot · No popup", color: "#22C55E" },
  manual_batched_wallet: { label: "1 popup",          color: "#FFB800" },
  manual_direct_wallet:  { label: "Direct",           color: "#94A3B8" },
};

function StatusDot({ status }: { status: ExecutionLogEntry["status"] }) {
  if (status === "success") return <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />;
  if (status === "failed")  return <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />;
  return (
    <motion.span
      className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0"
      animate={{ opacity: [1, 0.2, 1] }}
      transition={{ duration: 0.8, repeat: Infinity }}
    />
  );
}

export function AutonomyLog() {
  const [entries, setEntries] = useState<ExecutionLogEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  // Poll the in-memory log every 2 seconds
  useEffect(() => {
    const tick = async () => {
      const { getExecutionLog } = await import("@/lib/autonomy/executor");
      setEntries(getExecutionLog());
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);

  if (entries.length === 0) return null;

  const latest = entries[0];
  const badge = MODE_BADGE[latest.mode];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-6 right-6 z-[70] w-72 font-mono"
    >
      {/* Header bar */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-white/8"
        style={{ background: "#080810", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <div className="flex items-center gap-2">
          <motion.span
            className="w-2 h-2 rounded-full bg-green-400"
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <span className="text-[10px] uppercase tracking-widest text-white/60">
            Agent Actions
          </span>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold"
            style={{ background: "rgba(34,197,94,0.15)", color: "#22C55E" }}
          >
            {entries.length}
          </span>
        </div>
        <span className="text-white/30 text-xs">{collapsed ? "▲" : "▼"}</span>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ background: "#080810", border: "1px solid rgba(255,255,255,0.08)", borderTop: "none" }}
            className="overflow-hidden"
          >
            <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
              {entries.map((entry) => {
                const modeBadge = MODE_BADGE[entry.mode];
                return (
                  <div key={entry.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <StatusDot status={entry.status} />
                      <span className="text-[10px] text-white/80 font-bold uppercase tracking-wide flex-1">
                        {ACTION_LABELS[entry.actionType] ?? entry.actionType}
                      </span>
                      <span
                        className="text-[8px] px-1.5 py-0.5 rounded-sm font-bold"
                        style={{ background: `${modeBadge.color}18`, color: modeBadge.color }}
                      >
                        {modeBadge.label}
                      </span>
                    </div>

                    {entry.prefundTxHash && entry.prefundTxHash !== "0x" + "0".repeat(64) && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[8px] text-white/30 uppercase">1Shot</span>
                        <a
                          href={`https://sepolia.basescan.org/tx/${entry.prefundTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[9px] text-clash-gold/70 hover:text-clash-gold transition-colors"
                        >
                          {entry.prefundTxHash.slice(0, 10)}…{entry.prefundTxHash.slice(-6)}
                        </a>
                      </div>
                    )}

                    {entry.txHash && entry.txHash !== entry.prefundTxHash && entry.txHash !== "0x" + "0".repeat(64) && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[8px] text-white/30 uppercase">Action</span>
                        <a
                          href={`https://sepolia.basescan.org/tx/${entry.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[9px] text-white/45 hover:text-white/75 transition-colors"
                        >
                          {entry.txHash.slice(0, 10)}…{entry.txHash.slice(-6)}
                        </a>
                      </div>
                    )}

                    {entry.status === "failed" && entry.reason && (
                      <p className="text-[9px] text-red-400/70 leading-snug">{entry.reason}</p>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-[8px] text-white/20">
                        ${entry.amountUsdc.toFixed(2)} USDC
                      </span>
                      <span className="text-[8px] text-white/20">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Latest action hero */}
            {latest.mode === "autonomous_oneshot" && latest.status === "success" && (
              <div
                className="px-4 py-3 border-t border-white/5"
                style={{ background: "rgba(34,197,94,0.04)" }}
              >
                <p className="text-[9px] text-green-400/80 leading-relaxed">
                  ⚡ Agent action executed by 1Shot — no wallet popup required.
                </p>
                {latest.prefundTxHash && (
                  <p className="text-[8px] text-white/30 mt-1">
                    1Shot: {latest.prefundTxHash.slice(0, 18)}…
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
