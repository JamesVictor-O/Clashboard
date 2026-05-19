"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface AgentCharacterProps {
  position: [number, number, number];
  color: string;
  isActive: boolean;
  isArguing: boolean;
  side: "A" | "B";
}

/**
 * Three.js agent mesh — stylized humanoid figure with:
 * - Body (torso)
 * - Head with glowing eyes
 * - Arms that animate when arguing (rolling/rocking)
 * - Idle bob animation
 * - Glow effect when active
 */
export function AgentCharacter({
  position,
  color,
  isActive,
  isArguing,
  side,
}: AgentCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);

  const threeColor = new THREE.Color(color);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;

    // Idle bob — always active
    groupRef.current.position.y = position[1] + Math.sin(t * 1.8) * 0.04;

    // Head subtle look-around
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.6) * 0.15;
    }

    if (isArguing) {
      // Arguing animation — arms raise and rock
      if (leftArmRef.current) {
        leftArmRef.current.rotation.z = -0.6 + Math.sin(t * 4) * 0.3;
        leftArmRef.current.rotation.x = Math.sin(t * 3) * 0.2;
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.z = 0.6 + Math.sin(t * 4 + Math.PI) * 0.3;
        rightArmRef.current.rotation.x = Math.sin(t * 3 + 0.5) * 0.2;
      }
      // Body rock
      groupRef.current.rotation.z = Math.sin(t * 3) * 0.05;
      // Glow pulse
      if (glowRef.current) {
        glowRef.current.intensity = 1.5 + Math.sin(t * 6) * 0.5;
      }
    } else {
      // Idle arm position
      if (leftArmRef.current) {
        leftArmRef.current.rotation.z = THREE.MathUtils.lerp(
          leftArmRef.current.rotation.z,
          -0.2,
          0.05
        );
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
          leftArmRef.current.rotation.x,
          0,
          0.05
        );
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.z,
          0.2,
          0.05
        );
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.x,
          0,
          0.05
        );
      }
      groupRef.current.rotation.z = THREE.MathUtils.lerp(
        groupRef.current.rotation.z,
        0,
        0.05
      );
      if (glowRef.current) {
        glowRef.current.intensity = THREE.MathUtils.lerp(
          glowRef.current.intensity,
          isActive ? 0.8 : 0.2,
          0.05
        );
      }
    }
  });

  const emissiveIntensity = isActive ? 0.6 : 0.15;

  return (
    <group ref={groupRef} position={position}>
      {/* Glow light */}
      <pointLight
        ref={glowRef}
        color={color}
        intensity={isActive ? 0.8 : 0.2}
        distance={3}
      />

      {/* Torso */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.5, 0.7, 0.3]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={emissiveIntensity}
          roughness={0.3}
          metalness={0.7}
        />
      </mesh>

      {/* Head */}
      <mesh ref={headRef} position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[0.38, 0.38, 0.32]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={emissiveIntensity}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Eyes — left */}
      <mesh position={[-0.1, 0.92, 0.17]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial
          color="#FFFFFF"
          emissive="#FFFFFF"
          emissiveIntensity={isActive ? 2 : 0.5}
        />
      </mesh>

      {/* Eyes — right */}
      <mesh position={[0.1, 0.92, 0.17]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial
          color="#FFFFFF"
          emissive="#FFFFFF"
          emissiveIntensity={isActive ? 2 : 0.5}
        />
      </mesh>

      {/* Left arm */}
      <mesh
        ref={leftArmRef}
        position={[-0.35, 0.3, 0]}
        rotation={[0, 0, -0.2]}
        castShadow
      >
        <capsuleGeometry args={[0.08, 0.45, 4, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={emissiveIntensity * 0.7}
          roughness={0.4}
          metalness={0.6}
        />
      </mesh>

      {/* Right arm */}
      <mesh
        ref={rightArmRef}
        position={[0.35, 0.3, 0]}
        rotation={[0, 0, 0.2]}
        castShadow
      >
        <capsuleGeometry args={[0.08, 0.45, 4, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={emissiveIntensity * 0.7}
          roughness={0.4}
          metalness={0.6}
        />
      </mesh>

      {/* Left leg */}
      <mesh position={[-0.15, -0.35, 0]} castShadow>
        <capsuleGeometry args={[0.09, 0.4, 4, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={emissiveIntensity * 0.5}
          roughness={0.5}
          metalness={0.5}
        />
      </mesh>

      {/* Right leg */}
      <mesh position={[0.15, -0.35, 0]} castShadow>
        <capsuleGeometry args={[0.09, 0.4, 4, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={emissiveIntensity * 0.5}
          roughness={0.5}
          metalness={0.5}
        />
      </mesh>

      {/* Active indicator ring */}
      {isActive && (
        <mesh position={[0, -0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.4, 0.5, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={threeColor}
            emissiveIntensity={1.5}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
    </group>
  );
}
