"use client";

/**
 * Videos home — project-based list for the video-generation system.
 * One project = one video (YAML spec + artifact directory under data/videos/).
 * Creation is conversation-driven: the modal collects series/episode/topic and
 * hands off to a fresh chat running the video_pipeline capability.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clapperboard, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import StageLights from "@/components/videos/StageLights";
import { useAppShell } from "@/context/AppShellContext";
import { formatDate, formatTime } from "@/lib/datetime";
import {
  deleteVideo,
  getVideoArtifacts,
  listVideos,
  type VideoSummary,
} from "@/lib/videos-api";

export default function VideosHomePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { language } = useAppShell();
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Latest render mtime per project — the list endpoint only carries job ids,
  // so card footers are filled by one artifacts call per project.
  const [latestRenderAt, setLatestRenderAt] = useState<
    Record<string, number | null>
  >({});
  const [createOpen, setCreateOpen] = useState(false);
  const [series, setSeries] = useState("");
  const [episode, setEpisode] = useState("1");
  const [topic, setTopic] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listVideos();
      setVideos(list);
      const entries = await Promise.all(
        list.map(async (video) => {
          try {
            const artifacts = await getVideoArtifacts(video.name);
            return [video.name, artifacts.renders[0]?.mtime ?? null] as const;
          } catch {
            return [video.name, null] as const;
          }
        }),
      );
      setLatestRenderAt(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canCreate = series.trim() !== "" && topic.trim() !== "";

  const [deleting, setDeleting] = useState<string | null>(null);
  const handleDelete = useCallback(
    async (video: VideoSummary) => {
      const label = video.display_name || video.name;
      if (!window.confirm(t("Delete video project \"{{name}}\"? This cannot be undone.", { name: label }))) {
        return;
      }
      setDeleting(video.name);
      try {
        await deleteVideo(video.name);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setDeleting(null);
      }
    },
    [refresh, t],
  );

  const handleCreate = useCallback(() => {
    if (!canCreate) return;
    const prompt = t(
      "Generate a video for series \"{{series}}\" episode {{episode}}: {{topic}}",
      { series: series.trim(), episode: episode.trim() || "1", topic: topic.trim() },
    );
    router.push(
      `/home?capability=video_pipeline&video_prompt=${encodeURIComponent(prompt)}`,
    );
  }, [canCreate, episode, router, series, t, topic]);

  const formatTs = useCallback(
    (ts: number) => {
      const date = new Date(ts * 1000);
      return `${formatDate(date, language)} ${formatTime(date, language)}`;
    },
    [language],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--foreground)]">
              <Clapperboard size={20} />
              {t("Videos")}
            </h1>
            <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
              {t("One project per video — spec, assets, narration and renders.")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-[13px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
          >
            <Plus size={15} />
            {t("New video project")}
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center text-[var(--muted-foreground)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
            <p className="text-[13px] text-red-500">{error}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              {t("Retry")}
            </button>
          </div>
        ) : videos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center">
            <Clapperboard
              size={28}
              className="mx-auto text-[var(--muted-foreground)]/50"
            />
            <p className="mt-3 text-[14px] text-[var(--foreground)]">
              {t("No video projects yet")}
            </p>
            <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
              {t("Create one from a conversation — the pipeline builds the spec, assets, narration and final render.")}
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-[13px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
            >
              <Plus size={15} />
              {t("New video project")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => {
              const latest = latestRenderAt[video.name];
              return (
                <Link
                  key={video.name}
                  href={`/videos/${encodeURIComponent(video.name)}`}
                  className="group flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--primary)]/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="truncate text-[14px] font-medium text-[var(--foreground)] group-hover:text-[var(--primary)]"
                      title={video.name}
                    >
                      {video.display_name || video.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <StageLights stages={video.stages} />
                      <button
                        type="button"
                        aria-label={t("Delete")}
                        title={t("Delete")}
                        disabled={deleting === video.name}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleDelete(video);
                        }}
                        className="rounded p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-[var(--danger,#dc2626)] group-hover:opacity-100 disabled:opacity-40"
                      >
                        {deleting === video.name ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </span>
                  </div>
                  <div className="mt-2 text-[12px] text-[var(--muted-foreground)]">
                    {video.has_spec
                      ? typeof video.scene_count === "number"
                        ? t("{{count}} scenes", { count: video.scene_count })
                        : t("Spec ready")
                      : t("No spec yet")}
                  </div>
                  <div className="mt-auto pt-3 text-[12px] text-[var(--muted-foreground)]">
                    {latest
                      ? `${t("Latest render")}: ${formatTs(latest)}`
                      : t("No renders yet")}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("New video project")}
        titleIcon={<Clapperboard size={18} />}
        width="md"
      >
        <div className="space-y-4 p-4">
          <div className="flex gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-[12px] text-[var(--muted-foreground)]">
                {t("Series slug")}
              </span>
              <input
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                placeholder={t("e.g. linear-algebra") as string}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="w-24">
              <span className="mb-1 block text-[12px] text-[var(--muted-foreground)]">
                {t("Episode")}
              </span>
              <input
                value={episode}
                onChange={(e) =>
                  setEpisode(e.target.value.replace(/[^0-9]/g, ""))
                }
                inputMode="numeric"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] text-[var(--muted-foreground)]">
              {t("Topic")}
            </span>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={4}
              placeholder={
                t("Describe what this episode should cover...") as string
              }
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
            />
          </label>
          <p className="text-[12px] text-[var(--muted-foreground)]">
            {t("This opens a chat with the video pipeline pre-loaded — review the prompt and send to start generating.")}
          </p>
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={() => setCreateOpen(false)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={handleCreate}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-[13px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("Start in chat")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
