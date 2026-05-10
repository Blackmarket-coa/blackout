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
| _(empty)_ | | | | | | |

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
