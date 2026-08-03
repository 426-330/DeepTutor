import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {serveMediaUrls} from './asset-server.js';
import {ensureSkillRegistry} from './skills/generate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Entry point of the Remotion project (the registerRoot() file).
 * Works both from `tsx src/...` (dev) and `node dist/...` (built):
 * the Remotion bundler compiles TS/TSX itself, so we always point at src/.
 */
export const REMOTION_ENTRY = path.resolve(__dirname, '..', 'src', 'remotion', 'index.ts');

/**
 * Our TS sources use NodeNext-style `.js` import specifiers that point at
 * `.ts`/`.tsx` files; teach the bundler (webpack or rspack) to resolve them.
 */
const EXTENSION_ALIAS = {'.js': ['.ts', '.tsx', '.js', '.jsx']};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withExtensionAlias(config: any): any {
  const resolve = config.resolve ?? {};
  return {
    ...config,
    resolve: {
      ...resolve,
      extensionAlias: {...(resolve.extensionAlias ?? {}), ...EXTENSION_ALIAS},
    },
  };
}

/** M0 fallback composition (kept for smoke tests without a YAML spec). */
export const DEFAULT_COMPOSITION_ID = 'HelloWorld';

/** IR-driven composition (tasks 4.3/4.4 — YAML spec → IR → scene components). */
export const CONCEPT_COMPOSITION_ID = 'ConceptVideo';

export interface RenderJobOptions {
  jobId: string;
  outDir: string;
  compositionId?: string;
  /** Composition input props — for ConceptVideo this is `{ir: VideoIR}`. */
  inputProps?: Record<string, unknown>;
  /**
   * Partial re-render (tasks 7.1): render only this inclusive frame range.
   * Output goes to `<jobId>.partial-<start>-<end>.mp4` instead of
   * `<jobId>.mp4`; splicing into an existing full render is the caller's job
   * (src/partial.ts).
   */
  frameRange?: {start: number; end: number};
  /** Called with progress in [0, 1] as frames are rendered/encoded. */
  onProgress?: (progress: number) => void;
}

/**
 * Bundle the Remotion project and render the composition to
 * `<outDir>/<jobId>.mp4` (h264) using headless Chrome + ffmpeg.
 *
 * The bundle is cached per-process — re-bundling on every job is slow
 * and unnecessary while the composition set is static (M0). If scene
 * components become dynamic per-spec (M1+), revisit this cache key.
 */
let bundleCache: Promise<string> | null = null;

export function getBundle(entry: string): Promise<string> {
  if (!bundleCache) {
    // (Re)generate the skill registry before bundling — the bundler needs
    // static imports (task 6.5, video_dsl/skills/ scan).
    ensureSkillRegistry();
    bundleCache = bundle(entry, undefined, {
      webpackOverride: withExtensionAlias,
      rspackOverride: withExtensionAlias,
    });
    bundleCache.catch(() => {
      // Allow retry on next job if the initial bundle failed.
      bundleCache = null;
    });
  }
  return bundleCache;
}

export async function renderToMp4(options: RenderJobOptions): Promise<string> {
  const {jobId, outDir, compositionId = DEFAULT_COMPOSITION_ID, frameRange, onProgress} = options;

  // Chrome refuses file:// media from the bundle's http origin — expose
  // voiceover/BGM over a local asset server for the duration of the render.
  const inputProps = await serveMediaUrls(options.inputProps);

  const serveUrl = await getBundle(REMOTION_ENTRY);
  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
  });

  fs.mkdirSync(outDir, {recursive: true});
  const outputLocation = frameRange
    ? path.join(outDir, `${jobId}.partial-${frameRange.start}-${frameRange.end}.mp4`)
    : path.join(outDir, `${jobId}.mp4`);

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation,
    frameRange: frameRange ? [frameRange.start, frameRange.end] : undefined,
    // Seamless AAC 仅片段渲染开启（拼接在 splice 侧按精确时长裁剪，见 partial.ts）。
    forSeamlessAacConcatenation: Boolean(frameRange),
    // three.js/R3F 技能背景需要可用的 WebGL context（task 6.2）：
    // headless 默认 Vulkan/SwiftShader 可能创建失败。macOS 本机 angle 可用；
    // Linux 容器（arm64）angle 创建 WebGL context 失败，需 swangle
    // （SwiftShader ANGLE 软件渲染）。REMOTION_GL 可覆盖，默认 swangle
    // （软件渲染，处处可用；有 GPU 的环境可显式设 angle 提速）。
    chromiumOptions: {gl: (process.env.REMOTION_GL || 'swangle') as 'angle' | 'swangle'},
    onProgress: ({progress}) => {
      onProgress?.(progress);
    },
  });

  return outputLocation;
}
