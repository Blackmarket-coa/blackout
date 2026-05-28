# Security Policy

## Supported versions

Security fixes are backported to the latest minor release. Older releases are best-effort.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report privately to the maintainers via the GitHub Security Advisories workflow:

- https://github.com/blackmarket-coa/blackout/security/advisories/new

If GitHub Security Advisories is unavailable, contact the maintainers directly through the project's listed contact channels and request a private channel before sharing details.

Please include:

- Affected component(s) and version(s) / commit hash.
- Steps to reproduce, or a proof of concept.
- Impact assessment (what an attacker can achieve).
- Whether you intend to publish, and your preferred disclosure timeline.

We aim to acknowledge reports within **3 business days** and to ship a fix or mitigation for confirmed Critical/High issues within **30 days**.

## Scope

In scope:

- The Blackout client apps (web, desktop, mobile).
- The Blackout server-side components in this repository.
- The deployment topologies documented under `deploy/`.

Out of scope:

- Third-party identity providers, push gateways, or homeservers not operated by the project.
- Social-engineering attacks against project maintainers.
- Issues already documented as accepted residual risks in [`THREAT_MODEL.md`](THREAT_MODEL.md) §7, unless you can demonstrate the rationale no longer holds.

## Threat model

See [`THREAT_MODEL.md`](THREAT_MODEL.md) for the authoritative adversary model, trust boundaries, and protected assets.

## Bot token scope (Synapse admin API)

The Blackout API uses a Matrix bot token (`MATRIX_BOT_TOKEN`) to provision and manage user accounts via the Synapse admin API. This token has full admin privileges over the homeserver.

**If compromised, an attacker can:**
- Create unlimited user accounts
- Deactivate (erase) any user account
- Force-join any user to any room
- Purge rooms and their message history
- List all users and room memberships
- Mint registration tokens

**Mitigations in place:**
- Destructive actions (user deactivation, room purge) require a time-limited confirmation token from `POST /v1/admin/destructive-action/request` — see `packages/api/src/middleware/require-destructive-confirm.ts`.
- All destructive actions are logged with admin username, target ID, and confirmation JTI to the structured logger for audit review.
- The token is passed via environment variable only, never checked into version control.

**Operator recommendations:**
- Restrict which services can connect to Synapse's admin port (firewall/network policy).
- Set up alerting for unusual admin API patterns (e.g., rapid user deactivation).
- Rotate the bot token periodically and use a dedicated, limited-scope bot account (not a personal admin account).

## Safe-harbor

Good-faith security research conducted in accordance with this policy will not result in legal action by the project. We ask that you:

- Do not access, modify, or destroy data that is not your own.
- Do not perform denial-of-service testing against production infrastructure.
- Give us a reasonable opportunity to remediate before public disclosure.
