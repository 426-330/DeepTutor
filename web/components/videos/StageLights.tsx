"use client";

import { useTranslation } from "react-i18next";
import {
  VIDEO_STAGES,
  type VideoStageRecord,
} from "@/lib/videos-api";

/** Short per-stage labels for the four-stage pipeline indicator. */
const STAGE_LABEL_KEYS: Record<(typeof VIDEO_STAGES)[number], string> = {
  video_spec: "Spec",
  asset_gen: "Media assets",
  narration_gen: "Narration",
  video_compose: "Compose",
};

function stageColor(status?: string): string {
  if (status === "done") return "bg-emerald-500";
  if (status === "failed") return "bg-red-500";
  if (status === "running") return "bg-amber-400 animate-pulse";
  return "bg-[var(--muted-foreground)]/30";
}

/**
 * Four-stage pipeline status lights (spec → assets → narration → compose).
 * Compact dot row by default; `showLabels` adds a caption under each dot for
 * the detail page's status bar.
 */
export default function StageLights({
  stages,
  showLabels = false,
}: {
  stages?: Record<string, VideoStageRecord> | null;
  showLabels?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={showLabels ? "flex items-start gap-4" : "flex items-center gap-1.5"}>
      {VIDEO_STAGES.map((stage) => {
        const record = stages?.[stage];
        const status = record?.status;
        const statusLabel =
          status === "done"
            ? t("Done")
            : status === "failed"
              ? t("Failed")
              : status === "running"
                ? t("Running")
                : t("Pending");
        const label = t(STAGE_LABEL_KEYS[stage]);
        const title = record?.error
          ? `${label}: ${statusLabel} — ${record.error}`
          : `${label}: ${statusLabel}`;
        return (
          <div
            key={stage}
            title={title}
            className={
              showLabels ? "flex flex-col items-center gap-1" : undefined
            }
          >
            <span
              className={`block rounded-full ${stageColor(status)} ${
                showLabels ? "h-2.5 w-2.5" : "h-2 w-2"
              }`}
            />
            {showLabels && (
              <span className="text-[11px] text-[var(--muted-foreground)]">
                {label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
