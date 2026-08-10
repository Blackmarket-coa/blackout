# How Blackout policy commitments change

Blackout makes public promises about encryption, privacy, and monetization. This
document describes how those promises are allowed to change, so that a user can
tell the difference between a commitment and a marketing sentence.

The mechanism is deliberately small: **a markdown file and git history.** No CMS,
no governance portal, no approval workflow beyond the one this repository already
has. The point is not ceremony — it is that a change is _visible as a diff_, that
it is dated, and that it cannot happen silently.

## The rule

> Any change to a published privacy or monetization commitment must land as a
> pull request that adds an entry to
> [`docs/legal/CHANGELOG.md`](CHANGELOG.md), in the same PR as the change
> itself.

If the code change and the changelog entry land separately, the record is wrong
for the window between them, and the window is exactly when someone would look.

## What counts as a policy change

Requires an entry:

-   Anything that makes encryption weaker, optional, or conditional — above all,
    anything that puts E2EE behind payment.
-   Adding a room type to the deliberately-unencrypted list, or changing what the
    Blackout bot can read.
-   Introducing server-side logging, analytics, or error reporting that touches
    message content.
-   Moving a capability from free to paid, or narrowing what the free tier can do.
-   Changing what a tier is _allowed_ to gate.
-   Introducing a new category of data collection or retention.
-   Any change that makes a statement in [`TRUST.md`](../../TRUST.md) less true.

Does **not** require an entry:

-   Prices. The catalog lives in the Free Black Market service, and repricing is
    not a change to what we promise.
-   Implementation, refactoring, or performance work that leaves observable
    behaviour unchanged.
-   Bug fixes that bring behaviour _back into line_ with an existing commitment —
    though if the gap was user-visible, say so in the entry for the commitment it
    restored, and prefer an audit document for anything substantial.
-   Release notes. Those are `allchange`-generated in `/CHANGELOG.md`.

When it is genuinely unclear, add the entry. A redundant line in a changelog
costs nothing; a missing one is the failure this process exists to prevent.

## Writing an entry

Date entries by **effective date** — when the change reaches users — not merge
date. Newest first. State the new commitment in full rather than describing the
delta, so the file can be read top-down without reconstructing history.

Link something checkable. A commitment that cannot be verified from source is a
slogan; the value of the entry is the reader's ability to confirm it themselves.

**If a commitment is weakening, say so in the entry, in plain words.** The
temptation is to describe a removal as a restructuring. A changelog that hides
withdrawals is worse than no changelog, because it manufactures trust that has
not been earned.

## Enforcement — stated honestly

**This is enforced socially, not mechanically.** Nothing in CI can tell that a
diff weakens a promise. What exists today:

-   `docs/legal/**` is owned in [`CODEOWNERS`](../../.github/CODEOWNERS), so
    changes to policy documents require maintainer review.
-   `pnpm guard:room-encryption` fails the build if room encryption regresses —
    narrow, but it covers the single commitment most likely to erode.
-   The git history is public and append-only in practice.

A determined maintainer can change a commitment without touching this file. The
protection is that the discrepancy is _discoverable_: the claims in `TRUST.md`
point at the code that backs them, so anyone can check whether the promise still
holds. Overstating this process would itself be the kind of thing it is meant to
prevent.

## Deferred: cooperative governance

A cooperative charter — member governance, formal decision rights over policy
changes, legal structure — is **not built and not committed to a date**. At
current scale it would be documentation of a process no one follows, which is
worse than an honest markdown file.

It is recorded on the trust page as a future direction so the roadmap is part of
the signal rather than a surprise later. Until it exists, this document describes
the whole of the process, and the trust page must not imply otherwise.
