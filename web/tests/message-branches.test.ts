import test from "node:test";
import assert from "node:assert/strict";
import { buildVisiblePath, tipMessageId } from "../lib/message-branches";
import type { MessageItem } from "../context/UnifiedChatContext";

// Repro: a video_pipeline session whose earliest persisted message chains
// under a message from a deleted (cancelled) turn. The flat list then has
// NO row with ``parentMessageId === null`` — the walk in buildVisiblePath
// used to start at the null root, find no children, and return an empty
// path, so the whole transcript rendered blank.
test("dangling parent_message_id (deleted turn) re-roots the chain", () => {
  const messages = [
    // id 44 belonged to a deleted turn; nothing in the list has parent null.
    { id: 45, role: "user" as const, content: "q1", parentMessageId: 44 },
    { id: 48, role: "user" as const, content: "q2", parentMessageId: 45 },
    {
      id: 49,
      role: "assistant" as const,
      content: "a2",
      parentMessageId: 48,
    },
    { id: 50, role: "user" as const, content: "q3", parentMessageId: 49 },
    {
      id: 51,
      role: "assistant" as const,
      content: "a3",
      parentMessageId: 50,
    },
  ];

  const { messages: visible } = buildVisiblePath(
    messages as unknown as MessageItem[],
    {},
  );

  assert.deepEqual(
    visible.map((m) => m.id),
    [45, 48, 49, 50, 51],
  );
  assert.equal(tipMessageId(visible), 51);
});

// A healthy session (null-rooted chain) must be unaffected by the re-root.
test("null-rooted chains are unchanged", () => {
  const messages = [
    { id: 1, role: "user" as const, content: "q1", parentMessageId: null },
    {
      id: 2,
      role: "assistant" as const,
      content: "a1",
      parentMessageId: 1,
    },
    { id: 3, role: "user" as const, content: "q2", parentMessageId: 2 },
  ];

  const { messages: visible } = buildVisiblePath(
    messages as unknown as MessageItem[],
    {},
  );

  assert.deepEqual(
    visible.map((m) => m.id),
    [1, 2, 3],
  );
});
