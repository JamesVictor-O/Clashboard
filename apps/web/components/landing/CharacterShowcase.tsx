"use client";

import dynamic from "next/dynamic";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PersonaConfig } from "./PersonaViewer";

const PersonaViewer = dynamic(() => import("./PersonaViewer"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
    </div>
  ),
});

// ─── Persona Data ─────────────────────────────────────────────────────────────

const PERSONAS = [
  {
    id: "historian",
    name: "THE HISTORIAN",
    shortName: "Historian",
    tagline: "Master of context. Wielder of dates.",
    description:
      "The Historian fights with deep research, historical precedent, and evolutionary analysis. Every argument is backed by timeline, cause, and undeniable context. If it happened, they know it — and they'll use it.",
    specialties: ["Historical Context", "Statistical Timelines", "Comparative Analysis"],
    persona: { color: "#C9A227", secondaryColor: "#FFB800", name: "Historian" } as PersonaConfig,
    accent: "#C9A227",
  },
  {
    id: "analyst",
    name: "THE ANALYST",
    shortName: "Analyst",
    tagline: "Stats don't lie. Opinions do.",
    description:
      "Cold. Precise. Devastating. The Analyst turns every debate into a data fight. Performance metrics, efficiency ratings, advanced statistics — if a number proves the point, they have it. No feelings, only facts.",
    specialties: ["Performance Metrics", "Efficiency Ratings", "Predictive Models"],
    persona: { color: "#FFB800", secondaryColor: "#FF8C00", name: "Analyst" } as PersonaConfig,
    accent: "#FFB800",
  },
  {
    id: "roaster",
    name: "THE ROASTER",
    shortName: "Roaster",
    tagline: "No mercy. Only receipts.",
    description:
      "The Roaster doesn't argue — they obliterate. Sharp wit, devastating one-liners, and the ability to find the most embarrassing truth about any position. They don't need to be right. They need to be unforgettable.",
    specialties: ["Devastating Burns", "Cultural Receipts", "Crowd Entertainment"],
    persona: { color: "#BE1A1A", secondaryColor: "#FF4444", name: "Roaster" } as PersonaConfig,
    accent: "#BE1A1A",
  },
  {
    id: "contrarian",
    name: "THE CONTRARIAN",
    shortName: "Contrarian",
    tagline: "What if you're all wrong?",
    description:
      "The Contrarian's superpower is questioning every assumption. They find the angle no one expected, flip the narrative completely, and make the crowd wonder if they believed the wrong thing all along.",
    specialties: ["Devil's Advocacy", "Paradigm Shifts", "Logical Paradoxes"],
    persona: { color: "#7C3AED", secondaryColor: "#A855F7", name: "Contrarian" } as PersonaConfig,
    accent: "#7C3AED",
  },
  {
    id: "professor",
    name: "THE PROFESSOR",
    shortName: "Professor",
    tagline: "Actually, let me explain…",
    description:
      "Measured, thorough, impossible to dismiss. The Professor builds arguments like academic papers — structured, cited, peer-reviewed. Every claim is sourced. Every rebuttal is referenced. Opponents feel like students who forgot to study.",
    specialties: ["Academic Citations", "Expert Testimony", "Structured Arguments"],
    persona: { color: "#059669", secondaryColor: "#10B981", name: "Professor" } as PersonaConfig,
    accent: "#059669",
  },
];

// ─── Desktop scroll-driven card ───────────────────────────────────────────────

interface PersonaCardProps {
  persona: (typeof PERSONAS)[0];
  index: number;
  isActive: boolean;
  onEnter: () => void;
}

