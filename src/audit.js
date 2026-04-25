import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Append-only JSONL audit log.
 *
 * Example:
 * const audit = new AuditLogger(config);
 * audit.write({ sessionId: "s1", actor: "user", kind: "approval", detail: { decision: "allow" } });
 */
export class AuditLogger {
  constructor(config = {}) {
    this.dir = path.join(config.home || os.homedir(), ".heaticy-codex");
    this.filePath = path.join(this.dir, "audit.log");
  }

  write({ sessionId = "", actor = "system", kind = "event", detail = {} } = {}) {
    const record = {
      timestamp: new Date().toISOString(),
      sessionId,
      actor,
      kind,
      detail
    };
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`);
    } catch {
      // Auditing must not break the active session path.
    }
  }
}
