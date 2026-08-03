import React from 'react';
import type {SceneProps} from './types.js';
import {SceneShell} from './SceneShell.js';

/** big_number — 大数字冲击（§4.11）。 */
export const BigNumberScene: React.FC<SceneProps> = ({scene}) => {
  return (
    <SceneShell
      scene={scene}
      content={{
        bigNumber: scene.slots.number as string | undefined,
        unit: scene.slots.unit as string | undefined,
        headline: scene.slots.number as string | undefined,
        subline: (scene.slots.context as string | undefined) ?? scene.coreMessage,
        callout: scene.slots.comparison as string | undefined,
      }}
    />
  );
};
