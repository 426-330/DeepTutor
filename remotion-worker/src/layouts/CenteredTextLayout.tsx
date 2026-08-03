import React from 'react';
import {Headline, Subline} from './shared.js';
import type {LayoutProps} from './types.js';

/** centered-text：居中单栏文字，适合抛问题与金句。 */
export const CenteredTextLayout: React.FC<LayoutProps> = ({content}) => {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        gap: 36,
        padding: '0 80px',
      }}
    >
      {content.headline ? <Headline text={content.headline} size={72} /> : null}
      {content.subline ? <Subline text={content.subline} size={34} /> : null}
      {content.callout ? <Subline text={content.callout} size={28} /> : null}
    </div>
  );
};
