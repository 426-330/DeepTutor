import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import {Headline} from './shared.js';
import type {LayoutProps} from './types.js';

/** full-bleed：全出血主视觉铺满，标题压角。 */
export const FullBleedLayout: React.FC<LayoutProps> = ({content}) => {
  const {colors} = useTheme();
  return (
    <div style={{flex: 1, position: 'relative', display: 'flex', margin: '-56px -72px'}}>
      {content.visual ? (
        <div style={{position: 'absolute', inset: 0}}>{content.visual}</div>
      ) : null}
      {content.headline ? (
        <div
          style={{
            position: 'absolute',
            left: 64,
            bottom: 48,
            right: 64,
            textShadow: `0 2px 12px ${colors.background}`,
          }}
        >
          <Headline text={content.headline} size={72} color={colors.text} />
        </div>
      ) : null}
    </div>
  );
};
