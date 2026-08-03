/**
 * ConceptVideo — the IR-driven composition: scenes concatenated in order
 * (Sequence per scene at its IR startFrame), each wrapped in its resolved
 * StyleChain via the theme provider. Unknown scene types degrade to a
 * placeholder frame without interrupting the video (design D8).
 *
 * Audio (M2): each scene's voiceover (<Audio> inside its Sequence, so it
 * starts at the scene boundary; silent when the scene has no wav) plus a
 * full-length looping BGM bed at a fixed low volume — voiceover always at
 * 1.0, BGM default 0.15 (no ducking).
 */
import React from 'react';
import {Audio, Sequence} from 'remotion';
import {PlaceholderFrame} from '../components/PlaceholderFrame.js';
import {ThemeProvider} from '../components/ThemeProvider.js';
import {SCENE_REGISTRY} from '../scenes/index.js';
import type {VideoIR} from '../parser/types.js';

export interface ConceptVideoProps {
  ir: VideoIR;
}

export const ConceptVideo: React.FC<ConceptVideoProps> = ({ir}) => {
  return (
    <ThemeProvider value={ir.style}>
      {ir.bgm ? <Audio src={ir.bgm.url} volume={ir.bgm.volume} loop /> : null}
      {ir.scenes.map((scene) => {
        const SceneComponent = SCENE_REGISTRY[scene.type];
        return (
          <Sequence
            key={scene.id}
            from={scene.startFrame}
            durationInFrames={scene.durationFrames}
            name={scene.id}
          >
            {scene.audioUrl ? <Audio src={scene.audioUrl} /> : null}
            <ThemeProvider value={scene.style}>
              {SceneComponent ? (
                <SceneComponent scene={scene} />
              ) : (
                <PlaceholderFrame
                  reason={`未注册的场景类型 "${scene.type}"（场景 ${scene.id}）`}
                />
              )}
            </ThemeProvider>
          </Sequence>
        );
      })}
    </ThemeProvider>
  );
};
