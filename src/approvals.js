import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HIGH_RISK_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /curl\s+\S+\s*\|\s*sh/i,
  /(?:^|\/)\.ssh(?:\/|$)/i,
  /^\/etc(?:\/|$)/i
];

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function extractSearchText(request) {
  return JSON.stringify(request?.detail || request?.params || request || {});
}

/**
 * Persistent approval whitelist and high-risk matcher.
 *
 * Example:
 * const approvals = new ApprovalManager(config);
 * approvals.remember({ pattern: "^ls$", scope: "global" });
 */
export class ApprovalManager {
  constructor(config = {}) {
    this.config = config;
    this.dir = path.join(config.home || os.homedir(), ".heaticy-codex");
    this.filePath = path.join(this.dir, "approvals.json");
    const entries = readJson(this.filePath, []);
    this.entries = Array.isArray(entries) ? entries : [];
  }

  isHighRisk(request) {
    const text = extractSearchText(request);
    return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(text));
  }

  canAutoApprove(request) {
    if (this.isHighRisk(request)) {
      return false;
    }
    if (this.config.codexFullAccess) {
      return true;
    }
    return false;
  }

  isRemembered(request) {
    if (this.isHighRisk(request) || !this.config.codexFullAccess) {
      return false;
    }
    const text = extractSearchText(request);
    return this.entries.some((entry) => {
      try {
        return new RegExp(entry.pattern).test(text);
      } catch {
        return false;
      }
    });
  }

  rememberCommand(command, { scope = "global" } = {}) {
    const text = String(command || "").trim();
    if (!text) {
      return null;
    }
    const entry = {
      pattern: escapeRegExp(text),
      scope,
      createdAt: new Date().toISOString()
    };
    this.entries.push(entry);
    this.save();
    return entry;
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
  }
}

export const approvalInternals = {
  HIGH_RISK_PATTERNS,
  extractSearchText
};
