import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ApprovalManager } from "../src/approvals.js";

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "heaticy-approvals-"));
}

test("approval manager always blocks high-risk commands from auto approval", () => {
  const approvals = new ApprovalManager({ home: tempHome(), codexFullAccess: true });
  const request = { detail: { command: "rm -rf /tmp/example" } };

  assert.equal(approvals.isHighRisk(request), true);
  assert.equal(approvals.canAutoApprove(request), false);
});

test("approval manager requires manual approval when full access is disabled", () => {
  const approvals = new ApprovalManager({ home: tempHome(), codexFullAccess: false });

  assert.equal(approvals.canAutoApprove({ detail: { command: "ls" } }), false);
});

test("approval manager persists remembered commands", () => {
  const home = tempHome();
  const approvals = new ApprovalManager({ home, codexFullAccess: true });

  approvals.rememberCommand("npm test");

  const reloaded = new ApprovalManager({ home, codexFullAccess: true });
  assert.equal(reloaded.isRemembered({ detail: { command: "npm test" } }), true);
});
