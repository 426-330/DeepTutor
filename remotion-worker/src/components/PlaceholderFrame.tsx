/**
 * Placeholder frame — render whitelist degradation (DSL §12, design D8).
 * Unknown scene types, layouts, chart types or missing chart data render as
 * a styled placeholder instead of breaking the render; the corresponding
 * warning is emitted server-side over WS.
 */
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useTheme} from './ThemeProvider.js';

export const PlaceholderFrame: React.FC<{reason: string}> = ({reason}) => {
  const {colors, fonts} = useTheme();
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        padding: 80,
      }}
    >
      <div
        style={{
          border: `3px dashed ${colors.warning}`,
          borderRadius: 24,
          padding: '48px 64px',
          maxWidth: '80%',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            color: colors.warning,
            fontFamily: fonts.title.family,
            fontWeight: fonts.title.weight,
            fontSize: 40,
            marginBottom: 16,
          }}
        >
          占位帧 · 未注册标识
        </div>
        <div
          style={{
            color: colors.textMuted,
            fontFamily: fonts.body.family,
            fontWeight: fonts.body.weight,
            fontSize: 26,
            lineHeight: 1.5,
          }}
        >
          {reason}
        </div>
      </div>
    </AbsoluteFill>
  );
};
