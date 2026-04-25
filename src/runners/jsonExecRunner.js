import { Codex } from "@openai/codex-sdk";

import { BaseRunner } from "./baseRunner.js";

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined && entry[1] !== ""));
}

function buildSdkConfig(config) {
  return compactObject({
    profile: config.codexProfile || undefined
  });
}

function buildThreadOptions(config, session) {
  return compactObject({
    workingDirectory: session.cwd,
    skipGitRepoCheck: true,
    model: session.model || config.codexModel || undefined,
    approvalPolicy: config.codexFullAccess ? "never" : "on-request",
    sandboxMode: config.codexFullAccess ? "danger-full-access" : "workspace-write"
  });
}

/**
 * Thin adapter around @openai/codex-sdk for the legacy json_exec session path.
 *
 * Example:
 * const runner = new JsonExecRunner(config);
 * await runner.runTurn(session, "summarize this repo", (event) => console.log(event.type));
 */
export class JsonExecRunner extends BaseRunner {
  constructor(config, { CodexImpl = Codex } = {}) {
    super(config);
    this.CodexImpl = CodexImpl;
    this.codex = new CodexImpl({
      codexPathOverride: config.codexBin,
      env: {
        ...process.env,
        ...(config.codexProfile ? { CODEX_PROFILE: config.codexProfile } : {})
      },
      config: buildSdkConfig(config)
    });
    this.threads = new Map();
    this.abortControllers = new Map();
  }

  getThread(session) {
    const key = session.id;
    const existing = this.threads.get(key);
    if (existing) {
      return existing;
    }

    const options = buildThreadOptions(this.config, session);
    const thread = session.resumeSessionId
      ? this.codex.resumeThread(session.resumeSessionId, options)
      : this.codex.startThread(options);
    this.threads.set(key, thread);
    return thread;
  }

  async runTurn(session, prompt, onEvent = () => {}) {
    const thread = this.getThread(session);
    const controller = new AbortController();
    this.abortControllers.set(session.id, controller);
    let emittedAssistant = false;

    try {
      const { events } = await thread.runStreamed(String(prompt || ""), {
        signal: controller.signal
      });
      for await (const event of events) {
        onEvent(event);
        this.emit("event", { sessionId: session.id, event });
        if (event?.type === "item.completed" && event?.item?.type === "agent_message") {
          emittedAssistant = true;
        }
        if (event?.type === "turn.failed") {
          throw new Error(event?.error?.message || "Codex turn failed");
        }
      }
      return { emittedAssistant };
    } finally {
      this.abortControllers.delete(session.id);
    }
  }

  stop(session) {
    const controller = this.abortControllers.get(session.id);
    if (controller) {
      controller.abort();
    }
    this.abortControllers.delete(session.id);
  }
}

export const testInternals = {
  buildSdkConfig,
  buildThreadOptions
};
