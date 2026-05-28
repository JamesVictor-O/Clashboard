"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { ConnectWallet } from "@/components/shared/ConnectWallet";
import { REGISTRY_ABI } from "@/lib/chain";
import { writeUserContract, waitForTx } from "@/lib/wallet-contract";
import type { PersonalityType, FightingStyle } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const PERSONAS: {
  id: PersonalityType;
  label: string;
  tagline: string;
  desc: string;
  accent: string;
  glow: string;
  icon: string;
}[] = [
  {
    id: "Historian",
    label: "THE HISTORIAN",
    tagline: "Master of context",
    desc: "Fights with timelines, precedent, and undeniable cause. Every argument is cited.",
    accent: "#C9A227",
    glow: "201,162,39",
    icon: "📜",
  },
  {
    id: "Analyst",
    label: "THE ANALYST",
    tagline: "Stats don't lie",
    desc: "Cold, precise, devastating. Turns every debate into a data fight.",
    accent: "#FFB800",
    glow: "255,184,0",
    icon: "📊",
  },
  {
    id: "Roaster",
    label: "THE ROASTER",
    tagline: "No mercy, only receipts",
    desc: "Obliterates with wit, burns, and the most embarrassing truths.",
    accent: "#BE1A1A",
    glow: "190,26,26",
    icon: "🔥",
  },
  {
    id: "Contrarian",
    label: "THE CONTRARIAN",
    tagline: "What if you're all wrong?",
    desc: "Flips every narrative. Finds the angle no one expected.",
    accent: "#7C3AED",
    glow: "124,58,237",
    icon: "🌀",
  },
  {
    id: "Professor",
    label: "THE PROFESSOR",
    tagline: "Actually, let me explain…",
    desc: "Structured, cited, peer-reviewed. Opponents feel like students who forgot to study.",
    accent: "#059669",
    glow: "5,150,105",
    icon: "🎓",
  },
];

const FIGHTING_STYLES: {
  id: FightingStyle;
  label: string;
  desc: string;
  icon: string;
}[] = [
  {
    id: "Aggressive",
    label: "AGGRESSIVE",
    desc: "Go for the throat. Early pressure, high risk, maximum crowd energy.",
    icon: "⚡",
  },
  {
    id: "Methodical",
    label: "METHODICAL",
    desc: "Build slowly. Lock down positions one by one. Hard to shake.",
    icon: "🧱",
  },
  {
    id: "Witty",
    label: "WITTY",
    desc: "Win the crowd first. Disarm opponents with humour before landing the blow.",
    icon: "🎭",
  },
  {
    id: "Balanced",
    label: "BALANCED",
    desc: "Adapt to anything. Read the room. Strike when the moment is right.",
    icon: "⚖️",
  },
];

const ALL_SPECIALTIES = [
  "Sports Analytics",
  "Music History",
  "Pop Culture",
  "Tech Industry",
  "Economics",
  "African Culture",
  "Hip-Hop",
  "Politics",
  "Philosophy",
  "Film & TV",
  "Fashion",
  "Gaming",
  "Science",
  "Social Media",
  "Business Strategy",
  "Literature",
  "Food Culture",
  "Geopolitics",
];

const STEPS = [
  "Intro",
  "Persona",
  "Beliefs",
  "Style",
  "Specialties",
  "Budget",
  "Name",
  "Deploy",
];

// ─── Shared shell ─────────────────────────────────────────────────────────────

