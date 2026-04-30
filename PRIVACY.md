# Privacy

Heaticy-Codex is local-first. It does not upload your prompts, Codex transcripts, approval decisions, audit logs, project data, or local configuration to a Heaticy-Codex service.

## What The App Reads

- Your local Codex session transcripts, by default under `~/.codex/sessions`.
- Optional Codex configuration from your local Codex home.
- Project state created by this app.

## What The App Writes

- `.env` in this repository when you run setup.
- `data/` in this repository for local app state such as custom session names and archive state.
- `logs/` for local service logs.
- `~/.heaticy-codex/approvals.json` for remembered approval rules.
- `~/.heaticy-codex/audit.log` for local audit records.
- Browser session cookies used to keep you logged in.

## Network Boundary

When `HOST=0.0.0.0`, the app listens on your network interfaces so another device on the same LAN can open the web UI with `http://<LAN-IP>:<WEB_PORT>/#/sessions`.

This is useful for phone access, but it also means other devices that can reach your machine may see the login page. Use a strong `ACCESS_TOKEN`, stay on networks you control, and do not expose the app directly to the public internet without your own HTTPS, authentication, and network controls.

## What To Avoid Sharing Publicly

Do not paste these into public issues, pull requests, screenshots, or logs:

- `ACCESS_TOKEN`
- `.env`
- Codex transcripts
- Local filesystem paths that identify private projects
- Private IPs or domains you do not want public
- Screenshots containing secrets, private prompts, or private output

## Git Ignore Defaults

The repository ignores common local runtime files including `.env`, `data/`, `logs/`, `.codex`, `.plan-state`, `node_modules/`, and `web/dist/`.
