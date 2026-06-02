"use client";

import { useRef, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { AgentCharacter } from "./AgentCharacter";
import { SpeechBubble } from "./SpeechBubble";
import type { Battle, BattlePhase } from "@/lib/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ArenaSceneProps {
  battle: Battle;
  activeAgent: "A" | "B";
  currentText: string;
  phase: BattlePhase;
}

// ─── Stage Environment ────────────────────────────────────────────────────────

function Stage() {
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#0D0D1A" roughness={0.8} metalness={0.2} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 2, -6]} receiveShadow>
        <planeGeometry args={[20, 8]} />
        <meshStandardMaterial color="#0A0A14" roughness={1} />
      </mesh>

      {/* Podium A (left — gold) */}
      <mesh position={[-3, -1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.6, 1.2]} />
        <meshStandardMaterial color="#1A1400" emissive="#FFB800" emissiveIntensity={0.15} roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Podium B (right — blue) */}
      <mesh position={[3, -1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.6, 1.2]} />
        <meshStandardMaterial color="#0A0A1A" emissive="#1A3FBE" emissiveIntensity={0.15} roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Center divider line */}
      <mesh position={[0, -1.49, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.04, 6]} />
        <meshStandardMaterial color="#FFB800" emissive="#FFB800" emissiveIntensity={0.8} />
      </mesh>

      {/* Arena floor rings */}
      {[2.6, 4.4, 6.2].map((radius, i) => (
        <mesh key={radius} position={[0, -1.47, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius, radius + 0.018, 96]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? "#FFB800" : "#4466FF"}
            emissive={i % 2 === 0 ? "#FFB800" : "#4466FF"}
            emissiveIntensity={0.28}
            transparent
            opacity={0.28}
          />
        </mesh>
      ))}
    </group>
  );
}

function EnergyRings({ activeAgent }: { activeAgent: "A" | "B" }) {
  const ringRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    ringRef.current.rotation.y = clock.elapsedTime * 0.45;
    ringRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.8) * 0.06;
  });

  const activeColor = activeAgent === "A" ? "#FFB800" : "#4466FF";

  return (
    <group ref={ringRef} position={[0, 0.25, 0]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, (Math.PI / 3) * i]}>
          <torusGeometry args={[2.25 + i * 0.32, 0.012, 8, 128]} />
          <meshStandardMaterial
            color={activeColor}
            emissive={activeColor}
            emissiveIntensity={0.9 - i * 0.18}
            transparent
            opacity={0.42 - i * 0.09}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Crowd Silhouettes ────────────────────────────────────────────────────────

