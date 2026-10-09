# Upstream Security Advisories

Tracked artifact for security advisories from the upstream projects that BMC
maintains forks of. Mandated by
[`AGGRESSIVE_OPERATIONS_GUIDE.md` §8.3](../AGGRESSIVE_OPERATIONS_GUIDE.md)
as a Foundation milestone deliverable. The intent is that this file is
written to by an automated feed-aggregation job and read by the
[AI security workflow](AI_SECURITY_WORKFLOW.md), but the file is
authoritative even when the automation is not yet running — entries can be
added by hand.

## Watched upstream projects

Per [`AGGRESSIVE_OPERATIONS_GUIDE.md` §2.9](../AGGRESSIVE_OPERATIONS_GUIDE.md),
BMC carries modified forks of the following projects and is responsible for
applying or declining their security advisories:

- Cinny (Blackout client fork)
- Synapse (Matrix homeserver fork)
- MedusaJS (FBM backend fork)
- MercurJS (FBM multi-vendor extensions fork)
- Fleetbase (logistics functionality absorbed into FBM)

Advisories from direct dependencies of the BMC repos themselves are also
tracked here when they cross the threshold of "advisory affects an actively
used dependency"; routine dependabot-style minor bumps are not.

## Entry schema

Each advisory is one row in the table below. Columns:

| Column | Meaning |
|---|---|
| Date | ISO-8601 date the advisory was published upstream |
| Project | Upstream project name |
| Advisory ID | Upstream identifier (CVE, GHSA, project-internal ID) |
| URL | Link to the upstream advisory |
| Classification | `applicable`, `not-applicable`, or `needs-review` |
| BMC patch | PR or commit link if applicable; explanation if not-applicable |
| Reviewer | Who classified it (human or AI tool name + run ID) |

Classification rules per [`AI_SECURITY_WORKFLOW.md`](AI_SECURITY_WORKFLOW.md):

- **applicable** — the affected code path exists in the BMC fork; mitigation
  must be applied. Open a tracking issue and link the patch PR when it lands.
- **not-applicable** — the affected code path has been removed or replaced
  in the BMC fork. Briefly note *why*; "we removed module X" is enough.
- **needs-review** — the AI tool could not make a confident determination.
  A human reviews and re-classifies.

Once a `needs-review` row has been resolved, edit the row in place to
`applicable` or `not-applicable`. Keep the row; do not delete it.

## Advisories

