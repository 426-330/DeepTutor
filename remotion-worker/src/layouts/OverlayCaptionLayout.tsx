import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import type {LayoutProps} from './types.js';

/** overlay-caption：全幅视觉 + 底部浮层说明条。 */
export const OverlayCaptionLayout: React.FC<LayoutProps> = ({content}) => {
  const {colors, fonts} = useTheme();
  return (
    <div style={{flex: 1, position: 'relative', display: 'flex'}}>
      <div style={{position: 'absolute', inset: 0, display: 'flex'}}>{content.visual}</div>
      {content.insight ?? content.headline ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '28px 48px',
            background: `linear-gradient(0deg, ${colors.background}F2 0%, ${colors.background}00 130%)`,
            color: colors.text,
            fontFamily: fonts.body.family,
            fontWeight: fonts.body.weight,
            fontSize: 30,
            lineHeight: 1.45,
          }}
        >
          {content.insight ?? content.headline}
        </div>
      ) : null}
    </div>
  );
};
