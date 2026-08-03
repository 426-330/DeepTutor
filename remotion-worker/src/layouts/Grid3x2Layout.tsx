import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import {Headline} from './shared.js';
import type {LayoutProps} from './types.js';

/** grid-3x2：六格网格（3 列 × 2 行），多要点/指标平铺。 */
export const Grid3x2Layout: React.FC<LayoutProps> = ({content}) => {
  const {colors, fonts} = useTheme();
  const cells = content.metrics
    ? content.metrics.map((m) => ({title: m.value, text: m.label, note: m.note}))
    : (content.bullets ?? content.cards ?? []).map((b) => ({title: '', text: b, note: undefined}));
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 36,
      }}
    >
      {content.headline ? (
        <div style={{textAlign: 'center'}}>
          <Headline text={content.headline} size={44} />
        </div>
      ) : null}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 28,
        }}
      >
        {cells.slice(0, 6).map((cell, i) => (
          <div
            key={i}
            style={{
              backgroundColor: colors.surface,
              border: `2px solid ${colors.border}`,
              borderRadius: 16,
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minHeight: 150,
            }}
          >
            {cell.title ? (
              <div
                style={{
                  color: colors.primary,
                  fontFamily: fonts.number.family,
                  fontWeight: fonts.number.weight,
                  fontSize: 40,
                }}
              >
                {cell.title}
              </div>
            ) : null}
            <div
              style={{
                color: colors.text,
                fontFamily: fonts.body.family,
                fontWeight: fonts.body.weight,
                fontSize: 24,
                lineHeight: 1.4,
              }}
            >
              {cell.text}
            </div>
            {cell.note ? (
              <div style={{color: colors.textMuted, fontSize: 20, fontFamily: fonts.body.family}}>
                {cell.note}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};
