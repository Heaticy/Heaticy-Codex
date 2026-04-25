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

  async stop() {
    this.running = false;
  }
}
