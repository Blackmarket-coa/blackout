# Developer Guide

This repository is in an active migration from inherited Element/Cinny structures into Blackout-owned surfaces. Use this guide as the quick orientation point before making changes.

## Where to work

-   `apps/blackout-client` is the canonical browser client and the long-term product shell.
-   `legacy/blackout-web` is the retained customization/steganography surface from the pre-migration app, not the long-term product shell.
-   Shared Blackout logic should move toward reusable core/state layers instead of new legacy wrappers.

## Preferred direction

-   Build on the modern client path first.
-   Treat legacy compatibility as a bridge, not a destination.
-   Keep Matrix wire compatibility where needed, but align user-facing language and UI with Blackout.

## Before implementing

-   Read [docs/choosing-an-issue.md](docs/choosing-an-issue.md) if you are picking up repository work for the first time.
-   Check whether the change belongs in shared Blackout state/helpers before patching an inherited duplicate surface.
-   If a change has product or migration consequences, open an issue or draft PR early so the approach can be reviewed before too much code lands.

## Local workflow

From the repository root:

```sh
pnpm install
pnpm web:dev
```

Helpful checks:

```sh
pnpm --filter @blackout/client run typecheck
pnpm web:test
pnpm --dir legacy/blackout-web exec tsc --noEmit
```

See the Development workflow section of [README.md](README.md) for the full
pre-PR checklist. `pnpm web:dev` is the canonical way to start the client —
`pnpm --dir apps/blackout-client start` runs the same Vite server if you prefer
to work from the workspace directly.

## Editing guidance

-   Prefer modern files and shared Blackout utilities over reviving removed legacy shells.
-   Do not remove compatibility keys or Matrix event identifiers unless the migration impact is understood.
-   Keep wording consistent with Blackout terminology, especially `canopy` and `den` in user-facing copy.

## Support paths

-   Repository: [Blackmarket-coa/blackout](https://github.com/Blackmarket-coa/blackout)
-   Issues: [GitHub issue tracker](https://github.com/Blackmarket-coa/blackout/issues)
