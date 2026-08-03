import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import {Headline} from './shared.js';
import type {LayoutProps} from './types.js';

/** timeline：横向时间轴，步骤与演进过程。 */
export const TimelineLayout: React.FC<LayoutProps> = ({content}) => {
  const {colors, fonts} = useTheme();
  const nodes = content.timelineNodes ?? content.bullets ?? [];
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 64,
        padding: '0 40px',
      }}
    >
      {content.headline ? (
        <div style={{textAlign: 'center'}}>
          <Headline text={content.headline} size={48} />
        </div>
      ) : null}
      <div style={{position: 'relative', display: 'flex', justifyContent: 'space-between'}}>
        <div
          style={{
            position: 'absolute',
            top: 18,
            left: 0,
            right: 0,
            height: 4,
            backgroundColor: colors.border,
          }}
        />
        {nodes.map((node, i) => (
          <div
            key={i}
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 20,
              padding: '0 16px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.primary,
                border: `4px solid ${colors.background}`,
                zIndex: 1,
              }}
            />
            <div
              style={{
                color: colors.text,
                fontFamily: fonts.body.family,
                fontWeight: fonts.body.weight,
                fontSize: 24,
                lineHeight: 1.4,
              }}
            >
              {node}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
