"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef, useMemo, Suspense } from "react";
import * as THREE from "three";

// ─── Agent Figure ────────────────────────────────────────────────────────────

interface AgentFigureProps {
  side: "left" | "right";
  color: string;
  isActive?: boolean;
}

function AgentFigure({ side, color, isActive = false }: AgentFigureProps) {
  const x = side === "left" ? -1.25 : 1.25;
  const groupRef = useRef<THREE.Group>(null!);
  const leftArmRef = useRef<THREE.Mesh>(null!);
  const rightArmRef = useRef<THREE.Mesh>(null!);

  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.18,
        roughness: 0.55,
        metalness: 0.15,
      }),
    [color]
  );

  const eyeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        emissive: "#ffffff",
        emissiveIntensity: 4,
      }),
    []
  );

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const phase = side === "left" ? 0 : Math.PI;

    // Idle float
    groupRef.current.position.y = Math.sin(t * 1.3 + phase) * 0.06;

    // Face inward
    groupRef.current.rotation.y = side === "left" ? 0.35 : -0.35;

    if (isActive) {
      // Arguing: rock body
      groupRef.current.rotation.z =
        (side === "left" ? -1 : 1) * Math.abs(Math.sin(t * 9)) * 0.12;

      // Pump arms
      if (leftArmRef.current) {
        leftArmRef.current.rotation.z = Math.sin(t * 10) * 0.4;
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.z = -Math.sin(t * 10 + 0.5) * 0.3;
      }
    } else {
      groupRef.current.rotation.z = Math.sin(t * 0.7 + phase) * 0.015;
      if (leftArmRef.current) leftArmRef.current.rotation.z = 0;
      if (rightArmRef.current) rightArmRef.current.rotation.z = 0;
    }
  });

  const eyeX = side === "left" ? [0.09, -0.09] : [-0.09, 0.09];

  return (
    <group ref={groupRef} position={[x, -0.25, 0]}>
      {/* Body */}
      <mesh material={bodyMat} castShadow>
        <boxGeometry args={[0.44, 0.54, 0.28]} />
      </mesh>

      {/* Head */}
      <mesh material={bodyMat} position={[0, 0.52, 0]} castShadow>
        <boxGeometry args={[0.4, 0.38, 0.28]} />
      </mesh>

      {/* Eyes */}
      <mesh material={eyeMat} position={[eyeX[0], 0.54, 0.15]}>
        <sphereGeometry args={[0.048, 8, 8]} />
      </mesh>
      <mesh material={eyeMat} position={[eyeX[1], 0.54, 0.15]}>
        <sphereGeometry args={[0.048, 8, 8]} />
      </mesh>

      {/* Left arm */}
      <mesh ref={leftArmRef} material={bodyMat} position={[-0.33, 0.06, 0]} castShadow>
        <boxGeometry args={[0.17, 0.4, 0.2]} />
      </mesh>

      {/* Right arm */}
      <mesh ref={rightArmRef} material={bodyMat} position={[0.33, 0.06, 0]} castShadow>
        <boxGeometry args={[0.17, 0.4, 0.2]} />
      </mesh>

      {/* Left leg */}
      <mesh material={bodyMat} position={[-0.14, -0.47, 0]} castShadow>
        <boxGeometry args={[0.16, 0.34, 0.2]} />
      </mesh>

      {/* Right leg */}
      <mesh material={bodyMat} position={[0.14, -0.47, 0]} castShadow>
        <boxGeometry args={[0.16, 0.34, 0.2]} />
      </mesh>

      {/* Atmospheric glow */}
      <pointLight color={color} intensity={1.5} distance={2.8} decay={2} />
    </group>
  );
}

// ─── Energy Arcs ─────────────────────────────────────────────────────────────

function EnergyArcs() {
  const arc1Ref = useRef<THREE.Mesh>(null!);
  const arc2Ref = useRef<THREE.Mesh>(null!);
  const mat1Ref = useRef<THREE.MeshBasicMaterial>(null!);
  const mat2Ref = useRef<THREE.MeshBasicMaterial>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (arc1Ref.current) {
      arc1Ref.current.scale.y = 0.014 + Math.abs(Math.sin(t * 18)) * 0.05;
      arc1Ref.current.position.y = Math.sin(t * 5) * 0.04 - 0.25;
    }
    if (arc2Ref.current) {
      arc2Ref.current.scale.y = 0.009 + Math.abs(Math.sin(t * 22 + 1.2)) * 0.035;
      arc2Ref.current.position.y = Math.sin(t * 7 + 2) * 0.06 - 0.28;
    }
    if (mat1Ref.current) {
      mat1Ref.current.opacity = 0.25 + Math.abs(Math.sin(t * 14)) * 0.55;
    }
    if (mat2Ref.current) {
      mat2Ref.current.opacity = 0.15 + Math.abs(Math.sin(t * 16 + 1)) * 0.4;
    }
  });

  return (
    <>
      <mesh ref={arc1Ref} position={[0, -0.25, 0.1]}>
        <boxGeometry args={[2.2, 0.014, 0.04]} />
        <meshBasicMaterial ref={mat1Ref} color="#FFB800" transparent opacity={0.5} />
      </mesh>
      <mesh ref={arc2Ref} position={[0, -0.28, 0.07]}>
        <boxGeometry args={[1.9, 0.009, 0.03]} />
        <meshBasicMaterial ref={mat2Ref} color="#1A3FBE" transparent opacity={0.4} />
      </mesh>
    </>
  );
}

// ─── Floating Particles ───────────────────────────────────────────────────────

function FloatingParticles() {
  const pointsRef = useRef<THREE.Points>(null!);

  const { positions, colors } = useMemo(() => {
    const count = 180;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const goldColor = new THREE.Color("#FFB800");
    const blueColor = new THREE.Color("#1A3FBE");
    const whiteColor = new THREE.Color("#ffffff");

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4 - 2;

      const r = Math.random();
      const c = r < 0.4 ? goldColor : r < 0.7 ? blueColor : whiteColor;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { positions, colors };
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.035;
    pointsRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.25) * 0.04;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.048}
        vertexColors
        transparent
        opacity={0.45}
        sizeAttenuation
      />
    </points>
  );
}

// ─── Camera Rig ───────────────────────────────────────────────────────────────

function CameraRig() {
  const { camera } = useThree();

  useFrame((state) => {
    const px = state.pointer.x;
    const py = state.pointer.y;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, px * 0.5, 0.025);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, py * 0.25 + 0.2, 0.025);
    camera.lookAt(0, -0.05, 0);
  });

  return null;
}

// ─── Scene ───────────────────────────────────────────────────────────────────

function HeroScene({ activeAgent }: { activeAgent?: "A" | "B" }) {
  return (
    <>
      <ambientLight intensity={0.12} />
      <directionalLight position={[0, 5, 4]} intensity={0.3} />
      <Suspense fallback={null}>
        <AgentFigure side="left" color="#FFB800" isActive={activeAgent === "A"} />
        <AgentFigure side="right" color="#1A3FBE" isActive={activeAgent === "B"} />
        <EnergyArcs />
        <FloatingParticles />
        <CameraRig />
      </Suspense>
    </>
  );
}

// ─── Canvas Export ─────────────────────────────────────────────────────────

interface HeroArenaProps {
  activeAgent?: "A" | "B";
}

export default function HeroArena({ activeAgent }: HeroArenaProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.2, 3.6], fov: 54 }}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      style={{ background: "transparent", width: "100%", height: "100%" }}
      dpr={[1, 2]}
    >
      <HeroScene activeAgent={activeAgent} />
    </Canvas>
  );
}
