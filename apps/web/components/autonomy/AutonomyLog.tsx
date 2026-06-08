"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ExecutionLogEntry } from "@/lib/autonomy/executor";
import type { LoopLogEntry } from "@/lib/autonomy/loop-store";

// ─── Unified display entry ────────────────────────────────────────────────────

interface DisplayEntry {
  id: string;
  actionType: string;
  status: "pending" | "success" | "failed" | "skipped";
  mode?: string;
  txHash?: string;
  prefundTxHash?: string;
  oneShotTaskId?: string;
  amountUsdc?: number;
  topic?: string;
  reason?: string;
  timestamp: number;
  source: "executor" | "loop";
}

function toDisplay(e: ExecutionLogEntry): DisplayEntry {
  return {
    id: e.id, actionType: e.actionType, status: e.status,
    mode: e.mode, txHash: e.txHash, prefundTxHash: e.prefundTxHash,
    oneShotTaskId: e.oneShotTaskId, amountUsdc: e.amountUsdc,
    reason: e.reason, timestamp: e.timestamp, source: "executor",
  };
}

function loopToDisplay(e: LoopLogEntry): DisplayEntry {
  return {
    id: e.id,
    actionType: e.actionType,
    status: e.status === "skipped" ? "skipped" : e.status,
    txHash: e.txHash,
    amountUsdc: e.stakeUsdc,
    topic: e.topic,
    reason: e.reason,
    timestamp: e.timestamp,
    source: "loop",
  };
}

// ─── Labels / badges ─────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  ISSUE_CHALLENGE:  "Challenge Issued",
  ACCEPT_CHALLENGE: "Challenge Accepted",
  PLACE_BET:        "Bet Placed",
  BUY_RESEARCH:     "Research Purchased",
  AGENT_RESEARCH:   "Agent Research",
  SKIPPED:          "Scan · No Match",
  BLOCKED:          "Scan · Blocked",
};

const MODE_BADGE: Record<string, { label: string; color: string }> = {
  autonomous_oneshot:    { label: "1Shot · No popup", color: "#22C55E" },
  manual_batched_wallet: { label: "1 popup",          color: "#FFB800" },
  manual_direct_wallet:  { label: "Direct",           color: "#94A3B8" },
  loop:                  { label: "Auto Loop",        color: "#818CF8" },
};

