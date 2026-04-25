import test from "node:test";
import assert from "node:assert/strict";

import { JsonExecRunner, testInternals } from "../src/runners/jsonExecRunner.js";

function makeConfig(overrides = {}) {
  return {
    codexBin: "/usr/local/bin/codex",
    codexModel: "gpt-test",
    codexProfile: "heaticy",
    codexFullAccess: true,
    ...overrides
  };
}

function makeMockCodex(events) {
  const calls = {
    constructorOptions: null,
    startThreadOptions: null,
    resumeThreadArgs: null,
    prompts: []
  };

  class MockThread {
    async runStreamed(prompt) {
      calls.prompts.push(prompt);
      return {
        events: (async function* streamEvents() {
          for (const event of events) {
            yield event;
          }
        })()
      };
    }
  }

  class MockCodex {
    constructor(options) {
      calls.constructorOptions = options;
    }

    startThread(options) {
      calls.startThreadOptions = options;
      return new MockThread();
    }

    resumeThread(id, options) {
      calls.resumeThreadArgs = { id, options };
      return new MockThread();
    }
  }

  return { MockCodex, calls };
}

test("json exec runner starts a new SDK thread and streams events", async () => {
  const { MockCodex, calls } = makeMockCodex([
    { type: "thread.started", thread_id: "thread-new" },
    { type: "item.completed", item: { id: "item-1", type: "agent_message", text: "hello" } },
    { type: "turn.completed", usage: null }
  ]);
  const runner = new JsonExecRunner(makeConfig(), { CodexImpl: MockCodex });
  const session = { id: "session-1", cwd: "/tmp/project", model: "", resumeSessionId: "" };
  const seen = [];

  const result = await runner.runTurn(session, "ping", (event) => seen.push(event.type));

  assert.deepEqual(seen, ["thread.started", "item.completed", "turn.completed"]);
  assert.equal(result.emittedAssistant, true);
  assert.equal(calls.constructorOptions.codexPathOverride, "/usr/local/bin/codex");
  assert.equal(calls.constructorOptions.config.profile, "heaticy");
  assert.equal(calls.constructorOptions.env.CODEX_PROFILE, "heaticy");
  assert.deepEqual(calls.startThreadOptions, {
    workingDirectory: "/tmp/project",
    skipGitRepoCheck: true,
    model: "gpt-test",
    approvalPolicy: "never",
    sandboxMode: "danger-full-access"
  });
  assert.deepEqual(calls.prompts, ["ping"]);
});

test("json exec runner resumes an existing SDK thread", async () => {
  const { MockCodex, calls } = makeMockCodex([
    { type: "item.completed", item: { id: "item-2", type: "agent_message", text: "back" } },
    { type: "turn.completed", usage: null }
  ]);
  const runner = new JsonExecRunner(makeConfig({ codexFullAccess: false }), { CodexImpl: MockCodex });
  const session = { id: "session-2", cwd: "/tmp/project", model: "gpt-session", resumeSessionId: "thread-old" };

  await runner.runTurn(session, "continue");

  assert.equal(calls.resumeThreadArgs.id, "thread-old");
  assert.equal(calls.resumeThreadArgs.options.model, "gpt-session");
  assert.equal(calls.resumeThreadArgs.options.approvalPolicy, "on-request");
  assert.equal(calls.resumeThreadArgs.options.sandboxMode, "workspace-write");
  assert.equal(calls.startThreadOptions, null);
});

test("json exec runner config helpers omit empty values", () => {
  assert.deepEqual(testInternals.buildSdkConfig(makeConfig({ codexProfile: "" })), {});
  assert.deepEqual(
    testInternals.buildThreadOptions(makeConfig({ codexModel: "" }), {
      cwd: "/repo",
      model: "",
      resumeSessionId: ""
    }),
    {
      workingDirectory: "/repo",
      skipGitRepoCheck: true,
      approvalPolicy: "never",
      sandboxMode: "danger-full-access"
    }
  );
});
