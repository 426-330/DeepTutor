import React from 'react';
import {VisualCard} from '../components/VisualCard.js';
import type {SceneProps} from './types.js';
import {SceneShell} from './SceneShell.js';

/** concept — 定义 + 类比 + 要点拆解（+ 常见误解澄清）。 */
export const ConceptScene: React.FC<SceneProps> = ({scene}) => {
  const definition = scene.slots.definition as string | undefined;
  const analogy = scene.slots.analogy as string | undefined;
  const keyPoints = (scene.slots.key_points as string[] | undefined) ?? [];
  const misconception = scene.slots.misconception as string | undefined;
  return (
    <SceneShell
      scene={scene}
      content={{
        headline: definition ?? scene.coreMessage,
        subline: analogy,
        bullets: keyPoints,
        callout: misconception,
        timelineNodes: keyPoints,
        visual: <VisualCard text={scene.visual.primary} emphasis={scene.visual.emphasis} />,
      }}
    />
  );
};
