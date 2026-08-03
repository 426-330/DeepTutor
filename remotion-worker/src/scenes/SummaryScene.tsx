import React from 'react';
import type {SceneProps} from './types.js';
import {SceneShell} from './SceneShell.js';

/** summary — 回顾要点 + 下集预告 + 系列引导（§4.7）。 */
export const SummaryScene: React.FC<SceneProps> = ({scene}) => {
  const recapPoints = (scene.slots.recap_points as string[] | undefined) ?? [];
  const nextEpisode = scene.slots.next_episode as string | undefined;
  const seriesCta = scene.slots.series_cta as string | undefined;
  return (
    <SceneShell
      scene={scene}
      content={{
        headline: scene.coreMessage,
        subline: nextEpisode,
        callout: seriesCta,
        bullets: recapPoints,
        timelineNodes: recapPoints,
      }}
    />
  );
};
