import React from 'react';
import {BulletList, Headline, Subline} from './shared.js';
import type {LayoutProps} from './types.js';

/** split-40-60：非对称分栏（左 40% 文 / 右 60% 视觉）。 */
export const Split4060Layout: React.FC<LayoutProps> = ({content}) => {
  return (
    <div style={{flex: 1, display: 'flex', gap: 56}}>
      <div
        style={{
          flex: 4,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 28,
          minWidth: 0,
        }}
      >
        {content.headline ? <Headline text={content.headline} size={44} /> : null}
        {content.subline ? <Subline text={content.subline} size={28} /> : null}
        {content.bullets && content.bullets.length > 0 ? (
          <BulletList items={content.bullets} size={26} />
        ) : null}
      </div>
      <div style={{flex: 6, display: 'flex', minHeight: 0, minWidth: 0}}>
        {content.visual}
      </div>
    </div>
  );
};
