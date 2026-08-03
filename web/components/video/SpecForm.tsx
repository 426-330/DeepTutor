"use client";

/**
 * 表单模式编辑器：按 DSL 结构渲染受控表单 —— 顶层元数据 + 每屏
 * type/layout/duration + PageModel 六字段 + 类型专有 content_slots
 * （槽位字段集来自 @/lib/video-spec 的 SCENE_SLOT_FIELDS，DSL §3/§4）。
 * 所有变更通过 onUpdate 写回 doc，由父组件 dump 成 YAML（单一事实源）。
 */
import { useTranslation } from "react-i18next";

import {
  LAYOUT_IDS,
  SCENE_SLOT_FIELDS,
  SCENE_TYPES,
  locateValidationError,
  newSceneDoc,
  type RawSceneDoc,
  type SlotFieldDef,
  type SpecDoc,
  type SpecValidationError,
} from "@/lib/video-spec";
import type { SceneType } from "@/vendor/remotion-preview/parser/types";

const INPUT_CLASS =
  "w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm outline-none focus:border-[var(--primary)]";
const ERROR_CLASS = "border-[var(--destructive)]";

interface FormProps {
  doc: SpecDoc;
  onUpdate: (mutate: (doc: SpecDoc) => void) => void;
  errors: SpecValidationError[];
  selectedScene: number;
  onSelectScene: (index: number) => void;
}

