"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Room } from "@/lib/challenges";
import { fetchRooms } from "@/lib/challenges";
import { HOTTAKEROOMS_CONTRACT } from "@/lib/contracts";

function sameAddress(a?: string | null, b?: string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function CancelChallengeButton({
  roomId,
  stake,
  onSuccess,
}: {
  roomId: string;
  stake: number;
  onSuccess: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelling(true);
    setError(null);
    try {
      const { getProvider } = await import("@/lib/metamask");
      const provider = getProvider();
      if (!provider) throw new Error("Wallet not connected");
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      if (!accounts[0]) throw new Error("No wallet connected");

      const { HOTTAKEROOMS_ABI: abi } = await import("@/lib/chain");
      const { writeUserContract, waitForTx } = await import("@/lib/wallet-contract");

      const txHash = await writeUserContract({
        address: HOTTAKEROOMS_CONTRACT,
        abi,
        functionName: "cancelChallenge",
        args: [roomId as `0x${string}`],
        account: accounts[0] as `0x${string}`,
      });
      await waitForTx(txHash);
      onSuccess();
    } catch (err) {
      let msg = "Cancel failed";
      if (err instanceof Error) {
        msg = err.message;
      } else if (typeof err === "object" && err !== null) {
        const e = err as Record<string, unknown>;
        msg = String(e.message ?? e.reason ?? e.shortMessage ?? JSON.stringify(err));
      }
      setError(msg);
      setCancelling(false);
    }
  };

  return (
    <div className="flex-shrink-0 flex flex-col items-end gap-1">
      <button
        onClick={handleCancel}
        disabled={cancelling}
        className="font-mono text-[9px] uppercase tracking-widest px-3 py-2 border transition-colors disabled:opacity-40"
        style={{ borderColor: "rgba(239,68,68,0.3)", color: "rgba(239,68,68,0.7)" }}
      >
        {cancelling ? (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 border border-red-400/40 border-t-red-400 rounded-full animate-spin" />
            Cancelling...
          </span>
        ) : (
          `Cancel +$${stake} back`
        )}
      </button>
      {error && (
        <span className="font-mono text-[8px] text-red-400 max-w-[180px] text-right">
          {error}
        </span>
      )}
    </div>
  );
}

export function AgentOpenChallenges({ ownerAddress }: { ownerAddress: string }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    fetchRooms()
      .then((fresh) => {
        if (alive) setRooms(fresh);
      })
      .catch(() => {
        if (alive) setRooms([]);
      });

    import("@/lib/metamask")
      .then(({ getProvider }) => {
        const provider = getProvider();
        if (!provider) return null;
        return provider.request({ method: "eth_accounts" }) as Promise<string[]>;
      })
      .then((accounts) => {
        if (alive && accounts?.[0]) setConnectedAddress(accounts[0]);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  const mine = useMemo(
    () =>
      rooms.filter(
        (r) =>
          r.state === "WAITING" &&
          sameAddress(r.creatorAddress, ownerAddress)
      ),
    [ownerAddress, rooms]
  );
  const canCancel = sameAddress(connectedAddress, ownerAddress);

  if (mine.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-clash-gold/20 overflow-hidden"
      style={{ background: "rgba(255,184,0,0.03)" }}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-clash-gold/10">
        <div className="flex items-center gap-2">
          <motion.span
            className="w-1.5 h-1.5 rounded-full bg-clash-gold"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          <span className="font-mono text-[9px] uppercase tracking-widest text-clash-gold/70">
            Open Challenges
          </span>
        </div>
        <span className="font-mono text-[9px] text-white/25">{mine.length} active</span>
      </div>

      <div className="divide-y divide-white/5">
        {mine.map((r) => (
          <div key={r.id} className="flex items-center gap-4 px-5 py-3">
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-bold text-white/80 uppercase truncate leading-tight">
                {r.topic}
              </p>
              <p className="font-mono text-[9px] text-white/30 mt-0.5">
                ${r.stake} staked - waiting for opponent
              </p>
            </div>
            {canCancel ? (
              <CancelChallengeButton
                roomId={r.id}
                stake={r.stake}
                onSuccess={() => setRooms((prev) => prev.filter((room) => room.id !== r.id))}
              />
            ) : (
              <span className="font-mono text-[9px] uppercase tracking-widest text-clash-gold/45 border border-clash-gold/15 px-3 py-2">
                Waiting
              </span>
            )}
          </div>
        ))}
      </div>

      {canCancel && (
        <div className="px-5 py-2.5 border-t border-clash-gold/10">
          <p className="font-mono text-[8px] text-white/20 uppercase tracking-widest">
            Cancel before someone accepts to get your testnet USDC back
          </p>
        </div>
      )}
    </motion.div>
  );
}
