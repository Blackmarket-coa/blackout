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
   a new device see "unable to decrypt" for historical messages, because
   Blackout can't yet restore keys from a backup or receive them from the
   account's other sessions, whether or not a backup exists. Severity: high — it
   directly undercuts the encryption claim on the trust page. Workaround: none
   in Blackout yet. Another Matrix app with the account's recovery key may
   restore backed-up keys there. For an account with no backup and no
   cross-signing, the key-backup nudge's "Set up backup" starts one, which other
   Matrix apps can restore from once the setup finishes; Blackout can't restore
   from it after you sign in on a new device. It holds the keys of the
   device that set it up (and of other sessions that trust it); a Blackout
   session signed in later doesn't add to it. **Not yet fixed**; see the note
   below.
2.
3.
4.
5.

## Full list

|   ID | First seen | Surface | Severity | Status        | Workaround                                                     | ETA |
| ---: | ---------- | ------- | -------- | ------------- | -------------------------------------------------------------- | --- |
| BO-1 | 2026-08-10 | Client  | high     | Instrumenting | None in Blackout yet (another Matrix app can restore a backup) | TBD |

### BO-1 notes

Filed by the 2026-08-10 encryption audit
([`docs/audits/2026-08-10-encryption-audit.md`](docs/audits/2026-08-10-encryption-audit.md)).

2026-11-08 (finding S9 of 2026-11-02): the earlier workaround here pointed to
a "Settings → Encryption" that never existed, and to the "Set up backup"
action, which on a new device of an account that already had a backup replaced
the account's secret storage and cross-signing and deleted that backup
([`docs/security/key-backup-nudge-2026-11-02.md`](docs/security/key-backup-nudge-2026-11-02.md)).
The nudge and the undecryptable-message chip now ask the homeserver what the
account has, again at every click, and offer the from-scratch setup only when
it answered that there is neither a backup nor cross-signing, and the warned
reset only when this device already trusts the account's cross-signing and no
backup exists; the chip explains first, and the setup form checks once more
before its first write. Otherwise they say what is true and offer nothing.
Closing the setup or reset window before that write stops it with nothing
changed; from that write until the attempt ends the window's close button is
off and Android's back press is held. An attempt that stops after its first
write (a failed step, a cancelled account confirmation, or a confirmation
Blackout can't do) keeps its new recovery key on screen and says how far it
got, since the account's secret storage may by then open only with that key
(or the passphrase entered with it); where it may have created a backup, it
offers no way on (sixth and seventh reviews of the same record). The window
can still go away mid-attempt: a browser's Back leaves the screen, and the
chip, which the app shows only in the pinned-messages popout and in
message-search results, takes its window with it when that popout or panel
closes or the message becomes readable. The attempt then runs to its end
and its recovery key is shown in a window of its own (eighth review). The
key is still lost if the page reloads or closes during the attempt (the page
asks the browser to confirm first; whether a prompt appears is up to the
browser or app), if the session is signed out before the key shows, or if a
request never answers. The restore path itself is still missing.

What BO-1 gates is anything that routes trust through Blackout
(`TRANSMUTATION_NOTES.md` §5). It does not gate coalition external sync:
cross-posting out and replies back in move public text between public
platforms and make no confidentiality claim, and that feature's own
preconditions are in `docs/coalitions/ECOSYSTEM_WIRING.md` §External sync
sequencing.

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

2026-11-08 (finding S9): the main cause is no longer undiagnosed. A new
Blackout device has no way to get the keys of messages sent before it signed
in: no mounted screen restores from a backup, verifies the device or receives
keys from another session, and the SDK's room-key requests are off
(matrix-js-sdk 40.2.0, `lib/rust-crypto/index.js`,
`roomKeyRequestsEnabled = false`). On such a device "restore failing" is not a
restore that fails: there is no restore. A new device of an account that has a
backup reports `active=no` for that reason alone, so the rule's
`backup=yes` with `active=no` names a path that does not exist there.
`failures` counts the SDK's `KeyBackupFailed` events, which it emits when this
device's upload to its active backup is refused because that version was
replaced or deleted on the server (`lib/rust-crypto/backup.js`, the upload
loop): a backup this device was writing to, not a restore. What live numbers
can still tell is narrower: how often a device fails on messages sent after it
signed in, whose keys should reach it from the sender. See
[`docs/security/key-backup-nudge-2026-11-02.md`](docs/security/key-backup-nudge-2026-11-02.md)
("What remains") and `TRANSMUTATION_NOTES.md` §5.

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
