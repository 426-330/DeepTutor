/**
 * SceneShell — common plumbing for all scene components: transition-in
 * wrapper → SceneFrame (标题条/字幕区/风险条位) → entrance animation →
 * layout component from the registry (unknown layout → placeholder, D8).
 */
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {entranceStyle, transitionInStyle, typewriterText} from '../components/animations.js';
import {PlaceholderFrame} from '../components/PlaceholderFrame.js';
import {SceneFrame} from '../components/SceneFrame.js';
import {LAYOUT_REGISTRY} from '../layouts/index.js';
import type {SceneContent} from '../layouts/types.js';
import type {SceneIR} from '../parser/types.js';

export const SceneShell: React.FC<{scene: SceneIR; content: SceneContent}> = ({
  scene,
  content,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {effects} = scene.style;

  const Layout = LAYOUT_REGISTRY[scene.layout];

  // typewriter entrance applies to the headline text itself.
  const effectiveContent: SceneContent =
    effects.entrance === 'typewriter' && content.headline
      ? {...content, headline: typewriterText(content.headline, frame, fps)}
      : content;

  return (
    <AbsoluteFill style={transitionInStyle(effects.transition, frame)}>
      <SceneFrame
        title={scene.title}
        question={scene.question}
        subtitleFallback={scene.narration.explanation}
        cues={scene.cues}
      >
        <AbsoluteFill style={entranceStyle(effects.entrance, frame, fps)}>
          {Layout ? (
            <Layout content={effectiveContent} />
          ) : (
            <PlaceholderFrame
              reason={`未注册的布局标识 "${scene.layout}"（场景 ${scene.id}）`}
            />
          )}
        </AbsoluteFill>
      </SceneFrame>
    </AbsoluteFill>
  );
};
