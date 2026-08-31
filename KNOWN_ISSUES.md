# Known Issues — V1 Test Flight

This is the running list of **defects discovered during the 96-hour V1
test flight**. It is distinct from [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md):

| File                                           | Contents                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) | Planned deferrals — features intentionally incomplete for V1. Pre-existing before launch. |
| **`KNOWN_ISSUES.md` (this file)**              | Defects discovered during the test flight. Updated in each daily build report.            |

If you found something and don't see it here yet, file an issue — don't
assume someone else already did. Duplicates are easy to mark; missed reports
are not. Use the right template:
[Issues → choose template](https://github.com/Blackmarket-coa/blackout/issues/new/choose).

## Top 5 right now

Updated daily from H48 onward, in the daily build report at
`docs/launch/builds/H{N}.md`. The defect-intake loop is wired: the
`docs/launch/builds/` directory exists with a baseline `H0.md` and a
[`README.md`](docs/launch/builds/README.md) describing the cadence and the
curation step. This list is empty because no test-flight **defects** have been
curated yet — not because the loop isn't running.

Open items carried in from the pre-launch readiness audit (the deferred React
18→19 / react-router 8 migration, counsel review of the drafted Privacy Policy /
ToS, the production-like E2E + load run) are tracked in that report's Appendix B
(`docs/audits/pre-launch-readiness-audit-2026-07.md`) and in
[`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md), since they are planned deferrals
rather than newly discovered defects.

1. **BO-1 — Key-backup `DecryptionError` / unable-to-decrypt history.** Users on
   a new device see "unable to decrypt" for historical messages when no
   server-side key backup exists or it fails to restore. Severity: high — it
   directly undercuts the encryption claim on the trust page. Workaround: set up
   recovery (Settings → Encryption); `MessageBadEncryptedContent` surfaces a
   "Set up backup" action on the affected events. **Not yet fixed**; see the note
   below.
2.
3.
4.
5.

## Full list

|   ID | First seen | Surface | Severity | Status        | Workaround                               | ETA |
| ---: | ---------- | ------- | -------- | ------------- | ---------------------------------------- | --- |
| BO-1 | 2026-08-10 | Client  | high     | Instrumenting | Set up recovery in Settings → Encryption | TBD |

### BO-1 notes

Filed by the 2026-08-10 encryption audit
([`docs/audits/2026-08-10-encryption-audit.md`](docs/audits/2026-08-10-encryption-audit.md)).

The audit could not size this defect, and that was itself the finding:
`apps/blackout-client/src/client/matrixLogger.ts` deliberately drops both the
rust layer's `Failed to decrypt a room event: Can't find the room key` warning
and the `PerSessionKeyBackupDownloader` "no backup" probe. Each suppression is
defensible alone, but together they meant the rate of users who cannot read
their own history was not observable anywhere.

That wrapper now counts what it drops (`getSuppressedLogCounts()`), so the rate
can be read from a diagnostics surface or attached to a bug report. **Fixing the
underlying decryption failure is still open** — the next step is to collect real
`decryptUtd` numbers and determine whether the cause is backup setup never
completing, restore failing, or cross-signing state. Do not close this from the
instrumentation alone.

Since 2026-08-31 each report also classifies itself among those three causes:
`src/client/encryptionHealth.ts` tracks a privacy-safe key-backup /
cross-signing posture snapshot (backup exists on server / trusted / actively
connected / decryption key cached / cross-signing ready / failure count —
tristates and counts only, no identifiers). It rides the settings-page
diagnostics object and, on widget reports that already carry a non-zero
`undecryptableEvents`, a one-line
`backup=… trusted=… active=… key_cached=… cross_signing=… failures=…`
field. Triage rule of thumb: `backup=no` → setup never completed;
`backup=yes` with `active=no` / `key_cached=no` / `failures>0` → restore
failing; `trusted=no` or `cross_signing=no` → cross-signing state. The rate
question still needs live-fleet reports; this only makes each report answer
the "which cause" question by itself.

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

-   `severity:critical` — data risk, sign-in broken, hosted instance down.
-   `severity:high` — major feature unusable for many users.
-   `severity:medium` — feature degraded; workaround exists.
-   `severity:low` — minor; cosmetic or rare path.
-   `severity:papercut` — visible, impactful, easy to action.

## Relationship to V1.1

At H84+ the V1.1 roadmap planning starts. Issues on this list with
`severity:critical` or `severity:high` are the first cut of V1.1 scope. See
[`docs/launch/V1.1_ROADMAP.md`](docs/launch/V1.1_ROADMAP.md).
