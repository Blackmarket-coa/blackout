# Known Issues — V1 Test Flight

This is the running list of **defects discovered during the 96-hour V1
test flight**. It is distinct from [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md):

| File | Contents |
|---|---|
| [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) | Planned deferrals — features intentionally incomplete for V1. Pre-existing before launch. |
| **`KNOWN_ISSUES.md` (this file)** | Defects discovered during the test flight. Updated in each daily build report. |

If you found something and don't see it here yet, file an issue — don't
assume someone else already did. Duplicates are easy to mark; missed reports
are not. Use the right template:
[Issues → choose template](https://github.com/Blackmarket-coa/blackout/issues/new/choose).

## Top 5 right now

(Updated daily from H48 onward, in the daily build report at
`docs/launch/builds/H{N}.md`. The test flight is underway; this list is
still empty because no defects have been curated onto it yet, or because
the flight hasn't yet reached H48.)

1. _(none curated yet)_
2.
3.
4.
5.

## Full list

| ID | First seen | Surface | Severity | Status | Workaround | ETA |
|---:|---|---|---|---|---|---|
| _none yet_ |  |  |  |  |  |  |

## How this list is maintained

When a maintainer triages an incoming issue and decides it belongs on this
list, they add the **`needs-curate-known-issue`** label. The next daily
build report includes the curation step:

```bash
# Pull all issues tagged for curation
gh issue list --label "needs-curate-known-issue" --json number,title,labels,createdAt --limit 100 \
  > /tmp/curate.json

# After updating the table above, remove the label so the issue doesn't
# get pulled again next time
gh issue list --label "needs-curate-known-issue" --json number --jq '.[].number' | \
  xargs -I {} gh issue edit {} --remove-label "needs-curate-known-issue"
```

Severity assignments follow `.github/labels.yml`:

- `severity:critical` — data risk, sign-in broken, hosted instance down.
- `severity:high` — major feature unusable for many users.
- `severity:medium` — feature degraded; workaround exists.
- `severity:low` — minor; cosmetic or rare path.
- `severity:papercut` — visible, impactful, easy to action.

## Relationship to V1.1

At H84+ the V1.1 roadmap planning starts. Issues on this list with
`severity:critical` or `severity:high` are the first cut of V1.1 scope. See
[`docs/launch/V1.1_ROADMAP.md`](docs/launch/V1.1_ROADMAP.md).
