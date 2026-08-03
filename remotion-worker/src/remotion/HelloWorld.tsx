import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

/**
 * M0 hardcoded composition: centered title with a simple fade-in.
 * Replaced in M1+ by scene/layout components driven by the DSL IR (design D4/D5).
 */
export const HelloWorld: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const translateY = interpolate(frame, [0, 30], [24, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0b1020',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          color: '#ffffff',
          fontSize: 72,
          fontWeight: 600,
          fontFamily: 'Helvetica, Arial, sans-serif',
          letterSpacing: 1,
        }}
      >
        DeepTutor Video System · M0
      </div>
    </AbsoluteFill>
  );
};
