"use client";

/**
 * Spec 编辑器（video-generation-system M5 / tasks 5.5）：
 * 左编辑右预览、表单/YAML 双模同一份 YAML 事实源、PUT 保存 + 400 错误定位。
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import Button from "@/components/ui/Button";
import { apiFetch, apiUrl } from "@/lib/api";
import {
  dumpSpecDoc,
  extractValidationErrors,
  locateValidationError,
  parseSpecText,
  type SpecDoc,
  type SpecValidationError,
} from "@/lib/video-spec";

import SpecForm from "./SpecForm";
import SpecPreview from "./SpecPreview";
import SpecYamlEditor from "./SpecYamlEditor";

type EditorMode = "form" | "yaml";

export default function SpecEditor({ name }: { name: string }) {
  const { t } = useTranslation();
  const [yamlText, setYamlText] = useState<string | null>(null);
  const [savedText, setSavedText] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("form");
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<SpecValidationError[] | null>(
    null,
  );
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [selectedScene, setSelectedScene] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          apiUrl(`/api/v1/videos/${encodeURIComponent(name)}/spec`),
        );
        if (!res.ok) throw new Error(`GET spec failed (${res.status})`);
        const text = await res.text();
        if (!cancelled) {
          setYamlText(text);
          setSavedText(text);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  const parsed = useMemo(
    () => (yamlText == null ? null : parseSpecText(yamlText)),
    [yamlText],
  );

  const dirty = yamlText != null && yamlText !== savedText;

  /** 表单编辑入口：在解析后的 doc 副本上执行变更，再 dump 回 YAML 文本。 */
  const updateDoc = useCallback(
    (mutate: (doc: SpecDoc) => void) => {
      if (!parsed?.ok) return;
      const doc = structuredClone(parsed.doc);
      mutate(doc);
      setYamlText(dumpSpecDoc(doc));
      setSaveErrors(null);
      setSaveNotice(null);
    },
    [parsed],
  );

  const handleYamlChange = useCallback((text: string) => {
    setYamlText(text);
    setSaveErrors(null);
    setSaveNotice(null);
  }, []);

  const jumpToError = useCallback((err: SpecValidationError) => {
    const loc = locateValidationError(err);
    if (loc.sceneIndex != null) {
      setMode("form");
      setSelectedScene(loc.sceneIndex);
    }
  }, []);

  const save = useCallback(async () => {
    if (yamlText == null || saving) return;
    setSaving(true);
    setSaveNotice(null);
    try {
      const res = await apiFetch(
        apiUrl(`/api/v1/videos/${encodeURIComponent(name)}/spec`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: yamlText }),
        },
      );
      if (res.ok) {
        setSavedText(yamlText);
        setSaveErrors(null);
      } else if (res.status === 400) {
        const body = await res.json().catch(() => null);
        const errors = extractValidationErrors(body);
        // 校验未过：保持未保存状态，并把首条错误定位到对应屏。
        setSaveErrors(errors);
        const first = errors
          .map(locateValidationError)
          .find((loc) => loc.sceneIndex != null);
        if (mode === "form" && first?.sceneIndex != null) {
          setSelectedScene(first.sceneIndex);
        }
      } else {
        setSaveNotice(`PUT spec failed (${res.status})`);
      }
    } catch (err) {
      setSaveNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [yamlText, saving, name, mode]);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="rounded-xl border border-[var(--destructive)] bg-[var(--card)] p-6 text-sm text-[var(--destructive)]">
          {t("Failed to load spec")}: {loadError}
        </div>
      </div>
    );
  }
  if (yamlText == null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">
        {t("Loading spec…")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <Link
          href="/videos"
          className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          ← {t("Videos")}
        </Link>
        <h1 className="truncate text-sm font-semibold">{name}</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)] text-xs">
            {(["form", "yaml"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 ${
                  mode === m
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                {m === "form" ? t("Form") : "YAML"}
              </button>
            ))}
          </div>
          <span
            className={`text-xs ${
              saveErrors
                ? "text-[var(--destructive)]"
                : dirty
                  ? "text-[var(--muted-foreground)]"
                  : "text-[var(--success,#16a34a)]"
            }`}
          >
            {saveErrors
              ? t("Validation failed")
              : dirty
                ? t("Unsaved changes")
                : t("Saved")}
          </span>
          <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
            {t("Save")}
          </Button>
        </div>
      </header>

      {/* Validation / save feedback */}
      {(saveErrors || saveNotice) && (
        <div className="max-h-40 overflow-y-auto border-b border-[var(--destructive)]/40 bg-[var(--destructive)]/5 px-4 py-2">
          {saveNotice && (
            <p className="text-xs text-[var(--destructive)]">{saveNotice}</p>
          )}
          {saveErrors?.map((err, i) => {
            const loc = locateValidationError(err);
            return (
              <button
                key={i}
                onClick={() => jumpToError(err)}
                className="block w-full text-left text-xs text-[var(--destructive)] hover:underline"
              >
                {loc.sceneIndex != null
                  ? `${t("Scene")} ${loc.sceneIndex + 1} · `
                  : ""}
                {err.field} — {err.message}
              </button>
            );
          })}
        </div>
      )}

      {/* Editor + preview */}
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 w-1/2 overflow-y-auto border-r border-[var(--border)]">
          {mode === "form" ? (
            parsed?.ok ? (
              <SpecForm
                doc={parsed.doc}
                onUpdate={updateDoc}
                errors={saveErrors ?? []}
                selectedScene={selectedScene}
                onSelectScene={setSelectedScene}
              />
            ) : (
              <div className="p-4">
                <div className="rounded-lg border border-[var(--destructive)]/40 bg-[var(--destructive)]/5 p-3 text-xs text-[var(--destructive)]">
                  <p className="mb-1 font-medium">
                    {t("Fix YAML errors to use the form view")}
                  </p>
                  {parsed?.issues.map((issue, i) => (
                    <p key={i}>{issue.message}</p>
                  ))}
                </div>
              </div>
            )
          ) : (
            <SpecYamlEditor
              value={yamlText}
              onChange={handleYamlChange}
              parseIssues={parsed?.ok ? [] : (parsed?.issues ?? [])}
            />
          )}
        </div>
        <div className="min-h-0 w-1/2 overflow-y-auto p-4">
          <SpecPreview text={yamlText} />
        </div>
      </div>
    </div>
  );
}
