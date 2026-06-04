"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { parseAbiItem } from "viem";
import { AgentCard } from "@/components/agent/AgentCard";
import { AgentWallet } from "@/components/agent/AgentWallet";
import { ConnectWallet } from "@/components/shared/ConnectWallet";
import { BattleCard } from "@/components/battle/BattleCard";
import { AgentOpenChallenges } from "@/components/challenges/AgentOpenChallenges";
import { permissionExpiryLabel, getPermissionContext, storePermissionContext } from "@/lib/permissions";
import { blockRanges, getEventScanStartBlock, mapWithConcurrency } from "@/lib/event-scan";
import type { AgentConfig, Battle, PersonalityType, FightingStyle } from "@/lib/types";

const PERSONA_COLOR: Record<string, string> = {
  Historian: "#C9A227",
  Analyst: "#FFB800",
  Roaster: "#BE1A1A",
  Contrarian: "#7C3AED",
  Professor: "#059669",
  "Hype Man": "#1A3FBE",
};

interface OnChainRecord {
  wins: number;
  losses: number;
  totalBattles: number;
  avgScore: number;
  earnings: number;
}

type BattleTuple = readonly [
  number,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  number,
  `0x${string}`,
  bigint,
  `0x${string}`,
  string,
  `0x${string}`,
  boolean
];

function loadLocalAgentConfig(address: string): Partial<AgentConfig> & {
  persona?: string;
  beliefs?: string[];
} {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`clashboard_agent_${address}`);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<AgentConfig> & {
      persona?: string;
      beliefs?: string[];
    };
  } catch {
    return {};
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function withRpcRetry<T>(task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    if (!message.includes("rate limit") && !message.includes("429")) {
      throw err;
    }
    await sleep(450);
    try {
      return await task();
    } catch {
      return fallback;
    }
  }
}

async function readAgentProfile(address: `0x${string}`): Promise<{
  agent: AgentConfig;
  record: OnChainRecord;
}> {
  const { getPublicClient, REGISTRY_ABI } = await import("@/lib/chain");
  const client = getPublicClient();
  const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT as `0x${string}`;

  const [agentOnChain, reputation] = (await client.readContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: "getAgent",
    args: [address],
  }) as unknown) as [
    { name: string; forgedAt: bigint; exists: boolean },
    { wins: bigint; losses: bigint; totalBattles: bigint; scoreSum: bigint; earningsTotal: bigint }
  ];

  if (!agentOnChain.exists) {
    throw new Error("Agent not found on-chain.");
  }

  const local = loadLocalAgentConfig(address);
  const personality = (local.personality ?? local.persona ?? "Analyst") as PersonalityType;
  const operatingBudgetUSDC = Number(local.operatingBudgetUSDC ?? local.researchBudget ?? 0);
  const totalBattles = Number(reputation.totalBattles);

  return {
    agent: {
      address,
      name: agentOnChain.name,
      personality,
      customInstructions: local.customInstructions,
      specialties: Array.isArray(local.specialties) ? local.specialties : [],
      fightingStyle: (local.fightingStyle ?? "Balanced") as FightingStyle,
      operatingBudgetUSDC,
      researchBudget: Number(local.researchBudget ?? operatingBudgetUSDC),
      color: local.color ?? PERSONA_COLOR[personality] ?? "#FFB800",
    },
    record: {
      wins: Number(reputation.wins),
      losses: Number(reputation.losses),
      totalBattles,
      avgScore: totalBattles > 0 ? Math.round(Number(reputation.scoreSum) / totalBattles) : 0,
      earnings: Number(reputation.earningsTotal) / 1_000_000,
    },
  };
}

