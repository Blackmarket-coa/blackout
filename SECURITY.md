# Security Policy

## Supported versions

Security fixes are backported to the latest minor release. Older releases are best-effort.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report privately to the maintainers via the GitHub Security Advisories workflow:

-   https://github.com/blackmarket-coa/blackout/security/advisories/new

If GitHub Security Advisories is unavailable, contact the maintainers directly through the project's listed contact channels and request a private channel before sharing details.

Please include:

-   Affected component(s) and version(s) / commit hash.
-   Steps to reproduce, or a proof of concept.
-   Impact assessment (what an attacker can achieve).
-   Whether you intend to publish, and your preferred disclosure timeline.

We aim to acknowledge reports within **3 business days** and to ship a fix or mitigation for confirmed Critical/High issues within **30 days**.

## Scope

In scope:

-   The Blackout client apps (web, desktop, mobile).
-   The Blackout server-side components in this repository.
-   The deployment topologies documented under `deploy/`.

Out of scope:

-   Third-party identity providers, push gateways, or homeservers not operated by the project.
-   Social-engineering attacks against project maintainers.
-   Issues already documented as accepted residual risks in [`THREAT_MODEL.md`](THREAT_MODEL.md) §7, unless you can demonstrate the rationale no longer holds.

## Threat model

See [`THREAT_MODEL.md`](THREAT_MODEL.md) for the authoritative adversary model, trust boundaries, and protected assets.

## What we claim, and how to check it

[`TRUST.md`](TRUST.md) states Blackout's user-facing commitments — end-to-end
encryption that is never paywalled, free self-service data export, and a
versioned record of policy changes — with a link to the code behind each one and
a named list of what is _not_ encrypted.

If you find something that contradicts a claim on that page, that is a report we
want, through the process above. Changes to those commitments are recorded in the
[policy changelog](docs/legal/CHANGELOG.md).

## Safe-harbor

Good-faith security research conducted in accordance with this policy will not result in legal action by the project. We ask that you:

-   Do not access, modify, or destroy data that is not your own.
-   Do not perform denial-of-service testing against production infrastructure.
-   Give us a reasonable opportunity to remediate before public disclosure.
