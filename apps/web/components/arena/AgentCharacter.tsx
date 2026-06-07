"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface AgentCharacterProps {
  position: [number, number, number];
  color: string;
  isActive: boolean;
  isArguing: boolean;
  isStaggered: boolean;
  side: "A" | "B";
}

export function AgentCharacter({
  position,
  color,
  isActive,
  isArguing,
  isStaggered,
  side,
}: AgentCharacterProps) {
  const groupRef    = useRef<THREE.Group>(null);
  const torsoRef    = useRef<THREE.Mesh>(null);
  const headRef     = useRef<THREE.Mesh>(null);
  const leftArmRef  = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const leftLegRef  = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const glowRef     = useRef<THREE.PointLight>(null);
  const eyeLRef     = useRef<THREE.Mesh>(null);
  const eyeRRef     = useRef<THREE.Mesh>(null);

  const threeColor = useMemo(() => new THREE.Color(color), [color]);

  // dir: +1 = side A attacks toward right (+X), -1 = side B attacks toward left (−X)
  const dir = side === "A" ? 1 : -1;

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const t  = clock.elapsedTime;
    const lf = Math.min(delta * 7, 1);   // fast lerp factor
    const ls = Math.min(delta * 2.8, 1); // slow lerp factor

    // ── STAGGERED: hit-flash shake ──────────────────────────────────────────
    if (isStaggered) {
      groupRef.current.position.x = position[0] + Math.sin(t * 38) * 0.1;
      groupRef.current.position.y = position[1] + Math.sin(t * 30) * 0.05;
      if (torsoRef.current) {
        const mat = torsoRef.current.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 3.0 + Math.sin(t * 55) * 1.8;
      }
      if (glowRef.current) glowRef.current.intensity = 6 + Math.sin(t * 32) * 2;
      if (headRef.current) headRef.current.rotation.z = Math.sin(t * 32) * 0.18;
      return;
    }

    // Restore X after stagger
    groupRef.current.position.x = THREE.MathUtils.lerp(
      groupRef.current.position.x, position[0], lf
    );

    // ── ATTACKING ───────────────────────────────────────────────────────────
    if (isArguing) {
      groupRef.current.position.y = position[1] + Math.sin(t * 4.8) * 0.08;

      // Lunge body toward opponent
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, dir * 0.32, lf);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, dir * -0.13, lf);

      // Head thrust forward + slightly down (intense focus)
      if (headRef.current) {
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, dir * 0.2 + Math.sin(t * 3) * 0.04, lf);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, -0.14, ls);
      }

      // Punch arm extends hard toward opponent
      const punchArm = side === "A" ? rightArmRef.current : leftArmRef.current;
      const pullArm  = side === "A" ? leftArmRef.current  : rightArmRef.current;
      if (punchArm) {
        punchArm.rotation.z = THREE.MathUtils.lerp(punchArm.rotation.z, dir * -0.95 + Math.sin(t * 5.5) * 0.2, lf);
        punchArm.rotation.x = THREE.MathUtils.lerp(punchArm.rotation.x, -0.6  + Math.sin(t * 4.5) * 0.2, lf);
      }
      // Pull arm coils back for power
      if (pullArm) {
        pullArm.rotation.z = THREE.MathUtils.lerp(pullArm.rotation.z, dir * 0.48, lf);
        pullArm.rotation.x = THREE.MathUtils.lerp(pullArm.rotation.x, 0.38 + Math.sin(t * 4) * 0.14, lf);
      }

      // Legs: planted, slight weight shift
      if (leftLegRef.current)  leftLegRef.current.rotation.x  = Math.sin(t * 4.2 + 0.6) * 0.09;
      if (rightLegRef.current) rightLegRef.current.rotation.x = Math.sin(t * 4.2)       * 0.09;

      // Eyes blaze
      const eyeGlow = 2.8 + Math.sin(t * 8) * 1.4;
      if (eyeLRef.current) (eyeLRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = eyeGlow;
      if (eyeRRef.current) (eyeRRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = eyeGlow + Math.sin(t * 7 + 0.3) * 0.4;

      // Glow + torso pulse with speech
      if (glowRef.current) glowRef.current.intensity = 2.8 + Math.sin(t * 9) * 1.5;
      if (torsoRef.current) {
        const mat = torsoRef.current.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.78 + Math.sin(t * 6) * 0.3, lf);
      }

    // ── DEFENDING ───────────────────────────────────────────────────────────
    } else if (!isActive) {
      groupRef.current.position.y = position[1] + Math.sin(t * 1.1) * 0.022;

      // Lean back, braced
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, dir * -0.2, ls);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, dir * 0.08, ls);

      // Head slightly bowed
      if (headRef.current) {
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, Math.sin(t * 0.35) * 0.06, ls);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, 0.12, ls);
      }

      // Both arms raised into guard
      if (leftArmRef.current) {
        leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, -0.58, ls);
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, -0.44, ls);
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, 0.58, ls);
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, -0.44, ls);
      }

      // Eyes dim + flicker
      const dimGlow = 0.3 + Math.sin(t * 2.5) * 0.18;
      if (eyeLRef.current) (eyeLRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = dimGlow;
      if (eyeRRef.current) (eyeRRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = dimGlow + Math.sin(t * 2.5 + 0.6) * 0.1;

      if (glowRef.current) glowRef.current.intensity = THREE.MathUtils.lerp(glowRef.current.intensity, 0.1 + Math.sin(t * 2) * 0.06, ls);
      if (torsoRef.current) {
        const mat = torsoRef.current.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.06, ls);
      }

    // ── READY / CHARGING (active, not yet speaking) ─────────────────────────
    } else {
      groupRef.current.position.y = position[1] + Math.sin(t * 2.1) * 0.048;

      // Face opponent, proud stance
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, dir * 0.14, ls);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, 0, ls);

      if (headRef.current) {
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, dir * 0.09 + Math.sin(t * 0.7) * 0.1, ls);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, 0, ls);
      }

      // Arms out — power pose
      if (leftArmRef.current) {
        leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, -0.35, ls);
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, 0, ls);
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, 0.35, ls);
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, 0, ls);
      }

      // Bright + building charge glow
      const chargeGlow = 1.9 + Math.sin(t * 2.4) * 0.55;
      if (eyeLRef.current) (eyeLRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = chargeGlow;
      if (eyeRRef.current) (eyeRRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = chargeGlow + Math.sin(t * 2.4 + 0.45) * 0.3;

      if (glowRef.current) glowRef.current.intensity = THREE.MathUtils.lerp(glowRef.current.intensity, 1.2 + Math.sin(t * 3.0) * 0.45, ls);
      if (torsoRef.current) {
        const mat = torsoRef.current.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.44 + Math.sin(t * 2.1) * 0.12, ls);
      }
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Character glow */}
      <pointLight ref={glowRef} color={color} intensity={isActive ? 1.2 : 0.14} distance={4} />

      {/* Torso */}
      <mesh ref={torsoRef} position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.54, 0.74, 0.33]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={isActive ? 0.44 : 0.1}
          roughness={0.22}
          metalness={0.78}
        />
      </mesh>

      {/* Chest badge — glows like a reactor */}
      <mesh position={[0, 0.34, 0.175]}>
        <boxGeometry args={[0.2, 0.13, 0.02]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={isActive ? 3.2 : 0.55}
          roughness={0.06}
          metalness={0.96}
        />
      </mesh>

      {/* Head */}
      <mesh ref={headRef} position={[0, 0.93, 0]} castShadow>
        <boxGeometry args={[0.42, 0.42, 0.36]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={isActive ? 0.36 : 0.09}
          roughness={0.18}
          metalness={0.82}
        />
      </mesh>

      {/* Left eye */}
      <mesh ref={eyeLRef} position={[-0.11, 0.95, 0.19]}>
        <sphereGeometry args={[0.057, 10, 10]} />
        <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={isActive ? 2.0 : 0.5} />
      </mesh>

      {/* Right eye */}
      <mesh ref={eyeRRef} position={[0.11, 0.95, 0.19]}>
        <sphereGeometry args={[0.057, 10, 10]} />
        <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={isActive ? 2.0 : 0.5} />
      </mesh>

      {/* Left arm */}
      <mesh ref={leftArmRef} position={[-0.38, 0.28, 0]} rotation={[0, 0, -0.2]} castShadow>
        <capsuleGeometry args={[0.088, 0.5, 4, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={isActive ? 0.28 : 0.07}
          roughness={0.38}
          metalness={0.62}
        />
      </mesh>

      {/* Right arm */}
      <mesh ref={rightArmRef} position={[0.38, 0.28, 0]} rotation={[0, 0, 0.2]} castShadow>
        <capsuleGeometry args={[0.088, 0.5, 4, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={isActive ? 0.28 : 0.07}
          roughness={0.38}
          metalness={0.62}
        />
      </mesh>

      {/* Left leg */}
      <mesh ref={leftLegRef} position={[-0.15, -0.4, 0]} castShadow>
        <capsuleGeometry args={[0.092, 0.44, 4, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={isActive ? 0.18 : 0.05}
          roughness={0.5}
          metalness={0.5}
        />
      </mesh>

      {/* Right leg */}
      <mesh ref={rightLegRef} position={[0.15, -0.4, 0]} castShadow>
        <capsuleGeometry args={[0.092, 0.44, 4, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={isActive ? 0.18 : 0.05}
          roughness={0.5}
          metalness={0.5}
        />
      </mesh>

      {/* Active ground halo */}
      {isActive && (
        <mesh position={[0, -0.84, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.44, 0.6, 40]} />
          <meshStandardMaterial
            color={color}
            emissive={threeColor}
            emissiveIntensity={2.2}
            transparent
            opacity={0.88}
          />
        </mesh>
      )}
    </group>
  );
}
