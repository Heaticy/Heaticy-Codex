import test from "node:test";
import assert from "node:assert/strict";

import { createKoaApp } from "../src/koa-app.js";
import { config as baseConfig } from "../src/config.js";

function createSessionManagerStub() {
  return {
    listAll: () => [],
    listProjects: () => [],
    listCodexThreads: () => [],
    stats: () => ({ running: 0, archived: 0, total: 0 }),
    observability: () => ({
      bridgeReady: true,
      activeRunners: 0,
      lastErrorAt: null,
      turns: { completed: 0, failed: 0 },
      approvals: { allow: 0, deny: 0, auto_allow: 0 }
    })
  };
}

async function withServer(fn) {
  const { app } = createKoaApp({
    config: {
      ...baseConfig,
      accessToken: "test-token",
      trustedCidrs: [],
      secureCookies: false,
      authSessionCookieName: "test_auth"
    },
    sessionManager: createSessionManagerStub()
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
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

test("oversized login request returns 413", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `{"token":"${"x".repeat(2_000_001)}"}`
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "Payload Too Large" });
  });
});

test("health endpoint remains public while observability endpoints require auth", async () => {
  await withServer(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);

    const healthz = await fetch(`${baseUrl}/api/healthz`);
    assert.equal(healthz.status, 401);

    const metrics = await fetch(`${baseUrl}/api/metrics`);
    assert.equal(metrics.status, 401);
  });
});

test("authenticated users can read healthz and metrics", async () => {
  await withServer(async (baseUrl) => {
    const cookie = await login(baseUrl);

    const healthz = await fetch(`${baseUrl}/api/healthz`, {
      headers: { Cookie: cookie }
    });
    assert.equal(healthz.status, 200);
    assert.equal((await healthz.json()).ok, true);

    const metrics = await fetch(`${baseUrl}/api/metrics`, {
      headers: { Cookie: cookie }
    });
    assert.equal(metrics.status, 200);
    assert.match(await metrics.text(), /heaticy_sessions_active 0/);
  });
});
