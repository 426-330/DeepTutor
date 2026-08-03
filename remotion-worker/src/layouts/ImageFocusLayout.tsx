import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import type {LayoutProps} from './types.js';

/** image-focus：大图主视觉 + 角标说明。 */
export const ImageFocusLayout: React.FC<LayoutProps> = ({content}) => {
  const {colors, fonts} = useTheme();
  return (
    <div style={{flex: 1, position: 'relative', display: 'flex'}}>
      <div style={{flex: 1, display: 'flex'}}>{content.visual}</div>
      {content.insight ?? content.subline ? (
        <div
          style={{
            position: 'absolute',
            right: 24,
            bottom: 24,
            maxWidth: '45%',
            backgroundColor: colors.surface,
            border: `2px solid ${colors.accent}`,
            borderRadius: 16,
            padding: '20px 28px',
            color: colors.text,
            fontFamily: fonts.body.family,
            fontWeight: fonts.body.weight,
            fontSize: 26,
            lineHeight: 1.4,
          }}
        >
          {content.insight ?? content.subline}
        </div>
      ) : null}
    </div>
  );
};
