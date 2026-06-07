"use client";

import { useRef, useEffect, useState, useCallback, Suspense, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { AgentCharacter } from "./AgentCharacter";
import type { Battle, BattlePhase } from "@/lib/types";

interface ArenaSceneProps {
  battle: Battle;
  activeAgent: "A" | "B";
  currentText: string;
  phase: BattlePhase;
  /** true = real battle text streams in; false = demo, use typewriter */
  liveStreaming?: boolean;
  roundIndex?: number;
  onTextDone?: () => void;
}

// ─── In-Arena Typewriter ───────────────────────────────────────────────────────
// Drives character-by-character display and calls onDone when complete.

function ArenaTypewriter({
  text,
  onDone,
  speed = 13,
}: {
  text: string;
  onDone: () => void;
  speed?: number;
}) {
  const [displayed, setDisplayed] = useState("");
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        onDoneRef.current();
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return (
    <>
      {displayed}
      {displayed.length < text.length && (
        <span className="inline-block w-[2px] h-[1.1em] ml-0.5 bg-current align-middle animate-pulse opacity-80" />
      )}
    </>
  );
}

// ─── Argument Metrics ─────────────────────────────────────────────────────────

function argMetrics(text: string) {
  const words  = text.trim().split(/\s+/).filter(Boolean).length;
  const claims = Math.min(9, Math.max(1, Math.round(words / 18)));
  const heat   = Math.min(99, Math.max(20, words + (text.match(/[!?]/g)?.length ?? 0) * 8));
  return { words, claims, heat };
}

// ─── Stage ────────────────────────────────────────────────────────────────────

function Stage() {
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
        <planeGeometry args={[26, 22]} />
        <meshStandardMaterial color="#07070F" roughness={0.92} metalness={0.12} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 2.5, -7]} receiveShadow>
        <planeGeometry args={[26, 11]} />
        <meshStandardMaterial color="#050508" roughness={1} />
      </mesh>

      {/* Podium A (gold) */}
      <mesh position={[-3, -1.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.35, 0.56, 1.35]} />
        <meshStandardMaterial color="#1A1200" emissive="#FFB800" emissiveIntensity={0.18} roughness={0.3} metalness={0.7} />
      </mesh>

      {/* Podium B (blue) */}
      <mesh position={[3, -1.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.35, 0.56, 1.35]} />
        <meshStandardMaterial color="#08081A" emissive="#1A3FBE" emissiveIntensity={0.18} roughness={0.3} metalness={0.7} />
      </mesh>

      {/* Center divider beam */}
      <mesh position={[0, -1.49, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.042, 7]} />
        <meshStandardMaterial color="#FFB800" emissive="#FFB800" emissiveIntensity={1.4} />
      </mesh>

      {/* Floor rings */}
      {[2.6, 4.4, 6.2, 8.0].map((radius, i) => (
        <mesh key={radius} position={[0, -1.47, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius, radius + 0.018, 96]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? "#FFB800" : "#4466FF"}
            emissive={i % 2 === 0 ? "#FFB800" : "#4466FF"}
            emissiveIntensity={0.22}
            transparent
            opacity={0.22}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Energy Projectile ────────────────────────────────────────────────────────
// Glowing orb shot from the speaking agent toward the opponent.

function EnergyProjectile({
  from,
  to,
  color,
  onArrival,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  onArrival: () => void;
}) {
  const meshRef  = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const progress = useRef(0);
  const done     = useRef(false);
  const cbRef    = useRef(onArrival);
  cbRef.current  = onArrival;

  const threeColor = useMemo(() => new THREE.Color(color), [color]);

  useFrame((_, delta) => {
    if (done.current) return;
    progress.current = Math.min(1, progress.current + delta * 1.7);
    const p = progress.current;

    // Ease in-out cubic
    const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

    const x = THREE.MathUtils.lerp(from[0], to[0], ease);
    const y = THREE.MathUtils.lerp(from[1], to[1], ease) + Math.sin(p * Math.PI) * 0.55;
    const z = THREE.MathUtils.lerp(from[2], to[2], ease);

    if (meshRef.current) {
      meshRef.current.position.set(x, y, z);
      const s = 0.25 + Math.sin(p * Math.PI) * 1.6;
      meshRef.current.scale.setScalar(s);
      (meshRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 4 + Math.sin(p * 22) * 1.2;
    }
    if (lightRef.current) {
      lightRef.current.position.set(x, y, z);
      lightRef.current.intensity = 5 + Math.sin(p * 28) * 1.8;
    }

    if (p >= 1 && !done.current) {
      done.current = true;
      cbRef.current();
    }
  });

  return (
    <>
      <mesh ref={meshRef} position={from}>
        <sphereGeometry args={[0.15, 14, 14]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={5}
          transparent
          opacity={0.94}
        />
      </mesh>
      <pointLight ref={lightRef} color={color} intensity={6} distance={5.5} position={from} />
    </>
  );
}

// ─── Impact Burst ─────────────────────────────────────────────────────────────
// Expanding ring burst + flash sphere at the defender's position.

function ImpactBurst({ position, color }: { position: [number, number, number]; color: string }) {
  const ringsRef = useRef<(THREE.Mesh | null)[]>([null, null, null]);
  const flashRef = useRef<THREE.Mesh>(null);
  const progress = useRef(0);

  useFrame((_, delta) => {
    progress.current = Math.min(1, progress.current + delta * 2.0);
    const p = progress.current;

    ringsRef.current.forEach((ring, i) => {
      if (!ring) return;
      const delay  = i * 0.1;
      const local  = Math.max(0, Math.min(1, (p - delay) / 0.72));
      ring.scale.setScalar(local * (3.5 + i * 2.2));
      (ring.material as THREE.MeshBasicMaterial).opacity = (1 - local) * 0.72;
    });

    if (flashRef.current) {
      const fScale = p < 0.12 ? p / 0.12 : Math.max(0, 1 - (p - 0.12) / 0.5);
      flashRef.current.scale.setScalar(fScale * 2.8);
      (flashRef.current.material as THREE.MeshBasicMaterial).opacity = fScale * 0.75;
    }
  });

  return (
    <group position={position}>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => { ringsRef.current[i] = el; }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.24, 0.46, 40]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.7}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
      <mesh ref={flashRef}>
        <sphereGeometry args={[0.32, 14, 14]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ─── Ground Shockwave ─────────────────────────────────────────────────────────
// Single large expanding ring on the floor under the defender.

function GroundShockwave({ position, color }: { position: [number, number, number]; color: string }) {
  const ringRef  = useRef<THREE.Mesh>(null);
  const progress = useRef(0);

  useFrame((_, delta) => {
    progress.current = Math.min(1, progress.current + delta * 1.35);
    if (!ringRef.current) return;
    ringRef.current.scale.setScalar(progress.current * 9);
    (ringRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - progress.current) * 0.48;
  });

  return (
    <mesh ref={ringRef} position={[position[0], -1.46, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.28, 0.55, 64]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.45}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── Agent Aura ───────────────────────────────────────────────────────────────
// Three orbiting torus rings around the active agent — shows who holds the floor.

function AgentAura({
  position,
  color,
  active,
  intensity,
}: {
  position: [number, number, number];
  color: string;
  active: boolean;
  intensity: number;
}) {
  const groupRef   = useRef<THREE.Group>(null);
  const targetOpac = useRef(0);
  const curOpac    = useRef(0);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;

    targetOpac.current = active ? 1 : 0;
    curOpac.current = THREE.MathUtils.lerp(curOpac.current, targetOpac.current, delta * 2.2);
    const c = curOpac.current;

    groupRef.current.rotation.y = t * 1.85;
    groupRef.current.rotation.z = Math.sin(t * 1.15) * 0.38;

    groupRef.current.children.forEach((child, i) => {
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = c * (0.40 - i * 0.09) * (1 + intensity * 0.55);
      child.scale.setScalar(1 + Math.sin(t * 2.6 + i) * 0.065 * c);
    });
  });

  return (
    <group ref={groupRef} position={[position[0], position[1] + 0.42, position[2]]}>
      {[0.66, 0.84, 1.02].map((r, i) => (
        <mesh key={i} rotation={[(Math.PI / 2.6) * i, 0, (Math.PI / 3.2) * i]}>
          <torusGeometry args={[r, 0.019, 8, 84]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Speech Beam ──────────────────────────────────────────────────────────────
// A thin glowing cylinder from the speaking agent toward the opponent —
// visually represents the argument being fired.

function SpeechBeam({ activeAgent, intensity }: { activeAgent: "A" | "B"; intensity: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = (0.05 + intensity * 0.25) * (0.65 + Math.sin(clock.elapsedTime * 9) * 0.35);
  });

  const color   = activeAgent === "A" ? "#FFB800" : "#4466FF";
  const length  = 5.3;
  const centerX = activeAgent === "A" ? -3 + length / 2 : 3 - length / 2;

  return (
    <mesh ref={meshRef} position={[centerX, 0.2, 0.1]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.013, 0.004, length, 6]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.08}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── Energy Rings (center orbital) ────────────────────────────────────────────

function EnergyRings({ activeAgent, intensity }: { activeAgent: "A" | "B"; intensity: number }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = clock.elapsedTime * (0.55 + intensity * 0.95);
    groupRef.current.rotation.z = Math.sin(clock.elapsedTime * 1.3) * (0.05 + intensity * 0.09);
  });

  const color = activeAgent === "A" ? "#FFB800" : "#4466FF";

  return (
    <group ref={groupRef} position={[0, 0.3, 0]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, (Math.PI / 3) * i]}>
          <torusGeometry args={[2.28 + i * 0.33, 0.013, 8, 128]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.15 + intensity * 1.3 - i * 0.2}
            transparent
            opacity={0.38 + intensity * 0.2 - i * 0.08}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Crowd Silhouettes ────────────────────────────────────────────────────────

function CrowdSilhouettes({ activeAgent, intensity }: { activeAgent: "A" | "B"; intensity: number }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const baseY = child.userData.baseY as number;
      child.rotation.z = Math.sin(t * (0.75 + intensity * 0.55) + i * 0.38) * (0.05 + intensity * 0.05);
      child.position.y  = baseY + Math.sin(t * 1.5 + i * 0.55) * (0.022 + intensity * 0.065);
    });
  });

  const positions: [number, number, number][] = [];
  for (let i = -9.5; i <= 9.5; i += 1.05) {
    positions.push([i, -0.1,  -4.5]);
    positions.push([i,  0.7,  -5.2]);
    positions.push([i,  1.5,  -5.9]);
  }

  return (
    <group ref={groupRef}>
      {positions.map((pos, i) => {
        const isActiveTeam = i % 3 === (activeAgent === "A" ? 0 : 1);
        return (
          <mesh key={i} position={pos} userData={{ baseY: pos[1] }} castShadow>
            <capsuleGeometry args={[0.185, 0.46, 4, 8]} />
            <meshStandardMaterial
              color="#09091B"
              emissive={i % 3 === 0 ? "#FFB800" : i % 3 === 1 ? "#1A3FBE" : "#18182C"}
              emissiveIntensity={isActiveTeam ? 0.52 + intensity * 0.45 : 0.18}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ─── Spotlights ───────────────────────────────────────────────────────────────

function Spotlights({ activeAgent }: { activeAgent: "A" | "B" }) {
  const goldRef = useRef<THREE.SpotLight>(null);
  const blueRef = useRef<THREE.SpotLight>(null);

  useFrame((_, delta) => {
    const lf = Math.min(delta * 4, 1);
    if (goldRef.current) goldRef.current.intensity = THREE.MathUtils.lerp(goldRef.current.intensity, activeAgent === "A" ? 5.8 : 0.75, lf);
    if (blueRef.current) blueRef.current.intensity = THREE.MathUtils.lerp(blueRef.current.intensity, activeAgent === "B" ? 5.8 : 0.75, lf);
  });

  return (
    <>
      <spotLight ref={goldRef} position={[-3, 7, 2]} target-position={[-3, 0, 0]} color="#FFB800" intensity={3} angle={0.38} penumbra={0.5} castShadow />
      <spotLight ref={blueRef} position={[3,  7, 2]} target-position={[3,  0, 0]} color="#4466FF" intensity={0.5} angle={0.38} penumbra={0.5} castShadow />
      <ambientLight intensity={0.11} color="#13131E" />
      <pointLight position={[0, 5, 2]} intensity={0.22} color="#EEEEEE" />
    </>
  );
}

// ─── Camera Rig ───────────────────────────────────────────────────────────────
// Fast punch-cut to the new speaker, then slow dreamy drift.

function CameraRig({ activeAgent, intensity }: { activeAgent: "A" | "B"; intensity: number }) {
  const { camera } = useThree();
  const prevAgent      = useRef(activeAgent);
  const timeSinceSwitch = useRef(999); // start large so initial view is wide

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;

    if (prevAgent.current !== activeAgent) {
      timeSinceSwitch.current = 0;
      prevAgent.current = activeAgent;
    }
    timeSinceSwitch.current += delta;

    const closeUp = timeSinceSwitch.current < 2.0;
    const lf      = closeUp ? Math.min(delta * 2.8, 1) : Math.min(delta * 0.04, 1);

    const speakerX = activeAgent === "A" ? -1.15 : 1.15;
    const targetX  = closeUp
      ? speakerX * 0.55
      : speakerX * 0.30 + Math.sin(t * 0.38) * 0.14;
    const targetZ  = closeUp
      ? 4.6 - intensity * 0.32
      : 6.0 - intensity * 0.28;
    const targetY  = 1.58 + Math.sin(t * 0.72) * (0.036 + intensity * 0.036);

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, lf);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, Math.min(delta * 0.045, 1));
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, lf);
    camera.lookAt(activeAgent === "A" ? -0.3 : 0.3, -0.06, -0.1);
  });

  useEffect(() => {
    camera.position.set(0, 1.58, 6.6);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return null;
}

// ─── Effect state types ───────────────────────────────────────────────────────

interface ProjectileState {
  key: number;
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}
interface ImpactState { key: number; pos: [number, number, number]; color: string }
interface ShockwaveState { key: number; pos: [number, number, number]; color: string }

// ─── Main Scene ───────────────────────────────────────────────────────────────

export function ArenaScene({
  battle,
  activeAgent,
  currentText,
  phase,
  liveStreaming = true,
  roundIndex = 0,
  onTextDone,
}: ArenaSceneProps) {
  const textEnergy = Math.min(1, currentText.length / 650);
  const metrics    = argMetrics(currentText);

  const [projectile, setProjectile]     = useState<ProjectileState | null>(null);
  const [impactBurst, setImpactBurst]   = useState<ImpactState | null>(null);
  const [shockwave, setShockwave]       = useState<ShockwaveState | null>(null);
  const [staggeredSide, setStaggered]   = useState<"A" | "B" | null>(null);

  const prevAgent = useRef(activeAgent);

  // Stable ref holding the arrival callback — reads fresh data at call time.
  const defenderInfoRef = useRef<{
    pos: [number, number, number];
    color: string;
    side: "A" | "B";
    attackerColor: string;
  }>({ pos: [0, 0, 0], color: "#fff", side: "B", attackerColor: "#FFB800" });

  // Fire a projectile whenever the active agent changes during LIVE.
  useEffect(() => {
    if (prevAgent.current === activeAgent || phase !== "LIVE") {
      prevAgent.current = activeAgent;
      return;
    }
    prevAgent.current = activeAgent;

    const attackerPos: [number, number, number] = activeAgent === "A" ? [-2.7, 0.55, 0] : [2.7, 0.55, 0];
    const defenderPos: [number, number, number] = activeAgent === "A" ? [2.7, 0.55, 0]  : [-2.7, 0.55, 0];
    const defendingSide: "A" | "B"             = activeAgent === "A" ? "B" : "A";
    const attackerColor = activeAgent === "A" ? battle.agentA.color : battle.agentB.color;
    const defenderColor = activeAgent === "A" ? battle.agentB.color : battle.agentA.color;

    defenderInfoRef.current = { pos: defenderPos, color: defenderColor, side: defendingSide, attackerColor };
    setProjectile({ key: Date.now(), from: attackerPos, to: defenderPos, color: attackerColor });
  }, [activeAgent, phase, battle.agentA.color, battle.agentB.color]);

  // Called by EnergyProjectile on arrival — triggers hit effects.
  const handleProjectileArrival = useCallback(() => {
    const { pos, color, side, attackerColor } = defenderInfoRef.current;
    setProjectile(null);
    setImpactBurst({ key: Date.now(), pos, color });
    setShockwave({ key: Date.now(), pos, color: attackerColor });
    setStaggered(side);
    setTimeout(() => setImpactBurst(null), 1500);
    setTimeout(() => setShockwave(null), 1300);
    setTimeout(() => setStaggered(null), 720);
  }, []);

  const aColor = battle.agentA.color;
  const bColor = battle.agentB.color;

  const speakerName  = activeAgent === "A" ? battle.agentA.name : battle.agentB.name;
  const speakerRole  = activeAgent === "A" ? battle.agentA.personality : battle.agentB.personality;
  const speakerColor = activeAgent === "A" ? aColor : bColor;
  const isLiveText   = phase === "LIVE" && currentText.trim().length > 0;

  return (
    <div className="relative w-full h-[620px] overflow-hidden border border-white/10 bg-[#080810]">
      {/* CRT scanlines */}
      <div className="absolute inset-0 z-10 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:100%_10px] opacity-28" />
      <div className="absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-clash-gold/55 to-transparent" />

      {/* Ambient color bleed from active agent */}
      <div
        className="absolute inset-0 z-10 pointer-events-none transition-all duration-700"
        style={{
          opacity: 0.38,
          background:
            activeAgent === "A"
              ? `radial-gradient(circle at 20% 62%, ${aColor}22, transparent 32%), radial-gradient(circle at 82% 56%, ${bColor}0A, transparent 26%)`
              : `radial-gradient(circle at 80% 62%, ${bColor}22, transparent 32%), radial-gradient(circle at 18% 56%, ${aColor}0A, transparent 26%)`,
        }}
      />

      {/* ── Three.js Canvas ── */}
      <Canvas
        shadows
        camera={{ position: [0, 1.58, 6.6], fov: 52 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: "#080810" }}
      >
        <Suspense fallback={null}>
          <CameraRig activeAgent={activeAgent} intensity={textEnergy} />
          <Spotlights activeAgent={activeAgent} />
          <Stage />
          <EnergyRings activeAgent={activeAgent} intensity={textEnergy} />
          <CrowdSilhouettes activeAgent={activeAgent} intensity={textEnergy} />

          {/* Speech beam — only while actively speaking */}
          {phase === "LIVE" && currentText && (
            <SpeechBeam activeAgent={activeAgent} intensity={textEnergy} />
          )}

          {/* Agent auras */}
          <AgentAura position={[-3, -0.9, 0]} color={aColor} active={activeAgent === "A"} intensity={textEnergy} />
          <AgentAura position={[3,  -0.9, 0]} color={bColor} active={activeAgent === "B"} intensity={textEnergy} />

          {/* Fighters */}
          <AgentCharacter
            position={[-3, -0.9, 0]}
            color={aColor}
            isActive={activeAgent === "A"}
            isArguing={activeAgent === "A" && phase === "LIVE"}
            isStaggered={staggeredSide === "A"}
            side="A"
          />
          <AgentCharacter
            position={[3, -0.9, 0]}
            color={bColor}
            isActive={activeAgent === "B"}
            isArguing={activeAgent === "B" && phase === "LIVE"}
            isStaggered={staggeredSide === "B"}
            side="B"
          />

          {/* Dynamic hit effects */}
          {projectile && (
            <EnergyProjectile
              key={projectile.key}
              from={projectile.from}
              to={projectile.to}
              color={projectile.color}
              onArrival={handleProjectileArrival}
            />
          )}
          {impactBurst && (
            <ImpactBurst key={impactBurst.key} position={impactBurst.pos} color={impactBurst.color} />
          )}
          {shockwave && (
            <GroundShockwave key={shockwave.key} position={shockwave.pos} color={shockwave.color} />
          )}
        </Suspense>
      </Canvas>

      {/* ── HTML Overlays ── */}

      {/* Topic banner */}
      <div className="absolute left-4 right-4 top-3 pointer-events-none z-20">
        <div className="mx-auto max-w-3xl border border-clash-gold/14 bg-black/58 px-4 py-2 text-center backdrop-blur-sm">
          <p className="font-mono text-[7px] uppercase tracking-[0.38em] text-clash-gold/42">Tonight's Hot Take</p>
          <p className="font-display text-sm sm:text-lg font-extrabold uppercase leading-tight text-white/82 truncate">
            {battle.topic}
          </p>
        </div>
      </div>

      {/* Agent name labels — hidden when text panel is visible */}
      {!isLiveText && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-between px-8 pointer-events-none z-20">
          <div className="text-center">
            <div className="font-display text-sm font-bold" style={{ color: aColor }}>{battle.agentA.name}</div>
            <div className="font-body text-[10px] text-white/32">{battle.agentA.personality}</div>
          </div>
          <div className="text-center">
            <div className="font-display text-sm font-bold" style={{ color: bColor }}>{battle.agentB.name}</div>
            <div className="font-body text-[10px] text-white/32">{battle.agentB.personality}</div>
          </div>
        </div>
      )}

      {/* ── IN-ARENA ARGUMENT PANEL ── */}
      {isLiveText && (
        <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none">
          {/* Gradient fade from the 3D scene above */}
          <div className="h-14 bg-gradient-to-b from-transparent to-black/90" />

          {/* Argument card */}
          <div
            className="bg-black/92 backdrop-blur-md px-5 py-4 border-t"
            style={{ borderColor: `${speakerColor}35` }}
          >
            {/* Top strip: colored accent bar */}
            <div
              className="absolute inset-x-0 top-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, transparent, ${speakerColor}, transparent)` }}
            />

            <div className="grid grid-cols-[auto_1fr] gap-4 items-start max-w-5xl mx-auto">
              {/* Left — speaker identity + live metrics */}
              <div className="min-w-[88px] max-w-[110px] shrink-0">
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ background: speakerColor }}
                  />
                  <span className="font-mono text-[8px] uppercase tracking-widest text-white/35">
                    {activeAgent === "A" ? "Opening" : "Counter"}
                  </span>
                </div>

                <div
                  className="font-display text-base font-extrabold uppercase leading-none mb-0.5"
                  style={{ color: speakerColor }}
                >
                  {speakerName}
                </div>
                <div className="font-body text-[10px] text-white/35 mb-3">{speakerRole}</div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-1">
                  {([
                    ["W", metrics.words],
                    ["C", metrics.claims],
                    ["🔥", metrics.heat],
                  ] as [string, number][]).map(([label, val]) => (
                    <div key={label} className="border border-white/8 bg-black/30 px-1 py-1.5 text-center">
                      <div className="font-display text-xs font-extrabold text-white">{val}</div>
                      <div className="font-mono text-[7px] uppercase tracking-wide text-white/25">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Heat bar */}
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, metrics.heat)}%`,
                      background: speakerColor,
                      boxShadow: `0 0 8px ${speakerColor}`,
                    }}
                  />
                </div>
              </div>

              {/* Right — streaming argument text */}
              <div
                className="rounded-lg border border-white/8 bg-black/25 p-4 min-h-[90px]"
                style={{ borderLeftColor: `${speakerColor}50`, borderLeftWidth: 2 }}
              >
                <p
                  className="font-body text-sm leading-relaxed text-white/88"
                  style={{ color: "rgba(255,255,255,0.88)" }}
                >
                  {liveStreaming ? (
                    <>
                      {currentText}
                      <span
                        className="ml-1 inline-block h-[1.05em] w-[2px] animate-pulse align-middle"
                        style={{ background: speakerColor }}
                      />
                    </>
                  ) : (
                    <ArenaTypewriter
                      key={`${roundIndex}-${activeAgent}`}
                      text={currentText}
                      onDone={onTextDone ?? (() => {})}
                      speed={13}
                    />
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Phase overlays ── */}
      {phase === "BETTING" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-30">
          <div className="text-center">
            <div className="font-display text-3xl font-bold text-clash-gold mb-2">BETTING OPEN</div>
            <div className="font-body text-white/55 text-sm">Place your bets before the battle begins</div>
          </div>
        </div>
      )}
      {phase === "RESEARCH" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px] z-30">
          <div className="text-center border border-clash-gold/25 bg-black/65 px-8 py-5">
            <div className="font-display text-2xl font-bold text-clash-gold mb-2">AGENTS BUYING RESEARCH</div>
            <div className="font-body text-white/48 text-sm">x402 and A2A data rails are preparing the arguments</div>
          </div>
        </div>
      )}
      {phase === "PREPARING" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px] z-30">
          <div className="text-center border border-white/10 bg-black/65 px-8 py-5">
            <div className="font-display text-2xl font-bold text-clash-gold mb-2">SYNCING ARENA</div>
            <div className="font-body text-white/48 text-sm">Loading battle state and agent sessions</div>
          </div>
        </div>
      )}
      {(phase === "ROUND_1" || phase === "ROUND_2" || phase === "ROUND_3") && !currentText && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/22 backdrop-blur-[2px] z-30">
          <div className="text-center border border-white/10 bg-black/65 px-8 py-5">
            <div className="font-display text-2xl font-bold text-clash-gold mb-2">ROUND LIVE</div>
            <div className="font-body text-white/48 text-sm">Waiting for the next argument stream</div>
          </div>
        </div>
      )}
      {phase === "JUDGING_READY" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px] z-30">
          <div className="text-center border border-red-500/25 bg-black/65 px-8 py-5">
            <div className="font-display text-2xl font-bold text-red-300 mb-2">JUDGING READY</div>
            <div className="font-body text-white/48 text-sm">Waiting for verdict and settlement</div>
          </div>
        </div>
      )}
    </div>
  );
}
