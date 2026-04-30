# Contributing

Thanks for contributing.

## Development Setup

1. Install Node.js 22+.
2. Copy `.env.example` to `.env`.
3. Set `ACCESS_TOKEN` in `.env`.
4. Install dependencies:

```bash
npm install
```

5. Start development servers (backend watch + web HMR):

```bash
npm run dev:up
```

`npm run setup` is also available and checks whether `PORT` and `WEB_PORT` are already occupied before writing `.env`.

## Checks Before PR

Run:

```bash
npm run check
```

## Scope Guidelines

- Prefer minimal, local changes.
- Do not include secrets, personal paths, or local debug artifacts in commits.
- Do not paste `ACCESS_TOKEN`, `.env`, local Codex transcripts, sensitive logs, or screenshots containing secrets into issues or pull requests.
- Keep `web/dist/` out of git history (already ignored).
