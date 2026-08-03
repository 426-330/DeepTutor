/**
 * Stand-in card for the `visual` slot. DSL visual fields are generation
 * instructions (for asset_gen, M2); until real assets exist we render the
 * description as a framed card so layout and typography stay truthful.
 */
import React from 'react';
import {useTheme} from './ThemeProvider.js';

export const VisualCard: React.FC<{text: string; emphasis?: string}> = ({
  text,
  emphasis,
}) => {
  const {colors, fonts} = useTheme();
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: 240,
        border: `2px solid ${colors.border}`,
        borderRadius: 20,
        backgroundColor: colors.surface,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        padding: 40,
      }}
    >
      <div
        style={{
          color: colors.secondary,
          fontFamily: fonts.body.family,
          fontWeight: fonts.body.weight,
          fontSize: 26,
          lineHeight: 1.5,
          textAlign: 'center',
        }}
      >
        {text}
      </div>
      {emphasis ? (
        <div
          style={{
            color: colors.accent,
            fontFamily: fonts.title.family,
            fontWeight: fonts.title.weight,
            fontSize: 24,
          }}
        >
          {emphasis}
        </div>
      ) : null}
    </div>
  );
};
