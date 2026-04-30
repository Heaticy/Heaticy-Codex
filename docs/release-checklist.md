# Heaticy-Codex 1.0.0 Release Checklist

## Required

- [ ] `npm test` passes.
- [ ] `npm run check` passes.
- [ ] `git diff --check` passes.
- [ ] `.env`, `data/`, `logs/`, `.codex`, `.plan-state`, and local transcripts are not tracked.
- [ ] README screenshots are final, compressed, and reviewed for secrets/private data.
- [ ] `README.md` and `README.zh-CN.md` contain equivalent startup, privacy, LAN, and security guidance.
- [ ] `PRIVACY.md` states local-only/no-upload behavior.
- [ ] `SECURITY.md` does not imply direct public-internet exposure is safe.
- [ ] `PORT` and `WEB_PORT` startup checks reject occupied ports and recommend alternatives.
- [ ] GitHub issue and PR templates warn against posting secrets or local data.
- [ ] `CHANGELOG.md` contains public `1.0.0` notes only.

## Publish

- [ ] Confirm the public repository remote and upstream fork attribution.
- [ ] Create tag `v1.0.0`.
- [ ] Use `docs/releases/v1.0.0.md` as the GitHub Release draft.
- [ ] Confirm CI passes on the pushed tag/release branch.
