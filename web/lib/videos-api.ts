// REST client for the video-generation system (`/api/v1/videos`).
//
// A video project = one `data/videos/<series_slug>_ep<NN>.yaml` spec plus its
// artifact directory (`assets/`, `audio/`, `renders/`, `pipeline_state.json`).
// Render execution is fire-and-poll: `POST /{name}/render` returns 202
// immediately, and completion is detected by polling `GET /{name}/renders`
// until the artifact list changes.

import { apiFetch, apiUrl } from "@/lib/api";

/** The four video_pipeline stages, in execution order. */
export const VIDEO_STAGES = [
  "video_spec",
  "asset_gen",
  "narration_gen",
  "video_compose",
] as const;

export type VideoStage = (typeof VIDEO_STAGES)[number];

export interface VideoStageRecord {
  status?: string;
  updated_at?: string;
  error?: string;
  [key: string]: unknown;
}

export interface VideoSummary {
  series_slug: string;
  episode: number;
  name: string;
  spec_path: string;
  has_spec: boolean;
  /** Optional — absent when the spec is missing or unparsable. */
  scene_count?: number | null;
  /** Optional — absent when no pipeline_state.json exists yet. */
  stages?: Record<string, VideoStageRecord>;
  /** Job ids of finished renders (no timing info on the list endpoint). */
  renders: string[];
}

export interface VideoRenderEntry {
  job_id: string;
  size: number;
  /** Epoch seconds (server `st_mtime`). */
  mtime: number;
}

export interface VideoAssetEntry {
  name: string;
  size: number;
  mtime: number;
  kind: "image" | "meta" | "other" | string;
  /** Parsed `.meta.json` / `manifest.json` content, when applicable. */
  meta?: Record<string, unknown> | null;
}

export interface VideoAudioEntry {
  name: string;
  size: number;
  mtime: number;
  has_align: boolean;
  duration_seconds?: number;
}

export interface VideoArtifacts {
  name: string;
  assets: VideoAssetEntry[];
  audio: VideoAudioEntry[];
  renders: VideoRenderEntry[];
  pipeline_state: {
    version?: number;
    updated_at?: string;
    stages?: Record<string, VideoStageRecord>;
  } | null;
}

export interface RenderTriggerResponse {
  job_id: string;
  status: string;
  worker_url: string;
}

async function readErrorDetail(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = await res.json();
    if (body?.detail) return String(body.detail);
  } catch {
    // body wasn't JSON; fall through
  }
  return fallback;
}

export async function listVideos(): Promise<VideoSummary[]> {
  const res = await apiFetch(apiUrl("/api/v1/videos"), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to list videos"));
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function getVideoArtifacts(name: string): Promise<VideoArtifacts> {
  const res = await apiFetch(
    apiUrl(`/api/v1/videos/${encodeURIComponent(name)}/artifacts`),
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load artifacts"));
  }
  return (await res.json()) as VideoArtifacts;
}

export async function listVideoRenders(
  name: string,
): Promise<VideoRenderEntry[]> {
  const res = await apiFetch(
    apiUrl(`/api/v1/videos/${encodeURIComponent(name)}/renders`),
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to list renders"));
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function triggerVideoRender(
  name: string,
  body?: { frames?: { start: number; end: number } },
): Promise<RenderTriggerResponse> {
  const res = await apiFetch(
    apiUrl(`/api/v1/videos/${encodeURIComponent(name)}/render`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    },
  );
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to trigger render"));
  }
  return (await res.json()) as RenderTriggerResponse;
}

/** URL for a static artifact file (`<video>/<img>/<audio>` src or download). */
export function videoFileUrl(
  name: string,
  kind: "renders" | "assets" | "audio",
  filename: string,
): string {
  return apiUrl(
    `/api/v1/videos/${encodeURIComponent(name)}/files/${kind}/${encodeURIComponent(filename)}`,
  );
}
