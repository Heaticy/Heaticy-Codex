import { EventEmitter } from "node:events";

/**
 * Minimal base class for session backends.
 *
 * Example:
 * class EchoRunner extends BaseRunner {
 *   async write(input) { this.emit("message", input); }
 * }
 */
export class BaseRunner extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.running = false;
  }

  async start() {
    this.running = true;
  }

  async write() {
    throw new Error("Runner.write() must be implemented by subclasses");
  }

  /**
   * Return session metadata exposed to the browser status bar.
   *
   * Example:
   * runner.getMeta({ cwd: "/repo", model: "gpt-5-codex", reasoningEffort: "high" });
   */
  getMeta(session = {}) {
    return {
      model: session.model || this.config.model || "",
      reasoningEffort: session.reasoningEffort || this.config.codexReasoningEffort || "",
      cwd: session.cwd || "",
      profile: this.config.codexProfile || "",
      transport: session.transport || "unknown",
      turnState: session.turnState || "idle",
      lastEventAt: session.lastEventAt || session.updatedAt || ""
    };
  }

  async stop() {
    this.running = false;
  }
}
