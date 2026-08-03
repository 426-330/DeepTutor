"use client";

/**
 * Remotion Player 预览（video-generation-system M5 / tasks 5.6）：
 * 编辑器文本 debounce 500ms → 浏览器侧 YAML→IR（js-yaml + worker 纯函数
 * styleChain）→ Player 渲染 ConceptVideo。全程不调渲染 API。
 * 解析失败 / 结构不可用时显示结构化错误而非白屏（未知场景类型由
 * ConceptVideo 自身降级为占位帧）。
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { buildPreviewIr } from "@/lib/video-spec";

const SpecPreviewPlayer = dynamic(() => import("./SpecPreviewPlayer"), {
  ssr: false,
  loading: () => <PlayerLoading />,
});

function PlayerLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex aspect-video items-center justify-center rounded-xl bg-[var(--muted)] text-xs text-[var(--muted-foreground)]">
      {t("Loading player…")}
    </div>
  );
}

const DEBOUNCE_MS = 500;

export default function SpecPreview({ text }: { text: string }) {
  const { t } = useTranslation();
  const [debounced, setDebounced] = useState(text);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(text), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text]);

  const result = useMemo(() => buildPreviewIr(debounced), [debounced]);

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
        {t("Preview")}
      </h2>
      {result.ok ? (
        result.ir.scenes.length > 0 ? (
          <SpecPreviewPlayer ir={result.ir} />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-[var(--muted)] text-xs text-[var(--muted-foreground)]">
            {t("No scenes yet")}
          </div>
        )
      ) : (
        <div className="rounded-xl border border-[var(--destructive)]/40 bg-[var(--destructive)]/5 p-4">
          <p className="mb-1 text-xs font-medium text-[var(--destructive)]">
            {t("Preview unavailable")}
          </p>
          {result.issues.map((issue, i) => (
            <p key={i} className="text-xs text-[var(--destructive)]">
              {issue.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
