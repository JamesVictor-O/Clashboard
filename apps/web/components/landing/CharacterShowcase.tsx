"use client";

import dynamic from "next/dynamic";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
} from "framer-motion";
import type { PersonaConfig } from "./PersonaViewer";

const PersonaViewer = dynamic(() => import("./PersonaViewer"), {
  ssr: false,
  loading: () => null,
});

// ─── Character data ────────────────────────────────────────────────────────────
const CHARACTERS = [
  {
    id: "historian",
    index: 0,
    name: "THE HISTORIAN",
    codename: "HISTORIAN",
    tagline: "Master of context.\nWielder of dates.",
    quote: "Every empire fell for a reason. I know all of them.",
    description:
      "The Historian fights with deep research, historical precedent, and evolutionary analysis. Every argument is backed by timeline, cause, and undeniable context. If it happened, they know it — and they'll use it against you.",
    specialties: [
      "Historical Context",
      "Statistical Timelines",
      "Comparative Analysis",
    ],
    wins: "61%",
    power: 78,
    wit: 65,
    precision: 90,
    // Visual identity
    accentPrimary: "#C9A227",
    accentSecondary: "#FF8C00",
    bgColorA: "rgba(201,162,39,0.15)",
    bgColorB: "rgba(201,162,39,0.03)",
    particleColor: "#C9A227",
    glowColor: "201,162,39",
    // Entrance type drives Three.js animation
    entranceType: "rise",
    persona: {
      color: "#C9A227",
      secondaryColor: "#FFB800",
      name: "Historian",
    } as PersonaConfig,
  },
  {
    id: "analyst",
    index: 1,
    name: "THE ANALYST",
    codename: "ANALYST",
    tagline: "Stats don't lie.\nOpinions do.",
    quote: "Your feelings are noted. Your data is inadequate.",
    description:
      "Cold. Precise. Devastating. The Analyst turns every debate into a data fight. Performance metrics, efficiency ratings, advanced statistics — if a number proves the point, they have it.",
    specialties: [
      "Performance Metrics",
      "Efficiency Ratings",
      "Predictive Models",
    ],
    wins: "67%",
    power: 85,
    wit: 55,
    precision: 95,
    accentPrimary: "#FFB800",
    accentSecondary: "#FF4500",
    bgColorA: "rgba(255,184,0,0.12)",
    bgColorB: "rgba(255,184,0,0.02)",
    particleColor: "#FFB800",
    glowColor: "255,184,0",
    entranceType: "slam",
    persona: {
      color: "#FFB800",
      secondaryColor: "#FF8C00",
      name: "Analyst",
    } as PersonaConfig,
  },
  {
    id: "roaster",
    index: 2,
    name: "THE ROASTER",
    codename: "ROASTER",
    tagline: "No mercy.\nOnly receipts.",
    quote: "I don't win arguments. I end careers.",
    description:
      "The Roaster doesn't argue — they obliterate. Sharp wit, devastating one-liners, and the ability to find the most embarrassing truth about any position. They don't need to be right. They need to be unforgettable.",
    specialties: [
      "Devastating Burns",
      "Cultural Receipts",
      "Crowd Entertainment",
    ],
    wins: "44%",
    power: 60,
    wit: 98,
    precision: 50,
    accentPrimary: "#BE1A1A",
    accentSecondary: "#FF4444",
    bgColorA: "rgba(190,26,26,0.18)",
    bgColorB: "rgba(190,26,26,0.03)",
    particleColor: "#FF4444",
    glowColor: "190,26,26",
    entranceType: "charge",
    persona: {
      color: "#BE1A1A",
      secondaryColor: "#FF4444",
      name: "Roaster",
    } as PersonaConfig,
  },
  {
    id: "contrarian",
    index: 3,
    name: "THE CONTRARIAN",
    codename: "CONTRARIAN",
    tagline: "What if you're\nall wrong?",
    quote: "The crowd is always wrong. I'll prove it.",
    description:
      "The Contrarian's superpower is questioning every assumption. They find the angle no one expected, flip the narrative completely, and make the crowd wonder if they believed the wrong thing all along.",
    specialties: ["Devil's Advocacy", "Paradigm Shifts", "Logical Paradoxes"],
    wins: "48%",
    power: 70,
    wit: 88,
    precision: 72,
    accentPrimary: "#7C3AED",
    accentSecondary: "#A855F7",
    bgColorA: "rgba(124,58,237,0.18)",
    bgColorB: "rgba(124,58,237,0.03)",
    particleColor: "#A855F7",
    glowColor: "124,58,237",
    entranceType: "flicker",
    persona: {
      color: "#7C3AED",
      secondaryColor: "#A855F7",
      name: "Contrarian",
    } as PersonaConfig,
  },
  {
    id: "professor",
    index: 4,
    name: "THE PROFESSOR",
    codename: "PROFESSOR",
    tagline: "Actually,\nlet me explain…",
    quote: "You presented a claim. I brought a bibliography.",
    description:
      "Measured, thorough, impossible to dismiss. The Professor builds arguments like academic papers — structured, cited, peer-reviewed. Every claim is sourced. Opponents feel like students who forgot to study.",
    specialties: [
      "Academic Citations",
      "Expert Testimony",
      "Structured Arguments",
    ],
    wins: "63%",
    power: 80,
    wit: 72,
    precision: 88,
    accentPrimary: "#059669",
    accentSecondary: "#10B981",
    bgColorA: "rgba(5,150,105,0.14)",
    bgColorB: "rgba(5,150,105,0.02)",
    particleColor: "#10B981",
    glowColor: "5,150,105",
    entranceType: "materialize",
    persona: {
      color: "#059669",
      secondaryColor: "#10B981",
      name: "Professor",
    } as PersonaConfig,
  },
];

