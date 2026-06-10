"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import type { Battle, BattlePhase } from "@/lib/types";
import { getConnectedWalletAccount, placeUserArenaStake } from "@/lib/wallet-contract";
import { executePlaceBet } from "@/lib/autonomy/executor";

interface BettingPanelProps {
  battle: Battle;
  phase: BattlePhase;
  onBetPlaced: (side: 1 | 2, amount: number) => void;
}

const STAKE_OPTIONS = [0.25, 0.5, 1, 2];

/**
 * Spectator prediction panel — pick side, stake selector, odds display, potential win.
 */
export function BettingPanel({ battle, phase, onBetPlaced }: BettingPanelProps) {
  const [selectedSide, setSelectedSide] = useState<1 | 2 | null>(null);
  const [selectedStake, setSelectedStake] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [betPlaced, setBetPlaced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPool = Number(battle.poolA + battle.poolB) / 1_000_000;
  const poolA = Number(battle.poolA) / 1_000_000;
  const poolB = Number(battle.poolB) / 1_000_000;

  const oddsA = totalPool > 0 ? poolA / totalPool : 0.5;
  const oddsB = totalPool > 0 ? poolB / totalPool : 0.5;

  // Potential payout calculation (parimutuel)
  const selectedSidePool = selectedSide === 1 ? poolA : selectedSide === 2 ? poolB : 0;
  const projectedSidePool = selectedSidePool + selectedStake;
  const projectedTotalPool = totalPool + selectedStake;
  const potentialWin =
    selectedSide && projectedSidePool > 0
      ? (selectedStake / projectedSidePool) * projectedTotalPool * 0.95
      : selectedStake * 2;

  const isBettingOpen = phase === "BETTING";

  const handlePlaceBet = async () => {
    if (!selectedSide) return;
    setIsSubmitting(true);
    setError(null);

    try {
      if (!battle.id.startsWith("0x")) {
        throw new Error("This demo battle does not accept on-chain stakes");
      }

      const account = await getConnectedWalletAccount();
      const execution = await executePlaceBet({
        agentOwner: account,
        battleId: battle.id as `0x${string}`,
        side: selectedSide,
        amountUsdc: selectedStake,
        isAgentTriggered: false,
      });

      if (execution.policyError) throw new Error(execution.policyError);

      if (execution.mode !== "autonomous_oneshot") {
        await placeUserArenaStake({
          account,
          battleId: battle.id as `0x${string}`,
          side: selectedSide,
          amountUSDC: selectedStake,
        });
      }

      setBetPlaced(true);
      onBetPlaced(selectedSide, selectedStake);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stake failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card space-y-4 sticky top-4">
      <h3 className="font-display text-lg font-bold text-clash-white">
        Spectator Predictions
      </h3>

      {/* Phase gate */}
      {!isBettingOpen && (
        <div className="bg-clash-black/50 rounded-xl p-4 text-center">
          <p className="font-body text-sm text-white/40">
            {phase === "RESEARCH" && "Agents are researching..."}
            {phase === "LIVE" && "Battle in progress — predictions closed"}
            {phase === "VERDICT" && "Awaiting verdict..."}
            {phase === "SETTLED" && "Battle settled"}
          </p>
        </div>
      )}

      {isBettingOpen && !betPlaced && (
        <>
          {/* Pick Side */}
          <div>
            <label className="font-body text-xs text-white/40 uppercase tracking-wider mb-2 block">
              Predict the winner
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* Agent A */}
              <button
                onClick={() => setSelectedSide(1)}
                className={clsx(
                  "p-3 rounded-xl border-2 text-left transition-all",
                  selectedSide === 1
                    ? "border-clash-gold bg-clash-gold/10"
                    : "border-white/10 hover:border-white/30"
                )}
              >
                <div
                  className="font-display text-sm font-bold"
                  style={{ color: battle.agentA.color }}
                >
                  {battle.agentA.name}
                </div>
                <div className="font-body text-xs text-white/40 mt-0.5">
                  {(oddsA * 100).toFixed(0)}% predicting
                </div>
              </button>

              {/* Agent B */}
              <button
                onClick={() => setSelectedSide(2)}
                className={clsx(
                  "p-3 rounded-xl border-2 text-left transition-all",
                  selectedSide === 2
                    ? "border-clash-blue bg-clash-blue/10"
                    : "border-white/10 hover:border-white/30"
                )}
              >
                <div
                  className="font-display text-sm font-bold"
                  style={{ color: battle.agentB.color }}
                >
                  {battle.agentB.name}
                </div>
                <div className="font-body text-xs text-white/40 mt-0.5">
                  {(oddsB * 100).toFixed(0)}% predicting
                </div>
              </button>
            </div>
          </div>

          {/* Stake Selector */}
          <div>
            <label className="font-body text-xs text-white/40 uppercase tracking-wider mb-2 block">
              Stake
            </label>
            <div className="grid grid-cols-4 gap-2">
              {STAKE_OPTIONS.map((stake) => (
                <button
                  key={stake}
                  onClick={() => setSelectedStake(stake)}
                  className={clsx(
                    "py-2 rounded-lg border font-display text-sm font-bold transition-all",
                    selectedStake === stake
                      ? "border-clash-gold bg-clash-gold/10 text-clash-gold"
                      : "border-white/10 text-white/60 hover:border-white/30"
                  )}
                >
                  ${stake}
                </button>
              ))}
            </div>
          </div>

          {/* Potential Win */}
          <AnimatePresence>
            {selectedSide && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-clash-black/50 rounded-xl p-3"
              >
                <div className="flex justify-between items-center">
                  <span className="font-body text-sm text-white/50">
                    Potential win
                  </span>
                  <span className="font-display text-lg font-bold text-clash-gold">
                    ${potentialWin.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="font-body text-xs text-white/30">
                    Your stake
                  </span>
                  <span className="font-body text-xs text-white/50">
                    ${selectedStake.toFixed(2)} USDC
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          {error && (
            <div className="bg-clash-red/10 border border-clash-red/30 rounded-lg px-3 py-2">
              <p className="font-body text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={handlePlaceBet}
            disabled={!selectedSide || isSubmitting}
            className="btn-primary w-full"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-clash-black/30 border-t-clash-black rounded-full animate-spin" />
                Locking prediction...
              </span>
            ) : (
              `Lock Prediction${selectedSide ? ` - $${selectedStake}` : ""}`
            )}
          </button>
        </>
      )}

      {/* Bet Placed Confirmation */}
      {betPlaced && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-4"
        >
          <div className="text-4xl mb-2">🎯</div>
          <div className="font-display text-lg font-bold text-clash-gold">
            Prediction Locked
          </div>
          <div className="font-body text-sm text-white/50 mt-1">
            ${selectedStake} on{" "}
            {selectedSide === 1 ? battle.agentA.name : battle.agentB.name}
          </div>
          <div className="font-body text-xs text-white/30 mt-2">
            Potential win: ${potentialWin.toFixed(2)}
          </div>
        </motion.div>
      )}

      {/* Pool Stats */}
      <div className="pt-3 border-t border-white/5 space-y-2">
        <div className="flex justify-between">
          <span className="font-body text-xs text-white/40">Total pool</span>
          <span className="font-display text-sm font-bold text-clash-gold">
            ${totalPool.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="font-body text-xs text-white/40">Predictors</span>
          <span className="font-body text-xs text-white/60">
            {battle.bettorCount ?? 0}
          </span>
        </div>
      </div>
    </div>
  );
}
