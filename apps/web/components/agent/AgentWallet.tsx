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
}

export function AgentWallet({ agentAddress }: AgentWalletProps) {
  const [wallet, setWallet] = useState<WalletState>({
    balance: "0.00",
    lifetimeEarnings: "0.00",
  });
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentAddress) return;

    const load = async () => {
      setLoading(true);
      try {
        const { getPublicClient, TREASURY_ABI, getTreasuryAddress } =
          await import("@/lib/chain");
        const client = getPublicClient();
        const treasuryAddress = getTreasuryAddress();

        const balanceWei = (await client.readContract({
          address: treasuryAddress,
          abi: TREASURY_ABI,
          functionName: "getBalance",
          args: [agentAddress as `0x${string}`],
        })) as bigint;

        setWallet({
          balance: (Number(balanceWei) / 1e6).toFixed(2),
          lifetimeEarnings: (Number(balanceWei) / 1e6).toFixed(2),
        });
      } catch (err) {
        console.error("AgentWallet load error:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [agentAddress]);

  const handleWithdraw = async () => {
    setIsWithdrawing(true);
    try {
      const { getProvider } = await import("@/lib/metamask");
      const provider = getProvider();
      if (!provider) throw new Error("Connect your wallet first");

      const accounts = (await provider.request({
        method: "eth_accounts",
      })) as string[];
      const account = accounts[0] as `0x${string}`;

      const { TREASURY_ABI, getTreasuryAddress } = await import("@/lib/chain");
      const { writeUserContract, waitForTx } = await import(
        "@/lib/wallet-contract"
      );

      const balanceWei = BigInt(Math.round(parseFloat(wallet.balance) * 1_000_000));
      const txHash = await writeUserContract({
        address: getTreasuryAddress(),
        abi: TREASURY_ABI,
        functionName: "withdraw",
        args: [balanceWei],
        account,
      });

      await waitForTx(txHash);
      setLastTx(txHash);
      setWallet((prev) => ({ ...prev, balance: "0.00" }));
    } catch (err) {
      console.error("Withdraw failed:", err);
      alert(err instanceof Error ? err.message : "Withdraw failed");
    } finally {
      setIsWithdrawing(false);
    }
  };

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
          {loading ? (
            <div className="w-5 h-5 mx-auto border-2 border-clash-gold/30 border-t-clash-gold rounded-full animate-spin" />
          ) : (
            <div className="font-display text-4xl font-bold text-clash-gold">
              ${wallet.balance}
            </div>
          )}
          <div className="font-body text-xs text-white/30 mt-1">USDC</div>
        </div>

        <button
          onClick={handleWithdraw}
          disabled={isWithdrawing || loading || parseFloat(wallet.balance) === 0}
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
            Treasury Balance
          </span>
          <span className="font-display text-lg font-bold text-green-400">
            ${wallet.lifetimeEarnings}
          </span>
        </div>
      </div>

      {/* Network */}
      <div className="card">
        <div className="flex items-center justify-between">
          <span className="font-body text-xs text-white/40 uppercase tracking-widest">
            Network
          </span>
          <span className="font-mono text-xs text-white/50">
            Base Sepolia · USDC
          </span>
        </div>
      </div>
    </div>
  );
}
