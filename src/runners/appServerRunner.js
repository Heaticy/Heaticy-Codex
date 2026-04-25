import { BaseRunner } from "./baseRunner.js";

/**
 * Runner adapter for Codex app-server sessions.
 *
 * Example:
 * const runner = new AppServerRunner(config, { bridge });
 * await runner.runTurn(session, "hello");
 */
export class AppServerRunner extends BaseRunner {
  constructor(config, { bridge }) {
    super(config);
    this.bridge = bridge;
  }

  async startTurn(session, prompt) {
    if (!this.bridge) {
      throw new Error("app-server bridge is not configured");
    }
    return this.bridge.startTurn(session, prompt);
  }

  async write(input) {
    const { session, prompt } = input || {};
    return this.startTurn(session, prompt);
  }

  async stop() {
    await super.stop();
  }
}
