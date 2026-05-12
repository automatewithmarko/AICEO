// src/components/stagedemo/VoiceOrb.jsx
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { vertexShader, fragmentShader } from './blobShader';

function Blob({ audioLevel = 0, bassLevel = 0, isActive = false }) {
  const meshRef = useRef();
  const materialRef = useRef();

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAudioLevel: { value: 0 },
    uBassLevel: { value: 0 },
    uDisplacement: { value: 0.3 },
  }), []);

  useFrame((state) => {
    if (!materialRef.current) return;
    const t = state.clock.getElapsedTime();
    materialRef.current.uniforms.uTime.value = t;

    // Smooth audio values — much more reactive when active
    const target = isActive ? audioLevel * 1.5 : 0.05;
    const current = materialRef.current.uniforms.uAudioLevel.value;
    materialRef.current.uniforms.uAudioLevel.value += (target - current) * 0.25;

    const bassTarget = isActive ? bassLevel * 2.0 : 0.02;
    const bassCurrent = materialRef.current.uniforms.uBassLevel.value;
    materialRef.current.uniforms.uBassLevel.value += (bassTarget - bassCurrent) * 0.2;

    // Scale displacement — much more aggressive morphing when active
    const dispTarget = isActive ? 0.7 + audioLevel * 1.2 : 0.3;
    const dispCurrent = materialRef.current.uniforms.uDisplacement.value;
    materialRef.current.uniforms.uDisplacement.value += (dispTarget - dispCurrent) * 0.15;

    // Gentle rotation
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.1;
      meshRef.current.rotation.x = Math.sin(t * 0.05) * 0.1;
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.4, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

export default function VoiceOrb({ audioLevel, bassLevel, isActive, scale = 1 }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 45 }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}
      gl={{ alpha: true, antialias: true }}
    >
      <ambientLight intensity={0.2} />
      <group scale={scale}>
        <Blob audioLevel={audioLevel} bassLevel={bassLevel} isActive={isActive} />
      </group>
    </Canvas>
  );
}