export default function SpecForm({
  doc,
  onUpdate,
  errors,
  selectedScene,
  onSelectScene,
}: FormProps) {
  const { t } = useTranslation();
  const scenes = doc.scenes ?? [];
  const sceneIndex = Math.min(selectedScene, Math.max(scenes.length - 1, 0));
  const scene = scenes[sceneIndex];

  /** 该屏命中的校验错误（fieldPath 为 null 表示整屏级错误）。 */
  const sceneError = (i: number, path: string | null): string | null => {
    for (const err of errors) {
      const loc = locateValidationError(err);
      if (loc.sceneIndex !== i) continue;
      if (path == null || loc.fieldPath == null) return err.message;
      if (loc.fieldPath === path || loc.fieldPath.startsWith(`${path}.`)) {
        return err.message;
      }
    }
    return null;
  };
  const sceneHasError = (i: number) =>
    errors.some((err) => locateValidationError(err).sceneIndex === i);

  const updateScene = (mutate: (s: RawSceneDoc) => void) =>
    onUpdate((d) => {
      const s = d.scenes?.[sceneIndex];
      if (s) mutate(s);
    });

  const setSlot = (key: string, value: unknown) =>
    updateScene((s) => {
      if (value === undefined || value === "") delete s[key];
      else s[key] = value;
    });

  return (
    <div className="space-y-6 p-4">
      {/* 顶层元数据 */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
          {t("Video metadata")}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("Version")}>
            <select
              className={INPUT_CLASS}
              value={doc.version ?? "3.1"}
              onChange={(e) =>
                onUpdate((d) => {
                  d.version = e.target.value;
                })
              }
            >
              <option value="3.1">3.1</option>
              <option value="3.0">3.0</option>
            </select>
          </Field>
          <Field label={t("FPS")}>
            <select
              className={INPUT_CLASS}
              value={doc.fps ?? 30}
              onChange={(e) =>
                onUpdate((d) => {
                  d.fps = Number(e.target.value);
                })
              }
            >
              {[24, 25, 30, 60].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Series")}>
            <input
              className={INPUT_CLASS}
              value={doc.series ?? ""}
              onChange={(e) =>
                onUpdate((d) => {
                  d.series = e.target.value;
                })
              }
            />
          </Field>
          <Field label={t("Episode")}>
            <input
              className={INPUT_CLASS}
              type="number"
              min={1}
              value={doc.episode ?? ""}
              onChange={(e) =>
                onUpdate((d) => {
                  const v = e.target.value;
                  if (v === "") delete d.episode;
                  else d.episode = Number(v);
                })
              }
            />
          </Field>
          <Field label={t("Opening title")}>
            <input
              className={INPUT_CLASS}
              value={doc.opening?.title ?? ""}
              onChange={(e) =>
                onUpdate((d) => {
                  d.opening = { ...d.opening, title: e.target.value };
                })
              }
            />
          </Field>
          <Field label={t("Opening subtitle")}>
            <input
              className={INPUT_CLASS}
              value={doc.opening?.subtitle ?? ""}
              onChange={(e) =>
                onUpdate((d) => {
                  d.opening = { ...d.opening, subtitle: e.target.value };
                })
              }
            />
          </Field>
        </div>
      </section>

      {/* 屏标签栏 */}
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {scenes.map((s, i) => (
            <button
              key={i}
              onClick={() => onSelectScene(i)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                i === sceneIndex
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              s{String(i + 1).padStart(2, "0")} · {s.type ?? "?"}
              {sceneHasError(i) ? " ⚠" : ""}
            </button>
          ))}
          <select
            className={`${INPUT_CLASS} ml-1 w-auto`}
            value=""
            onChange={(e) => {
              const type = e.target.value as SceneType;
              if (!type) return;
              onUpdate((d) => {
                d.scenes = [...(d.scenes ?? []), newSceneDoc(type)];
              });
              onSelectScene(scenes.length);
            }}
          >
            <option value="">{t("Add scene")}…</option>
            {SCENE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {!scene ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("No scenes yet")}
          </p>
        ) : (
          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            {/* 屏操作 + 结构字段 */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {t("Scene")} {sceneIndex + 1}
              </span>
              <div className="ml-auto flex gap-1">
                <button
                  className="rounded px-2 py-0.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                  disabled={sceneIndex === 0}
                  onClick={() => {
                    onUpdate((d) => {
                      const arr = d.scenes ?? [];
                      [arr[sceneIndex - 1], arr[sceneIndex]] = [
                        arr[sceneIndex],
                        arr[sceneIndex - 1],
                      ];
                    });
                    onSelectScene(sceneIndex - 1);
                  }}
                >
                  ↑ {t("Move up")}
                </button>
                <button
                  className="rounded px-2 py-0.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                  disabled={sceneIndex >= scenes.length - 1}
                  onClick={() => {
                    onUpdate((d) => {
                      const arr = d.scenes ?? [];
                      [arr[sceneIndex], arr[sceneIndex + 1]] = [
                        arr[sceneIndex + 1],
                        arr[sceneIndex],
                      ];
                    });
                    onSelectScene(sceneIndex + 1);
                  }}
                >
                  ↓ {t("Move down")}
                </button>
                <button
                  className="rounded px-2 py-0.5 text-xs text-[var(--destructive)] hover:bg-[var(--muted)]"
                  onClick={() => {
                    onUpdate((d) => {
                      d.scenes?.splice(sceneIndex, 1);
                    });
                    onSelectScene(Math.max(sceneIndex - 1, 0));
                  }}
                >
                  {t("Delete scene")}
                </button>
              </div>
            </div>
            {sceneError(sceneIndex, null) && (
              <p className="text-xs text-[var(--destructive)]">
                {sceneError(sceneIndex, null)}
              </p>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Field label={t("Scene type")} error={sceneError(sceneIndex, "type")}>
                <select
                  className={INPUT_CLASS}
                  value={scene.type ?? ""}
                  onChange={(e) =>
                    updateScene((s) => {
                      s.type = e.target.value;
                    })
                  }
                >
                  {SCENE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("Layout")} error={sceneError(sceneIndex, "layout")}>
                <select
                  className={INPUT_CLASS}
                  value={scene.layout ?? ""}
                  onChange={(e) =>
                    updateScene((s) => {
                      s.layout = e.target.value;
                    })
                  }
                >
                  {LAYOUT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("Duration (frames)")}
                error={sceneError(sceneIndex, "duration_frames")}
              >
                <input
                  className={INPUT_CLASS}
                  type="number"
                  min={1}
                  placeholder="90"
                  value={scene.duration_frames ?? ""}
                  onChange={(e) =>
                    updateScene((s) => {
                      const v = e.target.value;
                      if (v === "") delete s.duration_frames;
                      else s.duration_frames = Number(v);
                    })
                  }
                />
              </Field>
            </div>

            {/* PageModel 六字段 */}
            <Field label={t("Title")} error={sceneError(sceneIndex, "title")}>
              <input
                className={INPUT_CLASS}
                value={scene.title ?? ""}
                onChange={(e) =>
                  updateScene((s) => {
                    s.title = e.target.value;
                  })
                }
              />
            </Field>
            <Field label={t("Question")} error={sceneError(sceneIndex, "question")}>
              <input
                className={INPUT_CLASS}
                value={scene.question ?? ""}
                onChange={(e) =>
                  updateScene((s) => {
                    s.question = e.target.value;
                  })
                }
              />
            </Field>
            <Field
              label={t("Core message")}
              error={sceneError(sceneIndex, "core_message")}
            >
              <textarea
                className={`${INPUT_CLASS} min-h-16`}
                value={scene.core_message ?? ""}
                onChange={(e) =>
                  updateScene((s) => {
                    s.core_message = e.target.value;
                  })
                }
              />
            </Field>
            {(["opening", "explanation", "conclusion"] as const).map((key) => (
              <Field
                key={key}
                label={t(`Narration ${key}`)}
                error={sceneError(sceneIndex, `narration.${key}`)}
              >
                <textarea
                  className={`${INPUT_CLASS} min-h-14`}
                  value={scene.narration?.[key] ?? ""}
                  onChange={(e) =>
                    updateScene((s) => {
                      s.narration = { ...s.narration, [key]: e.target.value };
                    })
                  }
                />
              </Field>
            ))}
            <div className="grid grid-cols-3 gap-2">
              {(["primary", "secondary", "emphasis"] as const).map((key) => (
                <Field
                  key={key}
                  label={t(`Visual ${key}`)}
                  error={sceneError(sceneIndex, `visual.${key}`)}
                >
                  <input
                    className={INPUT_CLASS}
                    value={scene.visual?.[key] ?? ""}
                    onChange={(e) =>
                      updateScene((s) => {
                        s.visual = { ...s.visual, [key]: e.target.value };
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            <Field
              label={t("Next question")}
              error={sceneError(sceneIndex, "transition.next_question")}
            >
              <input
                className={INPUT_CLASS}
                value={scene.transition?.next_question ?? ""}
                onChange={(e) =>
                  updateScene((s) => {
                    s.transition = {
                      ...s.transition,
                      next_question: e.target.value,
                    };
                  })
                }
              />
            </Field>

            {/* content_slots */}
            <h3 className="pt-2 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              {t("Content slots")}
            </h3>
            {(
              SCENE_SLOT_FIELDS[(scene.type ?? "concept") as SceneType] ?? []
            ).map((def) => (
              <SlotField
                key={def.key}
                def={def}
                sceneKey={`${sceneIndex}.${def.key}`}
                value={scene[def.key]}
                error={sceneError(sceneIndex, def.key)}
                onChange={(v) => setSlot(def.key, v)}
                t={t}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className={`mb-0.5 block text-xs ${
          error ? "text-[var(--destructive)]" : "text-[var(--muted-foreground)]"
        }`}
      >
        {label}
        {error ? ` — ${error}` : ""}
      </span>
      {children}
    </label>
  );
}

function SlotField({
  def,
  sceneKey,
  value,
  error,
  onChange,
  t,
}: {
  def: SlotFieldDef;
  sceneKey: string;
  value: unknown;
  error: string | null;
  onChange: (value: unknown) => void;
  t: (key: string) => string;
}) {
  const cls = `${INPUT_CLASS} ${error ? ERROR_CLASS : ""}`;
  switch (def.kind) {
    case "text":
      return (
        <Field label={t(def.label)} error={error}>
          <input
            className={cls}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value || undefined)}
          />
        </Field>
      );
    case "textarea":
      return (
        <Field label={t(def.label)} error={error}>
          <textarea
            className={`${cls} min-h-14`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value || undefined)}
          />
        </Field>
      );
    case "select":
      return (
        <Field label={t(def.label)} error={error}>
          <select
            className={cls}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value || undefined)}
          >
            <option value="">—</option>
            {def.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
      );
    case "string-list":
      // 非受控 + blur 提交：避免受控模式下过滤空行导致换行被吞。
      return (
        <Field label={`${t(def.label)} (${t("one item per line")})`} error={error}>
          <textarea
            key={sceneKey}
            className={`${cls} min-h-20 font-mono text-xs`}
            defaultValue={Array.isArray(value) ? value.join("\n") : ""}
            onBlur={(e) => {
              const items = e.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0);
              onChange(items.length > 0 ? items : undefined);
            }}
          />
        </Field>
      );
    case "object-list": {
      // object[] 槽位（如 metrics/events）：每行一个 object 的动态子表单，
      // 字段形状按槽位定义（objectFields）；全行空白的行不落盘。
      const fields = def.objectFields ?? [];
      const rows = Array.isArray(value)
        ? (value as Array<Record<string, unknown>>)
        : [];
      const commit = (next: Array<Record<string, unknown>>) => {
        const cleaned = next
          .map((row) => {
            const out: Record<string, string> = {};
            for (const f of fields) {
              const v = String(row[f.key] ?? "").trim();
              if (v) out[f.key] = v;
            }
            return out;
          })
          .filter((row) => Object.keys(row).length > 0);
        onChange(cleaned.length > 0 ? cleaned : undefined);
      };
      return (
        <Field label={t(def.label)} error={error}>
          <div className="space-y-1">
            {rows.map((row, i) => (
              <div key={i} className="flex gap-1">
                {fields.map((f) => (
                  <input
                    key={f.key}
                    className={cls}
                    placeholder={t(f.label) + (f.required ? " *" : "")}
                    value={typeof row[f.key] === "string" ? (row[f.key] as string) : ""}
                    onChange={(e) => {
                      const next = rows.map((r, j) =>
                        j === i ? { ...r, [f.key]: e.target.value } : r,
                      );
                      commit(next);
                    }}
                  />
                ))}
                <button
                  className="px-2 text-[var(--destructive)]"
                  onClick={(e) => {
                    e.preventDefault();
                    commit(rows.filter((_, j) => j !== i));
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="text-xs text-[var(--primary)] hover:underline"
              onClick={(e) => {
                e.preventDefault();
                commit([...rows, {}]);
              }}
            >
              + {t("Add row")}
            </button>
          </div>
        </Field>
      );
    }
    case "variables": {
      const rows = Array.isArray(value)
        ? (value as Array<{ symbol?: string; meaning?: string }>)
        : [];
      return (
        <Field label={t(def.label)} error={error}>
          <div className="space-y-1">
            {rows.map((row, i) => (
              <div key={i} className="flex gap-1">
                <input
                  className={cls}
                  placeholder={t("Symbol")}
                  value={row.symbol ?? ""}
                  onChange={(e) => {
                    const next = rows.map((r, j) =>
                      j === i ? { ...r, symbol: e.target.value } : r,
                    );
                    onChange(next);
                  }}
                />
                <input
                  className={cls}
                  placeholder={t("Meaning")}
                  value={row.meaning ?? ""}
                  onChange={(e) => {
                    const next = rows.map((r, j) =>
                      j === i ? { ...r, meaning: e.target.value } : r,
                    );
                    onChange(next);
                  }}
                />
                <button
                  className="px-2 text-[var(--destructive)]"
                  onClick={(e) => {
                    e.preventDefault();
                    const next = rows.filter((_, j) => j !== i);
                    onChange(next.length > 0 ? next : undefined);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="text-xs text-[var(--primary)] hover:underline"
              onClick={(e) => {
                e.preventDefault();
                onChange([...rows, { symbol: "", meaning: "" }]);
              }}
            >
              + {t("Add variable")}
            </button>
          </div>
        </Field>
      );
    }
    case "axes": {
      const axes =
        value && typeof value === "object"
          ? (value as { x?: string; y?: string })
          : {};
      return (
        <Field label={t(def.label)} error={error}>
          <div className="flex gap-1">
            {(["x", "y"] as const).map((axis) => (
              <input
                key={axis}
                className={cls}
                placeholder={axis.toUpperCase()}
                value={axes[axis] ?? ""}
                onChange={(e) => {
                  const next = { ...axes, [axis]: e.target.value };
                  onChange(next.x || next.y ? next : undefined);
                }}
              />
            ))}
          </div>
        </Field>
      );
    }
  }
}
