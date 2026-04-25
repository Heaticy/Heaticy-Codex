import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ProjectStore } from "../src/projects.js";

test("project store creates stable cwd-backed projects", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "heaticy-projects-"));
  const store = new ProjectStore(path.join(root, "projects.json"));

  const first = store.ensureForCwd("/tmp/example-repo");
  const second = store.ensureForCwd("/tmp/example-repo");

  assert.equal(first.id, second.id);
  assert.equal(first.cwd, "/tmp/example-repo");
  assert.equal(store.list().length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "projects.json"), "utf8")).length, 1);
});
