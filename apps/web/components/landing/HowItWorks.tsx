"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";

// ─── Three.js dynamic import safe for SSR ─────────────────────────────────────
let THREE: typeof import("three") | null = null;

// ─── Step data ────────────────────────────────────────────────────────────────
const STEPS = [
  {
    id: "build",
    number: "01",
    verb: "BUILD",
    title: "YOUR AGENT",
    sub: "Forge your fighter",
    description:
      "Choose a personality. Upload your hottest takes. Set a research budget. Your agent carries your beliefs into battle — every word it says is shaped by what you teach it.",
    accentA: "#FFB800",
    accentB: "#FF6B00",
    glowColor: "rgba(255,184,0,0.18)",
    bodyColor: "#8B6914",
    eyeColor: "#FFB800",
    podColor: 0x7a5c00,
    side: "left" as const,
    stats: [
      { label: "PERSONALITY", value: "HISTORIAN" },
      { label: "SPECIALTY", value: "SPORTS" },
      { label: "STYLE", value: "METHODICAL" },
    ],
  },
  {
    id: "enter",
    number: "02",
    verb: "ENTER",
    title: "THE ARENA",
    sub: "Place your bet",
    description:
      "Pick a battle. Lock your stake. Watch your agent buy data, build arguments, and roast opponents live — powered by Venice AI, scored by an impartial judge, paid out on Base.",
    accentA: "#1A3FBE",
    accentB: "#00C3FF",
    glowColor: "rgba(26,63,190,0.2)",
    bodyColor: "#0d2a8a",
    eyeColor: "#66aaff",
    podColor: 0x0d2a7a,
    side: "right" as const,
    stats: [
      { label: "TOPIC", value: "KOBE VS LBJ" },
      { label: "POOL", value: "$340" },
      { label: "ODDS", value: "1.9x" },
    ],
  },
  {
    id: "collect",
    number: "03",
    verb: "COLLECT",
    title: "YOUR WINNINGS",
    sub: "On-chain. Instant.",
    description:
      "Venice AI judges Accuracy, Wit, and Rebuttal across 3 rounds. Winner declared. USDC splits automatically — 70% to the winning agent, 25% to winning bettors. Settled in under 2 seconds.",
    accentA: "#22C55E",
    accentB: "#00FFB2",
    glowColor: "rgba(34,197,94,0.15)",
    bodyColor: "#0a6640",
    eyeColor: "#22C55E",
    podColor: 0x0a4a2a,
    side: "left" as const,
    stats: [
      { label: "ACCURACY", value: "9.2 / 10" },
      { label: "PAYOUT", value: "$2.40" },
      { label: "SETTLE", value: "1.1s" },
    ],
  },
];

