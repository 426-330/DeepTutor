/**
 * Partial re-render splicing (tasks.md 7.1).
 *
 * A partial render produces a segment for the frame range [start, end]
 * (inclusive). When a full render already exists at renders/<job_id>.mp4 we
 * replace that exact range with the new segment:
 *
 *   head (frames 0..start-1) + segment + tail (frames end+1..)
 *
 * Strategy: lossless stream-copy first (fast, no quality loss); the result is
 * validated with ffprobe (duration must stay within tolerance of the
 * original). If copy fails validation — e.g. cut points not on keyframes —
 * fall back to re-encoding the three parts and concatenating with re-encode.
 * Audio: the segment carries its own range's audio (rendered with
 * forSeamlessAacConcatenation), head/tail keep the original audio.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TOLERANCE_SEC = 0.06; // ~2 帧 @30fps：超出即认为 copy 切割不精确

function ffprobeDuration(mp4: string): number {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    mp4,
  ]).toString().trim();
  return Number(out);
}

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], {stdio: ['ignore', 'ignore', 'pipe']});
}

function concatWithConcatDemuxer(parts: string[], out: string, copy: boolean): void {
  const list = path.join(path.dirname(out), `concat-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  try {
    ffmpeg([
      '-f', 'concat', '-safe', '0', '-i', list,
      ...(copy ? ['-c', 'copy'] : ['-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k']),
      '-movflags', '+faststart',
      out,
    ]);
  } finally {
    fs.rmSync(list, {force: true});
  }
}

/**
 * Replace frames [start, end] (inclusive) of `fullPath` with `segmentPath`.
 * Returns the strategy used ('copy' | 'reencode'). `fullPath` is updated in
 * place (atomically via a sibling temp file).
 */
export function spliceSegmentIntoFull(
  fullPath: string,
  segmentPath: string,
  range: {start: number; end: number},
  fps: number,
): 'copy' | 'reencode' {
  const {start, end} = range;
  const origDuration = ffprobeDuration(fullPath);
  const dir = fs.mkdtempSync(path.join(path.dirname(fullPath), '.splice-'));
  const head = path.join(dir, 'head.mp4');
  const tail = path.join(dir, 'tail.mp4');
  const segment = path.join(dir, 'segment.mp4');
  const merged = path.join(dir, 'merged.mp4');

  const headEnd = start / fps; // exclusive
  const segDuration = (end - start + 1) / fps;
  const tailStart = (end + 1) / fps;
  const hasHead = start > 0;
  const hasTail = tailStart < origDuration;

  try {
    // 片段音频带 seamless padding（renderMedia forSeamlessAacConcatenation），
    // 先裁剪回精确区间时长（AAC 帧粒度 ≈21ms，远小于容差）。
    ffmpeg(['-i', segmentPath, '-t', segDuration.toFixed(6), '-c', 'copy', segment]);

    // ① 无损流拷贝优先（切点可能落在非关键帧 → 校验不过则兜底）。
    if (hasHead) ffmpeg(['-ss', '0', '-to', headEnd.toFixed(6), '-i', fullPath, '-c', 'copy', head]);
    if (hasTail) ffmpeg(['-ss', tailStart.toFixed(6), '-i', fullPath, '-c', 'copy', tail]);
    const copyParts = [hasHead ? head : null, segment, hasTail ? tail : null]
      .filter((p): p is string => p !== null && fs.existsSync(p));
    concatWithConcatDemuxer(copyParts, merged, true);
    const copyDuration = ffprobeDuration(merged);
    if (Math.abs(copyDuration - origDuration) > TOLERANCE_SEC) {
      throw new Error(
        `stream-copy splice drifted: ${copyDuration.toFixed(3)}s vs ${origDuration.toFixed(3)}s`,
      );
    }
    fs.renameSync(merged, fullPath);
    return 'copy';
  } catch {
    // ② 重编码兜底：concat filter 单次完成（timebase 归一，帧级精确）。
    const inputs: string[] = [];
    const labels: string[] = [];
    let n = 0;
    if (hasHead) {
      inputs.push('-ss', '0', '-to', headEnd.toFixed(6), '-i', fullPath);
      labels.push(`[${n}:v][${n}:a]`);
      n++;
    }
    inputs.push('-t', segDuration.toFixed(6), '-i', segmentPath);
    labels.push(`[${n}:v][${n}:a]`);
    n++;
    if (hasTail) {
      inputs.push('-ss', tailStart.toFixed(6), '-i', fullPath);
      labels.push(`[${n}:v][${n}:a]`);
      n++;
    }
    ffmpeg([
      ...inputs,
      '-filter_complex',
      `${labels.join('')}concat=n=${n}:v=1:a=1[v][a]`,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      merged,
    ]);
    const mergedDuration = ffprobeDuration(merged);
    if (Math.abs(mergedDuration - origDuration) > TOLERANCE_SEC) {
      throw new Error(
        `re-encode splice drifted: ${mergedDuration.toFixed(3)}s vs ${origDuration.toFixed(3)}s`,
      );
    }
    fs.renameSync(merged, fullPath);
    return 'reencode';
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

/** Scene-boundary alignment info for a requested range (best-effort warning). */
export function rangeAlignsToScenes(
  scenes: Array<{startFrame: number; durationFrames: number}>,
  range: {start: number; end: number},
): boolean {
  const starts = new Set(scenes.map((s) => s.startFrame));
  const ends = new Set(scenes.map((s) => s.startFrame + s.durationFrames - 1));
  return starts.has(range.start) && ends.has(range.end);
}
