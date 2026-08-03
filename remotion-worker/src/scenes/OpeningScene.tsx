import React from 'react';
import {VisualCard} from '../components/VisualCard.js';
import type {SceneProps} from './types.js';
import {SceneShell} from './SceneShell.js';

/** opening — 建立主题与观看预期（hook_line / key_visual / agenda）。 */
export const OpeningScene: React.FC<SceneProps> = ({scene}) => {
  const hookLine = scene.slots.hook_line as string | undefined;
  const agenda = (scene.slots.agenda as string[] | undefined) ?? [];
  return (
    <SceneShell
      scene={scene}
      content={{
        headline: hookLine ?? scene.title,
        subline: scene.coreMessage,
        bullets: agenda,
        visual: <VisualCard text={scene.visual.primary} emphasis={scene.visual.emphasis} />,
      }}
    />
  );
};
