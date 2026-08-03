import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import {Headline, Subline} from './shared.js';
import type {LayoutProps} from './types.js';

/** title-closing：收尾标题卡，系列引导与下集预告。 */
export const TitleClosingLayout: React.FC<LayoutProps> = ({content}) => {
  const {colors} = useTheme();
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
      }}
    >
      {content.headline ? (
        <Headline text={content.headline} size={80} color={colors.primary} />
      ) : null}
      {content.subline ? <Subline text={content.subline} size={32} /> : null}
      {content.callout ? (
        <Subline text={content.callout} size={28} color={colors.accent} />
      ) : null}
    </div>
  );
};
