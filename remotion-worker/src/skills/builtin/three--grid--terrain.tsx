/**
 * three/grid-terrain — 滚动线框地形背景（复古合成波风）。
 * 确定性：起伏相位由 props.frame 驱动。
 */
import React, {useMemo} from 'react';
import * as THREE from 'three';

export interface SkillProps {
  colors: Record<string, string>;
  params: Record<string, unknown>;
  width: number;
  height: number;
  frame: number;
  fps: number;
}

const SEG = 48;
const SIZE = 22;

const GridTerrain: React.FC<SkillProps> = ({colors, params, frame, fps}) => {
  const color = (params.color as string) ?? colors.secondary;
  const amplitude = Number(params.amplitude ?? 1.0);
  const speed = Number(params.speed ?? 1.0);
  const t = (frame / fps) * speed;

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y =
        Math.sin(x * 0.5 + t * 1.4) *
          Math.cos(z * 0.45 - t * 1.1) *
          amplitude +
        Math.sin((x + z) * 0.22 + t * 0.7) * amplitude * 0.5;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [t, amplitude]);

  return (
    <group position={[0, -2.2, -2]} rotation={[0.25, 0, 0]}>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={new THREE.Color(color)} wireframe transparent opacity={0.55} />
      </mesh>
    </group>
  );
};

export default GridTerrain;