async function readAgentDisplay(address: `0x${string}`, fallback: "A" | "B") {
  try {
    const { getPublicClient, REGISTRY_ABI } = await import("@/lib/chain");
    const client = getPublicClient();
    const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT as `0x${string}`;
    const [agentOnChain, reputation] = (await client.readContract({
      address: registryAddress,
      abi: REGISTRY_ABI,
      functionName: "getAgent",
      args: [address],
    }) as unknown) as [
      { name: string; exists: boolean },
      { wins: bigint; totalBattles: bigint }
    ];
    const local = loadLocalAgentConfig(address);
    const personality = (local.personality ?? local.persona ?? (fallback === "A" ? "Analyst" : "Historian")) as PersonalityType;
    const totalBattles = Number(reputation.totalBattles);
    const wins = Number(reputation.wins);
    return {
      address,
      name: agentOnChain.exists ? agentOnChain.name : `Agent ${fallback}`,
      personality,
      color: local.color ?? PERSONA_COLOR[personality] ?? (fallback === "A" ? "#FFB800" : "#1A3FBE"),
      winRate: totalBattles > 0 ? wins / totalBattles : 0,
      totalBattles,
    };
  } catch {
    return {
      address,
      name: `Agent ${fallback}`,
      personality: (fallback === "A" ? "Analyst" : "Historian") as PersonalityType,
      color: fallback === "A" ? "#FFB800" : "#1A3FBE",
      winRate: 0,
      totalBattles: 0,
    };
  }
}

async function fetchRecentBattles(address: `0x${string}`): Promise<Battle[]> {
  const { getPublicClient, ARENA_ABI } = await import("@/lib/chain");
  const client = getPublicClient();
  const arenaAddress = process.env.NEXT_PUBLIC_ARENA_CONTRACT as `0x${string}`;
  if (!arenaAddress) return [];

  const latestBlock = await client.getBlockNumber();
  const fromBlock = getEventScanStartBlock(latestBlock, 12000n);
  const event = parseAbiItem(
    "event BattleCreated(bytes32 indexed battleId, address agentA, address agentB, uint256 entryFee, uint256 bettingDeadline, bytes32 topicHash, string topic)"
  );

  const logsByRange = await mapWithConcurrency(
    blockRanges(fromBlock, latestBlock, 750n),
    1,
    (range) =>
      withRpcRetry(() => client.getLogs({
        address: arenaAddress,
        event,
        fromBlock: range.fromBlock,
        toBlock: range.toBlock,
      }), [])
  );

  const lower = address.toLowerCase();
  const logs = logsByRange
    .flat()
    .filter((log) => {
      const a = String(log.args.agentA ?? "").toLowerCase();
      const b = String(log.args.agentB ?? "").toLowerCase();
      return a === lower || b === lower;
    })
    .slice(-8)
    .reverse();

  return mapWithConcurrency(logs, 3, async (log) => {
    const battleId = log.args.battleId as `0x${string}`;
    const tuple = (await client.readContract({
      address: arenaAddress,
      abi: ARENA_ABI,
      functionName: "battles",
      args: [battleId],
    }) as unknown) as BattleTuple;

    const [agentA, agentB] = await Promise.all([
      readAgentDisplay(tuple[1], "A"),
      readAgentDisplay(tuple[2], "B"),
    ]);

    return {
      id: battleId,
      topic: tuple[15] || String(log.args.topic ?? `Battle ${battleId.slice(0, 10)}...`),
      agentA,
      agentB,
      state: Number(tuple[0]) === 1 ? "SETTLED" : Number(tuple[0]) === 0 ? "OPEN" : "SETTLED",
      poolA: tuple[5] + tuple[7],
      poolB: tuple[6] + tuple[8],
      bettingDeadline: tuple[9],
      roundDuration: Number(tuple[10]),
      totalRounds: Number(tuple[11]),
      rubricHash: tuple[12],
      winner: tuple[3],
      createdAt: Number(tuple[9] - 300n) * 1000,
    };
  });
}

