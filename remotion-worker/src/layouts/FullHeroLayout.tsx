import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import {Headline, Subline} from './shared.js';
import type {LayoutProps} from './types.js';

/** full-hero：全屏主视觉 + 大标题（第一屏定调）。 */
export const FullHeroLayout: React.FC<LayoutProps> = ({content}) => {
  const {colors} = useTheme();
  return (
    <div style={{flex: 1, position: 'relative', display: 'flex'}}>
      {content.visual ? (
        <div style={{position: 'absolute', inset: 0, opacity: 0.55}}>
          {content.visual}
        </div>
      ) : null}
      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: 'center',
          textAlign: 'center',
          gap: 24,
          paddingBottom: 40,
        }}
      >
        {content.headline ? (
          <Headline text={content.headline} size={84} color={colors.primary} />
        ) : null}
        {content.subline ? <Subline text={content.subline} size={34} /> : null}
      </div>
    </div>
  );
};
