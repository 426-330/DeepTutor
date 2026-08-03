import React from 'react';
import type {SceneProps} from './types.js';
import {SceneShell} from './SceneShell.js';

/** quote — 金句/引用（§4.10）。 */
export const QuoteScene: React.FC<SceneProps> = ({scene}) => {
  return (
    <SceneShell
      scene={scene}
      content={{
        quoteText: (scene.slots.quote_text as string | undefined) ?? scene.coreMessage,
        attribution: scene.slots.attribution as string | undefined,
        footnote: scene.slots.context as string | undefined,
        headline: (scene.slots.quote_text as string | undefined) ?? scene.coreMessage,
        subline: scene.slots.attribution as string | undefined,
      }}
    />
  );
};
