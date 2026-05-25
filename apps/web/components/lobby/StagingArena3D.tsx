"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ─── Arena floor ──────────────────────────────────────────────────────────────

function ArenaFloor() {
  const meshRef = useRef<THREE.Mesh>(null);

  const gridTexture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0A0A0F";
    ctx.fillRect(0, 0, size, size);
    const step = 32;
    ctx.strokeStyle = "rgba(255,184,0,0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= size; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    }
    for (let y = 0; y <= size; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }
    // Central hex ring glow
    const grad = ctx.createRadialGradient(size/2, size/2, size*0.15, size/2, size/2, size*0.45);
    grad.addColorStop(0, "rgba(255,184,0,0.08)");
    grad.addColorStop(1, "rgba(255,184,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  }, []);

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
      <circleGeometry args={[14, 64]} />
      <meshStandardMaterial map={gridTexture} roughness={0.9} metalness={0.1} />
    </mesh>
  );
}

// ─── Glowing arena ring ───────────────────────────────────────────────────────

function ArenaRing() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.5 + Math.sin(clock.getElapsedTime() * 1.2) * 0.3;
    }
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.48, 0]}>
      <ringGeometry args={[7.8, 8.2, 64]} />
      <meshBasicMaterial color="#FFB800" transparent opacity={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Inner ring spinner ───────────────────────────────────────────────────────

function SpinnerRing({ radius, speed, color }: { radius: number; speed: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * speed;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.45, 0]}>
      <ringGeometry args={[radius - 0.08, radius, 3, 1, 0, Math.PI * 1.1]} />
      <meshBasicMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Agent pillar ─────────────────────────────────────────────────────────────

function AgentPillar({
  position,
  accent,
  name,
  isActive,
  index,
}: {
  position: [number, number, number];
  accent: string;
  name: string;
  isActive: boolean;
  index: number;
}) {
  const bodyRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const beamRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + index * 0.7;
    if (bodyRef.current) {
      bodyRef.current.position.y = position[1] + Math.sin(t * 0.9) * 0.06;
      bodyRef.current.rotation.y = t * 0.4;
    }
    if (headRef.current) {
      headRef.current.position.y = position[1] + 0.75 + Math.sin(t * 0.9) * 0.06;
      headRef.current.rotation.y = t * 0.4;
    }
    if (lightRef.current) {
      lightRef.current.intensity = isActive
        ? 1.8 + Math.sin(t * 2) * 0.8
        : 0.6 + Math.sin(t * 1.5) * 0.3;
    }
    if (beamRef.current) {
      const mat = beamRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.08 + Math.sin(t * 1.3) * 0.05;
    }
  });

  const color = new THREE.Color(accent);

  return (
    <group>
      {/* Floor glow circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[position[0], -1.49, position[2]]}>
        <circleGeometry args={[0.9, 32]} />
        <meshBasicMaterial color={accent} transparent opacity={0.15} />
      </mesh>

      {/* Light beam cylinder */}
      <mesh ref={beamRef} position={[position[0], 2, position[2]]}>
        <cylinderGeometry args={[0.5, 0.15, 8, 16, 1, true]} />
        <meshBasicMaterial color={accent} transparent opacity={0.1} side={THREE.BackSide} />
      </mesh>

      {/* Agent body */}
      <mesh ref={bodyRef} position={[position[0], position[1], position[2]]} castShadow>
        <boxGeometry args={[0.5, 0.65, 0.3]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.4} metalness={0.7} />
      </mesh>

      {/* Agent head */}
      <mesh ref={headRef} position={[position[0], position[1] + 0.75, position[2]]} castShadow>
        <boxGeometry args={[0.38, 0.38, 0.3]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Eyes */}
      {([-0.1, 0.1] as number[]).map((x, i) => (
        <mesh key={i} position={[position[0] + x, position[1] + 0.77, position[2] + 0.16]}>
          <boxGeometry args={[0.07, 0.05, 0.02]} />
          <meshStandardMaterial color="white" emissive="white" emissiveIntensity={6} />
        </mesh>
      ))}

      {/* Point light */}
      <pointLight
        ref={lightRef}
        position={[position[0], position[1] + 1.5, position[2]]}
        color={accent}
        intensity={isActive ? 1.8 : 0.6}
        distance={5}
      />

      {/* Platform disc */}
      <mesh position={[position[0], -1.47, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.04, 32]} />
        <meshStandardMaterial color={accent} emissive={color} emissiveIntensity={0.4} roughness={0.3} metalness={0.8} />
      </mesh>
    </group>
  );
}