function CrowdSilhouettes() {
  const crowdRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!crowdRef.current) return;
    // Subtle crowd sway
    crowdRef.current.children.forEach((child, i) => {
      child.rotation.z = Math.sin(clock.elapsedTime * 0.8 + i * 0.5) * 0.04;
    });
  });

  const positions: [number, number, number][] = [];
  for (let i = -8; i <= 8; i += 1.2) {
    positions.push([i, -0.2, -4.5]);
    positions.push([i, 0.6, -5.2]);
    positions.push([i, 1.4, -5.8]);
  }

  return (
    <group ref={crowdRef}>
      {positions.map((pos, i) => (
        <mesh key={i} position={pos} castShadow>
          <capsuleGeometry args={[0.2, 0.5, 4, 8]} />
          <meshStandardMaterial
            color="#0A0A1A"
            emissive={i % 3 === 0 ? "#FFB800" : i % 3 === 1 ? "#1A3FBE" : "#1A1A28"}
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Spotlights ───────────────────────────────────────────────────────────────

function Spotlights({ activeAgent }: { activeAgent: "A" | "B" }) {
  const goldLight = useRef<THREE.SpotLight>(null);
  const blueLight = useRef<THREE.SpotLight>(null);

  useFrame(() => {
    if (goldLight.current) {
      goldLight.current.intensity = activeAgent === "A" ? 4.4 : 0.85;
    }
    if (blueLight.current) {
      blueLight.current.intensity = activeAgent === "B" ? 4.4 : 0.85;
    }
  });

  return (
    <>
      {/* Gold spotlight — Agent A */}
      <spotLight
        ref={goldLight}
        position={[-3, 6, 2]}
        target-position={[-3, 0, 0]}
        color="#FFB800"
        intensity={3}
        angle={0.4}
        penumbra={0.5}
        castShadow
      />
      {/* Blue spotlight — Agent B */}
      <spotLight
        ref={blueLight}
        position={[3, 6, 2]}
        target-position={[3, 0, 0]}
        color="#4466FF"
        intensity={0.5}
        angle={0.4}
        penumbra={0.5}
        castShadow
      />
      {/* Ambient fill */}
      <ambientLight intensity={0.15} color="#1A1A28" />
      <pointLight position={[0, 4, 2]} intensity={0.3} color="#F5F5F0" />
    </>
  );
}

// ─── Camera Setup ─────────────────────────────────────────────────────────────

function CameraRig({ activeAgent }: { activeAgent: "A" | "B" }) {
  const { camera } = useThree();

  useFrame(({ clock }) => {
    // Subtle camera drift
    camera.position.x = Math.sin(clock.elapsedTime * 0.1) * 0.3;
    camera.position.y = 1.5 + Math.sin(clock.elapsedTime * 0.15) * 0.1;
    camera.lookAt(0, 0, 0);
  });

  useEffect(() => {
    camera.position.set(0, 1.5, 7);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return null;
}

// ─── Main Scene ───────────────────────────────────────────────────────────────

export function ArenaScene({
  battle,
  activeAgent,
  currentText,
  phase,
}: ArenaSceneProps) {
  return (
    <div className="relative w-full h-[520px] overflow-hidden border border-white/10 bg-black">
      <div className="absolute inset-0 z-10 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:100%_12px] opacity-35" />
      <div className="absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-clash-gold/70 to-transparent" />
      {/* Three.js Canvas */}
      <Canvas
        shadows
        camera={{ position: [0, 1.5, 7], fov: 55 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: "#0A0A0F" }}
      >
        <Suspense fallback={null}>
          <CameraRig activeAgent={activeAgent} />
          <Spotlights activeAgent={activeAgent} />
          <Stage />
          <EnergyRings activeAgent={activeAgent} />
          <CrowdSilhouettes />

          {/* Agent A — left podium */}
          <AgentCharacter
            position={[-3, -0.9, 0]}
            color={battle.agentA.color}
            isActive={activeAgent === "A"}
            isArguing={activeAgent === "A" && phase === "LIVE"}
            side="A"
          />

          {/* Agent B — right podium */}
          <AgentCharacter
            position={[3, -0.9, 0]}
            color={battle.agentB.color}
            isActive={activeAgent === "B"}
            isArguing={activeAgent === "B" && phase === "LIVE"}
            side="B"
          />
        </Suspense>
      </Canvas>

      {/* HTML Overlays */}
      <div className="absolute left-4 right-4 top-4 pointer-events-none">
        <div className="mx-auto max-w-3xl border border-clash-gold/20 bg-black/55 px-4 py-2 text-center backdrop-blur-sm">
          <p className="font-mono text-[8px] uppercase tracking-[0.34em] text-clash-gold/55">
            Tonight's hot take
          </p>
          <p className="font-display text-sm sm:text-lg font-extrabold uppercase leading-tight text-white/84">
            {battle.topic}
          </p>
        </div>
      </div>

      {/* Agent name labels */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-between px-8 pointer-events-none">
        <div className="text-center">
          <div
            className="font-display text-sm font-bold"
            style={{ color: battle.agentA.color }}
          >
            {battle.agentA.name}
          </div>
          <div className="font-body text-xs text-white/40">
            {battle.agentA.personality}
          </div>
        </div>
        <div className="text-center">
          <div
            className="font-display text-sm font-bold"
            style={{ color: battle.agentB.color }}
          >
            {battle.agentB.name}
          </div>
          <div className="font-body text-xs text-white/40">
            {battle.agentB.personality}
          </div>
        </div>
      </div>

      {/* Speech Bubble */}
      {phase === "LIVE" && currentText && (
        <SpeechBubble
          text={currentText}
          side={activeAgent}
          agentColor={
            activeAgent === "A" ? battle.agentA.color : battle.agentB.color
          }
        />
      )}

      {/* Phase overlay */}
      {phase === "BETTING" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="text-center">
            <div className="font-display text-3xl font-bold text-clash-gold mb-2">
              BETTING OPEN
            </div>
            <div className="font-body text-white/60 text-sm">
              Place your bets before the battle begins
            </div>
          </div>
        </div>
      )}

      {phase === "RESEARCH" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2">
          <div className="badge-gold animate-pulse">
            🔍 Agents researching...
          </div>
        </div>
      )}
    </div>
  );
}
