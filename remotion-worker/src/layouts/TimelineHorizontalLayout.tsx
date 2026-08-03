import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import type {ResolvedColors, ResolvedFonts} from '../parser/types.js';
import {Headline} from './shared.js';
import type {LayoutProps} from './types.js';

/** timeline-horizontal：横向时间轴，节点上下交错排布。 */
export const TimelineHorizontalLayout: React.FC<LayoutProps> = ({content}) => {
  const {colors, fonts} = useTheme();
  const events = content.events ?? [];
  const nodes = events.length > 0 ? events.map((e) => e.label) : (content.timelineNodes ?? []);
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 48,
        padding: '0 40px',
      }}
    >
      {content.headline ? (
        <div style={{textAlign: 'center'}}>
          <Headline text={content.headline} size={48} />
        </div>
      ) : null}
      <div style={{position: 'relative', height: 420}}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 4,
            backgroundColor: colors.border,
          }}
        />
        <div style={{display: 'flex', height: '100%'}}>
          {(events.length > 0 ? events : nodes).map((item, i) => {
            const isObj = typeof item !== 'string';
            const label = isObj ? (item as {label: string}).label : (item as string);
            const detail = isObj ? (item as {detail?: string}).detail : undefined;
            const above = i % 2 === 0;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: above ? 'flex-end' : 'flex-start',
                  padding: '0 16px',
                }}
              >
                {above ? (
                  <NodeText label={label} detail={detail} colors={colors} fonts={fonts} />
                ) : null}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: colors.primary,
                    border: `4px solid ${colors.background}`,
                  }}
                />
                {!above ? (
                  <NodeText label={label} detail={detail} colors={colors} fonts={fonts} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const NodeText: React.FC<{
  label: string;
  detail?: string;
  colors: ResolvedColors;
  fonts: ResolvedFonts;
}> = ({label, detail, colors, fonts}) => (
  <div style={{textAlign: 'center', paddingBottom: 16, paddingTop: 16}}>
    <div
      style={{
        color: colors.text,
        fontFamily: fonts.title.family,
        fontWeight: fonts.title.weight,
        fontSize: 26,
        lineHeight: 1.3,
      }}
    >
      {label}
    </div>
    {detail ? (
      <div
        style={{
          color: colors.textMuted,
          fontFamily: fonts.body.family,
          fontWeight: fonts.body.weight,
          fontSize: 20,
          marginTop: 8,
          lineHeight: 1.4,
        }}
      >
        {detail}
      </div>
    ) : null}
  </div>
);
