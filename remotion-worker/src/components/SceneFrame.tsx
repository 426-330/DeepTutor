/**
 * SceneFrame — the uniform outer wrapper for every scene (DSL §12):
 * 标题条 (top) + 内容区 + 字幕区 (bottom) + 风险条位 (reserved slot).
 */
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import type {SubtitleCue} from '../parser/types.js';
import {Background} from './Background.js';
import {useTheme} from './ThemeProvider.js';

function currentSubtitle(
  cues: SubtitleCue[] | undefined,
  fallback: string,
  frame: number,
): string {
  if (!cues || cues.length === 0) return fallback;
  const hit = cues.find((c) => frame >= c.startFrame && frame < c.endFrame);
  return hit?.text ?? '';
}

export const SceneFrame: React.FC<{
  title: string;
  question?: string;
  /** Fallback subtitle when no align cues exist (narration explanation). */
  subtitleFallback?: string;
  cues?: SubtitleCue[];
  /** 风险条内容（预留槽位，M2+ 填充）。 */
  risk?: string;
  children: React.ReactNode;
}> = ({title, question, subtitleFallback, cues, risk, children}) => {
  const {colors, fonts} = useTheme();
  const frame = useCurrentFrame();
  const subtitle = currentSubtitle(cues, subtitleFallback ?? '', frame);

  return (
    <AbsoluteFill>
      <Background />
      {/* 标题条 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '36px 72px 24px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 32,
          borderBottom: `2px solid ${colors.border}`,
          background: `linear-gradient(180deg, ${colors.background}E6 0%, ${colors.background}00 100%)`,
        }}
      >
        <div
          style={{
            width: 10,
            height: 44,
            alignSelf: 'center',
            borderRadius: 5,
            backgroundColor: colors.primary,
            flexShrink: 0,
          }}
        />
        <div
          style={{
            color: colors.text,
            fontFamily: fonts.title.family,
            fontWeight: fonts.title.weight,
            fontSize: 44,
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        {question ? (
          <div
            style={{
              color: colors.secondary,
              fontFamily: fonts.body.family,
              fontWeight: fonts.body.weight,
              fontSize: 26,
            }}
          >
            {question}
          </div>
        ) : null}
      </div>

      {/* 内容区 */}
      <div
        style={{
          position: 'absolute',
          top: 128,
          left: 72,
          right: 72,
          bottom: 140,
          display: 'flex',
        }}
      >
        {children}
      </div>

      {/* 风险条位（预留） */}
      {risk ? (
        <div
          style={{
            position: 'absolute',
            right: 72,
            bottom: 148,
            color: colors.warning,
            fontFamily: fonts.body.family,
            fontWeight: fonts.body.weight,
            fontSize: 20,
          }}
        >
          {risk}
        </div>
      ) : null}

      {/* 字幕区 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          minHeight: 110,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px 120px 36px',
          background: `linear-gradient(0deg, ${colors.background}E6 0%, ${colors.background}00 100%)`,
        }}
      >
        <div
          style={{
            color: colors.text,
            fontFamily: fonts.body.family,
            fontWeight: fonts.body.weight,
            fontSize: 30,
            lineHeight: 1.4,
            textAlign: 'center',
            textShadow: `0 2px 8px ${colors.background}`,
          }}
        >
          {subtitle}
        </div>
      </div>
    </AbsoluteFill>
  );
};
