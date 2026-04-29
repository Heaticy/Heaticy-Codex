# Heaticy Codex

English | [简体中文](./README.zh-CN.md)

One thing only: use local `codex` sessions in your browser.

This repository is a fork of an open source Codex web terminal project, renamed and maintained by heaticy, with adjustments for LAN and reverse-proxy deployment.

Currently supports **Codex** only.

## Codex Runtime

- App-server now uses Codex `app-server` over **stdio** by default, so a normal start no longer opens `127.0.0.1:8777`.
- Temporary websocket compatibility is still available with `CODEX_APP_SERVER_TRANSPORT=ws`; that path keeps `CODEX_APP_SERVER_LISTEN_URL` and logs a deprecation warning.
- When `CODEX_APP_SERVER_ENABLED=false`, the fallback `json_exec` path uses `@openai/codex-sdk`.

## Approvals

Codex command, file-change, and permission requests are surfaced in the web UI for per-action approval. `CODEX_FULL_ACCESS=true` keeps the old auto-allow behavior only for non-high-risk requests; high-risk requests always require manual approval.

Persistent allow rules live in `~/.heaticy-codex/approvals.json`. Audit records are appended to `~/.heaticy-codex/audit.log`.

## Operations

- `GET /api/health` stays public for lightweight probes.
- `GET /api/healthz` returns bridge readiness, active runner count, and last error time.
- `GET /api/metrics` exposes Prometheus text metrics such as active sessions, Codex turn totals, and approval decisions.
- `GET /api/healthz` and `GET /api/metrics` now require an authenticated web session.
- Historical transcript cleanup runs automatically with a default retention of 30 days, or 7 days for low-information sessions.
- The session list now includes a maintenance strip that shows the latest cleanup report and can trigger manual cleanup after login.
- PM2 config restarts daily at 04:00 and restarts the process if memory exceeds 1G.

### History Cleanup Configuration

Set these environment variables in `.env` when you need different retention behavior:

- `HISTORY_RETENTION_DAYS` default `30`
- `HISTORY_SIMPLE_RETENTION_DAYS` default `7`
- `HISTORY_SIMPLE_MAX_MESSAGES` default `4`
- `HISTORY_SIMPLE_MAX_CHARS` default `1000`
- `HISTORY_CLEANUP_INTERVAL_HOURS` default `24`

Simple sessions are cleaned earlier when they contain fewer than 4 messages or less than about 1000 characters of text.

## Screenshots

<p align="center">
  <img src="./docs/images/codex-web-terminal.jpg" alt="Heaticy Codex mobile screenshot 1" width="280" />
  <img src="./docs/images/codex-web-terminal2.jpg" alt="Heaticy Codex mobile screenshot 2" width="280" />
</p>

## Prerequisites

- Node.js 22+
- `codex` CLI installed and available in `PATH`

## Quick Start (1 minute)

```bash
git clone https://github.com/SZZH/heaticy-codex.git
cd heaticy-codex
npm run setup
```

`npm run setup` guides you through `.env` setup, dependency installation, and service startup.

Or run manually:

```bash
cd heaticy-codex
cp .env.example .env
# Set your own ACCESS_TOKEN in .env
npm install
npm run dev:up
```

Open:

- Frontend (recommended): `http://127.0.0.1:<WEB_PORT>/#/sessions`
- Backend direct: `http://127.0.0.1:<PORT>`

## Mobile Access

### A. Same Wi-Fi

1. In `.env`, make sure `HOST=0.0.0.0`.
2. Open on your phone: `http://<your-lan-ip>:3211`
3. Sign in with `ACCESS_TOKEN`.

## Deployment (PM2)

```bash
npm run service:start
npm run service:status
npm run service:logs
```

## Common Commands

```bash
npm run dev            # Dev mode (server + web, foreground)
npm run dev:up         # macOS/Linux: start dev in background
npm run dev:down       # macOS/Linux: stop background dev processes
npm run check          # Quick checks
```

## Common Issues

1. `Cross-origin request rejected`
- Start with `npm run dev` (or `npm run dev:up` on macOS/Linux). Do not manually split startup commands.

2. Frontend port is not reachable
- Run `npm run dev` first, then check port:
```bash
# macOS/Linux
lsof -iTCP:<WEB_PORT> -sTCP:LISTEN -n -P

```

3. Phone says desktop is offline
- Check service status first: `npm run service:status`
- Then verify network path: same Wi-Fi or another route you explicitly configured yourself
- If you changed `PORT`, use the same port in your phone URL.
- `npm run setup` now writes both `PORT` and `WEB_PORT` into `.env`.
- You can still override them temporarily with `WEB_PORT=xxxx PORT=yyyy npm run dev` or `npm run dev:up`.

## Open Source

- Forked and maintained by heaticy
- [LICENSE](./LICENSE)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
