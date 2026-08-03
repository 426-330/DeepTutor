/**
 * SkillHost — three-free mount point for特效技能背景（design D8, task 6.2）。
 *
 * This module deliberately has NO three/@react-three imports so it stays
 * browser-safe for the vendored web preview (scripts/sync-remotion-preview).
 * The worker entry (src/remotion/index.ts) imports src/skills/renderer.tsx,
 * which registers the real R3F implementation; everywhere else (web preview)
 * no renderer is registered and SkillHost renders nothing (gradient fallback
 * underneath stays visible).
 */
import React from 'react';
import type {ResolvedColors} from '../parser/types.js';

export interface SkillRenderProps {
  /** 技能标识，如 "three/particle-wave"。 */
  skill: string;
  /** spec params（颜色 token 已被 impl 解析为 hex）。 */
  params: Record<string, unknown>;
  colors: ResolvedColors;
}

type SkillRendererImpl = React.FC<SkillRenderProps>;

let impl: SkillRendererImpl | null = null;

export function registerSkillRenderer(renderer: SkillRendererImpl): void {
  impl = renderer;
}

export const SkillHost: React.FC<SkillRenderProps> = (props) =>
  impl ? React.createElement(impl, props) : null;
