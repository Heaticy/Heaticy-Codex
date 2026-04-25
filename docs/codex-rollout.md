# Codex Rollout Notes

- `$CODEX_HOME` resolves from the environment and defaults to `~/.codex`; heaticy-codex must not override it or point Codex at a temporary directory.
- Local rollout files were verified under `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`.
- File names include the session timestamp and thread id, for example `rollout-2026-04-25T22-16-48-019dc500-0dfb-74b3-94b6-1e4991dfff52.jsonl`.
- The first `session_meta` JSONL record carries `payload.id` (thread id), `payload.cwd`, `originator`, CLI version, and provider metadata.
- `codex resume` opens the interactive picker by default; `codex resume --last` resumes the most recent recorded session without the picker.
- The installed `codex resume --help` exposes no `--json` option as of 2026-04-25.
- Current app-server / SDK runs are expected to use the same Codex home because this app passes through the host environment instead of setting `CODEX_HOME`.
- If a future Codex release changes this layout, rollout import should degrade to read-only listing failure rather than writing compatibility files.
