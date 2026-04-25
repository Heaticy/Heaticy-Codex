import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CodexRolloutIndex } from "../src/codexRollout.js";

test("codex rollout index reads local rollout metadata without modifying rollout files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "heaticy-rollout-"));
  const codexHome = path.join(root, ".codex");
  const dataDir = path.join(root, ".heaticy-codex");
  const sessionsDir = path.join(codexHome, "sessions", "2026", "04", "25");
  fs.mkdirSync(sessionsDir, { recursive: true });
  const rolloutPath = path.join(
    sessionsDir,
    "rollout-2026-04-25T22-16-48-019dc500-0dfb-74b3-94b6-1e4991dfff52.jsonl"
  );
  fs.writeFileSync(
    rolloutPath,
    [
      JSON.stringify({
        timestamp: "2026-04-25T14:16:52.865Z",
        type: "session_meta",
        payload: {
          id: "019dc500-0dfb-74b3-94b6-1e4991dfff52",
          cwd: "/repo",
          originator: "codex-tui",
          source: "cli"
        }
      }),
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "hello rollout" } })
    ].join("\n"),
    "utf8"
  );
  const before = fs.statSync(rolloutPath).mtimeMs;

  const index = new CodexRolloutIndex({ codexHome, dataDir });
  const threads = index.listThreads({ limit: 10 });

  assert.equal(threads.length, 1);
  assert.equal(threads[0].threadId, "019dc500-0dfb-74b3-94b6-1e4991dfff52");
  assert.equal(threads[0].cwd, "/repo");
  assert.equal(threads[0].label, "hello rollout");
  assert.equal(threads[0].source, "tui");
  assert.equal(fs.statSync(rolloutPath).mtimeMs, before);
});

test("codex rollout index marks web-created threads in heaticy index", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "heaticy-rollout-"));
  const index = new CodexRolloutIndex({
    codexHome: path.join(root, ".codex"),
    dataDir: path.join(root, ".heaticy-codex")
  });

  assert.equal(index.markWebThread("thread-1", { projectId: "project", label: "web run" }), true);
  assert.deepEqual(index.readWebIndex()["thread-1"].projectId, "project");
});
