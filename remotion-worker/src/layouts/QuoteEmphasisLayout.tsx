import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import {Subline} from './shared.js';
import type {LayoutProps} from './types.js';

/** quote-emphasis：金句大字强调 + 背景压暗，情绪点与记忆点。 */
export const QuoteEmphasisLayout: React.FC<LayoutProps> = ({content}) => {
  const {colors, fonts} = useTheme();
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        gap: 40,
        padding: '0 100px',
      }}
    >
      <div
        style={{
          color: colors.accent,
          fontFamily: fonts.title.family,
          fontWeight: fonts.title.weight,
          fontSize: 120,
          lineHeight: 0.6,
        }}
      >
        「
      </div>
      {content.headline ? (
        <div
          style={{
            color: colors.text,
            fontFamily: fonts.title.family,
            fontWeight: fonts.title.weight,
            fontSize: 68,
            lineHeight: 1.35,
          }}
        >
          {content.headline}
        </div>
      ) : null}
      {content.subline ? <Subline text={content.subline} size={30} /> : null}
    </div>
  );
};
