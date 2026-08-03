/**
 * three/particle-wave — 正弦相位驱动的粒子网格波浪背景。
 * 确定性：全部动画由 props.frame 驱动（Remotion 逐帧渲染无墙钟）。
 * 组件契约见同目录 SKILL.md。
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

const GRID_X = 60;
const GRID_Z = 50;

const ParticleWave: React.FC<SkillProps> = ({colors, params, frame, fps}) => {
  const color = (params.color as string) ?? colors.primary;
  const speed = Number(params.speed ?? 1.0);
  const amplitude = Number(params.amplitude ?? 0.6);
  const t = (frame / fps) * speed;

  const positions = useMemo(() => {
    const arr = new Float32Array(GRID_X * GRID_Z * 3);
    let k = 0;
    for (let ix = 0; ix < GRID_X; ix++) {
      for (let iz = 0; iz < GRID_Z; iz++) {
        const x = (ix / (GRID_X - 1) - 0.5) * 16;
        const z = (iz / (GRID_Z - 1) - 0.5) * 12;
        const y =
          Math.sin(x * 0.8 + t * 1.6) * Math.cos(z * 0.7 + t * 1.2) * amplitude;
        arr[k++] = x;
        arr[k++] = y;
        arr[k++] = z;
      }
    }
    return arr;
  }, [t, amplitude]);

  return (
    <points position={[0, -1.2, 0]}>
      <bufferGeometry key={frame}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color={new THREE.Color(color)}
        size={0.055}
        sizeAttenuation
        transparent
        opacity={0.9}
      />
    </points>
  );
};

export default ParticleWave;
