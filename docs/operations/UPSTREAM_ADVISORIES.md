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
| 2026-05-14 | Cinny | GHSA-mxfq-g77w-7668 | https://github.com/cinnyapp/cinny/security/advisories/GHSA-mxfq-g77w-7668 | needs-review | _(pending)_ | _(automation)_ |
| 2026-05-07 | Cinny | GHSA-j944-w549-3453 | https://github.com/cinnyapp/cinny/security/advisories/GHSA-j944-w549-3453 | needs-review | _(pending)_ | _(automation)_ |
| 2026-07-28 | Synapse | GHSA-hgcg-p9gx-fq5f | https://github.com/element-hq/synapse/security/advisories/GHSA-hgcg-p9gx-fq5f | needs-review | _(pending)_ | _(automation)_ |
| 2026-07-28 | Synapse | GHSA-vh4c-pqh4-w3wq | https://github.com/element-hq/synapse/security/advisories/GHSA-vh4c-pqh4-w3wq | needs-review | _(pending)_ | _(automation)_ |
| 2026-07-28 | Synapse | GHSA-6wjm-9p2x-gvpm | https://github.com/element-hq/synapse/security/advisories/GHSA-6wjm-9p2x-gvpm | needs-review | _(pending)_ | _(automation)_ |
| 2026-07-28 | Synapse | GHSA-jhcg-5392-5mjw | https://github.com/element-hq/synapse/security/advisories/GHSA-jhcg-5392-5mjw | needs-review | _(pending)_ | _(automation)_ |
| 2026-07-28 | Synapse | GHSA-95fh-hv8c-chvq | https://github.com/element-hq/synapse/security/advisories/GHSA-95fh-hv8c-chvq | needs-review | _(pending)_ | _(automation)_ |
| 2026-07-28 | Synapse | GHSA-r66v-qhwx-8rg4 | https://github.com/element-hq/synapse/security/advisories/GHSA-r66v-qhwx-8rg4 | needs-review | _(pending)_ | _(automation)_ |
| 2026-07-28 | Synapse | GHSA-27p5-4f45-gx76 | https://github.com/element-hq/synapse/security/advisories/GHSA-27p5-4f45-gx76 | needs-review | _(pending)_ | _(automation)_ |
| 2026-07-28 | Synapse | GHSA-fp53-rw9v-hcf9 | https://github.com/element-hq/synapse/security/advisories/GHSA-fp53-rw9v-hcf9 | needs-review | _(pending)_ | _(automation)_ |
| 2026-07-28 | Synapse | GHSA-rgv2-84w7-5j9p | https://github.com/element-hq/synapse/security/advisories/GHSA-rgv2-84w7-5j9p | needs-review | _(pending)_ | _(automation)_ |
| 2026-07-28 | Synapse | GHSA-qcjr-46gf-7f4r | https://github.com/element-hq/synapse/security/advisories/GHSA-qcjr-46gf-7f4r | needs-review | _(pending)_ | _(automation)_ |
| 2026-07-28 | Synapse | GHSA-cjh7-rcpx-xpf8 | https://github.com/element-hq/synapse/security/advisories/GHSA-cjh7-rcpx-xpf8 | needs-review | _(pending)_ | _(automation)_ |
| 2026-05-08 | Synapse | GHSA-8q93-326v-3m7g | https://github.com/element-hq/synapse/security/advisories/GHSA-8q93-326v-3m7g | needs-review | _(pending)_ | _(automation)_ |
| 2026-05-08 | Synapse | GHSA-6qf2-7x63-mm6v | https://github.com/element-hq/synapse/security/advisories/GHSA-6qf2-7x63-mm6v | needs-review | _(pending)_ | _(automation)_ |
| 2025-10-08 | Synapse | GHSA-fh66-fcv5-jjfr | https://github.com/element-hq/synapse/security/advisories/GHSA-fh66-fcv5-jjfr | needs-review | _(pending)_ | _(automation)_ |
| 2025-03-26 | Synapse | GHSA-v56r-hwv5-mxg6 | https://github.com/element-hq/synapse/security/advisories/GHSA-v56r-hwv5-mxg6 | needs-review | _(pending)_ | _(automation)_ |
| 2024-12-03 | Synapse | GHSA-vp6v-whfm-rv3g | https://github.com/element-hq/synapse/security/advisories/GHSA-vp6v-whfm-rv3g | needs-review | _(pending)_ | _(automation)_ |
| 2024-12-03 | Synapse | GHSA-f3r3-h2mq-hx2h | https://github.com/element-hq/synapse/security/advisories/GHSA-f3r3-h2mq-hx2h | needs-review | _(pending)_ | _(automation)_ |
| 2024-12-03 | Synapse | GHSA-rfq8-j7rh-8hf2 | https://github.com/element-hq/synapse/security/advisories/GHSA-rfq8-j7rh-8hf2 | needs-review | _(pending)_ | _(automation)_ |
| 2024-12-03 | Synapse | GHSA-56w4-5538-8v8h | https://github.com/element-hq/synapse/security/advisories/GHSA-56w4-5538-8v8h | needs-review | _(pending)_ | _(automation)_ |
| 2024-12-03 | Synapse | GHSA-gjgr-7834-rhxr | https://github.com/element-hq/synapse/security/advisories/GHSA-gjgr-7834-rhxr | needs-review | _(pending)_ | _(automation)_ |
| 2024-12-03 | Synapse | GHSA-4mhg-xv73-xq2x | https://github.com/element-hq/synapse/security/advisories/GHSA-4mhg-xv73-xq2x | needs-review | _(pending)_ | _(automation)_ |
| 2024-04-23 | Synapse | GHSA-3h7q-rfh9-xm4v | https://github.com/element-hq/synapse/security/advisories/GHSA-3h7q-rfh9-xm4v | needs-review | _(pending)_ | _(automation)_ |
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