function StatusDot({ status }: { status: DisplayEntry["status"] }) {
  if (status === "success") return <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />;
  if (status === "failed")  return <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />;
  if (status === "skipped") return <span className="w-2 h-2 rounded-full bg-white/20 flex-shrink-0" />;
  return (
    <motion.span
      className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0"
      animate={{ opacity: [1, 0.2, 1] }}
      transition={{ duration: 0.8, repeat: Infinity }}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AutonomyLog() {
  const [entries, setEntries] = useState<DisplayEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  // Merge executor + loop logs, newest first, every 2 s
  useEffect(() => {
    const tick = async () => {
      const [{ getExecutionLog }, { getLoopLog }] = await Promise.all([
        import("@/lib/autonomy/executor"),
        import("@/lib/autonomy/loop-store"),
      ]);
      const merged: DisplayEntry[] = [
        ...getExecutionLog().map(toDisplay),
        ...getLoopLog().map(loopToDisplay),
      ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
      setEntries(merged);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);

  if (entries.length === 0) return null;

  const latest = entries[0];
  const latestBadge = latest.mode ? MODE_BADGE[latest.mode] : (latest.source === "loop" ? MODE_BADGE.loop : undefined);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-6 right-6 z-[70] w-72 font-mono"
    >
      {/* Header bar */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3"
        style={{ background: "#080810", border: "1px solid rgba(255,255,255,0.1)", borderRadius: collapsed ? "12px" : "12px 12px 0 0" }}
      >
        <div className="flex items-center gap-2">
          <motion.span
            className="w-2 h-2 rounded-full bg-green-400"
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <span className="text-[10px] uppercase tracking-widest text-white/60">Agent Actions</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold" style={{ background: "rgba(34,197,94,0.15)", color: "#22C55E" }}>
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
            style={{ background: "#080810", border: "1px solid rgba(255,255,255,0.08)", borderTop: "none", borderRadius: "0 0 12px 12px" }}
            className="overflow-hidden"
          >
            <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
              {entries.map((entry) => {
                const modeBadge = entry.mode
                  ? MODE_BADGE[entry.mode]
                  : entry.source === "loop" ? MODE_BADGE.loop : undefined;
                return (
                  <div key={entry.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <StatusDot status={entry.status} />
                      <span className="text-[10px] text-white/80 font-bold uppercase tracking-wide flex-1">
                        {ACTION_LABELS[entry.actionType] ?? entry.actionType}
                      </span>
                      {modeBadge && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-sm font-bold" style={{ background: `${modeBadge.color}18`, color: modeBadge.color }}>
                          {modeBadge.label}
                        </span>
                      )}
                    </div>

                    {/* Topic (loop entries) */}
                    {entry.topic && (
                      <p className="text-[9px] text-white/40 leading-snug truncate">&ldquo;{entry.topic}&rdquo;</p>
                    )}

                    {/* 1Shot prefund tx */}
                    {entry.prefundTxHash && entry.prefundTxHash !== "0x" + "0".repeat(64) && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[8px] text-green-400/70 uppercase">1Shot Tx</span>
                        <a href={`https://sepolia.basescan.org/tx/${entry.prefundTxHash}`} target="_blank" rel="noreferrer"
                          className="text-[9px] text-clash-gold/70 hover:text-clash-gold transition-colors">
                          {entry.prefundTxHash.slice(0, 10)}…{entry.prefundTxHash.slice(-6)}
                        </a>
                      </div>
                    )}

                    {/* 1Shot task id (no tx yet) */}
                    {!entry.prefundTxHash && entry.oneShotTaskId && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[8px] text-green-400/70 uppercase">1Shot Task</span>
                        <span className="text-[9px] text-green-400/60">
                          {entry.oneShotTaskId.slice(0, 10)}…{entry.oneShotTaskId.slice(-6)}
                        </span>
                      </div>
                    )}

                    {/* Action tx */}
                    {entry.txHash && entry.txHash !== entry.prefundTxHash && entry.txHash !== "0x" + "0".repeat(64) && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[8px] text-white/30 uppercase">Tx</span>
                        <a href={`https://sepolia.basescan.org/tx/${entry.txHash}`} target="_blank" rel="noreferrer"
                          className="text-[9px] text-white/45 hover:text-white/75 transition-colors">
                          {entry.txHash.slice(0, 10)}…{entry.txHash.slice(-6)}
                        </a>
                      </div>
                    )}

                    {/* Failure reason */}
                    {entry.status === "failed" && entry.reason && (
                      <p className="text-[9px] text-red-400/70 leading-snug">{entry.reason}</p>
                    )}

                    <div className="flex items-center justify-between">
                      {entry.amountUsdc != null ? (
                        <span className="text-[8px] text-white/20">${entry.amountUsdc.toFixed(2)} USDC</span>
                      ) : <span />}
                      <span className="text-[8px] text-white/20">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hero footer for successful 1Shot actions */}
            {latest.mode === "autonomous_oneshot" && latest.status === "success" && (
              <div className="px-4 py-3 border-t border-white/5" style={{ background: "rgba(34,197,94,0.04)" }}>
                <p className="text-[9px] text-green-400/80 leading-relaxed">
                  ⚡ Agent action executed by 1Shot — no wallet popup required.
                </p>
                {latest.prefundTxHash && (
                  <p className="text-[8px] text-white/30 mt-1">1Shot Tx: {latest.prefundTxHash.slice(0, 18)}…</p>
                )}
              </div>
            )}

            {/* Hero footer for autonomous loop actions */}
            {latest.source === "loop" && latest.status === "success" && latest.mode !== "autonomous_oneshot" && (
              <div className="px-4 py-3 border-t border-white/5" style={{ background: "rgba(129,140,248,0.04)" }}>
                <p className="text-[9px] text-indigo-400/80 leading-relaxed">
                  🤖 Autonomous loop action — agent entered battle without user interaction.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
