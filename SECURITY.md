# Security Policy

## Reporting a Vulnerability

If you find a security issue, do not open a public issue first.

Please report details to the maintainers privately with:

- impact summary
- reproduction steps
- affected files/endpoints
- suggested mitigation (if available)

We will acknowledge receipt and provide a remediation timeline.

## Deployment Notes

- Always set a strong `ACCESS_TOKEN`.
- Heaticy-Codex is intended for personal local and LAN use by default.
- Keep `HOST=0.0.0.0` only on networks you control.
- For private deployments, prefer strict `TRUSTED_CIDRS` and keep the service behind your own network controls.
- Do not expose this service directly to the public internet without HTTPS, additional authentication, and network controls you operate.
- Do not share `ACCESS_TOKEN`, `.env`, local transcripts, private paths, sensitive logs, or screenshots containing secrets in public issues.
