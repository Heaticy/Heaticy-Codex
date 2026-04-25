# Agent Handoff

This file is the handoff entry for a new agent working in this repository.

## Read First

- `LOG.md`: current workspace history, latest fixes, validation already run, and known operational notes.
- `README.md` and `README.zh-CN.md`: product intent, local setup, service commands, and deployment expectations.
- `package.json`: supported scripts, especially `dev:hot`, `web:build`, `check`, `service:*`, and `pm2:*`.
- `src/config.js`: environment variables, defaults, and runtime configuration.
- `src/sessionManager.js`: provider/session lifecycle, Codex runner modes, app-server notifications, buffering, and WebSocket broadcasts.
- `src/appServerBridge.js`: bridge between this server and Codex app-server JSON-RPC/WebSocket behavior.
- `src/koa-app.js` and `src/routes/*.js`: HTTP routes, auth, history, sessions, and WebSocket wiring.
- `src/routes/ws.js`: WebSocket upgrade handling, heartbeat behavior, app-level ping/pong, and session input forwarding.
- `web/src/App.vue`: main frontend state machine, socket handling, snapshot handling, and message append logic.
- `web/src/lib/normalize-events.js`: server event to UI-part normalization. Keep it strict.
- `web/src/lib/session-helpers.js`: title, preview, history, terminal, and visible-chat cleanup helpers.
- `web/src/components/ChatView.vue`: final message rendering layer and process-detail display behavior.
- `NGINX_MIGRATION.md`: deployment/gateway migration notes if the task touches public routing or domains.

## Current Architecture

- Backend is a Koa server under `src/`.
- Frontend is a Vue/Vite app under `web/`.
- Production build output is `web/dist/` and should stay out of git history.
- Live sessions communicate through WebSocket messages from backend to frontend.
- Codex sessions can use legacy terminal-like streaming, JSON exec, or app-server integration depending on runtime configuration.

## Important Rules

- Do not show internal Codex process events in the main web chat.
- Main chat should only render user messages and assistant-visible answers.
- Treat command execution, file changes, tools, reasoning, approvals, status, and token usage as internal events unless the user explicitly asks to expose them.
- Keep filtering layered: server source filtering, event normalization filtering, snapshot/history cleanup, and render-layer guard.
- Do not default unknown roles to visible `system` chat messages.
- Preserve `session_updated` events for metadata refreshes.
- Preserve WebSocket heartbeat behavior when touching `src/routes/ws.js`; clients may rely on both app-level and protocol-level ping/pong.
- Do not remove the no-reply fallback unless replacing it with an equivalent user-visible failure state.
- After a feature is implemented and accepted/validated, commit that feature as its own version before starting unrelated work.

## Before Editing

- Run `git status --short` and check for unrelated user changes.
- Prefer small, surgical patches.
- Do not revert files you did not intentionally change.
- Keep commits scoped to one accepted feature or fix; do not mix unrelated changes into the same commit.
- If touching web message display, inspect all four paths: server broadcast, `normalize-events`, `App.vue`, and `ChatView.vue`.
- If touching history/session list titles, inspect `session-helpers.js` and `src/sessionManager.js` history extraction together.

## Validation

- For backend syntax after session manager edits: `node --check ./src/sessionManager.js`.
- For frontend/event-display edits: `npm run web:build`.
- For broader validation: `npm run check`.
- For any web UI, WebSocket, session lifecycle, routing, or end-to-end behavior change, you must actually open the running web app in a browser and verify the affected workflow before handoff. Use automated browser control or a real browser, test the relevant desktop/tablet/mobile viewport when applicable, and report what URL, viewport, workflow, and result were verified. Do not hand off based only on build success or “looks implemented” reasoning.
- Before handoff: `git diff --check`.

## Common Commands

- Start dev servers: `npm run dev:hot`.
- Build frontend: `npm run web:build`.
- Start production service: `npm run service:start`.
- Restart production service: `npm run service:restart`.
- View production logs: `npm run service:logs`.
- PM2 production reload: `npm run pm2:prod`.

## Current Caution

The latest user complaint was that the web UI still showed messy internal output. The current fix intentionally uses multiple guards. If future work reintroduces richer process visibility, keep it behind an explicit details view and never merge it into the primary assistant message body.
