# Contributing to Blackout

Thanks for your interest in Blackout. This document covers how to contribute
code, where to chat, and what we expect from pull requests. For non-developer
testing during the V1 test flight, see [`TESTERS.md`](TESTERS.md). For the
role taxonomy (Scout / Operator / Builder / Signal / Federation Team), see
[`CONTRIBUTOR_ROLES.md`](CONTRIBUTOR_ROLES.md).

## License and sign-off

Blackout is dual-licensed under **AGPL-3.0** ([`LICENSE-AGPL-3.0`](LICENSE-AGPL-3.0))
and **GPL-3.0** ([`LICENSE-GPL-3.0`](LICENSE-GPL-3.0)), with a separate
commercial option available — see [`LICENSE-COMMERCIAL`](LICENSE-COMMERCIAL).

Contributors certify the origin of their work using the **Developer Certificate
of Origin** ([DCO](https://developercertificate.org/)) — we do not require a
separate CLA. Sign off each commit:

```
git commit -s
```

This adds a `Signed-off-by: Your Name <you@example.com>` trailer that affirms
you have the right to submit the work under the project's license. By signing
off, you agree to the DCO. The commit author's name and email must match the
sign-off line.

## Where to chat

- **Developer / contributor chat:** [`#blackout-dev:theblackout.app`](https://matrix.to/#/#blackout-dev:theblackout.app)
  — code, architecture, contribution questions.
- **Tester / orientation chat:** [`#welcome:theblackout.app`](https://matrix.to/#/#welcome:theblackout.app)
  — for getting started on the hosted instance.
- **Open-ended discussion:** [GitHub Discussions](https://github.com/Blackmarket-coa/blackout/discussions)
  — roadmap, plugin ideas, governance, UX feedback, federation, steganography
  research.

## `_port/` (removed)

`_port/` was the parked Element-fork reference tree used during the initial
migration. It has been removed — the ported source now lives under `apps/`
(primarily `apps/blackout-client/` for the web client and `apps/blackout-server/`).
Older evidence and audit docs may still cite `_port/...` paths as they existed
before removal; those are historical and intentionally left as-is.

## How to contribute

The preferred and easiest way to contribute changes is to fork the repo on
GitHub and open a pull request. We use GitHub's pull request workflow to review
contributions, either asking for refinements or merging directly.

Pick up a [`good first issue`](https://github.com/Blackmarket-coa/blackout/labels/good%20first%20issue)
if you're new — these are scoped, well-documented, and reviewed quickly.

### PR titles

Your PR should have a title that describes what change is being made. This is
used for the changelog entry by default, so a good title tells a user
succinctly what is changing. "Fix bug where cows had five legs" and "Add
support for miniature horses" are examples of good titles. Don't include an
issue number in the title — that belongs in the description. Avoid the GitHub
default of "Update file.ts".

### PR descriptions

Your PR description should include:

- References to any bugs fixed by the change (in GitHub's `Fixes #123` notation).
- The why and what of the change, so reviewers can onboard and context-switch
  easily. This is also helpful when revisiting the change months later.
  - Why didn't it work before? Why does it work now? What use cases does it
    unlock?
  - If you find yourself explaining how the code works in the PR description,
    consider putting that explanation as a comment in the code itself.
  - If the PR evolves significantly during review, update the description to
    reflect the most recent state.
- Before/after screenshots for visible changes.
- A step-by-step testing strategy so a reviewer can check out the code
  locally and exercise your change.
- Inline diff comments where context helps the reviewer.

### Changelogs

There's no need to add changelog entries manually — we generate them from PR
information. By default the PR title is used; you can override this with a
`Notes:` annotation in the description.

To add a longer description:

_Fix reaction picker crash_

```
Notes: Fix a bug (https://github.com/Blackmarket-coa/blackout/issues/123) where the reaction picker would crash if a message had more than 8 distinct reactions.
```

For PRs that don't need a user-facing changelog entry (the default for
`T-Task`):

_Remove outdated comment from `RoomList.tsx`_

```
Notes: none
```

For changes spanning multiple downstream surfaces, scope the notes:

_Fix voice channel reconnect bug_

```
Notes: Fix a bug where the voice channel would not automatically reconnect after a dropped connection
blackout notes: Fix a bug where rejoining a voice channel after a dropped connection required a manual refresh
```

Scopes you can specify:

- `blackout` — main client / web
- `blackout-desktop` — Tauri wrapper (testers: verify a downloaded build with
  [`blackout-desktop/docs/signing-verification.md`](blackout-desktop/docs/signing-verification.md))
- `blackout-mobile` — Capacitor mobile build

If your PR introduces a breaking change, add the `X-Breaking-Change` label.
You don't need to call out "breaking" in the notes — the label handles that —
but you do need to document the migration:

_Remove legacy class_

```
Notes: Remove legacy `Camelopard` class. `Giraffe` should be used instead.
```

### Labels

Other metadata is added via labels (see the full scheme in
[`.github/labels.yml`](.github/labels.yml)):

- `X-Breaking-Change` — adding this label causes a _major_ version bump.
- `T-Enhancement` — a new feature; causes a _minor_ version bump.
- `T-Defect` — a bug fix (in code or docs).
- `T-Task` — no user-facing changes (refactors, CI, tests, comments). No
  changelog entry by default.
- `surface:{web,desktop,mobile,server}` — which surface(s) the change touches.
- `area:*` — domain (e.g. `area:coalition`, `area:governance`,
  `area:steganography`, `area:livekit`).

If you don't have permission to add labels, your reviewer will add them — just
mention it in the PR description.

All PRs go through CI. If your change breaks the build, the PR will show
failing checks; please come back after a few minutes.

## Tests

Your PR should include tests.

For new user-facing features, include:

1. **Unit tests** in Jest (located in `/test`, or co-located under
   `packages/*/test/` depending on the package).
2. **End-to-end "happy path" tests** in Playwright (located in
   `/playwright/e2e`).
3. Ideally, edge and error cases as well.

Unit tests are expected even when a feature is in labs — writing tests
alongside the code keeps the code testable from the start and gives you a
fast feedback loop. E2E tests should land before a feature leaves labs.

For bug fixes, include at least one unit test or E2E test that fails without
your fix and passes with it. Which kind of test is best depends on what most
concisely exercises the area.

Aim for **80%+ coverage** on new code. If you can't, document why in the PR.

Some code sensibly doesn't have coverage (e.g. branches that explicitly
inhibit noisy logging in tests). Hide those with an istanbul comment as
[documented here](https://github.com/gotwarlost/istanbul/blob/master/ignoring-code-for-coverage.md):

```javascript
/* istanbul ignore if */
if (process.env.NODE_ENV !== "test") {
    logger.error("Log line that is noisy enough in tests to want to skip");
}
```

Tests validate that your change works as intended and document concisely what
changed. Ideally your new tests fail before your change and succeed after.
Writing tests first is often the simplest way to get there.

If you're spiking experimental code that isn't supporting production
features, the test requirement can be relaxed. Tests will still be required
before the feature ships, and it's easier to add them while the design is
fresh.

Not sure how to test a change? Ask in
[`#blackout-dev:theblackout.app`](https://matrix.to/#/#blackout-dev:theblackout.app).

## Code style

Blackout targets TypeScript / ES2022. All new files should be TypeScript;
existing files should use modern ECMAScript idioms where practical.

Avoid `export default` — it makes index files less clear and can cause
naming drift since default exports are aliased on import. Use named exports.

The rest of the code style is in [`code_style.md`](./code_style.md).

Don't mix cosmetic and functional changes in the same commit — it makes
review much harder.

## Shared components

When adding UI components, consider whether they belong in
`packages/ui` rather than directly under `src/`. Add them to
shared components if they:

- Are reusable across different parts of the application,
- Could be reused by other Blackout surfaces (desktop wrapper, mobile, etc.),
- Follow established patterns and aren't tightly coupled to specific
  application logic.

See [`packages/ui/README.md`](./packages/ui/README.md) for more.

## Attribution

Everyone who contributes is welcome to add themselves to
[`AUTHORS.rst`](AUTHORS.rst) with a short note about the area(s) they've
worked on. Feel free to include the AUTHORS update in your PR.

## Review expectations

Most PRs get a first response within 48 hours during normal operation, and
within 6 hours during the V1 test flight window. Reviewers will work with you
to land your change — expect a few rounds of discussion, especially for
larger changes. If a PR is sitting without a response longer than that, ping
in [`#blackout-dev:theblackout.app`](https://matrix.to/#/#blackout-dev:theblackout.app).

## Merge strategy

The preferred method is **squash merge** to keep history trim. The merger
chooses on a case-by-case basis. We do not support rebase merges because
`allchange` cannot handle them. When merging, leave the default commit title
(or at minimum, leave the PR number at the end in brackets).

When stacking pull requests:

1. Branch from `develop` to your branch (`branch1`), push commits, open a PR.
2. Branch from `branch1` to your work branch (`branch2`), open a PR with
   `base: branch1`. Note in the description that it stacks on your other PR.
3. Merge the first PR with a **merge commit** rather than squash, otherwise
   the stacked PR will need a rebase. GitHub will automatically adjust the
   base branch of the second PR to `develop`.

## Conduct

Participation in the project — code, issues, discussions, hosted-instance
chat, and the Coliseum Coalition — is governed by
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
