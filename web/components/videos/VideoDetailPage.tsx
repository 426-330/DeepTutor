"use client";

/**
 * Video project detail — render job management (5.7) + artifact panel (5.8).
 *
 * Renders: trigger a full render or a frame-range re-render, then poll
 * `GET /{name}/renders` until the artifact list changes (the render endpoint
 * is fire-and-forget 202; there is no progress endpoint).
 * Artifacts: tabs for renders / assets (image thumbnails + meta summaries) /
 * audio (duration + align status), plus the four-stage pipeline status bar.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Clapperboard,
  Download,
  FileJson,
  Film,
  Loader2,
  Music,
  PencilLine,
  Play,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import StageLights from "@/components/videos/StageLights";
import { useAppShell } from "@/context/AppShellContext";
import { formatDate, formatTime } from "@/lib/datetime";
import { formatBytes } from "@/lib/doc-attachments";
import { notify } from "@/lib/notifications";
import {
  getVideoArtifacts,
  listVideoRenders,
  triggerVideoRender,
  videoFileUrl,
  type VideoArtifacts,
} from "@/lib/videos-api";

type Tab = "renders" | "assets" | "audio";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 10 * 60_000;

/** Signature of the renders list — a change means the render job landed. */
function rendersSignature(
  renders: { job_id: string; size: number; mtime: number }[],
): string {
  return renders
    .map((r) => `${r.job_id}:${r.size}:${r.mtime}`)
    .sort()
    .join("|");
}

