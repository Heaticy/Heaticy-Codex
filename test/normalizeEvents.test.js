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
