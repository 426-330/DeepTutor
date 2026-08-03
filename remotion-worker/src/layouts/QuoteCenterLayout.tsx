import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import {Subline} from './shared.js';
import type {LayoutProps} from './types.js';

/** quote-center：居中金句 + 上下装饰线，极简引用页。 */
export const QuoteCenterLayout: React.FC<LayoutProps> = ({content}) => {
  const {colors, fonts} = useTheme();
  const quote = content.quoteText ?? content.headline;
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 40,
        padding: '0 140px',
        textAlign: 'center',
      }}
    >
      <div style={{width: 120, height: 6, backgroundColor: colors.accent, borderRadius: 3}} />
      {quote ? (
        <div
          style={{
            color: colors.text,
            fontFamily: fonts.title.family,
            fontWeight: fonts.title.weight,
            fontSize: 60,
            lineHeight: 1.4,
          }}
        >
          {quote}
        </div>
      ) : null}
      {content.attribution ? (
        <Subline text={`—— ${content.attribution}`} size={28} />
      ) : null}
      {content.footnote ?? content.subline ? (
        <Subline text={(content.footnote ?? content.subline)!} size={24} />
      ) : null}
      <div style={{width: 120, height: 6, backgroundColor: colors.accent, borderRadius: 3}} />
    </div>
  );
};