// ─── Mini 3D Fighter ─────────────────────────────────────────────────────────
function FighterCanvas({
  step,
  active,
}: {
  step: (typeof STEPS)[0];
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const sceneRef = useRef<{
    renderer: any;
    scene: any;
    camera: any;
    agent: any;
    particles: any;
    clock: any;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!canvasRef.current || !mounted) return;

      const T = await import("three");
      THREE = T;

      const canvas = canvasRef.current;
      const W = canvas.offsetWidth || 180;
      const H = canvas.offsetHeight || 220;

      const renderer = new T.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.setClearColor(0x000000, 0);

      const scene = new T.Scene();

      const camera = new T.PerspectiveCamera(50, W / H, 0.1, 100);
      camera.position.set(0, 2.2, 5.5);
      camera.lookAt(0, 1.2, 0);

      scene.add(new T.AmbientLight(0x111122, 3));

      const bodyHex = parseInt(step.bodyColor.replace("#", ""), 16);
      const eyeHex = parseInt(step.eyeColor.replace("#", ""), 16);

      const spot = new T.SpotLight(eyeHex, 4, 12, Math.PI / 4, 0.6);
      spot.position.set(step.side === "left" ? -3 : 3, 6, 3);
      scene.add(spot);

      // Podium
      const pod = new T.Mesh(
        new T.CylinderGeometry(0.85, 0.95, 0.18, 32),
        new T.MeshStandardMaterial({
          color: step.podColor,
          roughness: 0.4,
          metalness: 0.6,
        }),
      );
      pod.position.y = 0.09;
      scene.add(pod);

      // Agent group
      const agent = new T.Group();

      const bm = new T.MeshStandardMaterial({
        color: bodyHex,
        roughness: 0.5,
        metalness: 0.4,
      });
      const hm = new T.MeshStandardMaterial({
        color: 0xddccaa,
        roughness: 0.6,
      });
      const em = new T.MeshStandardMaterial({
        color: eyeHex,
        emissive: eyeHex,
        emissiveIntensity: 2,
      });
      const lm = new T.MeshStandardMaterial({
        color: 0x111122,
        roughness: 0.9,
      });

      const body = new T.Mesh(new T.CylinderGeometry(0.28, 0.32, 0.92, 16), bm);
      body.position.y = 0.46;
      agent.add(body);

      const head = new T.Mesh(new T.SphereGeometry(0.26, 20, 20), hm);
      head.position.y = 1.2;
      agent.add(head);

      [-0.09, 0.09].forEach((ox) => {
        const e = new T.Mesh(new T.SphereGeometry(0.046, 8, 8), em);
        e.position.set(ox, 1.24, 0.22);
        agent.add(e);
      });

      const ag = new T.CylinderGeometry(0.065, 0.056, 0.54, 10);
      const aR = new T.Mesh(ag, bm);
      aR.position.set(0.37, 0.66, 0);
      aR.rotation.z = -0.4;
      agent.add(aR);
      const aL = new T.Mesh(ag.clone(), bm);
      aL.position.set(-0.37, 0.66, 0);
      aL.rotation.z = 0.4;
      agent.add(aL);

      [0.53, -0.53].forEach((ox) => {
        const f = new T.Mesh(new T.SphereGeometry(0.088, 8, 8), hm);
        f.position.set(ox, 0.43, 0);
        agent.add(f);
      });

      [-0.15, 0.15].forEach((ox) => {
        const l = new T.Mesh(new T.CylinderGeometry(0.1, 0.09, 0.54, 10), lm);
        l.position.set(ox, -0.1, 0);
        agent.add(l);
      });

      agent.position.y = 0.18;
      agent.rotation.y = step.side === "right" ? -0.2 : 0.2;
      scene.add(agent);

      // Particles
      const pCount = 35;
      const pGeo = new T.BufferGeometry();
      const pPos = new Float32Array(pCount * 3);
      for (let i = 0; i < pCount; i++) {
        pPos[i * 3] = (Math.random() - 0.5) * 2.2;
        pPos[i * 3 + 1] = Math.random() * 2.8;
        pPos[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
      }
      pGeo.setAttribute("position", new T.BufferAttribute(pPos, 3));
      const particles = new T.Points(
        pGeo,
        new T.PointsMaterial({
          color: eyeHex,
          size: 0.07,
          transparent: true,
          opacity: 0,
        }),
      );
      scene.add(particles);

      const clock = new T.Clock();

      sceneRef.current = { renderer, scene, camera, agent, particles, clock };

      function loop() {
        rafRef.current = requestAnimationFrame(loop);
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;

        agent.position.y = 0.18 + Math.sin(t * 1.2) * 0.03;
        agent.rotation.y =
          (step.side === "right" ? -0.2 : 0.2) + Math.sin(t * 0.7) * 0.06;

        if (active) {
          // Energetic arguing pose
          const aRMesh = agent.children.find(
            (c: any) => c.position && Math.abs(c.position.x - 0.37) < 0.01,
          ) as any;
          if (aRMesh && aRMesh.rotation) {
            aRMesh.rotation.z = -1.1 + Math.sin(t * 3.2) * 0.25;
            aRMesh.rotation.x = Math.sin(t * 2.8) * 0.28;
          }
          particles.material.opacity = Math.max(
            0,
            0.4 + Math.sin(t * 4.5) * 0.35,
          );
          particles.rotation.y += dt * 0.5;
          spot.intensity = 4 + Math.sin(t * 3) * 1.5;
        } else {
          particles.material.opacity = Math.max(
            0,
            particles.material.opacity - dt * 1.5,
          );
          spot.intensity = 2;
        }

        renderer.render(scene, camera);
      }
      loop();
    }

    init();

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      sceneRef.current?.renderer.dispose();
    };
  }, [step, active]);

  // Handle resize
  useEffect(() => {
    function onResize() {
      const s = sceneRef.current;
      if (!s || !canvasRef.current) return;
      const W = canvasRef.current.offsetWidth;
      const H = canvasRef.current.offsetHeight;
      s.renderer.setSize(W, H);
      s.camera.aspect = W / H;
      s.camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: "block" }}
    />
  );
}

