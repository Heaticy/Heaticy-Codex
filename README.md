# Codex Web Terminal

English | [简体中文](./README.zh-CN.md)

One thing only: use local `codex` sessions in your browser (including mobile).

Currently supports **Codex** only.

## Screenshots

<p align="center">
  <img src="./docs/images/codex-web-terminal.jpg" alt="Codex Web Terminal mobile screenshot 1" width="280" />
  <img src="./docs/images/codex-web-terminal2.jpg" alt="Codex Web Terminal mobile screenshot 2" width="280" />
</p>

## Prerequisites

- Node.js 22+
- `codex` CLI installed and available in `PATH`

## Quick Start (1 minute)

```bash
git clone https://github.com/SZZH/codex-cc-web-terminal.git
cd codex-cc-web-terminal
npm run setup
```

`npm run setup` guides you through `.env` setup, dependency installation, and service startup.

Or run manually:

```bash
cd codex-cc-web-terminal
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

- [LICENSE](./LICENSE)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
