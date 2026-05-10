# AI-Driven Security and Dependency Update Workflow

The operational answer to the fork-management posture in
[`AGGRESSIVE_OPERATIONS_GUIDE.md` §2.9](../AGGRESSIVE_OPERATIONS_GUIDE.md).
BMC maintains modified forks of Cinny, Synapse, MedusaJS, MercurJS, and the
absorbed Fleetbase rather than tracking upstream. This workflow is what makes
the resulting security-maintenance burden tractable for a solo maintainer.

Mandated by [`AGGRESSIVE_OPERATIONS_GUIDE.md` §8.3](../AGGRESSIVE_OPERATIONS_GUIDE.md)
as a Foundation milestone deliverable.

## Inputs and outputs

- **Input**: upstream security advisories and dependency releases.
- **Output**: a classified, auditable trail of which advisories were applied
  to BMC forks, which were declined as not-applicable, and which were
  surfaced to the maintainer for review.
- **Storage**: [`UPSTREAM_ADVISORIES.md`](UPSTREAM_ADVISORIES.md) holds the
  classified record. Patch PRs land on the BMC fork repos.

## The four steps

### 1. Aggregation

A scheduled GitHub Action pulls advisories from upstream feeds and appends
rows to [`UPSTREAM_ADVISORIES.md`](UPSTREAM_ADVISORIES.md).

Sources to aggregate:

- GitHub Security Advisories for each upstream repo (Cinny, Synapse,
  MedusaJS, MercurJS, Fleetbase).
- The respective project's official advisory feed where one exists
  (Synapse uses GitHub releases + the Matrix.org security blog; MedusaJS
  uses GitHub advisories).
- Direct dependencies of the BMC forks where the upstream advisory affects an
  actively used dependency.

Aggregation cadence: at least daily. The job does not classify; it only
deduplicates and writes new rows with `Classification = needs-review` until
step 2 reclassifies them.

The workflow YAML that implements this aggregation is a follow-up to this
docs-only deliverable.

### 2. Classification

For each `needs-review` row, AI tooling reads the upstream advisory and
determines whether the affected code path exists in the BMC fork. The output
is one of:

- **applicable** — affected code path exists in the fork; mitigation should
  be applied. The tool generates a candidate patch in step 3.
- **not-applicable** — affected code path has been removed or replaced in
  the fork. The row stays in [`UPSTREAM_ADVISORIES.md`](UPSTREAM_ADVISORIES.md)
  with a one-line justification ("Cinny: removed widget loader; advisory
  affects widget loader; not-applicable").
- **needs-review** — the tool cannot make a confident determination. The
  row is held for human review in step 4.

The classifier must cite the file paths it consulted in the BMC fork. A
classification with no citations is treated as `needs-review` regardless of
the tool's confidence.

### 3. Candidate patch generation

For `applicable` advisories, AI tooling produces a candidate patch on a
feature branch in the relevant BMC fork. The branch name follows
`security/<upstream-advisory-id>-<short-slug>`. The patch description includes:

- the upstream advisory ID and URL;
- a one-paragraph explanation of the mitigation as applied to the BMC fork
  (which may differ from the upstream patch if the fork has diverged);
- citations to the affected files and tests added;
- a note on whether existing tests cover the mitigation, and what new tests
  were added if not.

The maintainer reviews the patch as a normal PR. CI must pass before merge.

### 4. Human review (residual)

For `needs-review` advisories, the maintainer reviews the advisory in person
and decides applicability. This is the residual human-in-the-loop step. The
maintainer's decision is recorded in
[`UPSTREAM_ADVISORIES.md`](UPSTREAM_ADVISORIES.md) by editing the row's
`Classification` and `Reviewer` columns.

If the advisory has been in `needs-review` for longer than seven days, it
automatically escalates to a Stripe-style "must triage today" surface so it
does not silently rot. The exact alerting mechanism (email, Slack,
GitHub issue) is implementation detail and lives with the workflow YAML.

## Dependency updates

Routine dependency updates follow the same workflow. AI tooling proposes
updates, classifies them by risk (patch / minor / major), and the maintainer
approves or defers. Major-version upgrades are *always* `needs-review`
regardless of AI confidence.

The classifier should distinguish:

- **patch** — same major + minor, no API surface change. Auto-prepare PR; the
  maintainer merges if CI passes.
- **minor** — new functionality, no breaking changes per semver. Prepare PR;
  the maintainer reviews the upstream changelog before merging.
- **major** — breaking changes possible. Always human-reviewed; the
  classifier produces an analysis but does not auto-prepare a patch.

## Failure modes and mitigations

- **Classifier produces wrong "not-applicable"** — risk: an applicable
  advisory is silently dismissed. Mitigation: every `not-applicable` row in
  [`UPSTREAM_ADVISORIES.md`](UPSTREAM_ADVISORIES.md) records the reasoning,
  and a periodic spot-check (one per drill, see
  [`BUS_FACTOR_DRILL_CADENCE.md`](BUS_FACTOR_DRILL_CADENCE.md)) re-evaluates
  a sample.
- **Classifier produces wrong "applicable"** — risk: maintainer time wasted
  on PRs that don't need to ship. Lower-cost failure mode; CI and review
  catch it.
- **Aggregation job stops running** — risk: advisories pile up undetected.
  Mitigation: the job's last-run timestamp is a watch-item with an alert if
  more than 48 hours old.
- **Upstream changes feed format** — risk: aggregation silently misses rows.
  Mitigation: the job records a count of rows pulled per run and alerts on
  zero-count runs.

## Cross-references

- [`AGGRESSIVE_OPERATIONS_GUIDE.md` §2.9](../AGGRESSIVE_OPERATIONS_GUIDE.md) — fork posture rationale
- [`AGGRESSIVE_OPERATIONS_GUIDE.md` §8.3](../AGGRESSIVE_OPERATIONS_GUIDE.md) — workflow specification
- [`UPSTREAM_ADVISORIES.md`](UPSTREAM_ADVISORIES.md) — tracked artifact this workflow writes to
- [`BUS_FACTOR_DRILL_CADENCE.md`](BUS_FACTOR_DRILL_CADENCE.md) — drill spot-checks classifier output
