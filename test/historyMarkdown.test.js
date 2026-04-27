import test from "node:test";
import assert from "node:assert/strict";

import { normalizeHistoryMessages } from "../web/src/lib/session-helpers.js";

test("history message cleanup preserves markdown fences and list structure", () => {
  const [message] = normalizeHistoryMessages([
    {
      role: "assistant",
      timestamp: "2026-04-26T14:47:44.383Z",
      text: [
        "**其他问题**",
        "",
        "1. **公式实现不一致**",
        "   论文公式：",
        "",
        "   ```tex",
        "   v_t = alpha v_{t-1} + eta g_t",
        "   w_t = w_{t-1} - v_t",
        "   ```",
        "",
        "2. **学习率衰减**",
        "   需要说明 step-decay schedule。"
      ].join("\n")
    }
  ]);

  assert.match(message.text, /\*\*其他问题\*\*/);
  assert.match(message.text, /1\. \*\*公式实现不一致\*\*/);
  assert.match(message.text, /```tex\n\s*v_t = alpha/);
  assert.match(message.text, /w_t = w_\{t-1\} - v_t\n\s*```/);
  assert.match(message.text, /2\. \*\*学习率衰减\*\*/);
});

test("history normalization preserves image and process parts", () => {
  const messages = normalizeHistoryMessages([
    {
      role: "user",
      timestamp: "2026-04-26T14:48:00.000Z",
      text: "",
      partType: "image",
      payload: {
        url: "data:image/png;base64,abc",
        alt: "screenshot"
      }
    },
    {
      role: "assistant",
      timestamp: "2026-04-26T14:48:01.000Z",
      text: "npm test",
      partType: "command_exec",
      payload: {
        text: "npm test"
      }
    }
  ]);

  assert.equal(messages.length, 2);
  assert.equal(messages[0].partType, "image");
  assert.equal(messages[0].payload.url, "data:image/png;base64,abc");
  assert.equal(messages[1].partType, "command_exec");
  assert.equal(messages[1].payload.text, "npm test");
});