| Date | Project | Advisory ID | URL | Classification | BMC patch | Reviewer |
|------|---------|-------------|-----|----------------|-----------|----------|
| 2026-07-28 | Synapse | GHSA-hgcg-p9gx-fq5f | https://github.com/element-hq/synapse/security/advisories/GHSA-hgcg-p9gx-fq5f | applicable | ported: commit aee1f86 (29 servlet patterns anchored with `$`); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-07-28 | Synapse | GHSA-vh4c-pqh4-w3wq | https://github.com/element-hq/synapse/security/advisories/GHSA-vh4c-pqh4-w3wq | applicable | ported: commit aee1f86 (`UnrecognizedRequestResource.getChild` returns a childless leaf); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-07-28 | Synapse | GHSA-6wjm-9p2x-gvpm | https://github.com/element-hq/synapse/security/advisories/GHSA-6wjm-9p2x-gvpm | applicable | ported: commit aee1f86 (multipart rejection, case-insensitive; we also lacked the original GHSA-rfq8 fix); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-07-28 | Synapse | GHSA-jhcg-5392-5mjw | https://github.com/element-hq/synapse/security/advisories/GHSA-jhcg-5392-5mjw | not-applicable | none: Sliding Sync (MSC4186) does not exist in this 1.98-based tree; PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-07-28 | Synapse | GHSA-95fh-hv8c-chvq | https://github.com/element-hq/synapse/security/advisories/GHSA-95fh-hv8c-chvq | applicable | ported: commit aee1f86 (remote 401 / M_UNKNOWN_TOKEN no longer relayed to clients); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-07-28 | Synapse | GHSA-r66v-qhwx-8rg4 | https://github.com/element-hq/synapse/security/advisories/GHSA-r66v-qhwx-8rg4 | applicable | ported: commit 58ffffe (`/timestamp_to_event` requires the origin to be in the room); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-07-28 | Synapse | GHSA-27p5-4f45-gx76 | https://github.com/element-hq/synapse/security/advisories/GHSA-27p5-4f45-gx76 | applicable | ported: commit 58ffffe (`/get_missing_events` constrained to the requested room); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-07-28 | Synapse | GHSA-fp53-rw9v-hcf9 | https://github.com/element-hq/synapse/security/advisories/GHSA-fp53-rw9v-hcf9 | applicable | ported: commit 1cce11e (new `push_rules.limits` config, enforced in the store); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-07-28 | Synapse | GHSA-rgv2-84w7-5j9p | https://github.com/element-hq/synapse/security/advisories/GHSA-rgv2-84w7-5j9p | applicable | ported: commit 58ffffe (spoofed-sender to-device EDUs dropped, not just logged); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-07-28 | Synapse | GHSA-qcjr-46gf-7f4r | https://github.com/element-hq/synapse/security/advisories/GHSA-qcjr-46gf-7f4r | applicable | ported: commit 58ffffe (`/event_auth` checks the event's room); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-07-28 | Synapse | GHSA-cjh7-rcpx-xpf8 | https://github.com/element-hq/synapse/security/advisories/GHSA-cjh7-rcpx-xpf8 | applicable | ported: commit 024f957 (predecessor must be ours and its tombstone must name the joined room); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-05-14 | Cinny | GHSA-mxfq-g77w-7668 | https://github.com/cinnyapp/cinny/security/advisories/GHSA-mxfq-g77w-7668 | not-applicable | none: the vulnerable `apps/blackout-client/.github/workflows/deploy-pull-request.yml` is nested, so GitHub never runs it (not registered per the Actions API); recommend deleting it; PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-05-08 | Synapse | GHSA-8q93-326v-3m7g | https://github.com/element-hq/synapse/security/advisories/GHSA-8q93-326v-3m7g | applicable | ported: commit c31c335 (lock re-poll capped at 60s; upstream's spin path is absent here, the back-off defect is not); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-05-08 | Synapse | GHSA-6qf2-7x63-mm6v | https://github.com/element-hq/synapse/security/advisories/GHSA-6qf2-7x63-mm6v | applicable | ported: commit c31c335 (pagination continues past a page of rejected events); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-05-07 | Cinny | GHSA-j944-w549-3453 | https://github.com/cinnyapp/cinny/security/advisories/GHSA-j944-w549-3453 | not-applicable | none needed: fix already present (client is Cinny 4.10.5-based; `src/sw.ts` host check and EmojiBoard / media fallbacks match upstream 4.10.3); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2025-10-08 | Synapse | GHSA-fh66-fcv5-jjfr | https://github.com/element-hq/synapse/security/advisories/GHSA-fh66-fcv5-jjfr | applicable | ported: commit 8e0b2aa (`/keys/upload` body validated; user/device IDs must match); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2025-03-26 | Synapse | GHSA-v56r-hwv5-mxg6 | https://github.com/element-hq/synapse/security/advisories/GHSA-v56r-hwv5-mxg6 | applicable | ported: commit 024f957 (out-of-range `depth` dropped inbound and outbound; exploited in the wild upstream); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2024-12-03 | Synapse | GHSA-vp6v-whfm-rv3g | https://github.com/element-hq/synapse/security/advisories/GHSA-vp6v-whfm-rv3g | applicable | ported: commit 024f957 (thumbnailer decodes only JPEG/PNG/WebP/GIF); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2024-12-03 | Synapse | GHSA-f3r3-h2mq-hx2h | https://github.com/element-hq/synapse/security/advisories/GHSA-f3r3-h2mq-hx2h | applicable | ported: commit 024f957 (non-list `invite_room_state` / `knock_room_state` no longer breaks `/sync`); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2024-12-03 | Synapse | GHSA-rfq8-j7rh-8hf2 | https://github.com/element-hq/synapse/security/advisories/GHSA-rfq8-j7rh-8hf2 | applicable | ported: commit aee1f86 (POST `multipart/form-data` rejected with 415 before buffering); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2024-12-03 | Synapse | GHSA-56w4-5538-8v8h | https://github.com/element-hq/synapse/security/advisories/GHSA-56w4-5538-8v8h | not-applicable | none: affects 1.113.0rc1-1.120.0 Sliding Sync only; absent from this tree; PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2024-12-03 | Synapse | GHSA-gjgr-7834-rhxr | https://github.com/element-hq/synapse/security/advisories/GHSA-gjgr-7834-rhxr | applicable | **NOT patched.** The fix is the MSC3916 authenticated-media feature (1.106-1.120); too large for a faithful hand-port. Partly mitigated by the GHSA-4mhg rate limit. Tracked follow-up; see triage doc; PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2024-12-03 | Synapse | GHSA-4mhg-xv73-xq2x | https://github.com/element-hq/synapse/security/advisories/GHSA-4mhg-xv73-xq2x | applicable | ported: commit 4bb2059 (per-IP leaky-bucket limit on remote media downloads; code is from upstream 1.110/1.112, not 1.106 as the advisory says); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2024-04-23 | Synapse | GHSA-3h7q-rfh9-xm4v | https://github.com/element-hq/synapse/security/advisories/GHSA-3h7q-rfh9-xm4v | applicable | ported: commit 362ac17 (no transitive auth-chain links; rollback hazard noted in PATCHES.md); PR #953; details in `docs/security/upstream-advisory-triage-2026-10-09.md` | Claude Code (session_01A7YaaoV5J86sWCToKXNbeW); pending maintainer review |
| 2026-05-12 | fast-uri (devDep: vite-plugin-pwa → workbox-build → ajv) | GHSA-v39h-62p7-jpjc | https://github.com/advisories/GHSA-v39h-62p7-jpjc | accepted | none — `pnpm audit --prod` excludes; resolves when vite-plugin-pwa upgrades to a workbox-build with patched ajv | Release Eng |
| 2026-05-12 | fast-uri (devDep: vite-plugin-pwa → workbox-build → ajv) | GHSA-q3j6-qgpj-74h6 | https://github.com/advisories/GHSA-q3j6-qgpj-74h6 | accepted | none — same devDep chain as v39h advisory; resolves when vite-plugin-pwa upgrades to fast-uri >= 3.1.1 | Release Eng |
| 2026-05-12 | @babel/plugin-transform-modules-systemjs (devDep: vite-plugin-pwa → workbox-build → @babel/preset-env) | GHSA-fv7c-fp4j-7gwp | https://github.com/advisories/GHSA-fv7c-fp4j-7gwp | accepted | none — `pnpm audit --prod` excludes; resolves when vite-plugin-pwa upgrades to a workbox-build with patched @babel/preset-env | Release Eng |

The table is initialised empty. The aggregation job
([`AI_SECURITY_WORKFLOW.md` §Aggregation](AI_SECURITY_WORKFLOW.md))
appends rows. When entering rows by hand, prepend the newest row at the top
of the body so the table reads newest-first.

## Operational notes

- The aggregation job is documented in
  [`AI_SECURITY_WORKFLOW.md`](AI_SECURITY_WORKFLOW.md). The workflow YAML
  that implements it is a follow-up to this docs-only deliverable.
- This file is read-only for the workflow's classification step and write-only
  for the aggregation step. Do not refactor the table format without
  updating the workflow at the same time.
- Resolved-and-applied advisories are not pruned. The history is the
  audit trail.

## Cross-references

- [`AGGRESSIVE_OPERATIONS_GUIDE.md` §2.9](../AGGRESSIVE_OPERATIONS_GUIDE.md) — fork posture
- [`AGGRESSIVE_OPERATIONS_GUIDE.md` §8.3](../AGGRESSIVE_OPERATIONS_GUIDE.md) — workflow rationale
- [`AI_SECURITY_WORKFLOW.md`](AI_SECURITY_WORKFLOW.md) — companion workflow doc
