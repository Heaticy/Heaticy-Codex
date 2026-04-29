import test from "node:test";
import assert from "node:assert/strict";

import { createKoaApp } from "../src/koa-app.js";
import { config as baseConfig } from "../src/config.js";

function createSessionManagerStub() {
  return {
    stats: () => ({ running: 0, archived: 0, total: 0 }),
    observability: () => ({
      bridgeReady: true,
      activeRunners: 0,
      lastErrorAt: null,
      turns: { completed: 0, failed: 0 },
      approvals: { allow: 0, deny: 0, auto_allow: 0 }
    }),
    getMaintenanceReport: () => ({
      historyCleanup: {
        lastRunAt: "2026-04-29T00:00:00.000Z",
        lastTrigger: "manual",
        lastSummary: { deletedCount: 1, failedCount: 0 },
        warnings: []
      }
    }),
    runHistoricalCleanupCalls: 0,
    runHistoricalCleanup() {
      this.runHistoricalCleanupCalls += 1;
      return this.getMaintenanceReport();
    }
  };
}

async function withServer(sessionManager, fn) {
  const { app } = createKoaApp({
    config: {
      ...baseConfig,
      accessToken: "test-token",
      trustedCidrs: [],
      secureCookies: false,
      authSessionCookieName: "test_auth"
    },
    sessionManager
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "test-token" })
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie;
}

test("maintenance routes require authorization", async () => {
  const sessionManager = createSessionManagerStub();
  await withServer(sessionManager, async (baseUrl) => {
    const reportResponse = await fetch(`${baseUrl}/api/maintenance/report`);
    assert.equal(reportResponse.status, 401);

    const cleanupResponse = await fetch(`${baseUrl}/api/maintenance/cleanup`, {
      method: "POST"
    });
    assert.equal(cleanupResponse.status, 401);
  });
});

test("maintenance routes return report and allow manual cleanup after login", async () => {
  const sessionManager = createSessionManagerStub();
  await withServer(sessionManager, async (baseUrl) => {
    const cookie = await login(baseUrl);

    const reportResponse = await fetch(`${baseUrl}/api/maintenance/report`, {
      headers: { Cookie: cookie }
    });
    assert.equal(reportResponse.status, 200);
    assert.equal((await reportResponse.json()).report.historyCleanup.lastSummary.deletedCount, 1);

    const cleanupResponse = await fetch(`${baseUrl}/api/maintenance/cleanup`, {
      method: "POST",
      headers: { Cookie: cookie }
    });
    assert.equal(cleanupResponse.status, 200);
    assert.equal(sessionManager.runHistoricalCleanupCalls, 1);
  });
});
