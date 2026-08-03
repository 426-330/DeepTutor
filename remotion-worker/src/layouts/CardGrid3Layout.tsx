import React from 'react';
import {Card, Headline} from './shared.js';
import type {LayoutProps} from './types.js';

/** card-grid-3：三卡网格（恰好 3 卡，结论收束的标准形态）。 */
export const CardGrid3Layout: React.FC<LayoutProps> = ({content}) => {
  const cards = (content.cards ?? []).slice(0, 3);
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 48,
      }}
    >
      {content.headline ? (
        <div style={{textAlign: 'center'}}>
          <Headline text={content.headline} size={56} />
        </div>
      ) : null}
      <div style={{display: 'flex', gap: 36}}>
        {cards.map((c, i) => (
          <Card key={i} text={c} index={i} />
        ))}
      </div>
      {content.subline ? (
        <div style={{textAlign: 'center', fontSize: 28}}>{content.subline}</div>
      ) : null}
    </div>
  );
};
