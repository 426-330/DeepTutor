/**
 * R3F skill renderer (worker-only, task 6.2/6.5).
 *
 * Imported for side effects by the Remotion entry (src/remotion/index.ts):
 * registers the real three.js implementation onto the three-free SkillHost.
 * The web preview never imports this module, so its SkillHost stays a no-op
 * (gradient fallback) and web needs no three dependencies.
 *
 * params 中的颜色参数按纪律只允许 token（见各技能 SKILL.md），此处统一把
 * token 名解析为当前生效色板的 hex 再传给技能组件。
 */
import React from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {registerSkillRenderer, type SkillRenderProps} from '../components/SkillHost.js';
import {COLOR_TOKENS, type ColorToken, type ResolvedColors} from '../parser/types.js';
import {SKILL_REGISTRY} from './registry.gen.js';

const TOKEN_SET = new Set<string>(COLOR_TOKENS);

function resolveParams(
  params: Record<string, unknown>,
  colors: ResolvedColors,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] =
      typeof value === 'string' && TOKEN_SET.has(value)
        ? colors[value as ColorToken]
        : value;
  }
  return out;
}

const SkillRendererImpl: React.FC<SkillRenderProps> = ({skill, params, colors}) => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const entry = SKILL_REGISTRY[skill];
  // Parser degrades uninstalled skills before render; this is a second guard.
  if (!entry) return null;
  const Component = entry.Component;
  const merged = resolveParams({...entry.defaults, ...params}, colors);
  return (
    <div style={{position: 'absolute', inset: 0}}>
      <ThreeCanvas width={width} height={height}>
        <Component
          colors={colors}
          params={merged}
          width={width}
          height={height}
          frame={frame}
          fps={fps}
        />
      </ThreeCanvas>
    </div>
  );
};

registerSkillRenderer(SkillRendererImpl);
