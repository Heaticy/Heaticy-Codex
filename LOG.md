# Project Log

Last updated: 2026-04-25

This log records the important changes made in this workspace so a future maintainer can quickly understand the current state. It is based on the visible working tree, not on committed history.

## Current Focus

The latest work focused on keeping the web chat clean. The web UI was showing internal Codex/app-server events such as command execution, file-change notifications, tool events, token usage, and process output. The fix now filters this at multiple layers instead of relying on one frontend cleanup pass.

## Web Noise Cleanup

- `src/sessionManager.js` now only broadcasts visible assistant messages for app-server notifications.
- `src/sessionManager.js` ignores non-chat notification types such as started/status/token usage events unless they only update session metadata.
- `src/sessionManager.js` keeps a fallback extractor for assistant message payloads that do not expose text directly.
- `web/src/lib/normalize-events.js` now treats `user` and `assistant` as the only chat-visible roles.
- `web/src/lib/normalize-events.js` drops internal item types before they can become UI parts, including command execution, file changes, tools, reasoning, token usage, approvals, and status updates.
- `web/src/App.vue` no longer defaults unknown roles to `system` chat messages.
- `web/src/App.vue` routes error parts to status text instead of appending them into the chat stream.
- `web/src/App.vue` cleans snapshot buffers before rendering them, so older polluted buffers are less likely to reappear.
- `web/src/lib/session-helpers.js` adds `cleanVisibleChatText()` as the shared cleanup path for live, snapshot, and history text.
- `web/src/components/ChatView.vue` hides process lines from the main message body at render time as a final display-layer guard.

## WebSocket Stability

- `src/routes/ws.js` adds safer WebSocket sending through `safeSend()`.
- `src/routes/ws.js` tracks `lastSeenAt` and `lastPingSentAt` per client.
- `src/routes/ws.js` supports app-level `ping`/`pong` messages in addition to protocol-level ping frames.
- `src/routes/ws.js` uses a stale timeout before terminating clients, reducing accidental disconnects behind browsers or proxies.

## Nginx Migration Notes

- `NGINX_MIGRATION.md` documents the intended migration from GitLab bundled Nginx as the global gateway to system Nginx as the only public `80/443` entrypoint.
- Target routing in that document is: `gitlab.vsplab.cn -> 127.0.0.1:8081`, `api.vsplab.cn -> 127.0.0.1:19821`, `heaticy.cn -> 127.0.0.1:3211`, and `courses.vsplab.cn -> 127.0.0.1:18001`.
- The migration plan keeps GitLab behind localhost and moves non-GitLab domains out of GitLab-managed Nginx configuration.

## Validation Already Run

- `node --check ./src/sessionManager.js`
- `npm run web:build`
- `git diff --check`

## Current Working Tree Notes

- Modified files: `src/routes/ws.js`, `src/sessionManager.js`, `web/src/App.vue`, `web/src/components/ChatView.vue`, `web/src/lib/normalize-events.js`, `web/src/lib/session-helpers.js`.
- New documentation file: `NGINX_MIGRATION.md`.
- Empty untracked file observed: `.codex`.
- No commit has been made for these changes in this workspace.

## Known Operational Notes

- If the web page still shows old noise after these changes, first hard-refresh the browser.
- If the backend is running as a long-lived process, restart it so the new `src/sessionManager.js` logic is loaded.
- If the app is served from a built frontend, rerun `npm run web:build` and restart the service that serves `web/dist`.
