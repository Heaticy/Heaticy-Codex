import net from "node:net";

export function normalizePort(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }

  const port = Number.parseInt(text, 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

export async function isPortAvailable(port, host = "0.0.0.0") {
  const normalized = normalizePort(port);
  if (!normalized) {
    return false;
  }

  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(normalized, host);
  });
}

export async function findAvailablePort(startPort, { host = "0.0.0.0", limit = 100 } = {}) {
  const start = normalizePort(startPort);
  if (!start) {
    return null;
  }

  const maxPort = Math.min(65535, start + Math.max(0, limit));
  for (let port = start; port <= maxPort; port += 1) {
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }

  return null;
}

export async function resolvePortChoice(value, { host = "0.0.0.0", limit = 100 } = {}) {
  const port = normalizePort(value);
  if (!port) {
    return {
      status: "invalid",
      requested: value,
      port: null,
      recommendedPort: null
    };
  }

  if (await isPortAvailable(port, host)) {
    return {
      status: "available",
      requested: value,
      port,
      recommendedPort: port
    };
  }

  return {
    status: "occupied",
    requested: value,
    port,
    recommendedPort: await findAvailablePort(port + 1, { host, limit })
  };
}
