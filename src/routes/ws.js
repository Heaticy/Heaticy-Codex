import { WebSocketServer } from "ws";

function nowMs() {
  return Date.now();
}

function safeSend(ws, payload) {
  if (ws.readyState !== 1) {
    return false;
  }

  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function installWebSocketServer(server, runtime) {
  const wss = new WebSocketServer({ noServer: true });
  runtime.wss = wss;
  const heartbeatMs = Math.max(5_000, Number(runtime.config.wsHeartbeatMs || 30_000));
  const staleMs = Math.max(heartbeatMs * 3, 45_000);

  wss.on("connection", (ws, req, sessionId) => {
    ws.isAlive = true;
    ws.lastSeenAt = nowMs();
    ws.lastPingSentAt = 0;
    ws.on("pong", () => {
      ws.isAlive = true;
      ws.lastSeenAt = nowMs();
    });

    try {
      const url = new URL(req.url || "/", "http://localhost");
      runtime.sessionManager.attachClient(sessionId, ws, {
        sinceSeq: Number(url.searchParams.get("sinceSeq") || 0)
      });
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", error: err?.message || String(err) }));
      ws.close();
      return;
    }

    ws.on("message", (raw) => {
      try {
        const payload = JSON.parse(String(raw || "{}"));
        ws.isAlive = true;
        ws.lastSeenAt = nowMs();
        if (payload.type === "pong") {
          return;
        }
        if (payload.type === "ping") {
          safeSend(ws, { type: "pong", ts: payload.ts || nowMs() });
          return;
        }
        if (payload.type === "input") {
          runtime.sessionManager.write(sessionId, payload.data || "");
        } else if (payload.type === "approval_response") {
          runtime.sessionManager.resolveApproval(sessionId, payload);
        } else if (payload.type === "resize") {
          runtime.sessionManager.resize(sessionId, payload.cols, payload.rows);
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", error: err?.message || String(err) }));
      }
    });
  });

  const heartbeatInterval = setInterval(() => {
    const current = nowMs();
    for (const ws of wss.clients) {
      const lastSeenAt = Number(ws.lastSeenAt || 0);
      if (ws.isAlive === false && current - lastSeenAt > staleMs) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.lastPingSentAt = current;
      safeSend(ws, { type: "ping", ts: current });
      try {
        ws.ping();
      } catch {
        // Some browser/proxy combinations can reject protocol pings transiently.
      }
    }
  }, heartbeatMs);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    if (!runtime.isAllowedClient(req)) {
      console.warn(
        `[ws] denied client=${runtime.normalizeIp(runtime.getClientAddress(req)) || "unknown"} reason=client-not-allowed`
      );
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    if (!runtime.isTrustedOrigin(req)) {
      console.warn(
        `[ws] denied client=${runtime.normalizeIp(runtime.getClientAddress(req)) || "unknown"} reason=origin origin=${String(req.headers.origin || "")}`
      );
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    if (!runtime.isAuthorized(req)) {
      console.warn(
        `[ws] denied client=${runtime.normalizeIp(runtime.getClientAddress(req)) || "unknown"} reason=unauthorized`
      );
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const sessionId = url.searchParams.get("sessionId") || "";
    if (!sessionId || !runtime.sessionManager.get(sessionId)) {
      console.warn(
        `[ws] denied client=${runtime.normalizeIp(runtime.getClientAddress(req)) || "unknown"} reason=session-not-found sessionId=${sessionId}`
      );
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      console.log(
        `[ws] connected client=${runtime.normalizeIp(runtime.getClientAddress(req)) || "unknown"} sessionId=${sessionId}`
      );
      wss.emit("connection", ws, req, sessionId);
    });
  });

  return {
    wss,
    closeClients(signal = "unknown") {
      for (const ws of wss.clients) {
        try {
          ws.close(1012, `Server restarting (${signal})`);
        } catch {
          ws.terminate();
        }
      }
    },
    stop() {
      clearInterval(heartbeatInterval);
    }
  };
}