type Character = (typeof CHARACTERS)[0];

// ─── Stat bar ─────────────────────────────────────────────────────────────────
function StatBar({
  label,
  value,
  accent,
  delay,
}: {
  label: string;
  value: number;
  accent: string;
  delay: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span
          className="font-mono text-[9px] uppercase tracking-[0.25em]"
          style={{ color: `${accent}80` }}
        >
          {label}
        </span>
        <span
          className="font-mono text-[10px] font-bold"
          style={{ color: accent }}
        >
          {value}
        </span>
      </div>
      <div
        className="h-[3px] w-full rounded-none overflow-hidden"
        style={{ background: `${accent}18` }}
      >
        <motion.div
          className="h-full rounded-none"
          style={{ background: accent }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

// ─── Particle field ───────────────────────────────────────────────────────────
function ParticleField({
  accent,
  count = 24,
}: {
  accent: string;
  count?: number;
}) {
  const particles = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2.5 + 0.5,
    dur: Math.random() * 3 + 2,
    delay: Math.random() * 2,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: accent,
          }}
          animate={{
            opacity: [0, 0.7, 0],
            y: [0, -40 - Math.random() * 60],
            x: [(Math.random() - 0.5) * 30],
            scale: [1, 0.3],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

// ─── Impact flash on transition ───────────────────────────────────────────────
function ImpactFlash({ accent, trigger }: { accent: string; trigger: number }) {
  return (
    <motion.div
      key={trigger}
      className="absolute inset-0 pointer-events-none z-30"
      style={{ background: accent }}
      initial={{ opacity: 0.4 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    />
  );
}

// ─── Scanline overlay ─────────────────────────────────────────────────────────
function Scanlines({ opacity = 0.04 }: { opacity?: number }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,1) 3px,rgba(0,0,0,1) 4px)",
        opacity,
        mixBlendMode: "multiply",
      }}
    />
  );
}

// ─── Character selector strip ─────────────────────────────────────────────────
function SelectorStrip({
  characters,
  activeIndex,
  onSelect,
}: {
  characters: Character[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="flex gap-0 border border-white/8 overflow-hidden">
      {characters.map((c, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(i)}
            className="relative flex-1 py-3 px-2 flex flex-col items-center gap-1.5 transition-all duration-200 group overflow-hidden"
            style={{
              background: isActive
                ? `rgba(${c.glowColor},0.15)`
                : "transparent",
              borderRight:
                i < characters.length - 1
                  ? "0.5px solid rgba(255,255,255,0.06)"
                  : "none",
            }}
          >
            {/* Top accent bar */}
            <motion.div
              className="absolute top-0 left-0 right-0 h-[2px]"
              animate={{
                background: isActive
                  ? `linear-gradient(90deg, transparent, ${c.accentPrimary}, transparent)`
                  : "transparent",
              }}
              transition={{ duration: 0.3 }}
            />

            {/* Avatar circle */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center border transition-all duration-300"
              style={{
                borderColor: isActive
                  ? `${c.accentPrimary}60`
                  : "rgba(255,255,255,0.08)",
                background: isActive
                  ? `rgba(${c.glowColor},0.2)`
                  : "transparent",
              }}
            >
              <span
                className="font-mono text-[10px] font-bold"
                style={{
                  color: isActive ? c.accentPrimary : "rgba(255,255,255,0.25)",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>

            <span
              className="font-mono text-[8px] uppercase tracking-widest leading-none hidden sm:block transition-colors duration-200"
              style={{
                color: isActive ? c.accentPrimary : "rgba(255,255,255,0.2)",
              }}
            >
              {c.codename}
            </span>

            {/* Active pulse dot */}
            {isActive && (
              <motion.div
                className="w-1 h-1 rounded-full"
                style={{ background: c.accentPrimary }}
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main 3D stage ────────────────────────────────────────────────────────────
function CharacterStage({
  character,
  transitionKey,
}: {
  character: Character;
  transitionKey: number;
}) {
  // Entrance variants per character type
  const entranceVariants: Record<
    string,
    { initial: object; animate: object; exit: object }
  > = {
    rise: {
      initial: { opacity: 0, y: 80, scale: 0.85 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: -40, scale: 1.05 },
    },
    slam: {
      initial: { opacity: 0, y: -80, scale: 1.2 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, scale: 0.9, y: 20 },
    },
    charge: {
      initial: { opacity: 0, x: -120, skewX: "-8deg" as any },
      animate: { opacity: 1, x: 0, skewX: "0deg" as any },
      exit: { opacity: 0, x: 120, skewX: "8deg" as any },
    },
    flicker: {
      initial: { opacity: 0, scale: 1.15 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.85 },
    },
    materialize: {
      initial: { opacity: 0, filter: "blur(20px)", scale: 0.9 },
      animate: { opacity: 1, filter: "blur(0px)", scale: 1 },
      exit: { opacity: 0, filter: "blur(12px)", scale: 1.05 },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (entranceVariants[character.entranceType] || entranceVariants.rise) as any;

  return (
    <div className="relative w-full h-full">
      {/* Environmental atmosphere — reacts to character */}
      <motion.div
        key={`bg-${character.id}`}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          background: `
            radial-gradient(ellipse 70% 60% at 50% 100%, ${character.bgColorA} 0%, transparent 70%),
            radial-gradient(ellipse 40% 40% at 50% 50%, ${character.bgColorB} 0%, transparent 100%)
          `,
        }}
      />

      {/* Grid floor perspective */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1/3 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(${character.glowColor},0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(${character.glowColor},0.12) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          maskImage:
            "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)",
          transform: "perspective(300px) rotateX(40deg)",
          transformOrigin: "bottom center",
        }}
      />

      {/* Particle field */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`particles-${character.id}`}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <ParticleField accent={character.accentPrimary} count={20} />
        </motion.div>
      </AnimatePresence>

      {/* The character — full cinematic entrance */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`char-${character.id}-${transitionKey}`}
          className="absolute inset-0"
          initial={v.initial}
          animate={v.animate}
          exit={v.exit}
          transition={{
            duration: 0.5,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <PersonaViewer persona={character.persona} />
        </motion.div>
      </AnimatePresence>

      {/* Impact flash */}
      <ImpactFlash accent={character.accentPrimary} trigger={transitionKey} />

      {/* Scanlines */}
      <Scanlines opacity={0.03} />

      {/* Stage lighting beams */}
      <div
        className="absolute inset-x-0 top-0 h-3/4 pointer-events-none"
        style={{
          background: `conic-gradient(from 270deg at 50% -20%, ${character.bgColorA} 0deg, transparent 60deg, transparent 300deg, ${character.bgColorA} 360deg)`,
          opacity: 0.6,
        }}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function CharacterShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [transitionKey, setTransitionKey] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const character = CHARACTERS[activeIndex];

  const navigate = useCallback(
    (newIndex: number) => {
      if (newIndex === activeIndex) return;
      setDirection(newIndex > activeIndex ? "next" : "prev");
      setTransitionKey((k) => k + 1);
      setActiveIndex(newIndex);
    },
    [activeIndex],
  );

  const navNext = () => navigate((activeIndex + 1) % CHARACTERS.length);
  const navPrev = () =>
    navigate((activeIndex - 1 + CHARACTERS.length) % CHARACTERS.length);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") navNext();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") navPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeIndex]);

  return (
    <section
      id="characters"
      className="relative min-h-screen bg-clash-black overflow-hidden py-0"
    >
      {/* Full-bleed atmospheric background */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`atm-${character.id}`}
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            background: `radial-gradient(ellipse 80% 50% at 50% 100%, rgba(${character.glowColor},0.08) 0%, transparent 70%)`,
          }}
        />
      </AnimatePresence>

      <div className="relative max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 flex flex-col h-screen max-h-[1000px] min-h-[640px]">
        {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-6 pb-0 flex-shrink-0">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <p
              className="font-mono text-[9px] uppercase tracking-[0.4em] mb-0.5"
              style={{ color: `rgba(${character.glowColor},0.6)` }}
            >
              Select Fighter
            </p>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-clash-white uppercase leading-none">
              Choose Your{" "}
              <span style={{ color: character.accentPrimary }}>Persona</span>
            </h2>
          </motion.div>

          {/* Fighter count */}
          <div className="text-right">
            <span
              className="font-mono text-[9px] uppercase tracking-widest block"
              style={{ color: `rgba(${character.glowColor},0.5)` }}
            >
              Fighter
            </span>
            <span
              className="font-display text-2xl font-extrabold leading-none"
              style={{ color: character.accentPrimary }}
            >
              {String(activeIndex + 1).padStart(2, "0")}
            </span>
            <span className="font-mono text-xs text-white/20">
              /{String(CHARACTERS.length).padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* ── SELECTOR STRIP ───────────────────────────────────────────────── */}
       

        {/* ── MAIN ARENA ───────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 pt-4 pb-0 gap-4">
          {/* ── 3D STAGE — takes most space ──────────────────────────────── */}
          <div className="relative flex-1 lg:flex-[0_0_55%] min-h-0 overflow-hidden border border-white/8">
            <CharacterStage
              character={character}
              transitionKey={transitionKey}
            />

            {/* Corner brackets */}
            {[
              "top-0 left-0 border-l-2 border-t-2",
              "top-0 right-0 border-r-2 border-t-2",
              "bottom-0 left-0 border-l-2 border-b-2",
              "bottom-0 right-0 border-r-2 border-b-2",
            ].map((cls, i) => (
              <motion.div
                key={i}
                className={`absolute ${cls} w-5 h-5 pointer-events-none z-20`}
                animate={{ borderColor: `rgba(${character.glowColor},0.5)` }}
                transition={{ duration: 0.4 }}
              />
            ))}

            {/* Navigation arrows on stage */}
            <button
              onClick={navPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center border border-white/10 bg-black/40 hover:border-white/25 hover:bg-black/60 transition-all group"
            >
              <svg
                className="w-3 h-3 text-white/40 group-hover:text-white/80 transition-colors"
                fill="none"
                viewBox="0 0 12 12"
              >
                <path
                  d="M8 2L4 6l4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              onClick={navNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center border border-white/10 bg-black/40 hover:border-white/25 hover:bg-black/60 transition-all group"
            >
              <svg
                className="w-3 h-3 text-white/40 group-hover:text-white/80 transition-colors"
                fill="none"
                viewBox="0 0 12 12"
              >
                <path
                  d="M4 2l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* ── CHARACTER INFO PANEL ──────────────────────────────────────── */}
          <div className="flex-1 lg:flex-[0_0_45%] flex flex-col gap-4 min-h-0 overflow-y-auto pb-4">
            {/* Name card — cinematic reveal */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`name-${character.id}`}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="flex-shrink-0"
              >
                {/* Index + codename */}
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="font-mono text-[9px] uppercase tracking-[0.3em]"
                    style={{ color: `rgba(${character.glowColor},0.6)` }}
                  >
                    Characters · {String(activeIndex + 1).padStart(2, "0")}
                  </span>
                  <div
                    className="h-px flex-1"
                    style={{ background: `rgba(${character.glowColor},0.2)` }}
                  />
                </div>

                {/* Name — big, aggressive */}
                <h3
                  className="font-display text-3xl sm:text-4xl xl:text-5xl font-extrabold uppercase leading-[0.9] mb-2"
                  style={{ color: character.accentPrimary }}
                >
                  {character.name.split(" ").map((word, i) => (
                    <motion.span
                      key={i}
                      className="block"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: i * 0.08,
                        duration: 0.4,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      {word}
                    </motion.span>
                  ))}
                </h3>

                {/* Tagline — split across lines like a fighting game */}
                <div className="mb-3">
                  {character.tagline.split("\n").map((line, i) => (
                    <motion.p
                      key={i}
                      className="font-body text-sm italic leading-tight"
                      style={{ color: `rgba(${character.glowColor},0.7)` }}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.06, duration: 0.35 }}
                    >
                      {line}
                    </motion.p>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Quote card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`quote-${character.id}`}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.35, delay: 0.1 }}
                className="flex-shrink-0 border-l-2 pl-4 py-1"
                style={{ borderColor: character.accentPrimary }}
              >
                <p
                  className="font-display text-sm sm:text-base font-bold italic leading-snug"
                  style={{ color: "rgba(245,245,240,0.9)" }}
                >
                  "{character.quote}"
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Description */}
            <AnimatePresence mode="wait">
              <motion.p
                key={`desc-${character.id}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="flex-shrink-0 font-body text-sm text-white/50 leading-relaxed"
              >
                {character.description}
              </motion.p>
            </AnimatePresence>

            {/* Stats — the power readout */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`stats-${character.id}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="flex-shrink-0 border border-white/8 p-4"
                style={{ background: `rgba(${character.glowColor},0.04)` }}
              >
                {/* Win rate headline */}
                <div className="flex items-baseline gap-3 mb-4">
                  <span
                    className="font-display text-4xl font-extrabold leading-none"
                    style={{ color: character.accentPrimary }}
                  >
                    {character.wins}
                  </span>
                  <div>
                    <p
                      className="font-mono text-[9px] uppercase tracking-widest"
                      style={{ color: `rgba(${character.glowColor},0.6)` }}
                    >
                      Win rate
                    </p>
                    <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest">
                      Avg battles
                    </p>
                  </div>
                </div>

                {/* Stat bars */}
                <div className="flex flex-col gap-3">
                  <StatBar
                    label="Power"
                    value={character.power}
                    accent={character.accentPrimary}
                    delay={0.3}
                  />
                  <StatBar
                    label="Wit"
                    value={character.wit}
                    accent={character.accentPrimary}
                    delay={0.4}
                  />
                  <StatBar
                    label="Precision"
                    value={character.precision}
                    accent={character.accentPrimary}
                    delay={0.5}
                  />
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Specialties */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`spec-${character.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, delay: 0.25 }}
                className="flex-shrink-0 flex flex-wrap gap-2"
              >
                {character.specialties.map((s, i) => (
                  <motion.span
                    key={s}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 + i * 0.06 }}
                    className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border"
                    style={{
                      borderColor: `rgba(${character.glowColor},0.3)`,
                      color: character.accentPrimary,
                      background: `rgba(${character.glowColor},0.08)`,
                    }}
                  >
                    {s}
                  </motion.span>
                ))}
              </motion.div>
            </AnimatePresence>

            {/* CTA */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`cta-${character.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, delay: 0.35 }}
                className="flex-shrink-0 flex items-center gap-3 mt-auto pt-2"
              >
                <a
                  href={`/build?persona=${character.id}`}
                  className="relative inline-flex items-center gap-2.5 px-6 py-3 font-display text-xs font-bold uppercase tracking-widest text-black overflow-hidden group"
                  style={{ background: character.accentPrimary }}
                >
                  <motion.div
                    className="absolute inset-0 bg-white/20"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "100%" }}
                    transition={{ duration: 0.35 }}
                  />
                  <span className="relative">
                    Fight as {character.codename}
                  </span>
                  <svg
                    className="relative w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                    fill="none"
                    viewBox="0 0 14 14"
                  >
                    <path
                      d="M1 7h12M8 2l5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>

                <button
                  onClick={navNext}
                  className="inline-flex items-center gap-2 px-4 py-3 font-mono text-[10px] uppercase tracking-widest border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-all"
                >
                  Next
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
                    <path
                      d="M4 2l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ── BOTTOM PROGRESS BAR ───────────────────────────────────────────── */}
        <div className="pb-6 pt-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            {CHARACTERS.map((c, i) => (
              <button
                key={c.id}
                onClick={() => navigate(i)}
                className="relative h-[2px] flex-1 overflow-hidden transition-all duration-300"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                {i === activeIndex && (
                  <motion.div
                    key={transitionKey}
                    className="absolute inset-y-0 left-0 h-full"
                    style={{ background: c.accentPrimary }}
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 8, ease: "linear" }}
                    onAnimationComplete={navNext}
                  />
                )}
                {i < activeIndex && (
                  <div
                    className="absolute inset-0"
                    style={{ background: `rgba(${c.glowColor},0.4)` }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Bottom label row */}
          <div className="flex items-center justify-between mt-2">
            <span className="font-mono text-[9px] uppercase tracking-widest text-white/20">
              Use ← → keys to navigate
            </span>
            <span
              className="font-mono text-[9px] uppercase tracking-widest"
              style={{ color: `rgba(${character.glowColor},0.5)` }}
            >
              {CHARACTERS.map((c) => c.codename).join(" · ")}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
