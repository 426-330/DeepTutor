import React from 'react';
import {useTheme} from '../components/ThemeProvider.js';
import {Subline} from './shared.js';
import type {LayoutProps} from './types.js';

/** compare-2：双栏对比（A vs B），制造认知冲突。 */
export const Compare2Layout: React.FC<LayoutProps> = ({content}) => {
  const {colors, fonts} = useTheme();
  const panel = (text: string | undefined, borderColor: string) => (
    <div
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        border: `2px solid ${borderColor}`,
        borderRadius: 20,
        padding: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: colors.text,
        fontFamily: fonts.body.family,
        fontWeight: fonts.body.weight,
        fontSize: 32,
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 32,
      }}
    >
      <div style={{flex: 1, display: 'flex', gap: 40, minHeight: 0}}>
        {panel(content.compareLeft, colors.secondary)}
        <div
          style={{
            alignSelf: 'center',
            color: colors.accent,
            fontFamily: fonts.title.family,
            fontWeight: fonts.title.weight,
            fontSize: 40,
          }}
        >
          VS
        </div>
        {panel(content.compareRight, colors.primary)}
      </div>
      {content.subline ? (
        <div style={{textAlign: 'center'}}>
          <Subline text={content.subline} size={28} />
        </div>
      ) : null}
    </div>
  );
};
