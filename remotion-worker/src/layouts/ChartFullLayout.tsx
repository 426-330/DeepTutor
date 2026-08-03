import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import type {LayoutProps} from './types.js';

/** chart-full：全幅图表 + 读图结论底部条。 */
export const ChartFullLayout: React.FC<LayoutProps> = ({content}) => {
  const {colors, fonts} = useTheme();
  return (
    <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 24}}>
      <div style={{flex: 1, minHeight: 0, display: 'flex'}}>{content.visual}</div>
      {content.insight ? (
        <div
          style={{
            backgroundColor: colors.surface,
            borderLeft: `6px solid ${colors.accent}`,
            borderRadius: 12,
            padding: '20px 32px',
            color: colors.text,
            fontFamily: fonts.body.family,
            fontWeight: fonts.body.weight,
            fontSize: 28,
            lineHeight: 1.4,
          }}
        >
          {content.insight}
        </div>
      ) : null}
    </div>
  );
};
