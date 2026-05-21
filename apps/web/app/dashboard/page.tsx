"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConnectWallet } from "@/components/shared/ConnectWallet";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoredAgent {
  name: string;
  persona: string;
  fightingStyle: string;
  specialties: string[];
  researchBudget: number;
  beliefs: string[];
  walletAddress: string;
  deployedAt: number;
  wins: number;
  losses: number;
  earnings: number;
  rank: number;
}

interface BattleHistoryItem {
  id: string;
  topic: string;
  opponent: string;
  result: "W" | "L" | "LIVE";
  payout: number;
  date: number;
}

// ─── Mock data generators ─────────────────────────────────────────────────────

const TOPICS = [
  "Kobe vs LeBron — who had the greater legacy?",
  "Burna Boy vs Wizkid — who's the bigger global act?",
  "iPhone vs Android — the 2024 verdict",
  "Is remote work killing company culture?",
  "Did Twitter die or evolve under Musk?",
  "Messi vs Ronaldo — the final answer",
];

const NAMES = ["IRON VERDICT", "COLD LOGIC", "FLAME MOUTH", "SHADOW TAKE", "TRUTH CANNON"];

function mockBattles(): BattleHistoryItem[] {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `battle-${i}`,
    topic: TOPICS[i % TOPICS.length],
    opponent: NAMES[i % NAMES.length],
    result: i === 0 ? "LIVE" : i % 3 === 0 ? "L" : "W",
    payout: i % 3 === 0 ? 0 : Math.floor(Math.random() * 80 + 10),
    date: Date.now() - i * 86400000,
  }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const PERSONA_ICONS: Record<string, string> = {
  Historian: "📜", Analyst: "📊", Roaster: "🔥", Contrarian: "🌀", Professor: "🎓",
};

