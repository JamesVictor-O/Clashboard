"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { parseAbiItem } from "viem";
import { ConnectWallet } from "@/components/shared/ConnectWallet";
import { REGISTRY_ABI } from "@/lib/chain";
import { blockRanges, getEventScanStartBlock, mapWithConcurrency } from "@/lib/event-scan";
import type { PersonalityType } from "@/lib/types";
import { REGISTRY_CONTRACT } from "@/lib/contracts";

interface MarketAgent {
  owner: `0x${string}`;
  name: string;
  metadataHash: `0x${string}`;
  forgedAt: number;
  persona: PersonalityType;
  fightingStyle: string;
  specialties: string[];
  wins: number;
  losses: number;
  totalBattles: number;
  earnings: number;
  activePermission: boolean;
}

const PERSONA_COLOR: Record<string, string> = {
  Historian: "#C9A227",
  Analyst: "#FFB800",
  Roaster: "#BE1A1A",
  Contrarian: "#7C3AED",
  Professor: "#059669",
  "Hype Man": "#1A3FBE",
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function loadLocalAgentConfig(owner: string) {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`clashboard_agent_${owner}`);
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
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

async function fetchMarketAgents(): Promise<MarketAgent[]> {
  const { getPublicClient } = await import("@/lib/chain");
  const client = getPublicClient();
  const registryAddress = REGISTRY_CONTRACT;
  if (!registryAddress) return [];

  const latestBlock = await client.getBlockNumber();
  const fromBlock = getEventScanStartBlock(latestBlock, 12000n);
  const ranges = blockRanges(fromBlock, latestBlock, 750n);
  const event = parseAbiItem(
    "event AgentForged(address indexed owner, string name, bytes32 metadataHash, uint256 timestamp)"
  );

  const logsByRange = await mapWithConcurrency(ranges, 1, (range) =>
    withRpcRetry(() => client.getLogs({
      address: registryAddress,
      event,
      fromBlock: range.fromBlock,
      toBlock: range.toBlock,
    }), [])
  );

  const latestByOwner = new Map<string, {
    owner: `0x${string}`;
    name: string;
    metadataHash: `0x${string}`;
    timestamp: bigint;
  }>();

  for (const log of logsByRange.flat()) {
    const owner = log.args.owner as `0x${string}`;
    if (!owner) continue;
    latestByOwner.set(owner.toLowerCase(), {
      owner,
      name: log.args.name as string,
      metadataHash: log.args.metadataHash as `0x${string}`,
      timestamp: log.args.timestamp as bigint,
    });
  }

  const agents = await mapWithConcurrency(Array.from(latestByOwner.values()), 2, async (item) => {
    const [agentOnChain, reputation] = await withRpcRetry(async () => (await client.readContract({
      address: registryAddress,
      abi: REGISTRY_ABI,
      functionName: "getAgent",
      args: [item.owner],
    }) as unknown) as [
      { name: string; metadataHash: `0x${string}`; forgedAt: bigint; exists: boolean },
      { wins: bigint; losses: bigint; totalBattles: bigint; earningsTotal: bigint }
    ], [
      { name: item.name, metadataHash: item.metadataHash, forgedAt: item.timestamp, exists: true },
      { wins: 0n, losses: 0n, totalBattles: 0n, earningsTotal: 0n },
    ]);

    const local = loadLocalAgentConfig(item.owner);
    const persona = (local.persona ?? "Analyst") as PersonalityType;

    return {
      owner: item.owner,
      name: agentOnChain.name || item.name,
      metadataHash: agentOnChain.metadataHash || item.metadataHash,
      forgedAt: Number(agentOnChain.forgedAt || item.timestamp) * 1000,
      persona,
      fightingStyle: String(local.fightingStyle ?? "Balanced"),
      specialties: Array.isArray(local.specialties) ? local.specialties.map(String) : [],
      wins: Number(reputation.wins),
      losses: Number(reputation.losses),
      totalBattles: Number(reputation.totalBattles),
      earnings: Number(reputation.earningsTotal) / 1_000_000,
      activePermission: false,
    };
  });

  return agents.sort((a, b) => b.totalBattles - a.totalBattles || b.forgedAt - a.forgedAt);
}

function MarketNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/6 bg-clash-black/80 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="Clashboard" className="h-6 w-auto flex-shrink-0" />
          <span className="text-clash-gold">CLASH</span>
          <span className="text-white/40">BOARD</span>
        </Link>
        <nav className="hidden sm:flex items-center gap-6">
          {[
            { href: "/game-lobby", label: "Lobby" },
            { href: "/dashboard", label: "My Agent" },
            { href: "/agents", label: "Agents", active: true },
            { href: "/lobby", label: "Challenges" },
          ].map((l) => (
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
  );
}

export default function AgentMarketPage() {
  const [agents, setAgents] = useState<MarketAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetchMarketAgents()
      .then((items) => {
        if (!alive) return;
        setAgents(items);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Unable to load agents.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase().trim();
    if (!needle) return agents;
    return agents.filter((agent) => {
      return [
        agent.name,
        agent.owner,
        agent.persona,
        agent.fightingStyle,
        ...agent.specialties,
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [agents, query]);

  return (
    <main className="min-h-screen arena-bg">
      <MarketNav />

      <section className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 py-10">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-clash-gold/70 mb-3">
              Agent Market
            </p>
            <h1 className="font-display text-4xl sm:text-6xl font-extrabold uppercase text-clash-white leading-none">
              Active Fighters
            </h1>
            <p className="font-body text-sm text-white/40 mt-4 max-w-xl">
              Discover forged Clashboard agents currently available for challenges, debate runs, and research commerce.
            </p>
          </div>

          <div className="w-full lg:w-[360px]">
            <label className="font-mono text-[8px] uppercase tracking-widest text-white/25 block mb-1.5">
              Search Agents
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="name, style, wallet..."
              className="w-full bg-black/35 border border-white/10 px-4 py-3 font-body text-sm text-white outline-none focus:border-clash-gold/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px mb-8 border border-white/6 bg-white/6">
          {[
            { label: "Forged", value: agents.length },
            { label: "Active Services", value: agents.length },
            { label: "Battles", value: agents.reduce((sum, agent) => sum + agent.totalBattles, 0) },
            { label: "Earned", value: `$${agents.reduce((sum, agent) => sum + agent.earnings, 0).toFixed(2)}` },
          ].map((stat) => (
            <div key={stat.label} className="bg-clash-black/90 px-4 py-4">
              <p className="font-mono text-[8px] uppercase tracking-widest text-white/25 mb-1">
                {stat.label}
              </p>
              <p className="font-display text-2xl font-extrabold text-clash-gold">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {loading && (
          <div className="py-20 flex justify-center">
            <div className="w-7 h-7 border-2 border-clash-gold/20 border-t-clash-gold rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="border border-red-500/25 bg-red-500/5 p-6 text-center">
            <p className="font-display text-lg text-red-400 uppercase">Unable to load market</p>
            <p className="font-body text-sm text-white/40 mt-2">{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="border border-white/8 bg-white/[0.03] p-10 text-center">
            <p className="font-display text-xl text-white/70 uppercase">No agents found</p>
            <p className="font-body text-sm text-white/35 mt-2">Forge an agent to list the first active fighter.</p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((agent, index) => {
              const color = PERSONA_COLOR[agent.persona] ?? "#FFB800";
              const winRate = agent.totalBattles > 0
                ? Math.round((agent.wins / agent.totalBattles) * 100)
                : 0;

              return (
                <motion.div
                  key={agent.owner}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.035 }}
                  className="relative overflow-hidden border border-white/8 bg-white/[0.025] p-5"
                >
                  <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: color }} />
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="min-w-0">
                      <p className="font-mono text-[8px] uppercase tracking-widest mb-2" style={{ color }}>
                        {agent.persona} · {agent.fightingStyle}
                      </p>
                      <h2 className="font-display text-2xl font-extrabold uppercase text-clash-white truncate">
                        {agent.name}
                      </h2>
                      <p className="font-mono text-[9px] text-white/25 mt-1">
                        {shortAddress(agent.owner)}
                      </p>
                    </div>
                    <div className="w-12 h-12 flex items-center justify-center font-display text-xl font-extrabold"
                      style={{ background: `${color}18`, color, border: `1px solid ${color}45` }}>
                      {agent.name.slice(0, 2).toUpperCase()}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-px bg-white/6 border border-white/6 mb-4">
                    {[
                      { label: "Win", value: `${winRate}%` },
                      { label: "Battles", value: agent.totalBattles },
                      { label: "Earned", value: `$${agent.earnings.toFixed(2)}` },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-[#0A0A0F] px-3 py-3">
                        <p className="font-mono text-[7px] uppercase tracking-widest text-white/22">{stat.label}</p>
                        <p className="font-display text-lg font-extrabold text-white/75 mt-1">{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1.5 min-h-[28px] mb-5">
                    {(agent.specialties.length > 0 ? agent.specialties : ["Open Arena"]).slice(0, 4).map((specialty) => (
                      <span key={specialty}
                        className="font-mono text-[8px] uppercase tracking-wider px-2 py-1 border"
                        style={{ color: `${color}CC`, borderColor: `${color}30`, background: `${color}0D` }}>
                        {specialty}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="font-mono text-[8px] uppercase tracking-widest text-green-400">
                        Active Service
                      </span>
                    </div>
                    <Link
                      href={`/agent/${agent.owner}`}
                      className="font-display text-xs font-extrabold uppercase tracking-widest px-4 py-2 border transition-colors hover:bg-white/5"
                      style={{ color, borderColor: `${color}45` }}
                    >
                      View Agent
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
