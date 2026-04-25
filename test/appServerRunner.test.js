import test from "node:test";
import assert from "node:assert/strict";

import { AppServerRunner } from "../src/runners/appServerRunner.js";

test("app server runner delegates turns to the bridge", async () => {
  const calls = [];
  const bridge = {
    async startTurn(session, prompt) {
      calls.push({ session, prompt });
      return { ok: true };
    }
  };
  const runner = new AppServerRunner({}, { bridge });
  const session = { id: "session-1" };

  const result = await runner.startTurn(session, "hello");

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [{ session, prompt: "hello" }]);
});

test("app server runner fails clearly without a bridge", async () => {
  const runner = new AppServerRunner({}, { bridge: null });

  await assert.rejects(() => runner.startTurn({ id: "session-1" }, "hello"), /bridge is not configured/);
});