// ─── Floating particles ───────────────────────────────────────────────────────

function Particles({ count = 200 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = [
      new THREE.Color("#FFB800"),
      new THREE.Color("#C9A227"),
      new THREE.Color("#7C3AED"),
      new THREE.Color("#BE1A1A"),
      new THREE.Color("#059669"),
      new THREE.Color("#ffffff"),
    ];
    for (let i = 0; i < count; i++) {
      const r = 4 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = -1.5 + Math.random() * 8;
      pos[i * 3 + 2] = Math.sin(theta) * r;
      const c = palette[Math.floor(Math.random() * palette.length)];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    return { positions: pos, colors: col };
  }, [count]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position.array as Float32Array;
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] += 0.004;
      if (pos[i * 3 + 1] > 6.5) pos[i * 3 + 1] = -1.5;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
    ref.current.rotation.y = t * 0.04;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute args={[positions, 3]} attach="attributes-position" />
        <bufferAttribute args={[colors, 3]} attach="attributes-color" />
      </bufferGeometry>
      <pointsMaterial size={0.06} vertexColors transparent opacity={0.8} sizeAttenuation />
    </points>
  );
}

// ─── Atmospheric fog ring ─────────────────────────────────────────────────────

function FogRing() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.08;
  });
  return (
    <mesh ref={ref} position={[0, -1.2, 0]}>
      <torusGeometry args={[9, 1.2, 8, 64]} />
      <meshBasicMaterial color="#FFB800" transparent opacity={0.025} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Slow camera orbit ────────────────────────────────────────────────────────

function CameraOrbit() {
  const { camera } = useThree();
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.08;
    camera.position.x = Math.sin(t) * 16;
    camera.position.z = Math.cos(t) * 16;
    camera.position.y = 7;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// ─── VS connector beam ────────────────────────────────────────────────────────

function VSBeam({ from, to, color }: { from: [number, number, number]; to: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const mid: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2 + 0.5,
    (from[2] + to[2]) / 2,
  ];
  const length = Math.sqrt(
    (to[0] - from[0]) ** 2 + (to[1] - from[1]) ** 2 + (to[2] - from[2]) ** 2
  );
  const angle = Math.atan2(to[0] - from[0], to[2] - from[2]);

  useFrame(({ clock }) => {
    if (ref.current) {
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.15 + Math.sin(clock.getElapsedTime() * 3) * 0.1;
    }
  });

  return (
    <mesh ref={ref} position={mid} rotation={[0, angle, Math.PI / 2]}>
      <cylinderGeometry args={[0.02, 0.02, length, 4]} />
      <meshBasicMaterial color={color} transparent opacity={0.2} />
    </mesh>
  );
}

// ─── Main scene ───────────────────────────────────────────────────────────────

interface AgentSlot {
  name: string;
  accent: string;
  isActive: boolean;
}

interface StagingArena3DProps {
  agents: AgentSlot[];
}

function Scene({ agents }: StagingArena3DProps) {
  const count = Math.min(agents.length, 6);
  const positions = useMemo((): [number, number, number][] => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const r = 5.5;
      return [Math.cos(angle) * r, -0.2, Math.sin(angle) * r];
    });
  }, [count]);

  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[0, 12, 0]} intensity={0.4} color="#FFB800" />
      <pointLight position={[0, 6, 0]} intensity={1.5} color="#FFB800" distance={18} />

      <ArenaFloor />
      <ArenaRing />
      <SpinnerRing radius={5} speed={0.5} color="#FFB800" />
      <SpinnerRing radius={3.2} speed={-0.8} color="#7C3AED" />
      <SpinnerRing radius={1.8} speed={1.1} color="#BE1A1A" />
      <FogRing />
      <Particles count={250} />
      <CameraOrbit />

      {agents.slice(0, 6).map((agent, i) => (
        <AgentPillar
          key={i}
          position={positions[i]}
          accent={agent.accent}
          name={agent.name}
          isActive={agent.isActive}
          index={i}
        />
      ))}

      {/* VS beams between active pairs */}
      {count >= 2 && (
        <VSBeam from={positions[0]} to={positions[Math.floor(count / 2)]} color="#FFB800" />
      )}
      {count >= 4 && (
        <VSBeam from={positions[1]} to={positions[Math.floor(count / 2) + 1]} color="#7C3AED" />
      )}
    </>
  );
}

export default function StagingArena3D({ agents }: StagingArena3DProps) {
  return (
    <Canvas
      camera={{ position: [16, 7, 16], fov: 50 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
    >
      <Scene agents={agents} />
    </Canvas>
  );
}
