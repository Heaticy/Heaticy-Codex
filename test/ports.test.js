import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";

import {
  findAvailablePort,
  isPortAvailable,
  normalizePort,
  resolvePortChoice
} from "../scripts/lib/ports.mjs";

async function withListeningServer(fn) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();
  try {
    return await fn(port);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test("normalizePort accepts only TCP port integers", () => {
  assert.equal(normalizePort("3211"), 3211);
  assert.equal(normalizePort(5206), 5206);
  assert.equal(normalizePort("0"), null);
  assert.equal(normalizePort("65536"), null);
  assert.equal(normalizePort("abc"), null);
  assert.equal(normalizePort("12.5"), null);
});

test("isPortAvailable reports occupied localhost ports", async () => {
  await withListeningServer(async (port) => {
    assert.equal(await isPortAvailable(port), false);
  });
});

test("findAvailablePort skips occupied ports and returns a nearby replacement", async () => {
  await withListeningServer(async (port) => {
    const replacement = await findAvailablePort(port, { host: "127.0.0.1", limit: 20 });
    assert.ok(replacement > port);
    assert.equal(await isPortAvailable(replacement, "127.0.0.1"), true);
  });
});

test("resolvePortChoice explains invalid, available, and occupied ports", async () => {
  assert.deepEqual(await resolvePortChoice("bad", { host: "127.0.0.1" }), {
    status: "invalid",
    requested: "bad",
    port: null,
    recommendedPort: null
  });

  await withListeningServer(async (port) => {
    const occupied = await resolvePortChoice(port, { host: "127.0.0.1", limit: 20 });
    assert.equal(occupied.status, "occupied");
    assert.equal(occupied.port, port);
    assert.ok(occupied.recommendedPort > port);
  });

  const available = await resolvePortChoice(0, { host: "127.0.0.1" });
  assert.equal(available.status, "invalid");
});
