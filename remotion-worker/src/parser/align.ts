/**
 * `.align.json` duration override (DSL §11.4, design D6).
 *
 * narration_gen drops per-scene alignment artifacts at
 *   <yaml_dir>/<yaml_stem>/audio/s<NN>.align.json
 * alongside the spec file (data/videos/<name>.yaml + <name>/audio/, D10).
 * At IR injection time the real audio duration overrides the DSL/default
 * `duration_frames`. The YAML itself is NEVER modified.
 *
 * Tolerated align.json shapes (whisperX sidecar):
 *   { "duration_frames": 123, ... }                — used directly
 *   { "duration_sec": 4.1, "cues": [{start,end,text}...] }
 * cues are converted seconds → frames for the subtitle band.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {ParseWarning, SubtitleCue} from './types.js';

export interface AlignOverride {
  durationFrames?: number;
  cues?: SubtitleCue[];
}

function roundFrames(sec: number, fps: number): number {
  return Math.max(1, Math.round(sec * fps));
}

/**
 * Read the align.json for scene `sceneId` (s01, s02, …) if present.
 * Returns null when the file does not exist (caller falls back to DSL
 * duration); malformed content yields a warning and no override.
 */
export function readAlignOverride(
  yamlPath: string,
  sceneId: string,
  fps: number,
  warnings: ParseWarning[],
): AlignOverride | null {
  const dir = path.dirname(yamlPath);
  const stem = path.basename(yamlPath).replace(/\.ya?ml$/i, '');
  const alignPath = path.join(dir, stem, 'audio', `${sceneId}.align.json`);
  if (!fs.existsSync(alignPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(alignPath, 'utf8')) as Record<
      string,
      unknown
    >;
    const out: AlignOverride = {};

    if (typeof raw.duration_frames === 'number' && raw.duration_frames >= 1) {
      out.durationFrames = Math.round(raw.duration_frames);
    } else if (typeof raw.duration_sec === 'number' && raw.duration_sec > 0) {
      out.durationFrames = roundFrames(raw.duration_sec, fps);
    }

    if (Array.isArray(raw.cues)) {
      out.cues = (raw.cues as Array<Record<string, unknown>>)
        .filter(
          (c) =>
            typeof c?.start === 'number' &&
            typeof c?.end === 'number' &&
            typeof c?.text === 'string',
        )
        .map((c) => ({
          startFrame: roundFrames(c.start as number, fps),
          endFrame: roundFrames(c.end as number, fps),
          text: c.text as string,
        }));
    }

    if (out.durationFrames === undefined && !out.cues) {
      warnings.push({
        code: 'align-invalid',
        scene: sceneId,
        message: `${alignPath} has no usable duration/cues — ignored`,
      });
      return null;
    }
    return out;
  } catch (err) {
    warnings.push({
      code: 'align-invalid',
      scene: sceneId,
      message: `failed to parse ${alignPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    return null;
  }
}
