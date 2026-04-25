import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AuditLogger } from "../src/audit.js";

test("audit logger appends JSONL records", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "heaticy-audit-"));
  const audit = new AuditLogger({ home });

  audit.write({ sessionId: "s1", actor: "user", kind: "approval", detail: { decision: "allow" } });

  const logPath = path.join(home, ".heaticy-codex", "audit.log");
  const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.equal(record.sessionId, "s1");
  assert.equal(record.kind, "approval");
  assert.equal(record.detail.decision, "allow");
});
