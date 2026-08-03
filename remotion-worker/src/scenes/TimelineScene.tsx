import React from 'react';
import type {TimelineEvent} from '../layouts/types.js';
import type {SceneProps} from './types.js';
import {SceneShell} from './SceneShell.js';

/** timeline — 时间/步骤演进（§4.9）。 */
export const TimelineScene: React.FC<SceneProps> = ({scene}) => {
  const events = (scene.slots.events as TimelineEvent[] | undefined) ?? [];
  const insight = scene.slots.insight as string | undefined;
  return (
    <SceneShell
      scene={scene}
      content={{
        headline: scene.title,
        subline: insight ?? scene.coreMessage,
        events,
        timelineNodes: events.map((e) => e.label),
      }}
    />
  );
};
