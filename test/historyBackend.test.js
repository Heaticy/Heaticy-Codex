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

function createHistoryFixtureRoot(prefix = "heaticy-history-backend-") {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const codexHome = path.join(rootDir, ".codex");
  const codexSessionsDir = path.join(codexHome, "sessions");
  return { rootDir, codexHome, codexSessionsDir };
}

function createHistoryManager(rootDir, codexHome, codexSessionsDir, overrides = {}) {
  return new SessionManager(
    {
      ...baseConfig,
      dataDir: path.join(rootDir, "data"),
      heaticyDataDir: path.join(rootDir, ".heaticy"),
      codexHome,
      codexSessionsDir,
      ccSessionsDir: path.join(rootDir, ".claude", "projects"),
      defaultCwd: rootDir,
      historyRetentionDays: 30,
      historySimpleRetentionDays: 7,
      historySimpleMaxMessages: 4,
      historySimpleMaxChars: 1000,
      historyCleanupIntervalHours: 24,
      ...overrides
    },
    { appServerBridge: null }
  );
}

function buildSessionRecords({ threadId, cwd, title, messages }) {
  const records = [
    {
      type: "session_meta",
      payload: {
        id: threadId,
        cwd,
        thread_name: title,
        originator: "codex_cli"
      },
      timestamp: "2026-04-27T01:00:00.000Z"
    }
  ];

  let offset = 1;
  for (const message of messages) {
    if (message.role === "user") {
      records.push({
        type: "event_msg",
        payload: {
          type: "user_message",
          message: {
            role: "user",
            content: [{ type: "input_text", text: message.text }]
          }
        },
        timestamp: `2026-04-27T01:00:0${offset}.000Z`
      });
    } else {
      records.push({
        type: "event_msg",
        payload: {
          type: "agent_message",
          phase: "final_answer",
          message: message.text
        },
        timestamp: `2026-04-27T01:00:0${offset}.000Z`
      });
    }
    offset += 1;
  }

  return records;
}

