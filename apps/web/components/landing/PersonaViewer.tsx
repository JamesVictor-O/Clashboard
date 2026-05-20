"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useMemo, Suspense, useEffect } from "react";
import * as THREE from "three";

export interface PersonaConfig {
  color: string;
  secondaryColor: string;
  name: string;
}

// ─── Platform ────────────────────────────────────────────────────────────────

function Platform({ color }: { color: string }) {
  const ringRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (ringRef.current) {
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.35 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
    }
  });

  return (
    <group position={[0, -1.05, 0]}>
      {/* Base disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.85, 0.95, 0.06, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.1}
          roughness={0.7}
          metalness={0.4}
        />
      </mesh>
      {/* Glow ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <torusGeometry args={[0.88, 0.018, 8, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>
      {/* Floor light */}
      <pointLight color={color} intensity={0.6} distance={2.5} position={[0, 0.2, 0]} />
    </group>
  );
}

// ─── Character Body ───────────────────────────────────────────────────────────

interface CharacterProps {
  persona: PersonaConfig;
}

function Character({ persona }: CharacterProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const prevColorRef = useRef(persona.color);

  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: persona.color,
        emissive: persona.color,
        emissiveIntensity: 0.2,
        roughness: 0.5,
        metalness: 0.1,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persona.color]
  );

  const eyeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        emissive: "#ffffff",
        emissiveIntensity: 5,
      }),
    []
  );

  const accentMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: persona.secondaryColor,
        emissive: persona.secondaryColor,
        emissiveIntensity: 0.4,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persona.secondaryColor]
  );

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.y += 0.006;
    groupRef.current.position.y = Math.sin(t * 1.4) * 0.05;
  });

  return (
    <group ref={groupRef} position={[0, -0.1, 0]}>
      {/* Body */}
      <mesh material={bodyMat} castShadow>
        <boxGeometry args={[0.5, 0.6, 0.32]} />
      </mesh>

      {/* Chest accent stripe */}
      <mesh material={accentMat} position={[0, 0.05, 0.17]}>
        <boxGeometry args={[0.28, 0.12, 0.02]} />
      </mesh>

      {/* Head */}
      <mesh material={bodyMat} position={[0, 0.58, 0]} castShadow>
        <boxGeometry args={[0.44, 0.42, 0.32]} />
      </mesh>

      {/* Eyes */}
      <mesh material={eyeMat} position={[-0.1, 0.6, 0.17]}>
        <sphereGeometry args={[0.055, 10, 10]} />
      </mesh>
      <mesh material={eyeMat} position={[0.1, 0.6, 0.17]}>
        <sphereGeometry args={[0.055, 10, 10]} />
      </mesh>

      {/* Iris */}
      <mesh position={[-0.1, 0.6, 0.225]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color={persona.color} />
      </mesh>
      <mesh position={[0.1, 0.6, 0.225]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color={persona.color} />
      </mesh>

      {/* Left arm */}
      <mesh material={bodyMat} position={[-0.38, 0.08, 0]} castShadow>
        <boxGeometry args={[0.19, 0.44, 0.22]} />
      </mesh>

      {/* Right arm */}
      <mesh material={bodyMat} position={[0.38, 0.08, 0]} castShadow>
        <boxGeometry args={[0.19, 0.44, 0.22]} />
      </mesh>

      {/* Left leg */}
      <mesh material={bodyMat} position={[-0.155, -0.52, 0]} castShadow>
        <boxGeometry args={[0.18, 0.38, 0.22]} />
      </mesh>

      {/* Right leg */}
      <mesh material={bodyMat} position={[0.155, -0.52, 0]} castShadow>
        <boxGeometry args={[0.18, 0.38, 0.22]} />
      </mesh>

      {/* Glow aura */}
      <pointLight color={persona.color} intensity={1.2} distance={3} decay={2} position={[0, 0.3, 0.5]} />
    </group>
  );
}

// ─── Orbiting Particles ───────────────────────────────────────────────────────

function OrbitParticles({ color }: { color: string }) {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.6;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.4) * 0.15;
    }
  });

  const dots = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2;
      const r = 1.1 + (i % 3) * 0.15;
      return {
        x: Math.cos(angle) * r,
        y: (Math.random() - 0.5) * 0.8,
        z: Math.sin(angle) * r,
        size: 0.025 + Math.random() * 0.02,
      };
    });
  }, []);

  return (
    <group ref={groupRef}>
      {dots.map((dot, i) => (
        <mesh key={i} position={[dot.x, dot.y, dot.z]}>
          <sphereGeometry args={[dot.size, 6, 6]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function PersonaScene({ persona }: { persona: PersonaConfig }) {
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[2, 4, 3]} intensity={0.4} />
      <Suspense fallback={null}>
        <Character persona={persona} />
        <Platform color={persona.color} />
        <OrbitParticles color={persona.color} />
      </Suspense>
    </>
  );
}

// ─── Canvas Export ─────────────────────────────────────────────────────────

interface PersonaViewerProps {
  persona: PersonaConfig;
}

export default function PersonaViewer({ persona }: PersonaViewerProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.4, 3.2], fov: 52 }}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      style={{ background: "transparent", width: "100%", height: "100%" }}
      dpr={[1, 2]}
    >
      <PersonaScene persona={persona} />
    </Canvas>
  );
}