function formatDuration(seconds?: number): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function VideoDetailPage({ name }: { name: string }) {
  const { t } = useTranslation();
  const { language } = useAppShell();
  const [artifacts, setArtifacts] = useState<VideoArtifacts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("renders");
  const [rendering, setRendering] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [frameStart, setFrameStart] = useState("");
  const [frameEnd, setFrameEnd] = useState("");
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatTs = useCallback(
    (ts: number) => {
      const date = new Date(ts * 1000);
      return `${formatDate(date, language)} ${formatTime(date, language)}`;
    },
    [language],
  );

  const refresh = useCallback(async () => {
    try {
      setArtifacts(await getVideoArtifacts(name));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  /** Poll the renders list until it differs from `baseline` (or we give up). */
  const startPolling = useCallback(
    (baseline: string) => {
      stopPolling();
      const startedAt = Date.now();
      pollTimerRef.current = setInterval(() => {
        void (async () => {
          try {
            const renders = await listVideoRenders(name);
            if (rendersSignature(renders) !== baseline) {
              stopPolling();
              setRendering(false);
              setActiveJobId(null);
              await refresh();
              notify(t("Render finished"), { tone: "success" });
            } else if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
              stopPolling();
              setRendering(false);
              setActiveJobId(null);
              notify(t("Render is taking long — check back later"), {
                tone: "info",
              });
            }
          } catch {
            // transient poll failure — keep polling
          }
        })();
      }, POLL_INTERVAL_MS);
    },
    [name, refresh, stopPolling, t],
  );

  const handleRender = useCallback(
    async (frames?: { start: number; end: number }) => {
      if (rendering) return;
      const baseline = rendersSignature(artifacts?.renders ?? []);
      setRendering(true);
      try {
        const res = await triggerVideoRender(name, frames ? { frames } : {});
        setActiveJobId(res.job_id);
        notify(t("Render submitted"), { tone: "info" });
        startPolling(baseline);
      } catch (err) {
        setRendering(false);
        notify(err instanceof Error ? err.message : String(err), {
          tone: "error",
        });
      }
    },
    [artifacts, name, rendering, startPolling, t],
  );

  const parsedStart = frameStart.trim() === "" ? null : Number(frameStart);
  const parsedEnd = frameEnd.trim() === "" ? null : Number(frameEnd);
  const framesValid =
    parsedStart !== null &&
    parsedEnd !== null &&
    Number.isInteger(parsedStart) &&
    Number.isInteger(parsedEnd) &&
    parsedStart >= 0 &&
    parsedEnd > parsedStart;

  const renders = artifacts?.renders ?? [];
  const assets = artifacts?.assets ?? [];
  const audio = artifacts?.audio ?? [];
  const stages = artifacts?.pipeline_state?.stages ?? null;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--muted-foreground)]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error || !artifacts) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-[13px] text-red-500">
          {error ?? t("Failed to load artifacts")}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void refresh();
          }}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          {t("Retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Link
            href="/videos"
            aria-label={t("Back") as string}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1
            className="flex items-center gap-2 text-lg font-semibold text-[var(--foreground)]"
            title={artifacts.name}
          >
            <Clapperboard size={18} />
            {artifacts.display_name || artifacts.name}
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <StageLights stages={stages} showLabels />
            <Link
              href={`/videos/${encodeURIComponent(artifacts.name)}/edit`}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              <PencilLine size={14} />
              {t("Edit spec")}
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b border-[var(--border)]">
          {(
            [
              ["renders", "Renders", renders.length],
              ["assets", "Media assets", assets.length],
              ["audio", "Audio", audio.length],
            ] as [Tab, string, number][]
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-[13px] transition-colors ${
                tab === key
                  ? "border-b-2 border-[var(--primary)] font-medium text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {t(label)}
              <span className="ml-1.5 text-[11px] text-[var(--muted-foreground)]">
                {count}
              </span>
            </button>
          ))}
        </div>

        {tab === "renders" && (
          <section>
            {/* Render controls */}
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
              <button
                type="button"
                disabled={rendering}
                onClick={() => void handleRender()}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-[13px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rendering ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                {t("Render full video")}
              </button>
              <div className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)]">
                <span>{t("Frames")}</span>
                <input
                  value={frameStart}
                  onChange={(e) =>
                    setFrameStart(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="0"
                  inputMode="numeric"
                  className="w-16 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                />
                <span>–</span>
                <input
                  value={frameEnd}
                  onChange={(e) =>
                    setFrameEnd(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="300"
                  inputMode="numeric"
                  className="w-16 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                />
                <button
                  type="button"
                  disabled={rendering || !framesValid}
                  onClick={() =>
                    parsedStart !== null &&
                    parsedEnd !== null &&
                    void handleRender({ start: parsedStart, end: parsedEnd })
                  }
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("Re-render frames")}
                </button>
              </div>
              {rendering && (
                <span className="ml-auto flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)]">
                  <Loader2 size={12} className="animate-spin" />
                  {activeJobId
                    ? t("Rendering job {{jobId}}...", { jobId: activeJobId })
                    : t("Rendering...")}
                </span>
              )}
            </div>

            {/* Render list */}
            {renders.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-[var(--muted-foreground)]">
                {t("No renders yet")}
              </p>
            ) : (
              <div className="space-y-3">
                {renders.map((render) => {
                  const url = videoFileUrl(
                    name,
                    "renders",
                    `${render.job_id}.mp4`,
                  );
                  return (
                    <div
                      key={render.job_id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
                    >
                      <div className="mb-2 flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
                        <Film size={13} />
                        <span className="font-medium text-[var(--foreground)]">
                          {render.job_id}
                        </span>
                        <span>{formatBytes(render.size)}</span>
                        <span>{formatTs(render.mtime)}</span>
                        <a
                          href={url}
                          download={`${render.job_id}.mp4`}
                          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-[var(--foreground)] hover:bg-[var(--muted)]"
                        >
                          <Download size={12} />
                          {t("Download")}
                        </a>
                      </div>
                      <video
                        controls
                        preload="metadata"
                        src={url}
                        className="w-full rounded-lg bg-black"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === "assets" && (
          <section>
            {assets.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-[var(--muted-foreground)]">
                {t("No assets yet")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {assets.map((asset) => {
                  const url = videoFileUrl(name, "assets", asset.name);
                  if (asset.kind === "image") {
                    return (
                      <a
                        key={asset.name}
                        href={url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="group overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic backend artifact, next/image can't size it */}
                        <img
                          src={url}
                          alt={asset.name}
                          loading="lazy"
                          className="aspect-video w-full object-cover transition-opacity group-hover:opacity-90"
                        />
                        <div className="truncate px-2 py-1.5 text-[11px] text-[var(--muted-foreground)]">
                          {asset.name}
                        </div>
                      </a>
                    );
                  }
                  return (
                    <div
                      key={asset.name}
                      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
                    >
                      <div className="flex items-center gap-1.5 text-[12px] text-[var(--foreground)]">
                        <FileJson size={13} className="shrink-0" />
                        <span className="truncate" title={asset.name}>
                          {asset.name}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        {formatBytes(asset.size)}
                      </div>
                      {asset.meta ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                            {t("Meta summary")}
                          </summary>
                          <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-[var(--background)] p-2 text-[10px] text-[var(--muted-foreground)]">
                            {JSON.stringify(asset.meta, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === "audio" && (
          <section>
            {audio.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-[var(--muted-foreground)]">
                {t("No audio yet")}
              </p>
            ) : (
              <div className="space-y-2">
                {audio.map((track) => (
                  <div
                    key={track.name}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5"
                  >
                    <Music size={14} className="shrink-0 text-[var(--muted-foreground)]" />
                    <span
                      className="min-w-0 truncate text-[13px] text-[var(--foreground)]"
                      title={track.name}
                    >
                      {track.name}
                    </span>
                    <span className="text-[12px] text-[var(--muted-foreground)]">
                      {formatDuration(track.duration_seconds)}
                    </span>
                    {track.has_align ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={11} />
                        {t("Aligned")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]">
                        <CircleDashed size={11} />
                        {t("No alignment")}
                      </span>
                    )}
                    <audio
                      controls
                      preload="none"
                      src={videoFileUrl(name, "audio", track.name)}
                      className="ml-auto h-8 max-w-full"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
