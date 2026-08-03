import React from 'react';
import {BulletList, Headline, Subline} from './shared.js';
import type {LayoutProps} from './types.js';

/** stacked：上下堆叠——视觉在上，文字/要点在下。 */
export const StackedLayout: React.FC<LayoutProps> = ({content}) => {
  return (
    <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 36}}>
      <div style={{flex: 3, minHeight: 0, display: 'flex'}}>{content.visual}</div>
      <div
        style={{
          flex: 2,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        {content.headline ? <Headline text={content.headline} size={44} /> : null}
        {content.subline ? <Subline text={content.subline} size={28} /> : null}
        {content.bullets && content.bullets.length > 0 ? (
          <BulletList items={content.bullets} size={26} />
        ) : null}
        {content.callout ? <Subline text={content.callout} size={24} /> : null}
      </div>
    </div>
  );
};
