# Contributing to Blackout Client

Thanks for helping improve Blackout.

## Before you start

- Check existing issues before opening a new one.
- If you want to add or reshape a feature, open an issue first so the work lines up with the current migration plan.
- Prefer focused pull requests over broad mixed changes.

## Pull request expectations

- Use clear titles.
- Keep behavior changes easy to review.
- Do not bundle unrelated cleanup into feature work unless it is required to make the change safe.
- Preserve compatibility paths unless the change explicitly removes them.

## Development notes

- The modern client lives in `apps/blackout-client`.
- `apps/blackout-web` should only be used for customization transfer flows.
- Some inherited code still exists in the package; if you touch it, prefer moving behavior into the modern path instead of deepening the legacy surface.

## Quality bar

- Run the narrowest relevant checks you can before submitting.
- Call out any known test or typecheck gaps in your PR description.
- Avoid reverting unrelated workspace changes you did not make.

## Links

- Repo: [Blackmarket-coa/blackout](https://github.com/Blackmarket-coa/blackout)
- Issues: [GitHub issue tracker](https://github.com/Blackmarket-coa/blackout/issues)
- Client README: [README.md](./README.md)
