import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPreviewIr,
  dumpSpecDoc,
  extractValidationErrors,
  locateValidationError,
  parseSpecText,
  SCENE_SLOT_FIELDS,
} from "@/lib/video-spec";

const SAMPLE = `
version: "3.1"
series: 量化科普
episode: 3
fps: 30
opening:
  title: 最大回撤是什么？
scenes:
  - type: opening
    layout: full-hero
    title: 开场
    question: 为什么要看？
    core_message: 核心
    narration: { opening: o, explanation: e, conclusion: c }
    visual: { primary: p }
    hook_line: 钩子
  - type: formula
    layout: split-screen
    duration_frames: 120
    title: 公式
    question: 怎么算？
    core_message: 核心2
    narration: { opening: o, explanation: e, conclusion: c }
    visual: { primary: p }
    formula: "\\\\alpha = x"
    numeric_example: "1 + 2"
`;

test("buildPreviewIr builds IR from valid YAML", () => {
  const result = buildPreviewIr(SAMPLE);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { ir } = result;
  assert.equal(ir.scenes.length, 2);
  assert.equal(ir.fps, 30);
  // layout alias: split-screen → split
  assert.equal(ir.scenes[1].layout, "split");
  // durations: default 90 for scene 1, dsl 120 for scene 2
  assert.equal(ir.scenes[0].durationFrames, 90);
  assert.equal(ir.scenes[0].durationSource, "default");
  assert.equal(ir.scenes[1].startFrame, 90);
  assert.equal(ir.totalFrames, 210);
  // style chain resolved (default theme)
  assert.equal(ir.style.theme, "default");
  assert.ok(ir.scenes[0].style.colors.primary.startsWith("#"));
  // slots pass through
  assert.equal(ir.scenes[0].slots.hook_line, "钩子");
  assert.equal(ir.scenes[1].slots.numeric_example, "1 + 2");
  // browser preview never inlines chart data / audio
  assert.equal(ir.scenes[0].audioUrl, undefined);
});

test("buildPreviewIr tolerates mid-edit scenes (missing PageModel fields)", () => {
  const result = buildPreviewIr("scenes:\n  - type: concept\n");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.ir.scenes[0].narration.explanation, "");
  assert.equal(result.ir.scenes[0].title, "");
});

test("buildPreviewIr returns structured issues for bad YAML", () => {
  const result = buildPreviewIr("scenes: [unclosed");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.length > 0);
  assert.ok(result.issues[0].message.length > 0);
});

test("parseSpecText rejects non-mapping roots", () => {
  const result = parseSpecText("- just\n- a\n- list\n");
  assert.equal(result.ok, false);
});

test("dumpSpecDoc round-trips through parseSpecText", () => {
  const parsed = parseSpecText(SAMPLE);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const dumped = dumpSpecDoc(parsed.doc);
  const reparsed = parseSpecText(dumped);
  assert.equal(reparsed.ok, true);
  if (!reparsed.ok) return;
  assert.equal(reparsed.doc.scenes?.length, 2);
  assert.equal(reparsed.doc.scenes?.[1].layout, "split-screen");
});

test("locateValidationError maps backend field/scene", () => {
  assert.deepEqual(
    locateValidationError({
      rule: "semantic",
      field: "scenes[2].numeric_example",
      message: "m",
      scene: 3,
    }),
    { sceneIndex: 2, fieldPath: "numeric_example" },
  );
  // falls back to the 1-based scene number when field has no pointer
  assert.deepEqual(
    locateValidationError({ rule: "", field: "(root)", message: "m", scene: 2 }),
    { sceneIndex: 1, fieldPath: null },
  );
});

test("extractValidationErrors reads the PUT 400 payload", () => {
  const errors = extractValidationErrors({
    detail: {
      error: "spec validation failed",
      errors: [
        { rule: "schema", field: "scenes[0].title", message: "required", scene: 1 },
      ],
    },
  });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].field, "scenes[0].title");
  assert.equal(errors[0].scene, 1);
});

test("object slots (metrics/events) use object-list with schema-shaped fields", () => {
  const metrics = SCENE_SLOT_FIELDS.data_comparison.find((f) => f.key === "metrics");
  assert.equal(metrics?.kind, "object-list");
  assert.deepEqual(
    metrics?.objectFields?.map((f) => f.key),
    ["label", "value", "unit", "note"],
  );
  assert.deepEqual(
    metrics?.objectFields?.filter((f) => f.required).map((f) => f.key),
    ["label", "value"],
  );

  const events = SCENE_SLOT_FIELDS.timeline.find((f) => f.key === "events");
  assert.equal(events?.kind, "object-list");
  assert.deepEqual(
    events?.objectFields?.map((f) => f.key),
    ["label", "detail"],
  );
});

test("buildPreviewIr passes object-array slots through to IR", () => {
  const text = `
version: "3.1"
series: demo
episode: 1
scenes:
  - type: data_comparison
    layout: comparison-2col
    title: t
    question: q
    core_message: c
    narration: { opening: o, explanation: e, conclusion: c }
    visual: { primary: p }
    metrics:
      - { label: 方案A, value: "25%", unit: "%", note: 年化 }
      - { label: 方案B, value: "18%" }
`;
  const result = buildPreviewIr(text);
  assert.equal(result.ok, true);
  if (result.ok) {
    const slots = result.ir.scenes[0].slots as Record<string, unknown>;
    const metrics = slots.metrics as Array<Record<string, string>>;
    assert.equal(metrics.length, 2);
    assert.equal(metrics[0].label, "方案A");
    assert.equal(metrics[0].value, "25%");
    assert.equal(metrics[1].note, undefined);
  }
});
