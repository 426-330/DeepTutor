import React from 'react';
import {Composition} from 'remotion';
import {resolveGlobalStyle} from '../parser/styleChain.js';
import type {VideoIR} from '../parser/types.js';
import {ConceptVideo, type ConceptVideoProps} from './ConceptVideo.js';
import {HelloWorld} from './HelloWorld.js';

/**
 * Studio/dev fallback IR (a single placeholder-ish scene) — real renders pass
 * the parsed IR via inputProps and calculateMetadata derives duration/fps.
 */
const FALLBACK_IR: VideoIR = {
  version: '3.1',
  series: 'dev',
  episode: 1,
  fps: 30,
  width: 1920,
  height: 1080,
  totalFrames: 90,
  style: resolveGlobalStyle(),
  scenes: [
    {
      index: 0,
      id: 's01',
      type: 'opening',
      layout: 'full-hero',
      startFrame: 0,
      durationFrames: 90,
      durationSource: 'default',
      style: resolveGlobalStyle(),
      title: 'ConceptVideo',
      question: '等待 YAML 输入',
      coreMessage: 'POST /render {yaml_path, job_id}',
      narration: {opening: '', explanation: 'ConceptVideo composition', conclusion: ''},
      visual: {primary: 'fallback'},
      slots: {},
    },
  ],
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HelloWorld"
        component={HelloWorld}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ConceptVideo"
        component={ConceptVideo as unknown as React.FC<Record<string, unknown>>}
        durationInFrames={FALLBACK_IR.totalFrames}
        fps={FALLBACK_IR.fps}
        width={1920}
        height={1080}
        defaultProps={{ir: FALLBACK_IR}}
        calculateMetadata={({props}) => {
          const {ir} = props as unknown as ConceptVideoProps;
          return {durationInFrames: ir.totalFrames, fps: ir.fps};
        }}
      />
    </>
  );
};
