# Changelog

## 0.3.0 — 三周目

- Task 1: Added `session_meta` status data for model, cwd, profile, transport, turn state, activity, attached clients, and last event time.
- Task 2: Surfaced live reasoning, command, file-change, MCP, and streaming assistant events with a session activity strip.
- Task 3: Added 30s stall warnings, runner ping/restart endpoints, and recent raw-event diagnostics.
- Task 4: Added attached/detached lifecycle metadata plus per-session replay buffers keyed by `seq`.
- Task 5: Added persistent local Project records under `~/.heaticy-codex/projects.json`, project-aware session metadata, and quick navigation entry points.
- Task 6: Added read-only Codex rollout scanning, `GET /api/codex-threads`, `resumeThreadId` session creation, and rollout behavior notes.

## 0.2.0 — 二周目

- Task 1: App-server defaults to stdio transport; websocket transport remains behind `CODEX_APP_SERVER_TRANSPORT=ws` for one compatibility window.
- Task 2: `json_exec` now uses `@openai/codex-sdk` through `src/runners/jsonExecRunner.js`, with new/resume tests.
- Task 3: Introduced runner architecture scaffolding: base, app-server, json-exec, PTY runner adapters, session registry, and message bus.
- Task 4: Added manual approval flow, high-risk matching, persistent allow rules, and frontend approval toast UI.
- Task 5: Expanded rich event streaming with `message_part.kind` and collapsible frontend event cards for reasoning, commands, file changes, MCP tools, plans, and errors.
- Task 6: Added `/api/healthz`, `/api/metrics`, JSONL audit logging, and PM2 cron/memory restart settings.
- Task 7: Deferred. Config TOML and web settings page remain a follow-up because the lower-risk operational changes above are now in place.
