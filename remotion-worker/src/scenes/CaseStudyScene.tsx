import React from 'react';
import {VisualCard} from '../components/VisualCard.js';
import type {SceneProps} from './types.js';
import {SceneShell} from './SceneShell.js';

/** case_study — 案例拆解：背景→过程→结果→启示（§4.12）。 */
export const CaseStudyScene: React.FC<SceneProps> = ({scene}) => {
  const process = (scene.slots.process as string[] | undefined) ?? [];
  const result = scene.slots.result as string | undefined;
  const lesson = scene.slots.lesson as string | undefined;
  return (
    <SceneShell
      scene={scene}
      content={{
        headline: (scene.slots.case_title as string | undefined) ?? scene.title,
        subline: scene.slots.case_background as string | undefined,
        bullets: process,
        callout: result ? `结果：${result}${lesson ? `　启示：${lesson}` : ''}` : lesson,
        timelineNodes: process,
        visual: <VisualCard text={scene.visual.primary} emphasis={scene.visual.emphasis} />,
      }}
    />
  );
};
