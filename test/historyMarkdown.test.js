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
