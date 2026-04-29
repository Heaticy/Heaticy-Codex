import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AppServerBridge } from "../src/appServerBridge.js";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockAppServerBin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heaticy-app-server-"));
  const binPath = path.join(dir, "mock-codex-app-server.mjs");
  fs.writeFileSync(
    binPath,
    [
      "#!/usr/bin/env node",
      "process.stdin.resume();",
      "setInterval(() => {}, 1000);",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.chmodSync(binPath, 0o755);
  return binPath;
}

test("app server bridge resets shutdown state after restart", async () => {
  const bridge = new AppServerBridge({
    codexAppServerEnabled: true,
    codexAppServerTransport: "stdio",
    codexBin: createMockAppServerBin(),
    root: process.cwd(),
    codexAppServerListenUrl: "ws://127.0.0.1:0",
    codexAppServerConnectTimeoutMs: 1000,
    codexAppServerRequestTimeoutMs: 1000
  });
  const errors = [];
  bridge.on("error", (error) => errors.push(error));

  try {
    await bridge.startProcess();
    const firstProc = bridge.proc;

    await bridge.shutdown();
    await once(firstProc, "exit");
    assert.equal(errors.length, 0);

    await bridge.startProcess();
    assert.equal(bridge.shuttingDown, false);

    const errorPromise = once(bridge, "error");
    bridge.proc.kill("SIGTERM");
    const [error] = await Promise.race([
      errorPromise,
      wait(500).then(() => {
        throw new Error("expected restarted app-server exit to emit error");
      })
    ]);

    assert.match(error.message, /codex app-server exited/);
  } finally {
    await bridge.shutdown();
  }
});
