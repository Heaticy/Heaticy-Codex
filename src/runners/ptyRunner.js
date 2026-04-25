import pty from "node-pty";

import { BaseRunner } from "./baseRunner.js";

/**
 * Runner adapter for interactive PTY-backed providers.
 *
 * Example:
 * const shell = runner.spawn({ file: "bash", args: ["-l"], cwd: process.cwd() });
 */
export class PtyRunner extends BaseRunner {
  spawn({ file, args = [], cwd, env = process.env, cols = 120, rows = 30 }) {
    return pty.spawn(file, args, {
      name: "xterm-color",
      cols,
      rows,
      cwd,
      env: {
        ...env,
        TERM: "xterm-256color"
      }
    });
  }

  async write(input) {
    const { shell, data } = input || {};
    shell?.write(String(data || ""));
  }

  async stop(session) {
    if (session?.shell) {
      session.shell.kill();
    }
    await super.stop();
  }
}
