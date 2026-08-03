import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import {BulletList, Headline, Subline} from './shared.js';
import type {LayoutProps} from './types.js';

/** sidebar-left：左侧栏（要点导航）+ 右侧主内容。 */
export const SidebarLeftLayout: React.FC<LayoutProps> = ({content}) => {
  const {colors} = useTheme();
  return (
    <div style={{flex: 1, display: 'flex', gap: 48}}>
      <div
        style={{
          width: 380,
          flexShrink: 0,
          borderRight: `2px solid ${colors.border}`,
          paddingRight: 40,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        {content.bullets && content.bullets.length > 0 ? (
          <BulletList items={content.bullets} size={24} />
        ) : null}
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 28,
          minWidth: 0,
        }}
      >
        {content.headline ? <Headline text={content.headline} size={48} /> : null}
        {content.subline ? <Subline text={content.subline} /> : null}
        {content.visual}
        {content.callout ? <Subline text={content.callout} size={26} /> : null}
      </div>
    </div>
  );
};
