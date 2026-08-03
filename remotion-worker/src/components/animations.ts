/**
 * Minimal entrance / transition animations (DSL §5 effects, task 4.4).
 * Plain `interpolate`-based implementations; entrance applies to a scene's
 * content block, transition applies to the whole incoming scene frame.
 *
 * Known simplification: transitions animate the incoming scene only (no
 * crossfade overlap), so totalFrames stays exactly Σ scene durations.
 */
import type {CSSProperties} from 'react';
import {interpolate} from 'remotion';
import type {Entrance, TransitionSpec} from '../parser/types.js';

const ENTRANCE_FRAMES = 15;

export function entranceStyle(
  entrance: Entrance,
  frame: number,
  fps: number,
): CSSProperties {
  switch (entrance) {
    case 'fadeIn':
      return {
        opacity: interpolate(frame, [0, ENTRANCE_FRAMES], [0, 1], {
          extrapolateRight: 'clamp',
        }),
      };
    case 'slideUp':
      return {
        opacity: interpolate(frame, [0, ENTRANCE_FRAMES], [0, 1], {
          extrapolateRight: 'clamp',
        }),
        transform: `translateY(${interpolate(
          frame,
          [0, ENTRANCE_FRAMES],
          [60, 0],
          {extrapolateRight: 'clamp'},
        )}px)`,
      };
    case 'scaleIn':
      return {
        opacity: interpolate(frame, [0, ENTRANCE_FRAMES], [0, 1], {
          extrapolateRight: 'clamp',
        }),
        transform: `scale(${interpolate(
          frame,
          [0, ENTRANCE_FRAMES],
          [0.85, 1],
          {extrapolateRight: 'clamp'},
        )})`,
      };
    case 'typewriter':
    case 'none':
    default:
      return {};
  }
}

/** Typewriter reveal for headline text (characters per second based on fps). */
export function typewriterText(
  text: string,
  frame: number,
  fps: number,
  charsPerSecond = 16,
): string {
  const count = Math.floor((frame / fps) * charsPerSecond);
  return text.slice(0, Math.max(0, count));
}

export function transitionInStyle(
  transition: TransitionSpec,
  frame: number,
): CSSProperties {
  const frames = Math.max(1, transition.frames);
  const progress = interpolate(frame, [0, frames], [0, 1], {
    extrapolateRight: 'clamp',
  });
  switch (transition.type) {
    case 'fade':
      return {opacity: progress};
    case 'wipe-left':
      return {
        clipPath: `inset(0 ${100 - progress * 100}% 0 0)`,
      };
    case 'slide':
      return {
        opacity: Math.min(1, progress * 2),
        transform: `translateX(${(1 - progress) * 100}%)`,
      };
    case 'zoom':
      return {
        opacity: progress,
        transform: `scale(${1.15 - progress * 0.15})`,
      };
    case 'none':
    default:
      return {};
  }
}
