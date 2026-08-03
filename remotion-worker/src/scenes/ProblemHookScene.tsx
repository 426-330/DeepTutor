import React from 'react';
import {VisualCard} from '../components/VisualCard.js';
import type {SceneProps} from './types.js';
import {SceneShell} from './SceneShell.js';

/** problem_hook — 反常识现象 + 反问 + 承诺，制造认知冲突。 */
export const ProblemHookScene: React.FC<SceneProps> = ({scene}) => {
  const phenomenon = scene.slots.phenomenon as string | undefined;
  const counterQuestion = scene.slots.counter_question as string | undefined;
  const promise = scene.slots.promise as string | undefined;
  return (
    <SceneShell
      scene={scene}
      content={{
        headline: phenomenon ?? scene.coreMessage,
        subline: counterQuestion,
        callout: promise,
        compareLeft: phenomenon,
        compareRight: counterQuestion,
        visual: <VisualCard text={scene.visual.primary} emphasis={scene.visual.emphasis} />,
      }}
    />
  );
};
