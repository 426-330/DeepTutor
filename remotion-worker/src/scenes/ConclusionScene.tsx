import React from 'react';
import type {SceneProps} from './types.js';
import {SceneShell} from './SceneShell.js';

/** conclusion — 恰好 3 张要点卡 + 一句话带走（§4.6）。 */
export const ConclusionScene: React.FC<SceneProps> = ({scene}) => {
  const keyCards = (scene.slots.key_cards as string[] | undefined) ?? [];
  const takeaway = scene.slots.takeaway as string | undefined;
  const callToAction = scene.slots.call_to_action as string | undefined;
  return (
    <SceneShell
      scene={scene}
      content={{
        headline: takeaway ?? scene.coreMessage,
        subline: callToAction,
        cards: keyCards,
        bullets: keyCards,
      }}
    />
  );
};