function PermissionReloadPanel({ agentAddress }: { agentAddress: string }) {
  const [connectedAddress, setConnectedAddress] = useState<`0x${string}` | null>(null);
  const [budget, setBudget] = useState("40");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeBudget, setActiveBudget] = useState<number | null>(null);
  const [expiry, setExpiry] = useState<number | null>(null);

  const isOwner =
    connectedAddress?.toLowerCase() === agentAddress.toLowerCase();

  useEffect(() => {
    let mounted = true;
    import("@/lib/metamask").then(({ getSelectedWalletAddress }) => {
      if (!mounted) return;
      const address = getSelectedWalletAddress();
      setConnectedAddress(address);
      if (address) {
        const permission = getPermissionContext(address);
        setActiveBudget(permission?.totalBudgetUSDC ?? permission?.budgetUSDC ?? null);
        setExpiry(permission?.expiry ?? null);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!isOwner) return null;

  const renewPermission = async () => {
    if (!connectedAddress) return;
    setLoading(true);
    setMessage("Opening MetaMask permission request...");
    try {
      const amount = Number(budget);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a valid testnet USDC budget.");
      }

      const { grantPermissions } = await import("@/lib/metamask");
      const { registerResearchSessionForBackend } = await import("@/lib/research-session-client");
      const permission = await grantPermissions({
        account: connectedAddress,
        expiry: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        budgetUSDC: amount,
      });

      storePermissionContext(connectedAddress, permission);
      await registerResearchSessionForBackend(connectedAddress);

      setActiveBudget(permission.totalBudgetUSDC ?? permission.budgetUSDC);
      setExpiry(permission.expiry);
      setMessage("Operating budget reloaded. Arena and research rails are active.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Permission request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card border-clash-gold/25 bg-clash-gold/5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-clash-gold/70 mb-1">
            Agent Permission
          </p>
          <h3 className="font-display text-lg font-bold text-clash-white">
            Reload Operating Budget
          </h3>
          <p className="font-body text-xs text-white/40 mt-1">
            Renew this fighter's bounded testnet USDC permission when the previous budget is exhausted or near expiry.
          </p>
        </div>
        {expiry && (
          <div className="text-right flex-shrink-0">
            <div className="font-display text-lg font-extrabold text-clash-gold">
              ${activeBudget ?? "-"}
            </div>
            <div className="font-mono text-[8px] uppercase tracking-widest text-white/25">
              {permissionExpiryLabel(expiry)}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="block">
          <span className="font-mono text-[8px] uppercase tracking-widest text-white/25 block mb-1.5">
            New 24h Budget
          </span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="decimal"
            className="w-full bg-black/35 border border-white/10 px-3 py-3 font-display text-lg text-white outline-none focus:border-clash-gold/50"
          />
        </label>
        <button
          onClick={renewPermission}
          disabled={loading}
          className="self-end px-5 py-3 font-display text-xs font-extrabold uppercase tracking-widest disabled:opacity-50 hover:brightness-110"
          style={{ background: "#FFB800", color: "#0A0A0F" }}
        >
          {loading ? "Requesting..." : "Authorize"}
        </button>
      </div>

      {message && (
        <p className="font-mono text-[9px] text-white/35 mt-3 uppercase tracking-widest">
          {message}
        </p>
      )}
    </div>
  );
}

export default function AgentProfilePage() {
  const { address } = useParams<{ address: string }>();
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [onChainRecord, setOnChainRecord] = useState<OnChainRecord | null>(null);
  const [recentBattles, setRecentBattles] = useState<Battle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      setError("Invalid agent address.");
      setLoading(false);
      return;
    }

    const agentAddress = address as `0x${string}`;
    Promise.all([
      readAgentProfile(agentAddress),
      fetchRecentBattles(agentAddress).catch(() => [] as Battle[]),
    ])
      .then(([profile, battles]) => {
        if (!alive) return;
        setAgent(profile.agent);
        setOnChainRecord(profile.record);
        setRecentBattles(battles);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Unable to load agent profile.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [address]);

  const winRate =
    onChainRecord && onChainRecord.totalBattles > 0
      ? onChainRecord.wins / onChainRecord.totalBattles
      : 0;

  return (
    <main className="min-h-screen arena-bg">
      <header className="sticky top-0 z-40 border-b border-white/6 bg-clash-black/80 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Clashboard" className="h-6 w-auto flex-shrink-0" />
            <span className="text-clash-gold">CLASH</span>
            <span className="text-white/40">BOARD</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6">
            {([
              { href: "/game-lobby", label: "Lobby" },
              { href: "/dashboard", label: "My Agent", active: true },
              { href: "/agents", label: "Agents" },
              { href: "/lobby", label: "Challenges" },
            ] as { href: string; label: string; active?: boolean }[]).map(l => (
              <Link
                key={l.label}
                href={l.href}
                className="font-mono text-[10px] uppercase tracking-widest transition-colors"
                style={{ color: l.active ? "#FFB800" : "rgba(255,255,255,0.3)" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <ConnectWallet />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        {loading && (
          <div className="flex justify-center py-24">
            <div className="w-7 h-7 border-2 border-clash-gold/20 border-t-clash-gold rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="card text-center py-12">
            <p className="font-display text-2xl font-extrabold text-clash-red uppercase">
              Agent unavailable
            </p>
            <p className="font-body text-sm text-white/40 mt-2">{error}</p>
            <Link
              href="/agents"
              className="inline-flex mt-6 px-5 py-3 font-display text-xs font-extrabold uppercase tracking-widest border border-clash-gold/40 text-clash-gold"
            >
              View Agent Market
            </Link>
          </div>
        )}

        {!loading && agent && onChainRecord && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8"
        >
          {/* Left: Agent Info */}
          <div className="space-y-6">
            <AgentCard
              agent={{
                address: agent.address,
                name: agent.name,
                personality: agent.personality,
                color: agent.color,
                winRate,
                totalBattles: onChainRecord.totalBattles,
              }}
              showFull
            />

            <AgentOpenChallenges ownerAddress={address} />

            <PermissionReloadPanel agentAddress={address} />

            {/* Stats */}
            <div className="card">
              <h3 className="font-display text-lg font-bold text-clash-white mb-4">
                Battle Record
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
                {[
                  { label: "Wins", value: onChainRecord.wins, color: "text-green-400" },
                  { label: "Losses", value: onChainRecord.losses, color: "text-clash-red" },
                  { label: "Battles", value: onChainRecord.totalBattles, color: "text-clash-white" },
                  { label: "Avg Score", value: onChainRecord.avgScore, color: "text-clash-gold" },
                  { label: "Earned", value: `$${onChainRecord.earnings.toFixed(2)}`, color: "text-green-400" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className={`font-display text-2xl sm:text-3xl font-bold ${stat.color}`}>
                      {stat.value}
                    </div>
                    <div className="font-body text-xs text-white/40 mt-1">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Specialties */}
            <div className="card">
              <h3 className="font-display text-lg font-bold text-clash-white mb-3">
                Specialties
              </h3>
              {agent.specialties.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {agent.specialties.map((s) => (
                  <span key={s} className="badge-gold">
                    {s}
                  </span>
                  ))}
                </div>
              ) : (
                <p className="font-body text-sm text-white/35">
                  No local specialties saved for this agent yet.
                </p>
              )}
            </div>

            {/* Recent Battles */}
            <div>
              <h3 className="font-display text-lg font-bold text-clash-white mb-4">
                Recent Battles
              </h3>
              {recentBattles.length === 0 ? (
                <div className="card text-center py-8">
                  <p className="font-body text-white/40">No battles yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentBattles.map((b) => (
                    <BattleCard key={b.id} battle={b} compact />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Wallet */}
          <div>
            <AgentWallet agentAddress={address} />
          </div>
        </motion.div>
        )}
      </div>
    </main>
  );
}