function ForgeShell({
  step,
  total,
  accent,
  children,
}: {
  step: number;
  total: number;
  accent: string;
  children: React.ReactNode;
}) {
  const progress = step === 0 ? 0 : (step / (total - 1)) * 100;
  return (
    /*
     * h-[100dvh] (not min-h-screen) gives an EXPLICIT, definite height so
     * flex-1 children and absolute inset-0 grandchildren both resolve to
     * real pixel values. min-h-screen is not "definite" for CSS flex
     * intrinsic sizing, which caused absolute inset-0 to collapse to 0px.
     */
    <div className="h-[100dvh] bg-clash-black flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/6 flex-shrink-0">
        <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Clashboard" className="h-6 w-auto flex-shrink-0" />
          <span className="text-clash-gold">CLASH</span>
          <span className="text-white/40">BOARD</span>
        </Link>
        {step > 0 && step < total - 1 && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/25">
            Step {step} of {total - 2}
          </span>
        )}
        <ConnectWallet />
      </header>

      {/* Progress bar */}
      {step > 0 && step < total - 1 && (
        <div className="h-[2px] bg-white/6 flex-shrink-0">
          <motion.div
            className="h-full"
            style={{ background: accent }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      )}

      {/*
       * min-h-0 overrides flex item's default min-height:auto, which would
       * otherwise let the container grow beyond its flex-1 allocation and
       * prevent absolute children from resolving inset:0 correctly.
       */}
      <div className="flex-1 min-h-0 relative overflow-hidden">{children}</div>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function StepIntro({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-xl"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-clash-gold/60 mb-6">
          Agent Forge · One Time Only
        </p>
        <h1
          className="font-display font-extrabold uppercase leading-[0.88] mb-6"
          style={{ fontSize: "clamp(3rem,10vw,7rem)" }}
        >
          <span className="block text-clash-white">FORGE</span>
          <span className="block" style={{ color: "transparent", WebkitTextStroke: "2px #FFB800" }}>
            YOUR
          </span>
          <span className="block text-clash-white">FIGHTER</span>
        </h1>
        <p className="font-body text-white/50 text-base leading-relaxed mb-10 max-w-sm mx-auto">
          This is a ritual, not a form. Answer honestly. The agent you build will
          fight in your name — win or lose — for as long as it stands.
        </p>
        <div className="flex flex-col items-center gap-3">
          <button onClick={onNext} className="btn-primary px-10 py-4 text-base">
            Begin the Ritual →
          </button>
          <p className="font-mono text-[10px] text-white/20 uppercase tracking-widest">
            One wallet · One agent · No do-overs
          </p>
        </div>
      </motion.div>

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 80%, rgba(255,184,0,0.06) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}

function StepPersona({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: PersonalityType | null;
  onChange: (v: PersonalityType) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
      <div className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-clash-gold/60 mb-2">
          Step 1 — Persona
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-clash-white uppercase">
          Who fights in your name?
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {PERSONAS.map((p) => {
          const active = value === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onChange(p.id)}
              className="relative text-left p-5 border transition-all duration-200 group"
              style={{
                borderColor: active ? `${p.accent}60` : "rgba(255,255,255,0.08)",
                background: active ? `rgba(${p.glow},0.12)` : "transparent",
              }}
            >
              {active && (
                <motion.div
                  layoutId="persona-sel"
                  className="absolute inset-0 border-2"
                  style={{ borderColor: p.accent }}
                  transition={{ duration: 0.2 }}
                />
              )}
              <div className="text-2xl mb-3">{p.icon}</div>
              <p
                className="font-display text-xs font-extrabold uppercase tracking-widest mb-1"
                style={{ color: active ? p.accent : "rgba(255,255,255,0.5)" }}
              >
                {p.label}
              </p>
              <p className="font-body text-xs italic text-white/40 mb-2">{p.tagline}</p>
              <p className="font-body text-xs text-white/30 leading-relaxed">{p.desc}</p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-auto">
        <button onClick={onBack} className="btn-ghost text-sm">← Back</button>
        <button
          onClick={onNext}
          disabled={!value}
          className="btn-primary px-8 py-3 text-sm disabled:opacity-30"
        >
          Lock In →
        </button>
      </div>
    </div>
  );
}

function StepBeliefs({
  persona,
  values,
  onChange,
  onNext,
  onBack,
}: {
  persona: PersonalityType | null;
  values: string[];
  onChange: (v: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const accent = PERSONAS.find((p) => p.id === persona)?.accent ?? "#FFB800";

  const update = (i: number, v: string) => {
    const next = [...values];
    next[i] = v;
    onChange(next);
  };

  const filled = values.filter((v) => v.trim().length > 10).length;

  const placeholders = [
    "e.g. Kobe Bryant is definitively better than LeBron James — no debate.",
    "e.g. Burna Boy outranks Wizkid on pure cultural impact alone.",
    "e.g. Android has been the superior OS since 2015. iPhones are fashion.",
  ];

  return (
    <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 sm:px-6 py-10">
      <div className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] mb-2" style={{ color: `${accent}99` }}>
          Step 2 — Hot Take Beliefs
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-clash-white uppercase">
          What does your agent{" "}
          <span style={{ color: accent }}>actually believe?</span>
        </h2>
        <p className="font-body text-sm text-white/35 mt-2">
          Write 3 strong, unambiguous positions. These become your agent's fighting soul.
        </p>
      </div>

      <div className="flex flex-col gap-4 mb-8">
        {[0, 1, 2].map((i) => (
          <div key={i} className="relative">
            <div
              className="absolute left-0 top-0 bottom-0 w-[3px]"
              style={{ background: values[i]?.trim().length > 10 ? accent : "rgba(255,255,255,0.08)" }}
            />
            <textarea
              value={values[i] ?? ""}
              onChange={(e) => update(i, e.target.value)}
              placeholder={placeholders[i]}
              rows={3}
              className="textarea pl-5 text-sm resize-none"
            />
            <div className="flex justify-between mt-1 px-1">
              <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: `${accent}60` }}>
                Belief {i + 1}
              </span>
              <span className="font-mono text-[9px] text-white/20">{values[i]?.length ?? 0}/280</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-auto">
        <button onClick={onBack} className="btn-ghost text-sm">← Back</button>
        <button
          onClick={onNext}
          disabled={filled < 3}
          className="btn-primary px-8 py-3 text-sm disabled:opacity-30"
        >
          {filled < 3 ? `${filled}/3 beliefs set` : "Set Beliefs →"}
        </button>
      </div>
    </div>
  );
}

function StepStyle({
  persona,
  value,
  onChange,
  onNext,
  onBack,
}: {
  persona: PersonalityType | null;
  value: FightingStyle | null;
  onChange: (v: FightingStyle) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const accent = PERSONAS.find((p) => p.id === persona)?.accent ?? "#FFB800";
  const glow = PERSONAS.find((p) => p.id === persona)?.glow ?? "255,184,0";

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 sm:px-6 py-10">
      <div className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] mb-2" style={{ color: `${accent}99` }}>
          Step 3 — Fighting Style
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-clash-white uppercase">
          How does your agent{" "}
          <span style={{ color: accent }}>go to war?</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        {FIGHTING_STYLES.map((s) => {
          const active = value === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onChange(s.id)}
              className="relative text-left p-6 border transition-all duration-200"
              style={{
                borderColor: active ? `${accent}60` : "rgba(255,255,255,0.08)",
                background: active ? `rgba(${glow},0.1)` : "transparent",
              }}
            >
              {active && (
                <motion.div
                  layoutId="style-sel"
                  className="absolute inset-0 border-2"
                  style={{ borderColor: accent }}
                  transition={{ duration: 0.2 }}
                />
              )}
              <div className="text-3xl mb-3">{s.icon}</div>
              <p
                className="font-display text-sm font-extrabold uppercase tracking-widest mb-2"
                style={{ color: active ? accent : "rgba(255,255,255,0.5)" }}
              >
                {s.label}
              </p>
              <p className="font-body text-xs text-white/35 leading-relaxed">{s.desc}</p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-auto">
        <button onClick={onBack} className="btn-ghost text-sm">← Back</button>
        <button
          onClick={onNext}
          disabled={!value}
          className="btn-primary px-8 py-3 text-sm disabled:opacity-30"
        >
          Choose Style →
        </button>
      </div>
    </div>
  );
}

function StepSpecialties({
  persona,
  values,
  onChange,
  onNext,
  onBack,
}: {
  persona: PersonalityType | null;
  values: string[];
  onChange: (v: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const accent = PERSONAS.find((p) => p.id === persona)?.accent ?? "#FFB800";
  const glow = PERSONAS.find((p) => p.id === persona)?.glow ?? "255,184,0";

  const toggle = (tag: string) => {
    if (values.includes(tag)) {
      onChange(values.filter((v) => v !== tag));
    } else if (values.length < 3) {
      onChange([...values, tag]);
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 sm:px-6 py-10">
      <div className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] mb-2" style={{ color: `${accent}99` }}>
          Step 4 — Specialties
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-clash-white uppercase">
          Pick 3 domains your agent{" "}
          <span style={{ color: accent }}>dominates.</span>
        </h2>
        <p className="font-body text-sm text-white/35 mt-2">
          These determine which battle topics your agent is best matched for.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {ALL_SPECIALTIES.map((tag) => {
          const selected = values.includes(tag);
          const maxed = !selected && values.length >= 3;
          return (
            <button
              key={tag}
              onClick={() => !maxed && toggle(tag)}
              className="px-4 py-2 border font-mono text-xs uppercase tracking-widest transition-all duration-150"
              style={{
                borderColor: selected ? `${accent}70` : "rgba(255,255,255,0.08)",
                color: selected ? accent : maxed ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.4)",
                background: selected ? `rgba(${glow},0.12)` : "transparent",
                cursor: maxed ? "not-allowed" : "pointer",
              }}
            >
              {selected ? `✓ ${tag}` : tag}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-auto">
        <button onClick={onBack} className="btn-ghost text-sm">← Back</button>
        <button
          onClick={onNext}
          disabled={values.length < 3}
          className="btn-primary px-8 py-3 text-sm disabled:opacity-30"
        >
          {values.length < 3 ? `${values.length}/3 selected` : "Lock Specialties →"}
        </button>
      </div>
    </div>
  );
}

function StepBudget({
  persona,
  value,
  onChange,
  onNext,
  onBack,
}: {
  persona: PersonalityType | null;
  value: number;
  onChange: (v: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const accent = PERSONAS.find((p) => p.id === persona)?.accent ?? "#FFB800";
  const glow = PERSONAS.find((p) => p.id === persona)?.glow ?? "255,184,0";

  const tiers = [
    { min: 1, max: 5, label: "Scout", desc: "Light research. Quick battles." },
    { min: 6, max: 15, label: "Soldier", desc: "Solid data pull. Most topics covered." },
    { min: 16, max: 30, label: "Veteran", desc: "Deep research. Fewer surprises." },
    { min: 31, max: 50, label: "Elite", desc: "Full-depth intel. Maximum edge." },
  ];

  const currentTier = tiers.find((t) => value >= t.min && value <= t.max);

  return (
    <div className="flex-1 flex flex-col max-w-xl mx-auto w-full px-4 sm:px-6 py-10">
      <div className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] mb-2" style={{ color: `${accent}99` }}>
          Step 5 — Operating Budget
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-clash-white uppercase">
          How much can your agent{" "}
          <span style={{ color: accent }}>operate with?</span>
        </h2>
        <p className="font-body text-sm text-white/35 mt-2">
          One master testnet USDC budget for research purchases, x402 data,
          agent-to-agent research, demo arena actions, and arena stake.
        </p>
      </div>

      <div className="border border-white/8 p-6 mb-6" style={{ background: `rgba(${glow},0.05)` }}>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-display text-5xl font-extrabold" style={{ color: accent }}>
            ${value}
          </span>
          <span className="font-mono text-sm text-white/30 uppercase tracking-widest">/ day</span>
        </div>
        {currentTier && (
          <div className="flex items-center gap-3 mt-2">
            <span
              className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 border"
              style={{ borderColor: `${accent}40`, color: accent }}
            >
              {currentTier.label}
            </span>
            <span className="font-body text-xs text-white/35">{currentTier.desc}</span>
          </div>
        )}
      </div>

      <div className="mb-8">
        <input
          type="range"
          min={1}
          max={50}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1 appearance-none rounded-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${accent} 0%, ${accent} ${(value / 50) * 100}%, rgba(255,255,255,0.1) ${(value / 50) * 100}%, rgba(255,255,255,0.1) 100%)`,
          }}
        />
        <div className="flex justify-between mt-2">
          {tiers.map((t) => (
            <span key={t.label} className="font-mono text-[9px] uppercase tracking-widest text-white/20">
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-auto">
        <button onClick={onBack} className="btn-ghost text-sm">← Back</button>
        <button onClick={onNext} className="btn-primary px-8 py-3 text-sm">
          Set Operating Budget →
        </button>
      </div>
    </div>
  );
}

function StepName({
  persona,
  value,
  onChange,
  onNext,
  onBack,
}: {
  persona: PersonalityType | null;
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const accent = PERSONAS.find((p) => p.id === persona)?.accent ?? "#FFB800";
  const p = PERSONAS.find((x) => x.id === persona);
  const valid = value.trim().length >= 2 && value.trim().length <= 24;

  return (
    <div className="flex-1 flex flex-col max-w-xl mx-auto w-full px-4 sm:px-6 py-10">
      <div className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] mb-2" style={{ color: `${accent}99` }}>
          Step 6 — Name
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-clash-white uppercase">
          Give your fighter a{" "}
          <span style={{ color: accent }}>name.</span>
        </h2>
        <p className="font-body text-sm text-white/35 mt-2">
          This is how they'll be known in the arena. Choose wisely.
        </p>
      </div>

      <div
        className="border p-6 mb-8 flex items-center gap-4"
        style={{ borderColor: `${accent}30`, background: `rgba(${p?.glow ?? "255,184,0"},0.06)` }}
      >
        <div
          className="w-12 h-12 flex items-center justify-center text-2xl border flex-shrink-0"
          style={{ borderColor: `${accent}40` }}
        >
          {p?.icon}
        </div>
        <div>
          <p className="font-display text-lg font-extrabold uppercase tracking-wider" style={{ color: accent }}>
            {value.trim() || "???"}
          </p>
          <p className="font-mono text-xs text-white/30 uppercase tracking-widest">
            {persona} · Your Agent
          </p>
        </div>
      </div>

      <div className="mb-8">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 24))}
          placeholder="e.g. IRON ORACLE, COLD VERDICT, FLAME MOUTH…"
          className="input text-lg font-display uppercase tracking-widest"
          style={{ borderColor: value.trim().length > 0 ? `${accent}50` : undefined }}
          autoFocus
        />
        <div className="flex justify-between mt-1 px-1">
          <span className="font-mono text-[9px] text-white/20">2–24 characters, all caps preferred</span>
          <span className="font-mono text-[9px] text-white/20">{value.length}/24</span>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-auto">
        <button onClick={onBack} className="btn-ghost text-sm">← Back</button>
        <button
          onClick={onNext}
          disabled={!valid}
          className="btn-primary px-8 py-3 text-sm disabled:opacity-30"
        >
          This is my fighter →
        </button>
      </div>
    </div>
  );
}

function StepDeploy({
  config,
  walletAddress,
  onBack,
}: {
  config: ForgeConfig;
  walletAddress: string | null;
  onBack: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"review" | "deploying" | "done" | "error">("review");
  const [deployLog, setDeployLog] = useState<string[]>([]);
  const accent = PERSONAS.find((p) => p.id === config.persona)?.accent ?? "#FFB800";
  const p = PERSONAS.find((x) => x.id === config.persona);

  const deploy = useCallback(async () => {
    if (!walletAddress) return;
    setPhase("deploying");

    const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT as `0x${string}`;

    try {
      setDeployLog(["Preparing agent identity…"]);

      // Build metadataHash — commits the full config on-chain without storing it
      const metaJson = JSON.stringify({
        name: config.name,
        persona: config.persona,
        fightingStyle: config.fightingStyle,
        beliefs: config.beliefs,
        specialties: config.specialties,
        operatingBudgetUSDC: config.researchBudget,
        researchBudget: config.researchBudget,
      });
      const metaHash = keccak256(
        encodeAbiParameters(parseAbiParameters("string"), [metaJson])
      ) as `0x${string}`;

      setDeployLog((p) => [...p, "Requesting wallet signature…"]);

      const txHash = await writeUserContract({
        address: registryAddress,
        abi: REGISTRY_ABI,
        functionName: "forge",
        args: [config.name, metaHash],
        account: walletAddress as `0x${string}`,
      });

      setDeployLog((p) => [...p, `Transaction sent: ${txHash.slice(0, 10)}…`]);
      setDeployLog((p) => [...p, "Waiting for confirmation…"]);

      await waitForTx(txHash);

      setDeployLog((p) => [...p, "Agent identity confirmed on Base Sepolia."]);
      setDeployLog((p) => [...p, "Agent deployed. Welcome to the arena."]);

      // Cache config locally so dashboard can display personality details
      localStorage.setItem(
        `clashboard_agent_${walletAddress}`,
        JSON.stringify({
          ...config,
          operatingBudgetUSDC: config.researchBudget,
          walletAddress,
          txHash,
          deployedAt: Date.now(),
        })
      );

      setPhase("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setDeployLog((p) => [...p, `Error: ${msg}`]);
      // Return to config step so user can retry
      setTimeout(() => setPhase("review"), 2500);
    }
  }, [config, walletAddress]);

  if (phase === "done") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-md"
        >
          <div className="text-5xl mb-6">{p?.icon}</div>
          <p className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: `${accent}80` }}>
            Agent Deployed
          </p>
          <h2 className="font-display text-4xl font-extrabold uppercase mb-3" style={{ color: accent }}>
            {config.name}
          </h2>
          <p className="font-body text-sm text-white/40 mb-8">
            Your fighter is live. Head to the dashboard to fund, set permissions,
            and watch them go to work.
          </p>
          <button onClick={() => router.push("/dashboard")} className="btn-primary px-10 py-4 text-sm">
            Open Command Centre →
          </button>
        </motion.div>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 50% 50% at 50% 60%, rgba(${p?.glow},0.1) 0%, transparent 70%)`,
          }}
        />
      </div>
    );
  }

  if (phase === "deploying") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-sm w-full">
          <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/30 mb-6 text-center">
            Deploying Agent
          </p>
          <div className="border border-white/8 p-6 font-mono text-xs space-y-3" style={{ background: "#0A0A0F" }}>
            {deployLog.map((log, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-3"
              >
                <span style={{ color: accent }}>›</span>
                <span className="text-white/60">{log}</span>
              </motion.div>
            ))}
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="block text-white/20"
            >
              _
            </motion.span>
          </div>
        </div>
      </div>
    );
  }

  // Review phase
  return (
    <div className="flex-1 flex flex-col max-w-xl mx-auto w-full px-4 sm:px-6 py-10">
      <div className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] mb-2" style={{ color: `${accent}99` }}>
          Step 7 — Deploy
        </p>
        <h2 className="font-display text-2xl font-extrabold text-clash-white uppercase">
          Final review. <span style={{ color: accent }}>No edits after this.</span>
        </h2>
      </div>

      <div
        className="border p-6 mb-6 space-y-4"
        style={{ borderColor: `${accent}25`, background: `rgba(${p?.glow},0.05)` }}
      >
        <div className="flex items-center gap-3 pb-4 border-b border-white/6">
          <span className="text-3xl">{p?.icon}</span>
          <div>
            <p className="font-display text-xl font-extrabold uppercase" style={{ color: accent }}>{config.name}</p>
            <p className="font-mono text-xs text-white/30 uppercase tracking-widest">{config.persona}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="font-mono text-white/30 uppercase tracking-widest mb-1">Style</p>
            <p className="font-display font-bold uppercase" style={{ color: accent }}>{config.fightingStyle}</p>
          </div>
          <div>
            <p className="font-mono text-white/30 uppercase tracking-widest mb-1">Budget</p>
            <p className="font-display font-bold" style={{ color: accent }}>${config.researchBudget}/day</p>
          </div>
        </div>
        <div>
          <p className="font-mono text-white/30 uppercase tracking-widest text-xs mb-2">Specialties</p>
          <div className="flex flex-wrap gap-2">
            {config.specialties.map((s) => (
              <span
                key={s}
                className="font-mono text-[10px] px-2 py-1 border uppercase tracking-widest"
                style={{ borderColor: `${accent}30`, color: accent }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="font-mono text-white/30 uppercase tracking-widest text-xs mb-2">Beliefs</p>
          {config.beliefs.map(
            (b, i) =>
              b.trim() && (
                <p
                  key={i}
                  className="font-body text-xs text-white/40 italic border-l-2 pl-3 mb-2"
                  style={{ borderColor: `${accent}40` }}
                >
                  "{b.slice(0, 80)}{b.length > 80 ? "…" : ""}"
                </p>
              ),
          )}
        </div>
      </div>

      {!walletAddress && (
        <div className="border border-clash-gold/20 bg-clash-gold/5 p-4 mb-6 flex items-center gap-3">
          <span className="text-clash-gold text-lg">⚠</span>
          <p className="font-body text-sm text-white/60">Connect your wallet to deploy on-chain.</p>
        </div>
      )}

      <div className="flex items-center gap-4 mt-auto">
        <button onClick={onBack} className="btn-ghost text-sm">← Back</button>
        <button
          onClick={deploy}
          disabled={!walletAddress}
          className="btn-primary px-8 py-3 text-sm disabled:opacity-30 flex items-center gap-2"
        >
          Deploy Agent →
        </button>
      </div>
    </div>
  );
}

// ─── Config type ──────────────────────────────────────────────────────────────

interface ForgeConfig {
  persona: PersonalityType;
  beliefs: string[];
  fightingStyle: FightingStyle;
  specialties: string[];
  researchBudget: number;
  name: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ForgePage() {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back

  const [config, setConfig] = useState<ForgeConfig>({
    persona: "Analyst",
    beliefs: ["", "", ""],
    fightingStyle: "Balanced",
    specialties: [],
    researchBudget: 10,
    name: "",
  });

  useEffect(() => {
    let mounted = true;

    const handleAccount = async (address: string) => {
      if (!mounted) return;
      setWalletAddress(address);

      // Redirect if agent already exists on-chain for this wallet
      try {
        const { getPublicClient, REGISTRY_ABI } = await import("@/lib/chain");
        const client = getPublicClient();
        const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT as `0x${string}`;
        const exists = (await client.readContract({
          address: registryAddress,
          abi: REGISTRY_ABI,
          functionName: "agentExists_",
          args: [address as `0x${string}`],
        })) as boolean;
        if (exists && mounted) router.replace("/dashboard");
      } catch {
        // Chain unreachable — let user proceed
      }
    };

    const init = () => {
      // Use window.ethereum directly — avoids MetaMask SDK init which pops the
      // "choose wallet" modal and fails to return the session on page refresh.
      const eth = typeof window !== "undefined"
        ? (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<unknown>; on: (e: string, h: (...a: unknown[]) => void) => void; removeListener: (e: string, h: (...a: unknown[]) => void) => void } }).ethereum
        : undefined;
      if (!eth) return;

      // eth_accounts never prompts — returns already-connected accounts immediately
      eth.request({ method: "eth_accounts" }).then((accs) => {
        const list = accs as string[];
        if (list[0]) handleAccount(list[0]);
      }).catch(() => {});

      // Stay in sync when the user connects/switches in the nav
      const onAccountsChanged = (accs: unknown) => {
        const list = accs as string[];
        if (list[0]) handleAccount(list[0]);
        else if (mounted) setWalletAddress(null);
      };
      eth.on("accountsChanged", onAccountsChanged);
      return () => eth.removeListener("accountsChanged", onAccountsChanged);
    };

    const cleanup = init();
    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [router]);

  const accent = PERSONAS.find((p) => p.id === config.persona)?.accent ?? "#FFB800";

  // Directional navigation — sets direction before updating step so the
  // slide variant sees the correct value when the new motion.div mounts.
  const goTo = (target: number) => {
    setDirection(target > step ? 1 : -1);
    setStep(target);
  };

  const update = <K extends keyof ForgeConfig>(key: K, val: ForgeConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: val }));

  /*
   * Slide variants use a `custom` prop (direction) so forward navigation
   * enters from the right / exits to the left, and back does the opposite.
   * Using absolute inset-0 on the motion.div ensures height is always derived
   * from the parent container, not from the (possibly animating) sibling —
   * this is what eliminates blank/collapsed steps during transitions.
   */
  const slideVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * 36 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * -36 }),
  };

  return (
    <ForgeShell step={step} total={STEPS.length} accent={accent}>
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          /*
           * absolute inset-0: step always fills the viewport region regardless
           * of what the exiting step is doing. overflow-y-auto handles tall
           * content on small screens without breaking the layout.
           */
          className="absolute inset-0 flex flex-col overflow-y-auto"
        >
          {step === 0 && <StepIntro onNext={() => goTo(1)} />}
          {step === 1 && (
            <StepPersona
              value={config.persona}
              onChange={(v) => update("persona", v)}
              onNext={() => goTo(2)}
              onBack={() => goTo(0)}
            />
          )}
          {step === 2 && (
            <StepBeliefs
              persona={config.persona}
              values={config.beliefs}
              onChange={(v) => update("beliefs", v)}
              onNext={() => goTo(3)}
              onBack={() => goTo(1)}
            />
          )}
          {step === 3 && (
            <StepStyle
              persona={config.persona}
              value={config.fightingStyle}
              onChange={(v) => update("fightingStyle", v)}
              onNext={() => goTo(4)}
              onBack={() => goTo(2)}
            />
          )}
          {step === 4 && (
            <StepSpecialties
              persona={config.persona}
              values={config.specialties}
              onChange={(v) => update("specialties", v)}
              onNext={() => goTo(5)}
              onBack={() => goTo(3)}
            />
          )}
          {step === 5 && (
            <StepBudget
              persona={config.persona}
              value={config.researchBudget}
              onChange={(v) => update("researchBudget", v)}
              onNext={() => goTo(6)}
              onBack={() => goTo(4)}
            />
          )}
          {step === 6 && (
            <StepName
              persona={config.persona}
              value={config.name}
              onChange={(v) => update("name", v)}
              onNext={() => goTo(7)}
              onBack={() => goTo(5)}
            />
          )}
          {step === 7 && (
            <StepDeploy
              config={config}
              walletAddress={walletAddress}
              onBack={() => goTo(6)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </ForgeShell>
  );
}
