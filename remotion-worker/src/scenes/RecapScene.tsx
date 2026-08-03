import React from 'react';
import type {SceneProps} from './types.js';
import {SceneShell} from './SceneShell.js';

/** recap — 阶段回顾，承上启下（§4.13）。 */
export const RecapScene: React.FC<SceneProps> = ({scene}) => {
  const points = (scene.slots.points as string[] | undefined) ?? [];
  return (
    <SceneShell
      scene={scene}
      content={{
        headline: scene.coreMessage,
        subline: scene.slots.bridge as string | undefined,
        bullets: points,
        cards: points,
      }}
    />
  );
};
