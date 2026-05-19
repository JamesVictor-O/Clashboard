"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TxLink } from "@/components/shared/TxLink";

interface AgentWalletProps {
  agentAddress: string;
}

interface WalletState {
  balance: string;
  lifetimeEarnings: string;
  permissionLimit: string;
  permissionUsed: string;
  permissionExpiry: number | null;
}

/**
 * Smart account balance, lifetime earnings, permission limits display, withdraw button.
 */
export function AgentWallet({ agentAddress }: AgentWalletProps) {
  const [wallet, setWallet] = useState<WalletState>({
    balance: "0.00",
    lifetimeEarnings: "0.00",
    permissionLimit: "0.00",
    permissionUsed: "0.00",
    permissionExpiry: null,
  });
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);

  useEffect(() => {
    // In production: fetch from chain + API
    // Mock data for scaffold
    setWallet({
      balance: "12.50",
      lifetimeEarnings: "47.25",
      permissionLimit: "10.00",
      permissionUsed: "3.75",
      permissionExpiry: Date.now() + 18 * 60 * 60 * 1000, // 18h from now
    });
  }, [agentAddress]);

  const handleWithdraw = async () => {
    setIsWithdrawing(true);
    try {
      // In production: call withdraw API / contract
      await new Promise((r) => setTimeout(r, 1500));
      setLastTx(`0x${Math.random().toString(16).slice(2).padEnd(64, "0")}`);
      setWallet((prev) => ({ ...prev, balance: "0.00" }));
    } finally {
      setIsWithdrawing(false);
    }
  };

  const permissionPct =
    parseFloat(wallet.permissionLimit) > 0
      ? (parseFloat(wallet.permissionUsed) / parseFloat(wallet.permissionLimit)) * 100
      : 0;

  const expiryText = wallet.permissionExpiry
    ? (() => {
        const remaining = wallet.permissionExpiry - Date.now();
        const hours = Math.floor(remaining / 3600000);
        const mins = Math.floor((remaining % 3600000) / 60000);
        return `${hours}h ${mins}m remaining`;
      })()
    : "No active permission";

  return (
    <div className="space-y-4">
      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card border-clash-gold/20"
      >
        <div className="text-center py-2">
          <div className="font-display text-xs text-white/40 uppercase tracking-widest mb-1">
            Agent Balance
          </div>
          <div className="font-display text-4xl font-bold text-clash-gold">
            ${wallet.balance}
          </div>
          <div className="font-body text-xs text-white/30 mt-1">USDC</div>
        </div>

        <button
          onClick={handleWithdraw}
          disabled={isWithdrawing || parseFloat(wallet.balance) === 0}
          className="btn-secondary w-full mt-4"
        >
          {isWithdrawing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-clash-gold/30 border-t-clash-gold rounded-full animate-spin" />
              Withdrawing...
            </span>
          ) : (
            "Withdraw to Wallet"
          )}
        </button>

        {lastTx && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="font-body text-xs text-white/40">Tx:</span>
            <TxLink hash={lastTx} short />
          </div>
        )}
      </motion.div>

      {/* Lifetime Earnings */}
      <div className="card">
        <div className="flex items-center justify-between">
          <span className="font-body text-sm text-white/50">
            Lifetime Earnings
          </span>
          <span className="font-display text-lg font-bold text-green-400">
            ${wallet.lifetimeEarnings}
          </span>
        </div>
      </div>

      {/* Permission Limits */}
      <div className="card">
        <h4 className="font-display text-sm font-bold text-clash-white mb-3">
          Arena Budget
        </h4>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="font-body text-xs text-white/50">Used</span>
              <span className="font-body text-xs text-white/70">
                ${wallet.permissionUsed} / ${wallet.permissionLimit}
              </span>
            </div>
            <div className="h-2 bg-clash-black rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${permissionPct}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full rounded-full bg-clash-gold"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-body text-xs text-white/40">Expires</span>
            <span className="font-body text-xs text-white/60">{expiryText}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
