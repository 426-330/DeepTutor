import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import {Subline} from './shared.js';
import type {LayoutProps} from './types.js';

/** number-spotlight：超大数字居中聚焦，单位与参照系环绕。 */
export const NumberSpotlightLayout: React.FC<LayoutProps> = ({content}) => {
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
        gap: 28,
      }}
    >
      <div style={{display: 'flex', alignItems: 'baseline', gap: 24}}>
        <div
          style={{
            color: colors.primary,
            fontFamily: fonts.number.family,
            fontWeight: fonts.number.weight,
            fontSize: 220,
            lineHeight: 1,
          }}
        >
          {content.bigNumber ?? content.headline}
        </div>
        {content.unit ? (
          <div
            style={{
              color: colors.secondary,
              fontFamily: fonts.title.family,
              fontWeight: fonts.title.weight,
              fontSize: 56,
            }}
          >
            {content.unit}
          </div>
        ) : null}
      </div>
      {content.subline ? <Subline text={content.subline} size={32} /> : null}
      {content.callout ? (
        <Subline text={content.callout} size={28} color={colors.accent} />
      ) : null}
    </div>
  );
};
