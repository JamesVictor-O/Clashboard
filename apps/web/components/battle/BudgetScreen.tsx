"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { grantPermissions } from "@/lib/metamask";
import { storePermissionContext } from "@/lib/permissions";

interface BudgetScreenProps {
  onConfirm: (budget: number) => void;
  onCancel: () => void;
}

/**
 * ERC-7715 permission screen — framed as "Set your arena budget".
 * Plain English copy, slider $1–$20, single CTA.
 * Calls wallet_grantPermissions under the hood.
 */
export function BudgetScreen({ onConfirm, onCancel }: BudgetScreenProps) {
  const [budget, setBudget] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const eth = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<unknown> } }).ethereum;
      if (!eth) throw new Error("Wallet not connected");
      const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
      if (!accounts[0]) throw new Error("No wallet connected");
      const account = accounts[0];

      const expiry = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

      const result = await grantPermissions({
        account,
        expiry,
        budgetUSDC: budget,
      });

      // Persist the context so autonomous txs can use it without pop-ups
      storePermissionContext(account, result);

      onConfirm(budget);
    } catch (err) {
      const msg = err instanceof Error ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "Permission request failed";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const budgetLabels: Record<number, string> = {
    1: "Casual",
    5: "Competitive",
    10: "Serious",
    20: "High Roller",
  };

  const closestLabel =
    budgetLabels[budget] ??
    (budget <= 3 ? "Casual" : budget <= 8 ? "Competitive" : budget <= 15 ? "Serious" : "High Roller");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 16 }}
      className="bg-clash-dim border border-white/10 rounded-2xl p-8 max-w-md w-full"
    >
      {/* Header */}
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">🏟️</div>
        <h2 className="font-display text-2xl font-bold text-clash-white">
          Set Your Arena Budget
        </h2>
        <p className="font-body text-white/50 text-sm mt-2">
          This is the max you can spend across all battles today. You approve
          it once — no pop-ups every time you bet.
        </p>
      </div>

      {/* Budget Display */}
      <div className="text-center mb-6">
        <div className="font-display text-6xl font-bold text-clash-gold">
          ${budget}
        </div>
        <div className="font-body text-sm text-white/40 mt-1">
          {closestLabel} · resets in 24 hours
        </div>
      </div>

      {/* Slider */}
      <div className="mb-6">
        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={budget}
          onChange={(e) => setBudget(parseInt(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #FFB800 0%, #FFB800 ${((budget - 1) / 19) * 100}%, #1A1A28 ${((budget - 1) / 19) * 100}%, #1A1A28 100%)`,
          }}
        />
        <div className="flex justify-between mt-2">
          <span className="font-body text-xs text-white/30">$1</span>
          <span className="font-body text-xs text-white/30">$20</span>
        </div>
      </div>

      {/* What this means */}
      <div className="bg-clash-black/50 rounded-xl p-4 mb-6 space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-clash-gold mt-0.5">✓</span>
          <span className="font-body text-sm text-white/60">
            Bet on battles without approving each transaction
          </span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-clash-gold mt-0.5">✓</span>
          <span className="font-body text-sm text-white/60">
            You can never spend more than ${budget} total
          </span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-clash-gold mt-0.5">✓</span>
          <span className="font-body text-sm text-white/60">
            Permission expires automatically in 24 hours
          </span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-white/30 mt-0.5">✗</span>
          <span className="font-body text-sm text-white/40">
            We can never move funds outside of bets
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-clash-red/10 border border-clash-red/30 rounded-lg px-4 py-2 mb-4">
          <p className="font-body text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* CTAs */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="btn-ghost flex-1"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={isLoading}
          className="btn-primary flex-[2]"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-clash-black/30 border-t-clash-black rounded-full animate-spin" />
              Approving...
            </span>
          ) : (
            `Approve $${budget} Budget`
          )}
        </button>
      </div>
    </motion.div>
  );
}
