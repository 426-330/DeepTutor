import React from 'react';
import {Card, Headline} from './shared.js';
import type {LayoutProps} from './types.js';

/** card-list：纵向要点卡列表（≤5 条），回顾复盘用。 */
export const CardListLayout: React.FC<LayoutProps> = ({content}) => {
  const items = (content.bullets ?? content.cards ?? []).slice(0, 5);
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 32,
        padding: '0 120px',
      }}
    >
      {content.headline ? <Headline text={content.headline} size={48} /> : null}
      {items.map((item, i) => (
        <Card key={i} text={item} index={i} />
      ))}
    </div>
  );
};