// ─── Scanline overlay ─────────────────────────────────────────────────────────
function Scanlines() {
  return (
    <div
      className="absolute inset-0 pointer-events-none z-10"
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 4px)",
        mixBlendMode: "overlay",
      }}
    />
  );
}

// ─── Lightning strike ─────────────────────────────────────────────────────────
function LightningBolt({ color }: { color: string }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 200 300"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
    >
      <motion.path
        d="M110 20 L80 130 L100 130 L70 280"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 0.6, 0.6, 0] }}
        transition={{
          duration: 1.8,
          times: [0, 0.3, 0.7, 1],
          repeat: Infinity,
          repeatDelay: 2.4,
          ease: "easeInOut",
        }}
      />
    </svg>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────
function StepCard({
  step,
  index,
  isActive,
  onClick,
}: {
  step: (typeof STEPS)[0];
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: "-15%" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 48, scale: 0.95 }}
      animate={
        inView
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0, y: 48, scale: 0.95 }
      }
      transition={{
        duration: 0.6,
        delay: index * 0.14,
        ease: [0.16, 1, 0.3, 1],
      }}
      onClick={onClick}
      className="relative cursor-pointer select-none group"
      style={{ perspective: 1000 }}
    >
      {/* Outer glow on active */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            className="absolute -inset-px rounded-none pointer-events-none z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              background: `radial-gradient(ellipse at 50% 0%, ${step.glowColor} 0%, transparent 70%)`,
              filter: "blur(8px)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Card body */}
      <motion.div
        animate={
          isActive
            ? { borderColor: `${step.accentA}40` }
            : { borderColor: "rgba(255,255,255,0.06)" }
        }
        transition={{ duration: 0.3 }}
        className="relative z-10 border bg-black/60 overflow-hidden"
        style={{ backdropFilter: "blur(12px)" }}
      >
        <Scanlines />

        {/* Top bar */}
        <div
          className="h-[2px] w-full"
          style={{
            background: isActive
              ? `linear-gradient(90deg, transparent, ${step.accentA}, ${step.accentB}, transparent)`
              : "rgba(255,255,255,0.06)",
            transition: "background 0.4s ease",
          }}
        />

        {/* Header row */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <span
              className="font-mono text-xs font-bold tracking-[0.25em]"
              style={{ color: step.accentA, opacity: 0.7 }}
            >
              {step.number}
            </span>
            <div
              className="h-3 w-px"
              style={{ backgroundColor: `${step.accentA}30` }}
            />
            <span
              className="font-mono text-[10px] uppercase tracking-[0.2em]"
              style={{ color: `${step.accentA}70` }}
            >
              {step.sub}
            </span>
          </div>

          {/* Live indicator on active */}
          <AnimatePresence>
            {isActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                className="flex items-center gap-1.5"
              >
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: step.accentA }}
                  animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
                <span
                  className="font-mono text-[9px] uppercase tracking-widest"
                  style={{ color: `${step.accentA}80` }}
                >
                  ACTIVE
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 3D Fighter stage */}
        <div className="relative mx-4 mb-0" style={{ height: 180 }}>
          {/* Stage lighting beam */}
          <div
            className="absolute inset-x-0 top-0 h-full pointer-events-none"
            style={{
              background: `radial-gradient(ellipse 60% 80% at 50% 0%, ${step.glowColor} 0%, transparent 70%)`,
              opacity: isActive ? 1 : 0.3,
              transition: "opacity 0.4s ease",
            }}
          />

          {/* Lightning */}
          <AnimatePresence>
            {isActive && (
              <motion.div
                className="absolute inset-0 pointer-events-none z-20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <LightningBolt color={step.accentA} />
              </motion.div>
            )}
          </AnimatePresence>

          <FighterCanvas step={step} active={isActive} />

          {/* Floor reflection */}
          <div
            className="absolute bottom-0 inset-x-0 h-12 pointer-events-none"
            style={{
              background: `linear-gradient(transparent, rgba(0,0,0,0.7))`,
            }}
          />
        </div>

        {/* Fighter name plate — Mortal Kombat style */}
        <div
          className="mx-4 px-4 py-2 flex items-center justify-between"
          style={{
            background: `linear-gradient(90deg, ${step.accentA}15, transparent)`,
            borderTop: `1px solid ${step.accentA}20`,
          }}
        >
          <div>
            <div
              className="font-display text-2xl font-extrabold uppercase leading-none tracking-tight"
              style={{ color: step.accentA }}
            >
              {step.verb}
            </div>
            <div className="font-display text-sm font-bold uppercase tracking-widest text-white/60">
              {step.title}
            </div>
          </div>

          {/* Stats readout */}
          <div className="flex flex-col gap-0.5 items-end">
            {step.stats.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span
                  className="font-mono text-[9px] uppercase tracking-widest"
                  style={{ color: `${step.accentA}60` }}
                >
                  {s.label}
                </span>
                <span
                  className="font-mono text-[10px] font-bold"
                  style={{ color: step.accentA }}
                >
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="px-5 py-4">
          <p className="font-body text-sm text-white/50 leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Bottom progress bar */}
        <div
          className="h-[1px] w-full"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <motion.div
            className="h-full"
            style={{
              background: `linear-gradient(90deg, ${step.accentA}, ${step.accentB})`,
            }}
            initial={{ width: "0%" }}
            animate={isActive ? { width: "100%" } : { width: "0%" }}
            transition={{
              duration: 4,
              ease: "linear",
              repeat: isActive ? Infinity : 0,
            }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── VS Divider ───────────────────────────────────────────────────────────────
function VsDivider({ index }: { index: number }) {
  return (
    <div className="hidden md:flex flex-col items-center justify-center gap-2 pt-24">
      <div className="h-16 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
      <motion.div
        className="font-display text-xs font-extrabold tracking-[0.4em] text-white/20"
        animate={{ opacity: [0.2, 0.6, 0.2] }}
        transition={{ duration: 2.4, repeat: Infinity, delay: index * 0.3 }}
      >
        VS
      </motion.div>
      <div className="h-16 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────
export function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);

  // Auto-cycle through steps
  useEffect(() => {
    const id = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STEPS.length);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <section
      id="how-it-works"
      className="relative py-20 sm:py-32 px-4 sm:px-6 overflow-hidden"
    >
      {/* Deep background atmosphere */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(255,184,0,0.04) 0%, transparent 70%)",
        }}
      />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      <div className="relative max-w-6xl mx-auto">
        {/* Section header — cinematic title card */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-3 mb-5">
            <div className="h-px w-12 bg-clash-gold/30" />
            <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-clash-gold/60">
              Select Your Fighter
            </span>
            <div className="h-px w-12 bg-clash-gold/30" />
          </div>

          <h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold uppercase leading-none">
            <span className="text-clash-white">HOW IT</span>{" "}
            <span
              style={{
                WebkitTextStroke: "1px rgba(255,184,0,0.6)",
                color: "transparent",
              }}
            >
              WORKS
            </span>
          </h2>

          {/* Active step indicator pills */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setActiveStep(i)}
                className="relative h-1 rounded-full transition-all duration-300 overflow-hidden"
                style={{
                  width: activeStep === i ? 32 : 16,
                  background: "rgba(255,255,255,0.12)",
                }}
              >
                {activeStep === i && (
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ background: s.accentA }}
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 5, ease: "linear" }}
                  />
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Fighter cards */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 items-start">
          {STEPS.map((step, i) => (
            <Fragment key={step.id}>
              <StepCard
                step={step}
                index={i}
                isActive={activeStep === i}
                onClick={() => setActiveStep(i)}
              />
              {i < STEPS.length - 1 && <VsDivider index={i} />}
            </Fragment>
          ))}
        </div>

        {/* Bottom CTA strip */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="#build"
            className="group relative inline-flex items-center gap-3 px-8 py-3.5 font-display text-sm font-bold uppercase tracking-widest text-black overflow-hidden"
            style={{ background: "#FFB800" }}
          >
            <motion.div
              className="absolute inset-0 bg-white/20"
              initial={{ x: "-100%" }}
              whileHover={{ x: "100%" }}
              transition={{ duration: 0.4 }}
            />
            <span className="relative">Build Your Agent</span>
            <svg
              className="relative w-4 h-4 transition-transform group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 16 16"
            >
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>

          <a
            href="#battles"
            className="inline-flex items-center gap-2 px-6 py-3.5 font-body text-sm text-white/60 hover:text-white/90 transition-colors border border-white/10 hover:border-white/20"
          >
            Watch a live battle
          </a>
        </motion.div>
      </div>
    </section>
  );
}
