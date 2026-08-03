/**
 * Audio asset discovery (M2, tasks.md 5.2).
 *
 * Convention over configuration — the spec schema (single source, do not
 * extend here) has no audio fields, so the renderer picks up audio by data
 * layout convention (design D10):
 *
 *   <yaml_dir>/<stem>/audio/s<NN>.wav   — per-scene voiceover (narration_gen)
 *   <yaml_dir>/<stem>/bgm/<first audio file> — full-video background music
 *
 * Both are injected into the IR as `file://` URLs (the renderer's
 * resolveAssetSrc converts them back to fs paths for mixing). Scenes without
 * audio render silent; a missing BGM simply means no BGM track.
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac'];

function assetDir(yamlPath: string): string {
  const dir = path.dirname(yamlPath);
  const stem = path.basename(yamlPath).replace(/\.ya?ml$/i, '');
  return path.join(dir, stem);
}

function toFileUrl(absPath: string): string {
  return pathToFileURL(absPath).toString();
}

/** Per-scene voiceover: audio/s<NN>.<ext>, first matching extension wins. */
export function findSceneAudio(yamlPath: string, sceneId: string): string | null {
  const audioDir = path.join(assetDir(yamlPath), 'audio');
  for (const ext of AUDIO_EXTENSIONS) {
    const candidate = path.join(audioDir, `${sceneId}${ext}`);
    if (fs.existsSync(candidate)) return toFileUrl(candidate);
  }
  return null;
}

/** BGM: first audio file inside bgm/ (alphabetical), null when absent. */
export function findBgm(yamlPath: string): string | null {
  const bgmDir = path.join(assetDir(yamlPath), 'bgm');
  if (!fs.existsSync(bgmDir)) return null;
  const hit = fs
    .readdirSync(bgmDir)
    .filter((f) => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .sort()[0];
  return hit ? toFileUrl(path.join(bgmDir, hit)) : null;
}

export const DEFAULT_BGM_VOLUME = 0.15;
