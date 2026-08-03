import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import type {LayoutProps} from './types.js';

/** comparison-2col：双列对比带列头（A vs B 表格化）。 */
export const Comparison2colLayout: React.FC<LayoutProps> = ({content}) => {
  const {colors, fonts} = useTheme();
  const columns = content.columns ?? [
    {head: '', items: content.compareLeft ? [content.compareLeft] : []},
    {head: '', items: content.compareRight ? [content.compareRight] : []},
  ];
  return (
    <div style={{flex: 1, display: 'flex', gap: 40, alignItems: 'stretch'}}>
      {columns.slice(0, 2).map((col, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            backgroundColor: colors.surface,
            border: `2px solid ${i === 0 ? colors.secondary : colors.primary}`,
            borderRadius: 20,
            padding: '32px 36px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {col.head ? (
            <div
              style={{
                color: i === 0 ? colors.secondary : colors.primary,
                fontFamily: fonts.title.family,
                fontWeight: fonts.title.weight,
                fontSize: 32,
                borderBottom: `2px solid ${colors.border}`,
                paddingBottom: 16,
              }}
            >
              {col.head}
            </div>
          ) : null}
          {col.items.map((item, j) => (
            <div
              key={j}
              style={{
                color: colors.text,
                fontFamily: fonts.body.family,
                fontWeight: fonts.body.weight,
                fontSize: 28,
                lineHeight: 1.5,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
