/**
 * three/floating-shapes — 漂浮几何体背景。
 * 确定性：位置/旋转全部由 props.frame 驱动（种子化伪随机布点，无 Math.random）。
 */
import React from 'react';
import * as THREE from 'three';

export interface SkillProps {
  colors: Record<string, string>;
  params: Record<string, unknown>;
  width: number;
  height: number;
  frame: number;
  fps: number;
}

type ShapeKind = 'box' | 'sphere' | 'torus' | 'icosahedron';

/** 确定性伪随机（mulberry32 种子序列）。 */
function seeded(i: number): number {
  let t = (i + 1) * 2654435761;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const ShapeGeometry: React.FC<{kind: ShapeKind}> = ({kind}) => {
  switch (kind) {
    case 'box':
      return <boxGeometry args={[0.7, 0.7, 0.7]} />;
    case 'sphere':
      return <sphereGeometry args={[0.45, 24, 24]} />;
    case 'icosahedron':
      return <icosahedronGeometry args={[0.5, 0]} />;
    case 'torus':
    default:
      return <torusGeometry args={[0.5, 0.18, 12, 32]} />;
  }
};

const FloatingShapes: React.FC<SkillProps> = ({colors, params, frame, fps}) => {
  const count = Math.min(30, Math.max(1, Number(params.count ?? 12)));
  const shape = (params.shape as ShapeKind) ?? 'torus';
  const color = (params.color as string) ?? colors.accent;
  const speed = Number(params.speed ?? 1.0);
  const t = (frame / fps) * speed;

  const items = Array.from({length: count}, (_, i) => {
    const bx = (seeded(i * 3) - 0.5) * 14;
    const by = (seeded(i * 3 + 1) - 0.5) * 7;
    const bz = (seeded(i * 3 + 2) - 0.5) * 4 - 1;
    return {
      key: i,
      position: [
        bx + Math.sin(t * 0.5 + i) * 0.6,
        by + Math.sin(t * 0.8 + i * 1.7) * 0.8,
        bz,
      ] as [number, number, number],
      rotation: [t * 0.4 + i, t * 0.3 + i * 0.5, 0] as [number, number, number],
    };
  });

  return (
    <group>
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 6]} intensity={1.2} />
      {items.map((item) => (
        <mesh key={item.key} position={item.position} rotation={item.rotation}>
          <ShapeGeometry kind={shape} />
          <meshStandardMaterial
            color={new THREE.Color(color)}
            roughness={0.35}
            metalness={0.25}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </group>
  );
};

export default FloatingShapes;
