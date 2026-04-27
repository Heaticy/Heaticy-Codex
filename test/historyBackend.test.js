import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { config as baseConfig } from "../src/config.js";
import { SessionManager } from "../src/sessionManager.js";

function writeJsonl(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}`, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
}

test("backend history extraction preserves renderable images and filters local image paths", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "heaticy-history-backend-"));
  const codexHome = path.join(rootDir, ".codex");
  const codexSessionsDir = path.join(codexHome, "sessions");
  const threadId = "history-image-thread";
  const imageUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  writeJsonl(path.join(codexHome, "session_index.jsonl"), [
    { id: threadId, thread_name: "History Image Thread" }
  ]);
  writeJsonl(path.join(codexSessionsDir, "project", `${threadId}.jsonl`), [
    {
      type: "session_meta",
      payload: {
        id: threadId,
        cwd: rootDir,
        thread_name: "History Image Thread",
        originator: "codex_cli"
      },
      timestamp: "2026-04-27T01:00:00.000Z"
    },
    {
      type: "event_msg",
      payload: {
        type: "user_message",
        message: {
          role: "user",
          content: [
            { type: "input_text", text: "请看这张图" },
            { type: "input_image", image_url: imageUrl },
            { type: "input_image", image_url: "/Users/demo/private.png" }
          ]
        }
      },
      timestamp: "2026-04-27T01:00:01.000Z"
    },
    {
      type: "event_msg",
      payload: {
        type: "agent_message",
        phase: "commentary",
        message: "我会先检查图片内容。"
      },
      timestamp: "2026-04-27T01:00:02.000Z"
    }
  ]);

  const manager = new SessionManager(
    {
      ...baseConfig,
      dataDir: path.join(rootDir, "data"),
      heaticyDataDir: path.join(rootDir, ".heaticy"),
      codexHome,
      codexSessionsDir,
      ccSessionsDir: path.join(rootDir, ".claude", "projects"),
      defaultCwd: rootDir
    },
    { appServerBridge: null }
  );
  try {
    const { messages } = manager.getHistoricalMessages("codex", threadId);
    const imageMessages = messages.filter((message) => message.partType === "image");

    assert.equal(imageMessages.length, 1);
    assert.equal(imageMessages[0].payload.url, imageUrl);
    assert.ok(messages.some((message) => message.text === "请看这张图"));
    assert.ok(messages.some((message) => message.text === "我会先检查图片内容。"));
    assert.ok(!messages.some((message) => String(message?.payload?.url || "").includes("/Users/demo/private.png")));
  } finally {
    manager.shutdown();
  }
});