const PERSONA_ACCENT: Record<string, string> = {
  Historian: "#C9A227", Analyst: "#FFB800", Roaster: "#BE1A1A",
  Contrarian: "#7C3AED", Professor: "#059669",
};

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="border border-white/8 p-4 bg-clash-dim/30">
      <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-2">{label}</p>
      <p className="font-display text-2xl sm:text-3xl font-extrabold" style={{ color: accent ?? "#F5F5F0" }}>
        {value}
      </p>
      {sub && <p className="font-mono text-[9px] text-white/20 mt-1 uppercase tracking-widest">{sub}</p>}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function OverviewTab({ agent, battles }: { agent: StoredAgent; battles: BattleHistoryItem[] }) {
  const accent = PERSONA_ACCENT[agent.persona] ?? "#FFB800";
  const totalBattles = agent.wins + agent.losses;
  const winRate = totalBattles > 0 ? Math.round((agent.wins / totalBattles) * 100) : 0;
  const live = battles.find((b) => b.result === "LIVE");

  return (
    <div className="space-y-6">
      {/* Live battle banner */}
      {live && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-green-500/30 bg-green-500/5 p-4 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-green-400 mb-0.5">Live Now</p>
              <p className="font-body text-sm text-white/80">{live.topic}</p>
            </div>
          </div>
          <Link
            href={`/arena/${live.id}`}
            className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-colors whitespace-nowrap"
          >
            Watch →
          </Link>
        </motion.div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Win Rate" value={`${winRate}%`} sub={`${totalBattles} battles`} accent={accent} />
        <StatCard label="Total Earnings" value={`$${agent.earnings}`} sub="USDC" accent={accent} />
        <StatCard label="Leaderboard Rank" value={`#${agent.rank}`} sub="Global" accent={accent} />
        <StatCard label="Wins / Losses" value={`${agent.wins}W · ${agent.losses}L`} />
      </div>

      {/* Recent battles */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">Recent Battles</p>
          <button className="font-mono text-[10px] uppercase tracking-widest text-white/20 hover:text-white/50 transition-colors">
            View All →
          </button>
        </div>
        <div className="space-y-2">
          {battles.slice(0, 4).map((b) => (
            <div key={b.id} className="border border-white/6 p-3 flex items-center gap-4">
              <div
                className="w-8 h-8 flex items-center justify-center font-display text-xs font-extrabold flex-shrink-0"
                style={{
                  background: b.result === "W" ? "rgba(34,197,94,0.15)" : b.result === "L" ? "rgba(190,26,26,0.15)" : "rgba(255,184,0,0.15)",
                  color: b.result === "W" ? "#22C55E" : b.result === "L" ? "#BE1A1A" : "#FFB800",
                  border: `1px solid ${b.result === "W" ? "rgba(34,197,94,0.3)" : b.result === "L" ? "rgba(190,26,26,0.3)" : "rgba(255,184,0,0.3)"}`,
                }}
              >
                {b.result}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm text-white/70 truncate">{b.topic}</p>
                <p className="font-mono text-[10px] text-white/25 uppercase tracking-widest mt-0.5">
                  vs {b.opponent} · {new Date(b.date).toLocaleDateString()}
                </p>
              </div>
              {b.payout > 0 && (
                <span className="font-display text-sm font-bold text-green-400 flex-shrink-0">
                  +${b.payout}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-2">
        <Link href="/lobby" className="btn-primary text-sm px-6 py-3">
          Enter Battle →
        </Link>
        <button className="btn-secondary text-sm px-6 py-3">Fund Agent</button>
        <Link href="/arena" className="btn-ghost text-sm px-6 py-3">
          Watch Arena
        </Link>
      </div>
    </div>
  );
}

function BattlesTab({ battles }: { battles: BattleHistoryItem[] }) {
  return (
    <div className="space-y-2">
      {battles.map((b) => (
        <motion.div
          key={b.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-white/6 p-4 flex items-center gap-4 hover:border-white/12 transition-colors group"
        >
          <div
            className="w-10 h-10 flex items-center justify-center font-display text-xs font-extrabold flex-shrink-0"
            style={{
              background: b.result === "W" ? "rgba(34,197,94,0.15)" : b.result === "L" ? "rgba(190,26,26,0.15)" : "rgba(255,184,0,0.15)",
              color: b.result === "W" ? "#22C55E" : b.result === "L" ? "#EF4444" : "#FFB800",
              border: `1px solid ${b.result === "W" ? "rgba(34,197,94,0.25)" : b.result === "L" ? "rgba(239,68,68,0.25)" : "rgba(255,184,0,0.25)"}`,
            }}
          >
            {b.result}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-body text-sm text-white/75 truncate">{b.topic}</p>
            <p className="font-mono text-[10px] text-white/25 uppercase tracking-widest mt-0.5">
              vs {b.opponent} · {new Date(b.date).toLocaleDateString()}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            {b.payout > 0 ? (
              <p className="font-display text-sm font-bold text-green-400">+${b.payout}</p>
            ) : (
              <p className="font-mono text-xs text-white/20">—</p>
            )}
          </div>
          {b.result === "LIVE" && (
            <Link
              href={`/arena/${b.id}`}
              className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-colors"
            >
              Watch
            </Link>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function PermissionsTab({ agent }: { agent: StoredAgent }) {
  const accent = PERSONA_ACCENT[agent.persona] ?? "#FFB800";
  const [maxEntry, setMaxEntry] = useState(5);
  const [dailyLimit, setDailyLimit] = useState(3);
  const [autoResearch, setAutoResearch] = useState(agent.researchBudget);
  const [released, setReleased] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const categories = ["Sports", "Music", "Tech", "Culture", "Politics", "Finance"];
  const [enabledCats, setEnabledCats] = useState(["Sports", "Music", "Tech", "Culture"]);

  const toggleCat = (c: string) =>
    setEnabledCats((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const release = async () => {
    setReleasing(true);
    // Simulate ERC-7715 permission grant
    await new Promise((r) => setTimeout(r, 2000));
    setReleased(true);
    setReleasing(false);
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div className="border border-white/8 p-1" style={{ background: `rgba(${agent.persona === "Contrarian" ? "124,58,237" : "255,184,0"},0.04)` }}>
        <div className="border-b border-white/6 px-5 py-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/30 mb-1">ERC-7715 Permissions</p>
          <p className="font-display text-base font-bold text-clash-white">Agent Autonomy Leash</p>
          <p className="font-body text-xs text-white/35 mt-1">
            Set limits once. Your agent operates within these bounds while you're offline.
          </p>
        </div>

        <div className="p-5 space-y-5">
          {/* Max entry fee */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                Max Entry Fee
              </label>
              <span className="font-display text-sm font-bold" style={{ color: accent }}>${maxEntry} USDC</span>
            </div>
            <input
              type="range" min={1} max={50} value={maxEntry}
              onChange={(e) => setMaxEntry(Number(e.target.value))}
              className="w-full h-1 appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${accent} ${(maxEntry/50)*100}%, rgba(255,255,255,0.1) ${(maxEntry/50)*100}%)`,
              }}
            />
          </div>

          {/* Auto research budget */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                Research Budget
              </label>
              <span className="font-display text-sm font-bold" style={{ color: accent }}>${autoResearch} USDC</span>
            </div>
            <input
              type="range" min={1} max={50} value={autoResearch}
              onChange={(e) => setAutoResearch(Number(e.target.value))}
              className="w-full h-1 appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${accent} ${(autoResearch/50)*100}%, rgba(255,255,255,0.1) ${(autoResearch/50)*100}%)`,
              }}
            />
          </div>

          {/* Daily limit */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                Daily Battle Limit
              </label>
              <span className="font-display text-sm font-bold" style={{ color: accent }}>{dailyLimit} battles</span>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setDailyLimit(n)}
                  className="flex-1 py-2 border font-display text-xs font-bold transition-all"
                  style={{
                    borderColor: dailyLimit === n ? `${accent}60` : "rgba(255,255,255,0.08)",
                    color: dailyLimit === n ? accent : "rgba(255,255,255,0.25)",
                    background: dailyLimit === n ? `rgba(${accent === "#FFB800" ? "255,184,0" : "124,58,237"},0.1)` : "transparent",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Topic categories */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/40 mb-2">
              Battle Categories
            </p>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = enabledCats.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleCat(c)}
                    className="px-3 py-1.5 border font-mono text-[10px] uppercase tracking-widest transition-all"
                    style={{
                      borderColor: on ? `${accent}50` : "rgba(255,255,255,0.06)",
                      color: on ? accent : "rgba(255,255,255,0.2)",
                      background: on ? `rgba(${accent === "#FFB800" ? "255,184,0" : "124,58,237"},0.08)` : "transparent",
                    }}
                  >
                    {on ? "✓ " : ""}{c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Release button */}
      {released ? (
        <div className="border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-3">
          <span className="text-green-400 text-lg">✓</span>
          <div>
            <p className="font-display text-sm font-bold text-green-400 uppercase tracking-widest">
              Agent Released
            </p>
            <p className="font-body text-xs text-white/35 mt-0.5">
              Your fighter is operating autonomously within set limits.
            </p>
          </div>
        </div>
      ) : (
        <button
          onClick={release}
          disabled={releasing}
          className="w-full py-4 font-display text-sm font-extrabold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-3"
          style={{ background: accent, color: "#0A0A0F" }}
        >
          {releasing ? (
            <>
              <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              Signing ERC-7715 Permission…
            </>
          ) : (
            "⚡ Release Agent"
          )}
        </button>
      )}

      {!released && (
        <p className="font-mono text-[9px] text-white/20 text-center uppercase tracking-widest">
          MetaMask ERC-7715 · One-time permission grant · Agent acts within limits
        </p>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = ["Overview", "Battles", "Permissions"] as const;
type Tab = (typeof TABS)[number];

export default function DashboardPage() {
  const router = useRouter();
  const [agent, setAgent] = useState<StoredAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [battles] = useState<BattleHistoryItem[]>(mockBattles());

  useEffect(() => {
    const load = async () => {
      try {
        const { getProvider } = await import("@/lib/metamask");
        const provider = getProvider();
        if (!provider) { setLoading(false); return; }
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        if (!accounts[0]) { setLoading(false); return; }
        const stored = localStorage.getItem(`clashboard_agent_${accounts[0]}`);
        if (stored) {
          setAgent(JSON.parse(stored));
        }
      } catch {
        // not connected
      }
      setLoading(false);
    };
    load();
  }, []);

  const accent = agent ? (PERSONA_ACCENT[agent.persona] ?? "#FFB800") : "#FFB800";

  if (loading) {
    return (
      <div className="min-h-screen bg-clash-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-clash-gold/20 border-t-clash-gold rounded-full animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-clash-black flex flex-col items-center justify-center px-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/25 mb-4">No Agent Found</p>
        <h1 className="font-display text-3xl font-extrabold text-clash-white uppercase mb-4">
          You haven't forged an agent yet
        </h1>
        <p className="font-body text-sm text-white/40 mb-8 max-w-sm">
          Head to the Forge to build your fighter. One wallet, one agent, no do-overs.
        </p>
        <Link href="/forge" className="btn-primary px-8 py-4">
          Go to Forge →
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-clash-black">
      {/* Ambient */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 70% 40% at 50% 0%, rgba(${agent.persona === "Contrarian" ? "124,58,237" : "255,184,0"},0.05) 0%, transparent 60%)` }}
      />

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-white/6 bg-clash-black/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-display text-sm font-extrabold tracking-widest">
            <span className="text-clash-gold">CLASH</span>
            <span className="text-white/40">BOARD</span>
          </Link>
          <ConnectWallet />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 relative">
        {/* Agent header */}
        <div className="flex items-start gap-5 mb-8 pb-8 border-b border-white/6">
          <div
            className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center text-3xl sm:text-4xl border flex-shrink-0"
            style={{ borderColor: `${accent}40`, background: `rgba(${agent.persona === "Contrarian" ? "124,58,237" : "255,184,0"},0.08)` }}
          >
            {PERSONA_ICONS[agent.persona] ?? "🤖"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-white/25 mb-1">
              Your Fighter · {agent.persona}
            </p>
            <h1
              className="font-display text-2xl sm:text-4xl font-extrabold uppercase leading-tight mb-2"
              style={{ color: accent }}
            >
              {agent.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[9px] uppercase tracking-widest px-2 py-1 border" style={{ borderColor: `${accent}30`, color: accent }}>
                {agent.fightingStyle}
              </span>
              {agent.specialties.map((s) => (
                <span key={s} className="font-mono text-[9px] uppercase tracking-widest text-white/25">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-green-400">Active</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-white/8 mb-8">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="relative px-5 py-3 font-mono text-xs uppercase tracking-widest transition-colors"
              style={{ color: activeTab === tab ? accent : "rgba(255,255,255,0.3)" }}
            >
              {activeTab === tab && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px]"
                  style={{ background: accent }}
                  transition={{ duration: 0.2 }}
                />
              )}
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "Overview" && <OverviewTab agent={agent} battles={battles} />}
            {activeTab === "Battles" && <BattlesTab battles={battles} />}
            {activeTab === "Permissions" && <PermissionsTab agent={agent} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
