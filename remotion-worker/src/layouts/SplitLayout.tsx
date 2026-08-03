import React from 'react';
import {BulletList, Headline, Subline} from './shared.js';
import type {LayoutProps} from './types.js';

/** split：左右分栏，左文右图，叙述与视觉并行。 */
export const SplitLayout: React.FC<LayoutProps> = ({content}) => {
  return (
    <div style={{flex: 1, display: 'flex', gap: 56}}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 28,
        }}
      >
        {content.headline ? <Headline text={content.headline} size={52} /> : null}
        {content.subline ? <Subline text={content.subline} /> : null}
        {content.bullets && content.bullets.length > 0 ? (
          <BulletList items={content.bullets} />
        ) : null}
        {content.callout ? <Subline text={content.callout} size={26} /> : null}
      </div>
      <div style={{flex: 1, display: 'flex', minHeight: 0}}>{content.visual}</div>
    </div>
  );
};
