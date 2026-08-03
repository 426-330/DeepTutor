import React from 'react';
import {Headline, Subline} from './shared.js';
import type {LayoutProps} from './types.js';

/** text-focus：纯文字聚焦——一句大字 + 一行小注。 */
export const TextFocusLayout: React.FC<LayoutProps> = ({content}) => {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        gap: 32,
        padding: '0 120px',
      }}
    >
      {content.headline ? <Headline text={content.headline} size={76} /> : null}
      {content.footnote ?? content.subline ? (
        <Subline text={(content.footnote ?? content.subline)!} size={28} />
      ) : null}
    </div>
  );
};
