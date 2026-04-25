import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function readJsonFile(filePath, fallbackValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function sanitizeSnippet(value, maxLength = 80) {
  const text = String(value || "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trimEnd()}...` : text;
}

function collectRolloutFiles(rootDir, limit = 500) {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return [];
  }
  const files = [];
  const queue = [rootDir];
  while (queue.length > 0 && files.length < limit * 4) {
    const current = queue.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && /^rollout-.*\.jsonl$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  return files.slice(0, limit * 4);
}

function firstPromptFromRecord(record) {
  const payload = record?.payload || {};
  if (payload.type === "user_message" && payload.message) {
    return payload.message;
  }
  if (payload.role === "user" && Array.isArray(payload.content)) {
    return payload.content.map((item) => item?.text || item).filter(Boolean).join(" ");
  }
  return "";
}

function parseRolloutHead(filePath, maxLines = 80) {
  const content = fs.readFileSync(filePath, "utf8");
  const stat = fs.statSync(filePath);
  let threadId = "";
  let cwd = "";
  let model = "";
  let createdAt = "";
  let label = "";
  let originator = "";
  let sourceType = "";

  for (const line of content.split(/\r?\n/).slice(0, maxLines)) {
    if (!line.trim()) {
      continue;
    }
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.type === "session_meta") {
      const payload = record.payload || {};
      threadId = String(payload.id || threadId || "").trim();
      cwd = String(payload.cwd || cwd || "").trim();
      model = String(payload.model || payload.model_slug || payload.model_provider || model || "").trim();
      createdAt = String(payload.timestamp || record.timestamp || createdAt || "").trim();
      originator = String(payload.originator || originator || "").trim();
      sourceType = typeof payload.source === "string" ? String(payload.source || sourceType).trim() : sourceType;
    }
    const prompt = firstPromptFromRecord(record);
    if (prompt && !label) {
      label = sanitizeSnippet(prompt);
    }
  }

  if (!threadId) {
    const match = path.basename(filePath).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
    threadId = match?.[1] || path.basename(filePath, ".jsonl").replace(/^rollout-/, "");
  }
  if (!createdAt) {
    createdAt = stat.birthtime.toISOString();
  }

  return {
    threadId,
    rolloutPath: filePath,
    cwd,
    model,
    createdAt,
    label: label || threadId,
    originator,
    sourceType,
    mtimeMs: stat.mtimeMs
  };
}

/**
 * Read-only indexer for local Codex rollout JSONL files.
 *
 * Example:
 * const index = new CodexRolloutIndex({ codexHome: "~/.codex", dataDir: "~/.heaticy-codex" });
 * const threads = index.listThreads({ limit: 50 });
 */
export class CodexRolloutIndex {
  constructor({ codexHome = path.join(os.homedir(), ".codex"), dataDir = path.join(os.homedir(), ".heaticy-codex") } = {}) {
    this.codexHome = path.resolve(codexHome.replace(/^~(?=$|\/|\\)/, os.homedir()));
    this.sessionsDir = path.join(this.codexHome, "sessions");
    this.indexPath = path.join(dataDir, "sessions-index.json");
  }

  readWebIndex() {
    return readJsonFile(this.indexPath, {});
  }

  markWebThread(threadId, value = {}) {
    const id = String(threadId || "").trim();
    if (!id) {
      return false;
    }
    const index = this.readWebIndex();
    index[id] = {
      ...(index[id] || {}),
      ...value,
      createdVia: "web",
      updatedAt: new Date().toISOString()
    };
    writeJsonFile(this.indexPath, index);
    return true;
  }

  listThreads({ limit = 50 } = {}) {
    const webIndex = this.readWebIndex();
    const threads = [];
    for (const filePath of collectRolloutFiles(this.sessionsDir, limit)) {
      try {
        const parsed = parseRolloutHead(filePath);
        if (!parsed.threadId) {
          continue;
        }
        const marked = webIndex[parsed.threadId] || null;
        const looksTui = /codex-tui/i.test(parsed.originator) || /^cli$/i.test(parsed.sourceType);
        threads.push({
          threadId: parsed.threadId,
          rolloutPath: parsed.rolloutPath,
          cwd: parsed.cwd,
          model: parsed.model,
          createdAt: parsed.createdAt,
          label: sanitizeSnippet(marked?.label || parsed.label || parsed.threadId),
          source: marked?.createdVia === "web" ? "web" : looksTui ? "tui" : "unknown",
          projectId: marked?.projectId || ""
        });
      } catch {
        // Keep scanning other rollout files.
      }
    }
    return threads
      .sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""))
      .slice(0, Math.max(1, Number(limit) || 50));
  }
}

export const testInternals = {
  sanitizeSnippet,
  parseRolloutHead
};
