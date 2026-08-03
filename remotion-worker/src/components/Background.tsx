/**
 * Scene background per effects.background (DSL §5). All colors from context.
 * `particles` renders the referenced skill component (R3F, task 6.2) on top of
 * a gradient base; the parser degrades missing/uninstalled skills to gradient
 * (+ warning) before render, and the web preview renders gradient only.
 */
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {SkillHost} from './SkillHost.js';
import {useTheme} from './ThemeProvider.js';

export const Background: React.FC = () => {
  const {colors, effects} = useTheme();

  if (effects.background.type === 'gradient') {
    return (
      <AbsoluteFill
        style={{
          background: `linear-gradient(135deg, ${colors.background} 0%, ${colors.surface} 100%)`,
        }}
      />
    );
  }

  if (effects.background.type === 'particles') {
    return (
      <>
        {/* 渐变底托住（技能未注册/加载失败时画面不空） */}
        <AbsoluteFill
          style={{
            background: `linear-gradient(135deg, ${colors.background} 0%, ${colors.surface} 100%)`,
          }}
        />
        <SkillHost
          skill={effects.background.skill ?? ''}
          params={effects.background.params ?? {}}
          colors={colors}
        />
      </>
    );
  }

  return <AbsoluteFill style={{backgroundColor: colors.background}} />;
};
