# Changelog

## 0.2.0 — 二周目

- Task 1: App-server defaults to stdio transport; websocket transport remains behind `CODEX_APP_SERVER_TRANSPORT=ws` for one compatibility window.
- Task 2: `json_exec` now uses `@openai/codex-sdk` through `src/runners/jsonExecRunner.js`, with new/resume tests.
- Task 3: Introduced runner architecture scaffolding: base, app-server, json-exec, PTY runner adapters, session registry, and message bus.
- Task 4: Added manual approval flow, high-risk matching, persistent allow rules, and frontend approval toast UI.
- Task 5: Expanded rich event streaming with `message_part.kind` and collapsible frontend event cards for reasoning, commands, file changes, MCP tools, plans, and errors.
- Task 6: Added `/api/healthz`, `/api/metrics`, JSONL audit logging, and PM2 cron/memory restart settings.
- Task 7: Deferred. Config TOML and web settings page remain a follow-up because the lower-risk operational changes above are now in place.
