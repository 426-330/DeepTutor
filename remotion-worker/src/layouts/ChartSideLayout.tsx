import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import {BulletList, Subline} from './shared.js';
import type {LayoutProps} from './types.js';

/** chart-side：图表主区（约 2/3 宽）+ 侧注栏。 */
export const ChartSideLayout: React.FC<LayoutProps> = ({content}) => {
  const {colors} = useTheme();
  return (
    <div style={{flex: 1, display: 'flex', gap: 48}}>
      <div style={{flex: 2, minWidth: 0, display: 'flex'}}>{content.visual}</div>
      <div
        style={{
          flex: 1,
          borderLeft: `2px solid ${colors.border}`,
          paddingLeft: 40,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 28,
        }}
      >
        {content.insight ? (
          <Subline text={content.insight} size={28} color={colors.accent} />
        ) : null}
        {content.headline ? <Subline text={content.headline} size={30} /> : null}
        {content.bullets && content.bullets.length > 0 ? (
          <BulletList items={content.bullets} size={24} />
        ) : null}
      </div>
    </div>
  );
};
