/**
 * Shared building blocks for the 12 layouts — typography primitives that all
 * read from the theme context (no hardcoded colors/fonts).
 */
import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';

export const Headline: React.FC<{text: string; size?: number; color?: string}> = ({
  text,
  size = 64,
  color,
}) => {
  const {colors, fonts} = useTheme();
  return (
    <div
      style={{
        color: color ?? colors.text,
        fontFamily: fonts.title.family,
        fontWeight: fonts.title.weight,
        fontSize: size,
        lineHeight: 1.25,
      }}
    >
      {text}
    </div>
  );
};

export const Subline: React.FC<{text: string; size?: number; color?: string}> = ({
  text,
  size = 30,
  color,
}) => {
  const {colors, fonts} = useTheme();
  return (
    <div
      style={{
        color: color ?? colors.secondary,
        fontFamily: fonts.body.family,
        fontWeight: fonts.body.weight,
        fontSize: size,
        lineHeight: 1.45,
      }}
    >
      {text}
    </div>
  );
};

export const BulletList: React.FC<{items: string[]; size?: number}> = ({
  items,
  size = 28,
}) => {
  const {colors, fonts} = useTheme();
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
      {items.map((item, i) => (
        <div key={i} style={{display: 'flex', gap: 16, alignItems: 'flex-start'}}>
          <div
            style={{
              width: 12,
              height: 12,
              marginTop: size * 0.45,
              borderRadius: 6,
              backgroundColor: colors.accent,
              flexShrink: 0,
            }}
          />
          <div
            style={{
              color: colors.text,
              fontFamily: fonts.body.family,
              fontWeight: fonts.body.weight,
              fontSize: size,
              lineHeight: 1.45,
            }}
          >
            {item}
          </div>
        </div>
      ))}
    </div>
  );
};

export const Card: React.FC<{text: string; index?: number}> = ({text, index}) => {
  const {colors, fonts} = useTheme();
  return (
    <div
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        border: `2px solid ${colors.border}`,
        borderTop: `6px solid ${colors.primary}`,
        borderRadius: 20,
        padding: '36px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {index !== undefined ? (
        <div
          style={{
            color: colors.accent,
            fontFamily: fonts.number.family,
            fontWeight: fonts.number.weight,
            fontSize: 30,
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </div>
      ) : null}
      <div
        style={{
          color: colors.text,
          fontFamily: fonts.body.family,
          fontWeight: fonts.body.weight,
          fontSize: 28,
          lineHeight: 1.5,
        }}
      >
        {text}
      </div>
    </div>
  );
};
