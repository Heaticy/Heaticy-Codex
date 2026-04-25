import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

import { WebSocket } from "ws";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AppServerBridge extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.transport = String(config.codexAppServerTransport || "stdio").trim().toLowerCase() === "ws" ? "ws" : "stdio";
    this.listenUrl = config.codexAppServerListenUrl;
    this.proc = null;
    this.ws = null;
    this.connected = false;
    this.initialized = false;
    this.nextId = 1;
    this.pending = new Map();
    this.connecting = null;
    this.shuttingDown = false;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";

    if (this.transport === "ws") {
      console.warn(
        "[app-server] CODEX_APP_SERVER_TRANSPORT=ws is deprecated and will be removed in a future release; use stdio instead."
      );
    }
  }

  async ensureReady() {
    if (!this.config.codexAppServerEnabled) {
      throw new Error("codex app-server is disabled");
    }
    if (this.isTransportReady() && this.initialized) {
      return;
    }
    if (this.connecting) {
      return this.connecting;
    }
    this.connecting = this.connectInternal();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async connectInternal() {
    await this.startProcess();
    if (this.transport === "ws") {
      await this.openWebSocket();
    }
    await this.request("initialize", {
      clientInfo: {
        name: "heaticy-codex",
        title: "Heaticy Codex",
        version: "0.1.0"
      },
      capabilities: {
        experimentalApi: true
      }
    });
    this.initialized = true;
  }

  async startProcess() {
    if (this.proc && !this.proc.killed && this.proc.exitCode === null) {
      return;
    }
    const args = this.transport === "ws" ? ["app-server", "--listen", this.listenUrl] : ["app-server"];
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    this.proc = spawn(this.config.codexBin, args, {
      cwd: this.config.root,
      env: process.env,
      stdio: this.transport === "ws" ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"]
    });
    this.proc.stdout?.on("data", (chunk) => {
      if (this.transport === "stdio") {
        this.handleStdoutData(chunk);
        return;
      }
      const line = String(chunk || "").trim();
      if (line) {
        this.emit("log", line);
      }
    });
    this.proc.stderr?.on("data", (chunk) => {
      const line = String(chunk || "").trim();
      this.stderrBuffer = `${this.stderrBuffer}${String(chunk || "")}`.slice(-10_000);
      if (line) {
        this.emit("log", line);
      }
    });
    this.proc.on("error", (error) => {
      this.connected = false;
      this.initialized = false;
      this.ws = null;
      this.rejectPending(error);
      this.emit("error", error);
    });
    this.proc.on("exit", (code, signal) => {
      this.connected = false;
      this.initialized = false;
      this.ws = null;
      const detail = this.stderrBuffer.trim() ? `: ${this.stderrBuffer.trim().slice(-500)}` : "";
      const error = new Error(`codex app-server exited code=${code ?? "null"} signal=${signal ?? "null"}${detail}`);
      this.rejectPending(error);
      if (!this.shuttingDown) {
        this.emit("error", error);
      }
    });
    if (this.transport === "stdio") {
      this.connected = true;
    }
    await wait(350);
  }

  async openWebSocket() {
    const url = this.listenUrl;
    this.ws = new WebSocket(url);
    const connectTimeoutMs = Math.max(1_000, Number(this.config.codexAppServerConnectTimeoutMs) || 5_000);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("app-server websocket connect timeout")), connectTimeoutMs);
      this.ws.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    this.connected = true;
    this.ws.on("message", (raw) => this.handleMessage(raw));
    this.ws.on("close", () => {
      this.connected = false;
      this.initialized = false;
      if (!this.shuttingDown) {
        const error = new Error("app-server websocket closed");
        this.rejectPending(error);
        this.emit("error", error);
      }
    });
  }

  isTransportReady() {
    if (!this.connected || !this.proc || this.proc.killed || this.proc.exitCode !== null) {
      return false;
    }
    if (this.transport === "ws") {
      return this.ws?.readyState === WebSocket.OPEN;
    }
    return Boolean(this.proc.stdin?.writable);
  }

  handleStdoutData(chunk) {
    this.stdoutBuffer += String(chunk || "");
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      this.handleMessage(line);
    }
  }

  handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(String(raw || "{}"));
    } catch {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(msg, "id") && !msg.method) {
      const pending = this.pending.get(msg.id);
      if (!pending) {
        return;
      }
      this.pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error?.message || "app-server request failed"));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }
    if (Object.prototype.hasOwnProperty.call(msg, "id") && msg.method) {
      this.handleServerRequest(msg).catch((error) => {
        this.sendError(msg.id, -32000, error?.message || String(error));
      });
      return;
    }
    if (msg.method) {
      this.emit("notification", msg);
    }
  }

  sendResponse(id, result) {
    this.sendPayload({
      jsonrpc: "2.0",
      id,
      result
    });
  }

  sendError(id, code, message) {
    this.sendPayload({
      jsonrpc: "2.0",
      id,
      error: { code, message }
    });
  }

  sendPayload(payload) {
    const raw = JSON.stringify(payload);
    if (this.transport === "ws") {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return false;
      }
      try {
        this.ws.send(raw);
        return true;
      } catch (error) {
        this.emit("error", error);
        return false;
      }
    }
    if (!this.proc?.stdin?.writable) {
      return false;
    }
    try {
      this.proc.stdin.write(`${raw}\n`);
      return true;
    } catch (error) {
      this.emit("error", error);
      return false;
    }
  }

  async handleServerRequest(msg) {
    const id = msg.id;
    const method = String(msg.method || "");
    try {
      if (method === "item/commandExecution/requestApproval") {
        this.sendResponse(id, await this.requestFrontendApproval("command", msg));
        return;
      }
      if (method === "item/fileChange/requestApproval") {
        this.sendResponse(id, await this.requestFrontendApproval("file_change", msg));
        return;
      }
      if (method === "item/permissions/requestApproval") {
        this.sendResponse(id, await this.requestFrontendApproval("permissions", msg));
        return;
      }
      if (method === "item/tool/requestUserInput") {
        this.sendError(id, -32001, "tool user input is not supported by this bridge");
        return;
      }
      if (method === "item/tool/call") {
        this.sendError(id, -32001, "dynamic tool call is not supported by this bridge");
        return;
      }
      this.sendError(id, -32601, `method not handled by bridge: ${method}`);
    } catch (error) {
      this.sendError(id, -32000, error?.message || String(error));
    }
  }

  requestFrontendApproval(kind, msg) {
    return new Promise((resolve) => {
      const fallback = kind === "permissions" ? { permissions: {}, scope: "session" } : { decision: "deny" };
      const handled = this.emit("approval_request", {
        kind,
        method: msg.method,
        params: msg.params || {},
        resolve,
        fallback
      });
      if (!handled) {
        resolve(fallback);
      }
    });
  }

  request(method, params) {
    if (!this.isTransportReady()) {
      return Promise.reject(new Error(`app-server ${this.transport} not connected`));
    }
    const requestTimeoutMs = Math.max(1_000, Number(this.config.codexAppServerRequestTimeoutMs) || 20_000);
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`app-server request timeout: ${method}`));
      }, requestTimeoutMs);
      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });
      if (!this.sendPayload(payload)) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`app-server ${this.transport} send failed: ${method}`));
      }
    });
  }

  rejectPending(error) {
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      pending.reject(error);
    }
  }

  async ensureThread(session) {
    await this.ensureReady();
    if (session.resumeSessionId) {
      await this.request("thread/resume", {
        threadId: session.resumeSessionId,
        cwd: session.cwd,
        model: session.model || null
      });
      return session.resumeSessionId;
    }
    const result = await this.request("thread/start", {
      cwd: session.cwd,
      model: session.model || null,
      experimentalRawEvents: false,
      persistExtendedHistory: true
    });
    const threadId = String(result?.thread?.id || "").trim();
    if (!threadId) {
      throw new Error("app-server thread/start did not return thread id");
    }
    session.resumeSessionId = threadId;
    return threadId;
  }

  async startTurn(session, text) {
    const threadId = await this.ensureThread(session);
    return this.request("turn/start", {
      threadId,
      input: [{ type: "text", text: String(text || ""), text_elements: [] }]
    });
  }

  async shutdown() {
    this.shuttingDown = true;
    try {
      this.ws?.close();
    } catch {
      // no-op
    }
    try {
      this.proc?.stdin?.end();
    } catch {
      // no-op
    }
    try {
      this.proc?.kill("SIGTERM");
    } catch {
      // no-op
    }
    this.connected = false;
    this.initialized = false;
  }
}