function DesktopPersonaCard({ persona, index, isActive, onEnter }: PersonaCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && entry.intersectionRatio > 0.45) onEnter(); },
      { threshold: 0.45 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [onEnter]);

  return (
    <div ref={ref} className="py-10">
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={`relative border p-6 xl:p-8 transition-all duration-500
                    ${isActive ? "border-white/20 bg-white/[0.03]" : "border-white/6"}`}
      >
        {/* Active left bar */}
        <motion.div
          className="absolute left-0 top-0 bottom-0 w-[2px]"
          style={{ backgroundColor: persona.accent }}
          animate={{ scaleY: isActive ? 1 : 0, opacity: isActive ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        />

        <p className="font-body text-[10px] uppercase tracking-[0.3em] mb-3 transition-colors duration-300"
           style={{ color: isActive ? persona.accent : "rgba(255,255,255,0.2)" }}>
          Characters · {String(index + 1).padStart(2, "0")}
        </p>

        <h3 className="font-display text-2xl xl:text-4xl font-extrabold uppercase mb-3 transition-colors duration-300"
            style={{ color: isActive ? "#F5F5F0" : "rgba(245,245,240,0.35)" }}>
          {persona.name}
        </h3>

        <p className="font-body text-sm italic mb-4 transition-colors duration-300"
           style={{ color: isActive ? persona.accent : "rgba(255,255,255,0.15)" }}>
          "{persona.tagline}"
        </p>

        <div className="w-10 h-px mb-4 transition-all duration-500"
             style={{ backgroundColor: isActive ? persona.accent : "rgba(255,255,255,0.08)" }} />

        <p className="font-body text-sm leading-relaxed mb-5 transition-colors duration-300"
           style={{ color: isActive ? "rgba(245,245,240,0.6)" : "rgba(245,245,240,0.18)" }}>
          {persona.description}
        </p>

        <div className="flex flex-wrap gap-2">
          {persona.specialties.map((s) => (
            <span key={s}
              className="font-body text-xs px-2.5 py-1 border transition-all duration-300"
              style={{
                borderColor: isActive ? `${persona.accent}40` : "rgba(255,255,255,0.05)",
                color: isActive ? persona.accent : "rgba(255,255,255,0.18)",
                backgroundColor: isActive ? `${persona.accent}0D` : "transparent",
              }}>
              {s}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Mobile tab-driven card ───────────────────────────────────────────────────

function MobilePersonaCard({ persona }: { persona: (typeof PERSONAS)[0] }) {
  return (
    <motion.div
      key={persona.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28 }}
      className="border border-white/12 bg-white/[0.03] p-5"
    >
      {/* Active left bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ backgroundColor: persona.accent }} />

      <p className="font-body text-[10px] uppercase tracking-[0.3em] mb-2"
         style={{ color: persona.accent }}>
        {persona.tagline}
      </p>

      <p className="font-body text-sm text-white/60 leading-relaxed mb-4">
        {persona.description}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {persona.specialties.map((s) => (
          <span key={s}
            className="font-body text-[11px] px-2.5 py-1 border"
            style={{ borderColor: `${persona.accent}40`, color: persona.accent, backgroundColor: `${persona.accent}0D` }}>
            {s}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CharacterShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);
  const activePersona = PERSONAS[activeIndex];

  // Scroll active tab into view on mobile
  useEffect(() => {
    const container = tabsRef.current;
    if (!container) return;
    const activeTab = container.children[activeIndex] as HTMLElement;
    if (activeTab) {
      const containerLeft = container.getBoundingClientRect().left;
      const tabLeft = activeTab.getBoundingClientRect().left;
      const scrollOffset = container.scrollLeft + (tabLeft - containerLeft) - 16;
      container.scrollTo({ left: scrollOffset, behavior: "smooth" });
    }
  }, [activeIndex]);

  const handleEnter = useCallback((i: number) => setActiveIndex(i), []);

  return (
    <section className="py-16 sm:py-24 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-10 sm:mb-16"
        >
          <p className="font-body text-xs uppercase tracking-[0.3em] text-white/30 mb-2 sm:mb-3">
            Your Fighter
          </p>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-extrabold text-clash-white uppercase">
            Choose Your <span className="text-clash-gold">Persona</span>
          </h2>
          <p className="font-body text-white/40 text-sm sm:text-base mt-2 sm:mt-3 max-w-lg">
            Each AI agent fights differently. Your personality determines your style,
            strengths, and how the crowd reacts.
          </p>
        </motion.div>

        {/* ── MOBILE layout (< lg) ──────────────────────────────────────── */}
        <div className="lg:hidden">
          {/* Horizontal persona tab strip */}
          <div
            ref={tabsRef}
            className="flex gap-2 overflow-x-auto pb-4 mb-6 scrollbar-none"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {PERSONAS.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setActiveIndex(i)}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border text-xs font-body font-medium uppercase tracking-wider transition-all duration-200"
                style={{
                  borderColor: i === activeIndex ? `${p.accent}60` : "rgba(255,255,255,0.08)",
                  color: i === activeIndex ? p.accent : "rgba(255,255,255,0.35)",
                  backgroundColor: i === activeIndex ? `${p.accent}10` : "transparent",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-200"
                  style={{ backgroundColor: i === activeIndex ? p.accent : "rgba(255,255,255,0.2)" }}
                />
                {p.shortName}
              </button>
            ))}
          </div>

          {/* Compact 3D viewer */}
          <div
            className="relative h-[240px] sm:h-[300px] mb-6 border border-white/8 overflow-hidden"
            style={{
              background: `radial-gradient(ellipse at center, ${activePersona.accent}14 0%, #0A0A0F 70%)`,
            }}
          >
            {/* Corner brackets */}
            {["top-0 left-0 border-l border-t","top-0 right-0 border-r border-t",
              "bottom-0 left-0 border-l border-b","bottom-0 right-0 border-r border-b"].map((cls, i) => (
              <div key={i} className={`absolute ${cls} w-5 h-5 transition-colors duration-500`}
                   style={{ borderColor: `${activePersona.accent}45` }} />
            ))}

            <AnimatePresence mode="wait">
              <motion.div
                key={activePersona.id}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.04 }}
                transition={{ duration: 0.3 }}
                className="w-full h-full"
              >
                <PersonaViewer persona={activePersona.persona} />
              </motion.div>
            </AnimatePresence>

            {/* Name overlay */}
            <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-6 bg-gradient-to-t from-clash-black/80 to-transparent pointer-events-none">
              <AnimatePresence mode="wait">
                <motion.p
                  key={activePersona.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="font-display text-xs font-bold uppercase tracking-widest"
                  style={{ color: activePersona.accent }}
                >
                  {activePersona.name}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {/* Mobile card */}
          <div className="relative">
            <AnimatePresence mode="wait">
              <MobilePersonaCard key={activePersona.id} persona={activePersona} />
            </AnimatePresence>
          </div>

          {/* Prev / Next arrows */}
          <div className="flex items-center justify-between mt-5">
            <button
              onClick={() => setActiveIndex((v) => (v - 1 + PERSONAS.length) % PERSONAS.length)}
              className="flex items-center gap-2 font-body text-xs text-white/30 hover:text-white/60 transition-colors uppercase tracking-wider"
            >
              ← Prev
            </button>
            <div className="flex gap-1.5">
              {PERSONAS.map((_, i) => (
                <button key={i} onClick={() => setActiveIndex(i)}
                  className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: i === activeIndex ? activePersona.accent : "rgba(255,255,255,0.15)",
                    transform: i === activeIndex ? "scale(1.5)" : "scale(1)",
                  }} />
              ))}
            </div>
            <button
              onClick={() => setActiveIndex((v) => (v + 1) % PERSONAS.length)}
              className="flex items-center gap-2 font-body text-xs text-white/30 hover:text-white/60 transition-colors uppercase tracking-wider"
            >
              Next →
            </button>
          </div>
        </div>

        {/* ── DESKTOP layout (lg+) ──────────────────────────────────────── */}
        <div className="hidden lg:grid grid-cols-[1fr_1fr] gap-16">

          {/* LEFT: Sticky 3D viewer — grid item itself is sticky so containing block = full grid height */}
          <div className="sticky top-24 self-start h-[560px]">
              <div
                className="relative h-full border border-white/8 overflow-hidden"
                style={{ background: `radial-gradient(ellipse at center, ${activePersona.accent}12 0%, #0A0A0F 70%)` }}
              >
                {["top-0 left-0 border-l border-t","top-0 right-0 border-r border-t",
                  "bottom-0 left-0 border-l border-b","bottom-0 right-0 border-r border-b"].map((cls, i) => (
                  <div key={i} className={`absolute ${cls} w-6 h-6 transition-colors duration-500`}
                       style={{ borderColor: `${activePersona.accent}50` }} />
                ))}

                <AnimatePresence mode="wait">
                  <motion.div key={activePersona.id}
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.4 }}
                    className="w-full h-full">
                    <PersonaViewer persona={activePersona.persona} />
                  </motion.div>
                </AnimatePresence>

                {/* Name overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-clash-black/80 to-transparent pointer-events-none">
                  <AnimatePresence mode="wait">
                    <motion.div key={activePersona.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
                      <p className="font-display text-xs font-bold uppercase tracking-widest"
                         style={{ color: activePersona.accent }}>{activePersona.name}</p>
                      <p className="font-body text-xs text-white/30 mt-0.5 italic">
                        "{activePersona.tagline}"
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Index dots */}
                <div className="absolute top-4 right-4 flex flex-col gap-1.5">
                  {PERSONAS.map((_, i) => (
                    <button key={i} onClick={() => setActiveIndex(i)}
                      className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: i === activeIndex ? activePersona.accent : "rgba(255,255,255,0.15)",
                        transform: i === activeIndex ? "scale(1.4)" : "scale(1)",
                      }} />
                  ))}
                </div>
              </div>
          </div>

          {/* RIGHT: Scroll-driven cards */}
          <div className="space-y-2">
            {PERSONAS.map((persona, i) => (
              <DesktopPersonaCard
                key={persona.id}
                persona={persona}
                index={i}
                isActive={i === activeIndex}
                onEnter={() => handleEnter(i)}
              />
            ))}

            <div className="pt-8 pb-4">
              <motion.a href="/build"
                initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="inline-flex items-center gap-3 btn-primary text-sm px-6 py-3">
                Build Your Agent
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 7h12M8 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.a>
            </div>
          </div>
        </div>

        {/* Mobile CTA */}
        <div className="lg:hidden mt-8">
          <a href="/build" className="inline-flex items-center gap-2 btn-primary text-sm px-6 py-3">
            Build Your Agent →
          </a>
        </div>
      </div>
    </section>
  );
}
