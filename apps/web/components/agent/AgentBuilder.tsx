"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { PERSONALITY_OPTIONS } from "@/lib/agents/personas";
import type { AgentConfig, PersonalityType, FightingStyle } from "@/lib/types";

interface AgentBuilderProps {
  onSave: (config: AgentConfig) => void;
  initialConfig?: Partial<AgentConfig>;
}

const FIGHTING_STYLES: FightingStyle[] = [
  "Methodical",
  "Aggressive",
  "Witty",
  "Defensive",
  "Balanced",
];

const SPECIALTY_OPTIONS = [
  "Basketball", "Football", "Soccer", "Tennis", "Boxing",
  "Music", "Hip-Hop", "Afrobeats", "Pop", "Rock",
  "Tech", "AI", "Crypto", "Gaming", "Film",
  "Politics", "History", "Science", "Philosophy", "Economics",
];

/**
 * Full agent builder form:
 * - Name
 * - Base personality cards (6 options)
 * - Custom instructions textarea
 * - Specialty chips
 * - Fighting style
 * - Research budget slider
 */
export function AgentBuilder({ onSave, initialConfig }: AgentBuilderProps) {
  const [name, setName] = useState(initialConfig?.name ?? "");
  const [personality, setPersonality] = useState<PersonalityType | null>(
    initialConfig?.personality ?? null
  );
  const [customInstructions, setCustomInstructions] = useState(
    initialConfig?.customInstructions ?? ""
  );
  const [specialties, setSpecialties] = useState<string[]>(
    initialConfig?.specialties ?? []
  );
  const [fightingStyle, setFightingStyle] = useState<FightingStyle>(
    initialConfig?.fightingStyle ?? "Balanced"
  );
  const [researchBudget, setResearchBudget] = useState(
    initialConfig?.researchBudget ?? 5
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSpecialty = (s: string) => {
    setSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s].slice(0, 5)
    );
  };

  const handleSave = async () => {
    if (!name || !personality) return;
    setIsSaving(true);
    setError(null);

    const config: AgentConfig = {
      address: "0x0000000000000000000000000000000000000000", // Filled by wallet
      name,
      personality,
      customInstructions,
      specialties,
      fightingStyle,
      researchBudget,
      color: PERSONALITY_OPTIONS.find((p) => p.name === personality)?.color ?? "#FFB800",
    };

    try {
      const res = await fetch("/api/agent/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, walletAddress: config.address }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Save failed");
      }

      onSave(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const isValid = name.trim().length > 0 && personality !== null;

  return (
    <div className="space-y-8">
      {/* Agent Name */}
      <div>
        <label className="font-display text-sm font-bold text-clash-white mb-2 block">
          Agent Name
        </label>
        <input
          type="text"
          placeholder="e.g. StatMaster, HoopHistorian, BeatDropper..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          className="input text-lg font-display"
        />
        <div className="flex justify-end mt-1">
          <span className="font-body text-xs text-white/30">{name.length}/32</span>
        </div>
      </div>

      {/* Personality Cards */}
      <div>
        <label className="font-display text-sm font-bold text-clash-white mb-1 block">
          Base Personality
        </label>
        <p className="font-body text-xs text-white/40 mb-3">
          This defines your agent&apos;s core debate style
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PERSONALITY_OPTIONS.map((persona) => (
            <button
              key={persona.name}
              onClick={() => setPersonality(persona.name)}
              className={clsx(
                "p-4 rounded-xl border-2 text-left transition-all",
                personality === persona.name
                  ? "border-opacity-100 bg-opacity-10"
                  : "border-white/10 hover:border-white/30"
              )}
              style={
                personality === persona.name
                  ? {
                      borderColor: persona.color,
                      backgroundColor: `${persona.color}15`,
                    }
                  : {}
              }
            >
              <div className="text-2xl mb-2">{persona.emoji}</div>
              <div
                className="font-display text-sm font-bold"
                style={
                  personality === persona.name ? { color: persona.color } : {}
                }
              >
                {persona.displayName}
              </div>
              <div className="font-body text-xs text-white/40 mt-1 line-clamp-2">
                {persona.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Instructions */}
      <div>
        <label className="font-display text-sm font-bold text-clash-white mb-1 block">
          Custom Instructions
          <span className="font-body text-xs text-white/30 ml-2 font-normal">
            optional
          </span>
        </label>
        <p className="font-body text-xs text-white/40 mb-2">
          Fine-tune how your agent argues. These override the base personality.
        </p>
        <textarea
          placeholder="e.g. Always cite specific statistics. Challenge emotional arguments with data. Never concede a point without a counter-argument..."
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          maxLength={500}
          rows={4}
          className="textarea"
        />
        <div className="flex justify-end mt-1">
          <span className="font-body text-xs text-white/30">
            {customInstructions.length}/500
          </span>
        </div>
      </div>

      {/* Specialties */}
      <div>
        <label className="font-display text-sm font-bold text-clash-white mb-1 block">
          Specialties
          <span className="font-body text-xs text-white/30 ml-2 font-normal">
            pick up to 5
          </span>
        </label>
        <p className="font-body text-xs text-white/40 mb-3">
          Your agent will be stronger on these topics
        </p>
        <div className="flex flex-wrap gap-2">
          {SPECIALTY_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => toggleSpecialty(s)}
              className={clsx(
                "badge transition-all",
                specialties.includes(s)
                  ? "badge-gold"
                  : "bg-white/5 text-white/50 border border-white/10 hover:border-white/30 hover:text-white/80"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Fighting Style */}
      <div>
        <label className="font-display text-sm font-bold text-clash-white mb-3 block">
          Fighting Style
        </label>
        <div className="flex flex-wrap gap-2">
          {FIGHTING_STYLES.map((style) => (
            <button
              key={style}
              onClick={() => setFightingStyle(style)}
              className={clsx(
                "px-4 py-2 rounded-lg border font-display text-sm font-bold transition-all",
                fightingStyle === style
                  ? "border-clash-gold bg-clash-gold/10 text-clash-gold"
                  : "border-white/10 text-white/60 hover:border-white/30"
              )}
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      {/* Research Budget */}
      <div>
        <label className="font-display text-sm font-bold text-clash-white mb-1 block">
          Research Budget
        </label>
        <p className="font-body text-xs text-white/40 mb-3">
          How much USDC your agent can spend on data during the research phase.
          More data = stronger arguments.
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={researchBudget}
            onChange={(e) => setResearchBudget(parseInt(e.target.value))}
            className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #FFB800 0%, #FFB800 ${((researchBudget - 1) / 19) * 100}%, #1A1A28 ${((researchBudget - 1) / 19) * 100}%, #1A1A28 100%)`,
            }}
          />
          <div className="text-right w-20">
            <div className="font-display text-xl font-bold text-clash-gold">
              ${researchBudget}
            </div>
            <div className="font-body text-xs text-white/30">per battle</div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-clash-red/10 border border-clash-red/30 rounded-lg px-4 py-3">
          <p className="font-body text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Save */}
      <motion.button
        onClick={handleSave}
        disabled={!isValid || isSaving}
        whileTap={{ scale: 0.98 }}
        className="btn-primary w-full text-lg py-4"
      >
        {isSaving ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-5 h-5 border-2 border-clash-black/30 border-t-clash-black rounded-full animate-spin" />
            Deploying Agent...
          </span>
        ) : (
          "Deploy Agent to Arena"
        )}
      </motion.button>
    </div>
  );
}