function writeHistoricalSession({ codexHome, codexSessionsDir, threadId, cwd, title, messages, updatedAt }) {
  const indexPath = path.join(codexHome, "session_index.jsonl");
  const existingIndex = fs.existsSync(indexPath)
    ? fs
        .readFileSync(indexPath, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  existingIndex.push({ id: threadId, thread_name: title });
  writeJsonl(indexPath, existingIndex);

  const filePath = path.join(codexSessionsDir, "project", `${threadId}.jsonl`);
  writeJsonl(
    filePath,
    buildSessionRecords({
      threadId,
      cwd,
      title,
      messages
    })
  );
  const updatedAtDate = new Date(updatedAt);
  fs.utimesSync(filePath, updatedAtDate, updatedAtDate);
  return filePath;
}

test("backend history extraction preserves renderable images and filters local image paths", () => {
  const { rootDir, codexHome, codexSessionsDir } = createHistoryFixtureRoot();
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

  const manager = createHistoryManager(rootDir, codexHome, codexSessionsDir);
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

test("history cleanup deletes expired simple and regular sessions while keeping fresh and active sessions", () => {
  const { rootDir, codexHome, codexSessionsDir } = createHistoryFixtureRoot("heaticy-history-cleanup-");
  const oldRegularFile = writeHistoricalSession({
    codexHome,
    codexSessionsDir,
    threadId: "old-regular",
    cwd: rootDir,
    title: "Old Regular",
    messages: [
      { role: "user", text: "A".repeat(320) },
      { role: "assistant", text: "B".repeat(320) },
      { role: "user", text: "C".repeat(320) },
      { role: "assistant", text: "D".repeat(320) }
    ],
    updatedAt: "2026-03-01T00:00:00.000Z"
  });
  const oldSimpleFile = writeHistoricalSession({
    codexHome,
    codexSessionsDir,
    threadId: "old-simple",
    cwd: rootDir,
    title: "Old Simple",
    messages: [{ role: "user", text: "short request" }],
    updatedAt: "2026-04-10T00:00:00.000Z"
  });
  const freshSimpleFile = writeHistoricalSession({
    codexHome,
    codexSessionsDir,
    threadId: "fresh-simple",
    cwd: rootDir,
    title: "Fresh Simple",
    messages: [{ role: "user", text: "still fresh" }],
    updatedAt: "2026-04-27T00:00:00.000Z"
  });
  const activeOldFile = writeHistoricalSession({
    codexHome,
    codexSessionsDir,
    threadId: "active-old",
    cwd: rootDir,
    title: "Active Old",
    messages: [{ role: "user", text: "active session should stay" }],
    updatedAt: "2026-03-01T00:00:00.000Z"
  });

  const manager = createHistoryManager(rootDir, codexHome, codexSessionsDir);
  try {
    manager.setCustomName("codex", "old-simple", "Old Simple Custom");
    manager.setArchived("codex", "old-simple", "2026-04-11T00:00:00.000Z");
    manager.setCustomName("codex", "old-regular", "Old Regular Custom");
    manager.setArchived("codex", "old-regular", "2026-03-02T00:00:00.000Z");
    manager.sessions.set("live-1", {
      id: "live-1",
      provider: "codex",
      resumeSessionId: "active-old",
      status: "running",
      lifecycle: "attached",
      clients: new Set(),
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z",
      turnRunning: false,
      queuedInputs: []
    });

    const report = manager.runHistoricalCleanup({ trigger: "manual" });
    const summary = report.historyCleanup.lastSummary;

    assert.equal(summary.trigger, "manual");
    assert.equal(summary.deletedCount, 2);
    assert.equal(summary.failedCount, 0);
    assert.equal(summary.activeCount, 1);
    assert.ok(summary.deletedSessions.some((session) => session.resumeSessionId === "old-regular"));
    assert.ok(summary.deletedSessions.some((session) => session.resumeSessionId === "old-simple"));
    assert.ok(!fs.existsSync(oldRegularFile));
    assert.ok(!fs.existsSync(oldSimpleFile));
    assert.ok(fs.existsSync(freshSimpleFile));
    assert.ok(fs.existsSync(activeOldFile));
    assert.equal(manager.getCustomName("codex", "old-simple"), null);
    assert.equal(manager.getCustomName("codex", "old-regular"), null);
    assert.equal(manager.isArchived("codex", "old-simple"), false);
    assert.equal(manager.isArchived("codex", "old-regular"), false);
  } finally {
    manager.shutdown();
  }
});

test("history cleanup records warnings when deletion fails without crashing", () => {
  const { rootDir, codexHome, codexSessionsDir } = createHistoryFixtureRoot("heaticy-history-warning-");
  const failingFile = writeHistoricalSession({
    codexHome,
    codexSessionsDir,
    threadId: "failing-cleanup",
    cwd: rootDir,
    title: "Failing Cleanup",
    messages: [{ role: "user", text: "short request" }],
    updatedAt: "2026-04-10T00:00:00.000Z"
  });

  const manager = createHistoryManager(rootDir, codexHome, codexSessionsDir);
  const originalDeleteHistoricalEntries = manager.deleteHistoricalEntries.bind(manager);
  try {
    manager.deleteHistoricalEntries = (providerId, resumeSessionId, entries) => {
      if (resumeSessionId === "failing-cleanup") {
        throw new Error("simulated delete failure");
      }
      return originalDeleteHistoricalEntries(providerId, resumeSessionId, entries);
    };

    const report = manager.runHistoricalCleanup({ trigger: "manual" });
    const summary = report.historyCleanup.lastSummary;

    assert.equal(summary.deletedCount, 0);
    assert.equal(summary.failedCount, 1);
    assert.equal(report.historyCleanup.warnings.length, 1);
    assert.match(report.historyCleanup.warnings[0].error, /simulated delete failure/);
    assert.ok(fs.existsSync(failingFile));
  } finally {
    manager.deleteHistoricalEntries = originalDeleteHistoricalEntries;
    manager.shutdown();
  }
});
