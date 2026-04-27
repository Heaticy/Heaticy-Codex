import test from "node:test";
import assert from "node:assert/strict";

import { normalizeServerPayload } from "../web/src/lib/normalize-events.js";

test("normalizes rich message_part events by kind", () => {
  const parts = normalizeServerPayload(
    {
      type: "message_part",
      role: "assistant",
      kind: "command_exec",
      part: {
        type: "event",
        kind: "command_exec",
        text: "npm test",
        item: { type: "command_execution", command: "npm test" }
      }
    },
    "session-1"
  );

  assert.equal(parts.length, 1);
  assert.equal(parts[0].partType, "command_exec");
  assert.equal(parts[0].payload.text, "npm test");
});

test("normalizes upstream response items into process events", () => {
  const parts = normalizeServerPayload(
    {
      type: "response_item",
      item: {
        type: "command_execution",
        command: "npm test",
        status: "completed"
      }
    },
    "session-1"
  );

  assert.equal(parts.length, 1);
  assert.equal(parts[0].partType, "command_exec");
  assert.match(parts[0].payload.text, /npm test/);
});

test("keeps commentary agent messages visible and turns reasoning into process", () => {
  const commentary = normalizeServerPayload({
    type: "event_msg",
    payload: {
      type: "agent_message",
      phase: "commentary",
      message: "我会先检查日志。"
    }
  });
  const reasoning = normalizeServerPayload({
    type: "event_msg",
    payload: {
      type: "agent_message",
      phase: "reasoning",
      message: "检查失败路径"
    }
  });

  assert.equal(commentary[0].partType, "markdown");
  assert.equal(commentary[0].payload.text, "我会先检查日志。");
  assert.equal(reasoning[0].partType, "reasoning");
  assert.equal(reasoning[0].payload.text, "检查失败路径");
});

test("filters non-renderable image urls from message parts", () => {
  const local = normalizeServerPayload({
    type: "message_part",
    role: "assistant",
    part: {
      type: "image",
      url: "/Users/demo/private.png"
    }
  });
  const dataUrl = normalizeServerPayload({
    type: "message_part",
    role: "assistant",
    part: {
      type: "image",
      url: "data:image/png;base64,abc"
    }
  });

  assert.equal(local.length, 0);
  assert.equal(dataUrl.length, 1);
  assert.equal(dataUrl[0].partType, "image");
});
