# The key-backup nudge deleted the account's key backup — S9, 2026-11-02

Finding S9 of the sign-out design review (task #43, design revision 3, §4.10 and
§6.9), live on `develop` at `0367abdd69`, high. Found by reading the code while
designing Sign out, which would have made the path below a step people take on
purpose. Fixed on the branch this record ships with; the standing rule applies:
fixed and explained, nothing baselined. A second review on 2026-11-08 found that
the guard's verdict could be stale at the click (S9-2, below, and "Second
review"); fixed on the same branch, new commits only. A third review the same
day found that a check's late answer could replace a later one, that the chip's
"Why?" opened the setup without explaining, and that several sentences said
more or less than a backup does (S9-3, below, and "Third review"); fixed on the
same branch, new commits only. A fourth review the same day found five
sentences that said more or less than the code does, among them one on the
trust page, and could not run its checks for lack of disk space ("Fourth
review"); the sentences are fixed on the same branch, new commits only, and the
gates ran on the merged head beside a develop baseline. A fifth review the same
day found that the guard's checking, explanation and offer panels had no focus
trap, that a brand-new account whose setup failed partway could not finish it
from the same form, five places where the docs said more or less than the code
or the reproduction showed, and a broken table ("Fifth review"); all fixed on
the same branch, new commits only. That round's re-run of the reproduction also
found that develop's chip never showed the new recovery key (S9-4). A sixth
review the same day found that a setup or warned reset that stopped after its
first write never showed the recovery key that by then was the only one opening
the account's secret storage, and after a backup it may have created told the
person to press a Continue that could only be refused (S9-5); that the chip's
not-verified text, added by the fourth review, promised a message becomes
readable when the sender's device sends its key later, which the usual case for
that row rules out (S13-2); and that `docs/e2ee.md` described an onboarding gate
nothing calls ("Sixth review"); all fixed on the same branch, new commits only.

| ID    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                               | Where                                                                                                                                                                                                                            | Status                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| S9    | On a new device, the key-backup nudge and the undecryptable-message chip opened a setup that replaced the account's secret storage and cross-signing and deleted its server-side key backup, with no warning                                                                                                                                                                                                                          | `apps/blackout-client/src/app/features/settings/security/KeyBackupNudge.tsx`, `src/app/components/message/content/FallbackContent.tsx`, `src/app/features/settings/devices/Verification.tsx` (`EnableVerification`, not mounted) | fixed; restore path still missing (BO-1)                                                      |
| S9-2  | The guard's verdict was fetched once, and the nudge's and the Devices page's buttons opened the setup from that stored answer, so cross-signing and a backup created on another device after the check were replaced and deleted without warning; a rejecting device check escaped as an unhandled rejection                                                                                                                          | the same `KeyBackupNudge.tsx` and `Verification.tsx`; `src/app/components/DeviceVerificationSetup.tsx` (the form itself checked nothing)                                                                                         | fixed (second review, 2026-11-08)                                                             |
| S9-3  | A check's late answer replaced a later one: the answer to a superseded click, or to a click whose overlay was closed, set the overlay (the setup over a fresh "backup" answer, or a closed overlay reopened) and brought the nudge's button back; the chip's "Why?" opened the setup or the reset in rows 1 and 2 with no explanation                                                                                                 | `src/app/components/KeyBackupSetupGuard.tsx`, `KeyBackupNudge.tsx`, `Verification.tsx`, `FallbackContent.tsx`                                                                                                                    | fixed (third review, 2026-11-08)                                                              |
| S9-4  | On develop the chip chose its flow from account data at every render, so once its setup wrote `m.cross_signing.master` the overlay switched to "Reset Device Verification": the setup finished (new secret storage and cross-signing, the old backup deleted, a new one made) and the new recovery key was never shown                                                                                                                | `src/app/components/message/content/FallbackContent.tsx` (develop)                                                                                                                                                               | fixed by S9-3's guard overlay, which follows its own panel; pinned (fifth review, 2026-11-08) |
| S9-5  | A setup or warned reset that stopped after its first write (a failed step, or a cancel at the account confirmation) never showed the new recovery key, by then the only key that opened the account's secret storage; after a backup the attempt may have created, the form said to press Continue, which was then refused with a "may be able to restore" sentence that isn't true of that backup; a cancel left an empty error line | `src/app/components/DeviceVerificationSetup.tsx` (`SetupVerification`), `src/client/keyBackupCheck.ts`                                                                                                                           | fixed (sixth review, 2026-11-08)                                                              |
| S13-2 | The chip's not-verified text (fourth review) said "If the sender's device sends the key later, the message becomes readable here", which a message sent before this device signed in, the usual case for that row, can never meet                                                                                                                                                                                                     | `src/app/components/message/content/FallbackContent.tsx` (`CHIP_NOT_VERIFIED`)                                                                                                                                                   | fixed (sixth review, 2026-11-08)                                                              |
| S13   | The nudge, the chip, TRUST.md and KNOWN_ISSUES.md said a backup does something Blackout cannot do                                                                                                                                                                                                                                                                                                                                     | the same two components, `TRUST.md`, `KNOWN_ISSUES.md`                                                                                                                                                                           | fixed                                                                                         |

## What was found

`KeyBackupNudge` is mounted in `ClientLayout` (`src/app/pages/client/ClientLayout.tsx`),
the chat surface: the den routes that render it through `CommunitiesRoute`, and `/`
only when `shellAppShell` or `discoveryHomeFeed` is off. With the shipped flag
defaults (both on, `featureFlags.ts`) `/` mounts HomeFeed, and the AppShell chrome
imports the nudge but never renders it, so Explore, the invite landing, onboarding
and the canopy server page do not show it. It decided what to show from two
answers of the crypto layer: `crypto.isCrossSigningReady()` and
`crypto.getActiveSessionBackupVersion()`. Both describe **this device**, and on a
device that has just signed in both are false whatever the **account** has on its
homeserver. For cross-signing (matrix-js-sdk 40.2.0,
`lib/rust-crypto/rust-crypto.js:653-666`) the answer is "ready" only when this
device trusts the account's identity (`identity.isVerified()`) and the private
keys are cached or stored in secret storage. A new device does not trust the
identity until it is verified or holds the private keys, so the answer is false
even for an account whose secret storage holds the keys
(`secretStorageContainsCrossSigningKeys`, `lib/rust-crypto/secret-storage.js:40-61`,
only checks that the three secrets are stored under the default key, with no
unlock, and is true on a new device of such an account; the term that is false is
`isVerified()`).

So the nudge showed "Turn on encrypted message backup" and a "Set up backup"
button on every new device, including a device of an account that already had
cross-signing and a backup. Its button opened `DeviceVerificationSetup`, whose
setup (`DeviceVerificationSetup.tsx`, `SetupVerification`) runs, in order:

1. `crypto.bootstrapSecretStorage({ setupNewSecretStorage: true })`, which
   writes a new default secret-storage key and replaces the account's secret
   storage;
2. `crypto.bootstrapCrossSigning({ setupNewCrossSigning: true })`, which
   generates a new master, self-signing and user-signing key and uploads them
   (`POST /keys/device_signing/upload`), so every other device of the account
   and every contact who verified it sees a new identity;
3. `crypto.resetKeyBackup()` (`rust-crypto.js:1232-1245`), which calls
   `backupManager.setupKeyBackup`, and that begins with
   `deleteAllKeyBackupVersions()` (`lib/rust-crypto/backup.js:497-509`): it
   requests the current version and `DELETE`s it in a loop until none is left
   (`backup.js:537-551`), then creates a new backup under a new random key.

The component's own comment called this path "non-destructive — nothing exists
yet". Nothing in the flow checked what existed, and no screen warned.

The undecryptable-message chip (`MessageBadEncryptedContent`) reached the same
flow a different way: it chose between `DeviceVerificationReset` (warned) and
`DeviceVerificationSetup` (unwarned) from `useCrossSigningActive()`, which reads
account data (`m.cross_signing.master`). Account data says whether cross-signing
exists but never whether a backup exists, so an account with a backup and no
cross-signing was offered the unwarned setup, which deleted the backup. The chip
also read "it was sent before this device had your encrypted-message backup",
naming one cause as if it were the only one and implying a backup would have
avoided it.

A third entry, the legacy Devices page's "Enable" button (`EnableVerification`
in `Verification.tsx`), opens the same setup from the same account-data test. The
page is imported only by `features/settings/Settings.tsx`, which nothing renders,
so it is not reachable in the shipped app today; it is guarded anyway (below).

Why the SDK's own backup answer was not enough for a guard: `getKeyBackupInfo()`
resolves `null` both when the server answered "no backup" and when the request
failed (`backup.js:254-266`: `doCheckKeyBackup` catches the error and leaves
`serverBackupInfo` undefined; `rust-crypto.js:1188-1193` turns that into
`null`). Once a check has succeeded it keeps that answer until the SDK's next
forced check (at start-up, `rust-crypto.js:124`; on the user's own identity
update, `:1872`; after `resetKeyBackup`, `:1244`; after an upload failure of an
active backup, `backup.js:439`; or when the app calls
`checkKeyBackupAndEnable`, `:1215`), so the answer can be hours old. After a
failed request the next call asks again: `getServerBackupInfo` runs the
unforced check (`backup.js:88-95`), which returns early only once
`checkedForBackup` is set (`:122-125`), and that is set only when a check
succeeds (`:259-266`). (Rounds 1 and 2 said "for the life of the client",
citing `backup.js:122-125`; that is the unforced path, and every call above
forces the check. Rounds 3 and 4 said here and in `keyBackupCheck.ts` that it
kept its last answer, failed or not, until the next forced check; the fifth
review corrected that.) Either way "no backup" and "couldn't check" both read
`null`, so a guard built on it fails open when the homeserver is unreachable. The second design review caught this in
revision 2.

### S9-2: the verdict was stale at the click (second review)

The first fix asked the homeserver in `refresh`, at mount and on
`CryptoEvent.KeyBackupStatus`, stored the verdict, and the "Set up backup" and
"Enable" buttons opened `DeviceVerificationSetup` from that stored value. Nothing
refreshed it when another device of the account set things up. The SDK emits
`KeyBackupStatus` only when THIS device enables or disables backup
(`backup.js:322,345`). Its own re-checks of the backup are forced at start-up
(`rust-crypto.js:124`), on the user's own identity update (`:1872`), after an
upload failure of an active backup (`backup.js:439`), after this device's own
`resetKeyBackup` (`rust-crypto.js:1244`) and when the app calls
`checkKeyBackupAndEnable` (`:1215`, which Blackout never does); until a check
first succeeds, an unforced call re-checks too (`getServerBackupInfo`,
`backup.js:88-95`, which the SDK's `PerSessionKeyBackupDownloader` calls when an
event can't be decrypted; `checkedForBackup` is set only on success,
`backup.js:123,266`). On a new device, which trusts neither the account's
identity nor a backup signed by it, a re-check that finds another device's new
backup enables nothing (`backup.js:282-292`), so it emits nothing either. A
verdict could therefore be hours old. (Rounds 2 and 3 said here, and in
`KeyBackupSetupGuard.tsx`'s header, that the SDK re-checks "only" at the first
three of these; the fourth review found the list incomplete. Both now list them
all; the conclusion does not change.)
Sequence: a new Blackout device of an account with nothing shows the nudge on a den
screen; the person sets up cross-signing and a backup in another Matrix app while
the tab stays open; back in Blackout, "Set up backup" → "Setup Device
Verification" → Continue runs the three calls above and the fresh backup is deleted
and the identity replaced, with no warning. The verifier's probe showed it: with
the fake homeserver switched to backup `3` and a master key after the nudge had
rendered, the click sent no `GET /room_keys/version` and the submit reached all
three setup calls; `EnableVerification` had the same shape. The chip did not: its
click already re-asked.

Two smaller findings of the same review: `refresh` was fired with `void` and had
no catch, so a rejecting `isCrossSigningReady()` or
`getActiveSessionBackupVersion()` (the Rust machine closed during sign-out, say)
left the nudge hidden but escaped as an unhandled rejection; and the nudge's
overlay was rendered after the banner's `return null`, so when this device's
backup became active at the end of a setup, the banner's refresh unmounted the
overlay with the recovery key on it (develop had the same shape; the account
check's round trip was what made the key visible at all).

### Effects

For a person who had set up cross-signing and a backup in another Matrix app
and then signed in to Blackout on a new browser: one click on the banner on the
chat surface, then "Continue" (and their password, which Synapse asks for before
a master key is replaced), and their backup was gone, their cross-signing
identity was replaced, and every device and contact that had verified them saw a
security warning. The new backup held only that device's keys, and Blackout has
no screen to restore from it (BO-1); on that device the SDK would fetch a
missing key from it by itself only once another session had uploaded that key.
So the person gained almost nothing and lost the only server-side copy of their
older message keys. After the first fix, the same loss
remained reachable for anyone who set things up elsewhere after the banner had
rendered.

## Reproduced how

Two ways, both in `apps/blackout-client` with Vitest (jsdom), both through a
real `MatrixClient` whose `fetchFn` is a fake homeserver
(`tests/unit/helpers/fakeKeyHomeserver.ts`), so the SDK's own HTTP layer, error
classes and timeouts are what the code under test sees. The fake answers
`GET /room_keys/version` (the current version, or 404 `M_NOT_FOUND`),
`POST /keys/query` (`master_keys` with or without the account), the backup
`DELETE`/`POST`, `POST /keys/device_signing/upload` (401 with a password flow when
a master key already exists: that is the fork's Synapse under MSC3967,
`synapse/rest/client/keys.py` `SigningKeyUploadServlet.on_POST`, which is off by
default (`synapse/config/experimental.py`); with the default config Synapse asks
every time, first-time setup included, unless `ui_auth.session_timeout` is set,
`synapse/handlers/auth.py` `validate_user_via_ui_auth`), and account data
(stored, and echoed back after the answer, because secret storage waits for the
echo). It records every call and lists the destructive ones. The guard reaches
the upload from two rows: the verdict `'none'` (the from-scratch setup) and the
trusted `'cross_signing'` row (the warned reset, whose
`bootstrapCrossSigning({ setupNewCrossSigning: true })` sends it too). In the
second a master key exists, so Synapse asks for the password under either
configuration; the difference touches only a first-time setup, and the fake
takes the MSC3967 shape so its writes can be shown in one submit. (Rounds 1 and
2 said the guard reaches the upload only from `'none'`; the third review
corrected it.) Third review: `GET /room_keys/version` now answers with the
`algorithm` and `auth_data` a version was created with, so real crypto trusts
and enables a backup it created through the fake, as against Synapse (before,
every version carried a fixed unsigned key, so such a backup was never enabled
and the nudge never hid after a real-crypto setup), and
`delayNextBackupAnswer()` holds one answer back, for the ordering tests.

1. **Develop's code, real Rust crypto in memory**
   (`initRustCrypto({ useIndexedDB: false })`), not committed because it asserts
   the defect: `scratchpad/v60/s9.repro.test.tsx`, run with develop's versions of
   the five changed source files in place. The account has backup version `3`
   and master key `nqOvzeuGWT/…`; the device is new.

    - Nudge: `isCrossSigningReady()` false, `getActiveSessionBackupVersion()`
      null; the nudge rendered "Turn on encrypted message backup … Set up
      backup". Click → "Setup Device Verification" → Continue → "Account
      Password" (the fake's UIA; Synapse asks here under either configuration,
      because a master key exists) → password → the fake saw, in order: six
      account-data `PUT`s, five before the uploads (new secret-storage key,
      default key, three cross-signing secrets), then
      `POST /keys/device_signing/upload` twice (401, then with auth),
      `DELETE /room_keys/version/3`, `POST /room_keys/version`, and the sixth,
      `PUT …/account_data/m.megolm_backup.v1` (the new backup's key, stored in
      secret storage under the new default key, `rust-crypto.js:1239-1241`).
      After: backup version `4` and a new master key; the overlay showed the
      recovery-key screen. No warning anywhere. 4.2 s. (Rounds 1 to 4 listed
      five account-data `PUT`s ending at the backup's `POST` and said the
      recovery-key screen followed: their wait matched "Recovery Key" in the
      setup form's own text, so the list was taken before the setup finished
      and the screen was never shown to be there. The fifth review found it;
      the round-5 run below waits for the screen's own sentence and lists
      every write.)
    - Chip (account with a backup, no cross-signing): the chip read "Can't
      decrypt this message — it was sent before this device had your
      encrypted-message backup. Set up backup"; click → setup → Continue → the
      same writes; the fake asked for no password because the account had no
      master key (the MSC3967 shape; default Synapse would have asked here too);
      backup `3` deleted, `4` created. Round 5 found one more defect on this
      path (S9-4): develop's chip chose its flow from account data at every
      render, so once the setup wrote `m.cross_signing.master` the overlay
      switched to "Reset Device Verification" and the new recovery key, the
      only key to the new secret storage, was never shown.
    - One test-side shim: `PasswordStage` reads `form.passwordInput`, the form's
      named-property getter, which browsers provide and jsdom does not; the
      repro defines that property on the form before submitting. Nothing else is
      mocked besides `focus-trap-react`, which every overlay test in this
      repository renders as a pass-through because jsdom has no layout.
    - Re-run on 2026-11-08 (second review), the five files swapped for
      develop's and restored byte-for-byte afterwards (they are the same blobs at
      `0367abdd69`, at round 2's merge base `7bda9eb72a` and at develop's
      `27d8c17051`, which `b917bc89ba` merged, so the merge base is now
      `27d8c17051`): both cases passed, with the same write sequences
      (`scratchpad/v60/r3/fail-repro-develop.txt`). The same file against the
      fixed tree fails both cases: the nudge never renders "Set up backup"
      (timed out after 8 s) and the chip has no "Set up backup" button
      (`scratchpad/v60/r3/repro-on-head.txt`).
    - Re-run again on 2026-11-08 (third review), develop's five files at
      `27d8c17051` swapped in and restored from `HEAD`, with the fake as
      changed in round 3: both cases passed (the defect); against the fixed tree
      both failed (`scratchpad/v60/r4/repro-develop.txt`,
      `scratchpad/v60/r4/repro-head.txt`).
    - Re-run on 2026-11-08 (fourth review), on `000667426d`'s tree, develop's
      five files taken from `origin/develop` (`0f9df74349`, which changes none
      of them) and restored with `git checkout HEAD --`: both cases passed, 4.2 s
      for the nudge, with the writes round 1 listed (five account-data `PUT`s,
      two `POST /keys/device_signing/upload` for the nudge and one for the chip,
      `DELETE /room_keys/version/3`, `POST /room_keys/version`; backup `3` → `4`,
      master key `nqOvzeuGWT/…` → a new one), a list that stops at the backup's
      `POST` (above). Against the fixed tree both
      failed: the nudge never rendered "Set up backup" (4 s wait) and the chip
      had no "Set up backup" button (`scratchpad/v60/r5/repro-develop.txt`,
      `scratchpad/v60/r5/repro-head.txt`). The file was copied into
      `tests/unit/components/` for the runs and removed afterwards.
    - Re-run on 2026-11-08 (fifth review), on `d870440af4`'s tree, develop's
      five files from `origin/develop` (`97756ff4ec`) and restored with
      `git checkout HEAD --`, the repro changed to wait for "Store the Recovery
      Key in a safe place" in the nudge case and for the stored
      `m.megolm_backup.v1` in the chip case, and to say what the overlay shows
      then (`scratchpad/v60/r6/s9.repro.round5.test.tsx`): both cases passed.
      Nudge: the six account-data `PUT`s listed above, the last,
      `m.megolm_backup.v1`, encrypted under the new default key; the overlay on
      the recovery-key screen; backup `3` → `4`; master key `nqOvzeuGWT/…` → a
      new one. Chip: the same six account-data `PUT`s, one signing upload,
      `DELETE /room_keys/version/3`, `POST /room_keys/version`; the overlay on
      "Reset Device Verification", no recovery key. Against the fixed tree both
      failed as before (`scratchpad/v60/r6/repro-develop.txt`,
      `scratchpad/v60/r6/repro-head.txt`). A real-crypto chip case now pins that
      the guarded chip keeps the recovery key on screen (Tests).

2. **Committed, on the fixed tree, still real crypto**:
   `tests/unit/components/DeviceVerificationSetup.deletesBackup.test.tsx` makes
   the three SDK calls `SetupVerification` makes, in its order, against an
   account with backup `3` and no master key, and asserts
   `DELETE /room_keys/version/3`, `POST /room_keys/version`,
   `POST /keys/device_signing/upload`, backup version `4`, a new master key and
   new secret storage. It is the fact that makes the guard necessary. Its second
   case renders the real `DeviceVerificationSetup` against the same account and
   asserts that the form now refuses before its first write (second review): no
   destructive call, backup `3` still there, no master key, no recovery key
   shown. In round 1 the first case went through the component, which was then
   unguarded itself.
3. **The stale verdict** (second review): the verifier's probe, described under
   S9-2, is now the first case of `KeyBackupNudge.test.tsx`'s "the click re-asks"
   block and of `EnableVerification.test.tsx`'s, asserted the other way round
   (one more `GET /room_keys/version` at the click, the backup text, no setup, no
   destructive call). Under the round-1 source both fail (below).

The round-1 probe of 2026-11-02 (`scratchpad/v60/probe-calls.txt`) had already
shown the three SDK calls producing `DELETE /_matrix/client/v3/room_keys/version/3`
against the same fake; it ran in 2.4 s, which is what made real crypto in the
suite affordable.

## Fixed how

The reviewed plan is design revision 3, §4.10 ("The key-backup guard") and §6.9
(the wording table), with §0.3 point 1 (only a 404 `M_NOT_FOUND` means "no
backup"). Built as designed; one addition (the `EnableVerification` entry). The
second review added the click-time re-check the design's "fetched each time"
called for in both places, and the form's own check.

### `src/client/keyBackupCheck.ts` (new)

`checkAccountKeyState(mx)` asks the homeserver, every time, no cache:

-   `GET /_matrix/client/v3/room_keys/version` through `mx.http.authedRequest`
    with a 10 s `localTimeoutMs`. A 200 whose `version` is a non-empty string →
    `'backup'`. A rejection that is a `MatrixError` with `httpStatus === 404` and
    `errcode === 'M_NOT_FOUND'` → `'none'`. Anything else (another status or
    errcode, a non-JSON error, a network failure, the timeout's abort, a 200
    without a `version`) → `'unknown'`, with a `detail` such as `it answered 500
M_UNKNOWN` or `no answer` for diagnostics. Synapse answers 404 `M_NOT_FOUND`
    exactly when the account has no current backup version
    (`synapse/handlers/e2e_room_keys.py`).
-   `POST /_matrix/client/v3/keys/query` with `{ device_keys: { [userId]: [] } }`:
    a 200 with `master_keys[userId]` → `'yes'`; a 200 without → `'no'`; anything
    else → `'unknown'`.

`accountKeyVerdict(state, crossSigningReady)`, in this order: backup `'backup'`
→ `'backup'`; backup `'unknown'` → `'unknown'`; cross-signing `'yes'` or
`crossSigningReady` → `'cross_signing'`; cross-signing `'no'` → `'none'`; else
`'unknown'`. A failed backup check beats everything but a found backup, because
"couldn't check" must never be read as "nothing to lose". Only `'none'` lets any
screen open the from-scratch setup. `'unknown'` also covers a backup check that
answered "none" while the cross-signing check failed, so the texts for it name
both checks.

`setupRefusal(state, mode)` (second review): the check the setup form runs before
its first write. A backup, or a failed backup check, refuses both flows; for the
from-scratch `'setup'`, cross-signing on the server, or a failed cross-signing
check, refuses too; the warned `'reset'` exists to replace cross-signing and goes
on whatever that check says. Returns the message to show (`SETUP_REFUSED_TEXT`:
each says what the check found and that Blackout stopped before changing
anything) or null.

### What each verdict offers (the same in every entry)

| verdict           | this device trusts the account's cross-signing | offered       | flow                      | why it is safe                                                                                                                                                                                     |
| ----------------- | ---------------------------------------------- | ------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'none'`          | —                                              | Set up backup | `DeviceVerificationSetup` | The homeserver answered 404 `M_NOT_FOUND` for the backup and has no master key for the account: no backup and no cross-signing to replace (the check does not read secret storage; "What remains") |
| `'cross_signing'` | yes                                            | Set up backup | `DeviceVerificationReset` | No backup exists (the check answered), so none is deleted; the reset's own warning and confirm step stay                                                                                           |
| `'cross_signing'` | no                                             | nothing       | —                         | A reset would replace the account's cross-signing, and every device and contact that verified the account would see a new identity                                                                 |
| `'backup'`        | —                                              | nothing       | —                         | Any setup or reset deletes the existing backup                                                                                                                                                     |
| `'unknown'`       | —                                              | nothing       | —                         | The check failed                                                                                                                                                                                   |

-   `encryptionPosture.ts`: `selectKeyBackupNudge` now requires `accountState`
    and returns the row above; `actions` is empty except in the two rows that
    offer one. The text of every verdict is in `KEY_BACKUP_NUDGE_TEXT`.
-   `KeyBackupNudge.tsx`: `refresh` runs the account check alongside the two
    device checks and renders nothing until all three have answered, so no action
    flashes that the answer would remove. The primary button and the overlay
    render only when the verdict has an action; "Not now" and ✕ always render.
-   `FallbackContent.tsx`: the chip reads `CHIP_TEXT` with a `Why?` chip. A click
    opens the overlay with `CHIP_CHECKING`, runs the same inputs, then shows, for
    row 1 or row 2, an explanation with a "Set up backup" button that checks
    again and opens the setup or the reset (third review; rounds 1 and 2 opened
    the flow at once, as design §6.9 said), or a short explanation
    (`CHIP_BACKUP_EXISTS`, `CHIP_NOT_VERIFIED`, `CHIP_CHECK_FAILED`) with Close.
    `useCrossSigningActive` is no longer used to choose.
-   `Verification.tsx` `EnableVerification` (the unmounted third entry): the
    Enable button renders only once the account check answered `'none'`.
-   Behaviour change, deliberate: an unverified device of an account that has
    cross-signing is no longer offered the warned reset from the chip (develop
    offered it from account data alone). The person can still reset from another
    Matrix app, where the reset's consequences are visible.
-   Behaviour change, deliberate (second review): the warned reset
    (`DeviceVerificationReset`) now refuses, before its first write, while the
    account has a backup or the backup check fails (`setupRefusal`, below). In
    the shipped app the reset opens only from row 2, where the check answered
    that there is no backup, so this matters only for a backup created between
    that check and the submit. On the unmounted Devices page the same form is
    behind the "Reset" menu item, whose screen warned "your encryption backup
    will be lost" (the third review replaced that sentence: it now says a backup
    stops the reset); there it now stops a reset the person chose. The person
    can reset from another Matrix app; whether Blackout's
    own Reset should be allowed to delete a backup is left for when that page is
    mounted (below).

### The click re-asks, and the form checks once more (second review)

-   New `src/app/components/KeyBackupSetupGuard.tsx`, shared by the three entries.
    `useKeyBackupSetupGuard(mx).open()` sets the overlay to a checking state, runs
    `checkForSetup(mx)` (`checkAccountKeyState` plus this device's
    `isCrossSigningReady`, fetched now) and then shows: a fresh `'none'` →
    `DeviceVerificationSetup`; a fresh `'cross_signing'` this device trusts →
    `DeviceVerificationReset`; any other answer → the caller's text for that row
    with Close. It resolves with the fresh answer so the caller updates what it
    shows: the nudge's banner moves to the fresh row (the button goes), and the
    Enable button hides. `checkForSetup` never throws: a device check that
    rejects reads as `'unknown'`, which offers nothing. The chip uses the same
    hook (its own `explain()` did the same checks; it had no catch). Round 2's
    hook set the overlay from every answer that arrived while mounted, so a
    late answer could replace a later one; the third review fixed that (S9-3,
    "A late answer never replaces a later one"): only the answer to the latest
    click sets the overlay, and in the chip rows 1 and 2 explain first.
-   `KeyBackupNudge.tsx`: the button calls `open()` instead of opening the setup
    from the stored verdict; `refresh` is wrapped in try/catch, and on a rejecting
    device check leaves the nudge hidden (this device's state is unknown, so
    nothing is offered and nothing is claimed) and warns once; the overlay is
    rendered apart from the banner, so a setup under way stays on screen when the
    banner hides.
-   `Verification.tsx` `EnableVerification`: the mount-time check uses
    `checkForSetup` (fail closed); the click calls `open()` and shows the nudge's
    row texts in the overlay, which the page never had.
-   `DeviceVerificationSetup.tsx` `SetupVerification`: before anything is written
    (`clearSecretStorageKeys`, the three calls), `setupRefusal(await
checkAccountKeyState(mx), mode)` runs and a refusal is thrown into the
    form's existing error slot. `DeviceVerificationReset` renders the form with
    `mode="reset"`. `handleSubmit` catches the error that `useAsyncCallback`
    rethrows after recording it (`useAsyncCallback.ts:90`), so a refusal, an
    expected outcome, no longer escapes as an unhandled rejection; before this,
    every setup error did.

### A late answer never replaces a later one, and the chip explains first (third review)

-   `KeyBackupSetupGuard.tsx`: `useAnswerTurns()` hands out a turn when a check
    starts; an answer whose turn is no longer the latest is dropped. The guard
    takes one in every `open()` and every `close()`, so the answer to a click
    that a later click or a close superseded sets nothing and `open()` resolves
    null. Only the answer to the latest click opens a flow.
-   `KeyBackupNudge.tsx`: refreshes and clicks take account turns, and the
    banner shows only the newest answer, so a refresh that started before a
    click and answers after it is dropped. A refresh asked for while a click's
    check is in flight (`KeyBackupStatus`) waits for that answer and then runs,
    so the overlay never shows an answer older than the banner's. This device's
    backup state comes only from refreshes and keeps its own turns.
-   `Verification.tsx` `EnableVerification`: its mount-time check and its
    clicks take turns; the button follows the newest answer.
-   The chip passes `texts.offer`: rows 1 and 2 show `CHIP_OFFER_SETUP` or
    `CHIP_OFFER_RESET` (`CHIP_SETUP_WONT_FIX`, then the nudge's text for the
    row) with "Set up backup", which asks the homeserver again
    (`proceed()`) before it opens the flow. The nudge and `EnableVerification`
    pass no `offer`: the banner already says what the row does, and the Enable
    button is the page's own.
-   What is left in that order: either answer can go stale while it is on
    screen (another device acts after it). The setup form's own check, right
    before its first write, covers that, as before.

### The overlay traps focus, and a setup that failed partway finishes (fifth review)

-   `KeyBackupSetupGuard.tsx`: `KeyBackupExplanation` forwards its ref to its
    `Dialog`, as `DeviceVerificationSetup` does. `KeyBackupGuardOverlay` wraps
    its panel in `FocusTrap` (focus-trap-react 10.0.2), which takes its
    container from the child's ref. Without `forwardRef` React dropped the ref,
    so no trap was created in the checking, explanation and offer panels
    (`dist/focus-trap-react.js`, `setupFocusTrap` creates one only when a
    container exists) and Tab could leave the overlay for the page behind it.
    On develop every overlay the nudge and the chip opened was
    `DeviceVerificationSetup` or `DeviceVerificationReset`, both trapped. The
    trap also keeps the container it was created with, and a panel change from
    an explanation to a flow mounts a new DOM node, so the `FocusTrap` is keyed
    by the child's component type (explanation, setup, reset); with
    `forwardRef` alone the setup's trap held the detached explanation node and
    focus-trap threw on the next Tab.
-   `keyBackupCheck.ts`: `checkCrossSigningState` also returns the master key's
    public key (`masterKey`, from `master_keys[userId].keys`) and
    `checkAccountKeyState` passes it on. `setupRefusal(state, mode, ownMasterKey)`
    lets the from-scratch setup go on past cross-signing only when the
    homeserver's master key is `ownMasterKey`, and as before only when the
    backup check answered "none".
-   `DeviceVerificationSetup.tsx` `SetupVerification`: after its cross-signing
    step, finished or not, the form keeps in its state the master key that step
    made (`getCrossSigningKeyId()`) and whether the step finished. The next
    Continue passes that key to `setupRefusal`. When the homeserver holds it,
    there is no backup and the earlier step finished, the form keeps that
    identity: new secret storage (which also stores the kept cross-signing keys
    under the new recovery key), no second upload and so no password prompt,
    then the backup, signed by the kept master key. When the earlier step did
    not finish, the form makes the identity again, with the password, since a
    master key now exists. A step that fails after the form's cross-signing is
    on the homeserver shows `SETUP_STOPPED_PARTWAY_TEXT` under the error:
    "Cross-signing is now on for your account, but the rest of the setup didn't
    finish. Press Continue to try the rest again: this window keeps that
    cross-signing rather than replacing it." (Sixth review: that text was shown
    after a backup the attempt may have created too, where Continue could only
    be refused, and the attempt's recovery key was never shown; it is replaced
    by `SETUP_PARTWAY_TEXT`, below.) Before this, a brand-new account
    whose backup creation failed once could not finish from the same form: the
    second Continue was refused with the cross-signing text, and the banner's
    next click found cross-signing this device trusts and opened the warned
    reset. A backup or another master key that appears in between is still
    refused. Closing the window in between, and a backup that this attempt
    created before a later step failed, are under "What remains" (sixth
    review: the second is now handled, below).

### A setup that stops partway shows its recovery key (sixth review, S9-5)

What an attempt has written when it stops, read from the SDK (matrix-js-sdk
40.2.0):

-   `bootstrapSecretStorage({ setupNewSecretStorage: true })` writes the new
    key's description, then `m.secret_storage.default_key` (and waits for its
    echo), then the cross-signing private keys this device holds, each
    re-encrypted under the new key only (`rust-crypto.js:776-821`,
    `secret-storage.js` `setDefaultKeyId`, `store`). From the default key on,
    the account's secret storage opens only with this attempt's recovery key.
-   `bootstrapCrossSigning({ setupNewCrossSigning: true })` →
    `resetCrossSigning` makes new cross-signing keys on this device, stores
    them in the (new) secret storage, and only then uploads them, which is
    where the account confirmation (the password) is asked
    (`CrossSigningIdentity.js` `resetCrossSigning`: "Update 4S before uploading
    cross-signing keys"). So after a cancel there the account's secret storage
    holds keys the homeserver never received, and the account's own
    cross-signing keys are no longer in it under any key. The verifier's probe
    showed the rest on round 5's head: the default key new, the
    `m.cross_signing.master` secret under the new key id, the homeserver's
    master key unchanged, and the recovery key never shown. The code shows why
    the error line was empty: the password stage's ✕ called the cancel with its
    click event, which has no `message`, and the form rendered `error.message`.
-   `resetKeyBackup()` creates the backup (`POST /room_keys/version`), saves
    its key on this device, and only then stores it in secret storage
    (`rust-crypto.js:1232-1246`, `backup.js:505-529`). A failure after the
    `POST` leaves a backup whose key is on this device alone, or nowhere if the
    `POST`'s answer was lost. Round 5's form told the person to press Continue,
    and that Continue found the backup and was refused with
    `SETUP_REFUSED_TEXT.backup` ("…Another Matrix app that you sign in to with
    your recovery key or passphrase may be able to restore from it"), not true
    of a backup whose key never reached secret storage, while the recovery key
    that opened the new secret storage was never shown.

`SetupVerification` now notes which step it is in. When an attempt stops after
it began writing secret storage, it keeps this attempt's recovery key in its
state and shows it (`RecoveryKeyDisplay`, with Show, Copy and Download, outside
the form so its buttons do not submit it) under a sentence that says how far the
attempt got (`SETUP_PARTWAY_TEXT[stage].what`), and the next Continue uses the
same key rather than make another, so the key on screen stays the one that
opens the secret storage; the passphrase field goes, since no new key is made.
The stages (`SetupPartwayStage` in `keyBackupCheck.ts`):

| Stage            | When                                                                                                          | What the form says                                                                                                                                                                                                                                                                                                                                                                                                                 | Continue                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `secret_storage` | `bootstrapSecretStorage` itself failed; its error doesn't say how far it got                                  | "The setup stopped while Blackout was setting up new secret storage for your account, and it may already have done so. If it did, your secret storage now opens only with the recovery key below, so save it. Cross-signing wasn't changed, and no key backup was created."                                                                                                                                                        | "Press Continue to try again with this same recovery key."                                                                        |
| `cross_signing`  | secret storage replaced; the cross-signing step failed, or its account confirmation was cancelled             | "The setup stopped before it finished, but Blackout had already set up new secret storage for your account, which now opens only with the recovery key below, so save it. Cross-signing wasn't finished, and no key backup was created."                                                                                                                                                                                           | "Press Continue to try the rest again with this same recovery key."                                                               |
| `backup_none`    | cross-signing on; the backup step failed; the homeserver then answered 404 `M_NOT_FOUND`                      | "Your account's new cross-signing is on, and its new secret storage opens only with the recovery key below, so save it. Creating the key backup didn't finish, and your homeserver answered that it has no key backup."                                                                                                                                                                                                            | "Press Continue to create the backup with this same recovery key: this window keeps that cross-signing rather than replacing it." |
| `backup_unclear` | cross-signing on; the backup step failed; the homeserver then answered that a backup exists, or didn't answer | "Your account's new cross-signing is on, and its new secret storage opens only with the recovery key below, so save it. The key backup step didn't finish, and your homeserver may now have a key backup that this attempt created before it stopped. That backup's key may not be in your secret storage, so this recovery key may not restore from it. Blackout won't set up another backup here, because that would delete it." | none: no Continue button, and a submit by other means starts nothing                                                              |

The `backup_*` stages ask the homeserver again (`checkBackupState`, the same
read as the guard: only a 404 `M_NOT_FOUND` means none) once the backup step has
failed, rather than guess from which request failed inside `resetKeyBackup`.
The `next` line shows only while that attempt's failure is the latest; if the
next Continue is refused (another device's backup or master key, a failed
check), the refusal shows and the key stays, since the refusal wrote nothing.
A cancel at the account confirmation now rejects with an error that says so
(`SETUP_CONFIRM_CANCELLED_TEXT`: "The account confirmation step was cancelled,
so the setup stopped there."), and the error line falls back to "Unexpected
Error!" for any failure without a message, so it is never empty. The warned
reset's screen (`DeviceVerificationReset`) adds one sentence: "Blackout changes
your secret storage before it asks you to confirm your account, so if you stop
at that step, save the recovery key it then shows."

The first verifier's suggestion to move the password step before the
secret-storage write does not work for the reset: `resetCrossSigning` stores
the new keys in whatever secret storage exists, so run first it would need the
old secret-storage key, which a person resetting has usually lost.

### Wording (S13)

Every backup line now says what a backup does today: it keeps copies of message
keys on the homeserver, locked with a recovery key; another Matrix app signed in
with that key can restore older messages from it; Blackout has no screen that
restores from a backup, so here a backup does not bring older messages back after
a new sign-in. The two verdicts that promised recovery "when you sign in on a new
device" and said "so you don't lose access" are gone, and a test pins that no
verdict matches those phrases. The comments in both components, which called the
nudge "the forward fix" and the setup "non-destructive", are rewritten.

Second review: the `'unknown'` row and `CHIP_CHECK_FAILED` read "Blackout
couldn't finish checking whether your account already has a key backup or
cross-signing, so it doesn't offer to set one up right now", because the verdict
is `'unknown'` also when the backup check answered 404 `M_NOT_FOUND` and only the
cross-signing check failed, and (for the click-time check) when this device's own
check rejected; the earlier text named the backup check alone. `CHIP_TEXT` reads
"Can't decrypt this message on this device.", true of every event the SDK marks
`m.bad.encrypted`: usually the key is missing, but `rust-crypto.js`
`onMegolmDecryptionError` (`:2111-2177`) also marks events so for
`DecryptionFailureCode.UNKNOWN_ERROR` (a replayed message index, mismatched
identity keys) and the sender-identity refusals, where the device has the key;
the earlier "this device doesn't have its key" was not true of those. Row 2's
detail no longer says "the next screen explains what that changes": that screen
(`DeviceVerificationReset`) says "your encryption backup will be lost", and row 2
is reached only when the check answered that no backup exists. `SETUP_REFUSED_TEXT`
(three sentences) is new.

Third review: `DeviceVerificationReset`'s "Anyone you have verified with will see
security alerts and your encryption backup will be lost" was false in every run
the guarded form lets through (`setupRefusal(state, 'reset')` refuses while a
backup exists or the check fails, and the reset creates a new backup); it now
reads "Anyone you have verified with will see security alerts, and you will get
a new recovery key and a new key backup. If your account already has a key
backup, or Blackout can't check, Blackout stops before changing anything." Rows 1
and 2 said another app "can then restore your older encrypted messages" and
"older messages from the backup"; a backup holds the keys of the device that set
it up (every key it has when the backup is turned on, and those it gets later)
and of other sessions that trust it, and a Blackout session signed in later
never adds to it. They now say "this device's message keys, and those it gets
later", row 1 adds "a Blackout session you sign in to later doesn't add to it",
and row 2's "Blackout can't restore from a backup yet" is qualified as row 1's
is ("so here it won't bring older messages back after you sign in on a new
device"): on the device that set the backup up, the SDK fetches a missing key
from it by itself at each failed decryption (`rust-crypto.js:2118-2121` →
`PerSessionKeyBackupDownloader`), so the unqualified sentence understated what
Blackout does. `CHIP_SETUP_WONT_FIX` reads "Setting up a backup won't, by itself,
make this message readable: a new backup starts with only the keys this device
already has" ("by itself" for the same download). `EnableVerification` has its
own texts (`ENABLE_VERIFICATION_GUARD_TEXTS`): the nudge's "Blackout has no screen
that verifies this device" and "… restores keys from it" would be false on the
Devices page, which renders "Verify Manually" and the backup restore tile; its
texts say only what the check found.

Fourth review: `CHIP_NOT_VERIFIED` (the account has cross-signing and no
backup, and this device doesn't trust the account's cross-signing) said "…so it
can't get this message's key", which is absolute: a key the sender's device
sends later is tried at once (`rust-crypto.js:1790-1822`, `onRoomKeysUpdated` →
`onRoomKeyUpdated` retries every event waiting for that session; this paragraph
said "used at once", which a retry is not). It then read "…so it can't get this
message's key from a backup or from your other sessions. If the sender's device
sends the key later, the message becomes readable here. Another of your
sessions that has the key can still read it." What it names as closed is
closed: the account has no backup in this row, Blackout has no screen that
restores from one, and the SDK's room-key requests are off
(`lib/rust-crypto/index.js:87`). A test pins it. The middle sentence promised
too much and was narrowed by the sixth review (below). `DeviceVerificationReset`'s
JSX comment said the guarded reset loses no backup; it now says a backup that
exists when the form is submitted is not deleted, and names the
password-prompt window ("What remains"). The screen's own sentence ("If your
account already has a key backup, or Blackout can't check, Blackout stops
before changing anything") describes that check and is unchanged.

Sixth review (S13-2): that middle sentence promised a recovery the usual case
for this row rules out. The row is a new, unverified device looking at a
message sent before it signed in. A Megolm session the sender's device shares
with this device later (with its next message) starts at the session's current
index, so it cannot open an earlier message: the SDK reports
`UnknownMessageIndex`, "The sender's device has not sent us the keys for this
message at this index" (`rust-crypto.js:2151-2152`). Room-key requests are off,
so nothing asks for an earlier index; a sender that withholds keys from
unverified devices never sends one (`:2145`); and when the retry fails the SDK
logs "Still unable to decrypt event … after receiving key" (`:1813-1818`). The
sentence was true only when the first key delivery was merely delayed. It now
reads "If this message's key was only delayed, it becomes readable here when
the key arrives; a message sent before this device signed in stays unreadable
here." The comment above the constant says the same, and the chip test pins the
new sentence and that "sends the key later" is gone. "Stays unreadable here"
holds while the Devices page, whose `LocalBackup` imports a key file, stays
unmounted ("What remains").

`TRUST.md` ("Open, not hidden"): the BO-1 sentence no longer says the problem
happens "without key backup set up"; it says Blackout has no restore screen, so
it happens even when a backup exists, and that a backup still lets another
Matrix app restore (third review: "restore the messages whose keys are in it; a
Blackout session that didn't set the backup up doesn't add its keys to it";
fourth review: "…; a Blackout session you sign in to later, which Blackout
can't verify, doesn't add its keys to it", the qualifier the nudge's row 1 and
KNOWN_ISSUES already used, because the third-review sentence was false of a
Blackout session that holds the account's cross-signing identity: see "What
remains"). The trust page is rebuilt from it. `KNOWN_ISSUES.md` BO-1: the
cause and workaround are corrected (the old workaround pointed to a "Settings →
Encryption" that never existed and to the "Set up backup" action above), and a
note dated 2026-11-08, naming the finding's date, points here (the first version
of the note carried the finding's date as if the guard had shipped then).
`docs/features/data-export.md` no longer sends people to "Settings → Encryption →
Export room keys"; it says Blackout has no key-export screen yet and names
another Matrix app signed in to the same account. Third review: the BO-1 item says
whose keys a backup holds, and the note says the warned reset is offered when
this device trusts the account's cross-signing and no backup exists, and that the
chip explains first; `KNOWN_LIMITATIONS.md` says older messages "are not
readable" in the panel's own session (it said "may not be": nothing in Blackout
can make them readable); `TRANSMUTATION_NOTES.md` §5 no longer calls BO-1's main
cause undiagnosed and points here. `docs/audits/2026-08-10-encryption-audit.md`
is a dated record and is not edited.

## Tests

All in `apps/blackout-client`, Vitest. `fakeKeyHomeserver.ts` is the seam for
every one of them (the design's §7: fake the endpoint through a real client,
not the SDK call). `keyBackupRender.tsx` renders a component under
`MatrixClientProvider` with that client, `stubCrypto` stands in for this
device's crypto state with spies on the three setup calls, and (second review)
`unhandledRejectionsDuring` collects Node-level unhandled rejections while a
case runs, so a test can pin that none escaped. Its `waitFor` gives up after
4 s by default, inside Vitest's 5 s test timeout (second review; it was 8 s):
with the longer default, a case that failed timed out at 5 s while its polling
loop went on calling `act()` into the next cases of the same file, and failed
some of them too (the two "goes on" cases below). Cases that wait longer pass
their own timeout and a test timeout above it.

| File                                                                                 | Tests | What it pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/client/keyBackupCheck.test.ts` (new)                                     | 32    | every answer of both endpoints, incl. 404 `M_UNRECOGNIZED`, 500 JSON, 502 HTML, a rejected fetch, no answer in 10 s (fake timers), 200 without `version`; no cache; every row of the precedence; `setupRefusal` for every state in both modes, and its texts; (fifth review) the master key's public key in the answer, a master entry without one, and `setupRefusal` with the form's own key (it goes on only with that key and no backup)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `tests/unit/features/settings/KeyBackupNudge.test.tsx` (new)                         | 28    | the setup's three calls when the one safe row is submitted; S9's exact scenario offers nothing and reaches none of them; failed check (rejected, 500, 404 other) offers nothing; each row's text; nothing renders before the answer; nothing once this device's backup is active; the negative wording pin; five stale-click cases (the click re-asks; the overlay and the banner follow the fresh answer; a fresh `'none'` opens the setup with one more `GET`); a rejecting device check at mount (hidden, one warning, nothing escapes) and at the click (the unknown text); the recovery key stays on screen when the banner hides; (third review) three ordering cases (a late click answer, a refresh that answers after a click, a refresh that waits for a click), four snooze cases ("Not now" stores a week and a remount on the same store stays hidden, the week's end shows it again, the ✕, the unknown banner, snoozing with the setup open), and a brand-new account with real crypto through the nudge (backup 1 and a master key, no `DELETE`, the banner hides)                                                              |
| `tests/unit/components/FallbackContent.chip.test.tsx` (new)                          | 18    | label and text; checking; each verdict's panel; no destructive call in the three refusing rows; Close; a rejecting device check (the check-failed text, nothing escapes); the chip text; (third review) rows 1 and 2 explain first and "Set up backup" re-checks before the flow; a backup created after the explanation; the offer texts; four ordering cases (a late answer after a re-click, after a close, after the offer's button and a close; the legitimate path still reaches the setup calls); (fourth review) the not-verified text names what is closed and what can still happen (sixth review: and promises a late key only what a delayed key can do); (fifth review) a brand-new account with real crypto: the setup goes through, nothing is deleted, and the recovery key stays on screen once account data holds `m.cross_signing.master` (S9-4)                                                                                                                                                                                                                                                                             |
| `tests/unit/features/settings/devices/EnableVerification.test.tsx` (new)             | 11    | Enable only on `'none'`; nothing on backup, failed check or a server master key; nothing asked when not visible; the stale click (the backup text, the button goes); a fresh `'none'` re-checks; a rejecting device check; (third review) a late click answer; its own texts say nothing about screens; the not-verified text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tests/unit/components/DeviceVerificationSetup.guard.test.tsx` (new)                 | 10    | the form's own check: each refusal with its text and no write (backup, master key, failed backup check, failed cross-signing check), the goes-on case, the check at the submit rather than at the open (a backup created in between is refused); the warned reset goes on past cross-signing, refuses a backup and a failed check; (third review) the reset's warning says a backup stops it and no longer that a backup will be lost (sixth review: and that secret storage changes before the account confirmation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/unit/components/DeviceVerificationSetup.partial.test.tsx` (new, fifth review) | 8     | real crypto: the backup's creation fails once, then the next Continue keeps the form's own cross-signing (one signing upload, no password, no `DELETE`, backup 1 signed by the kept master key, the three cross-signing secrets and the backup key stored under the new default key); another master key or a backup appearing in between is refused with nothing written; a cross-signing step that failed after its keys went up is made again, with the password; (sixth review) each partway stop shows this attempt's recovery key, which opens the account's default secret-storage key, and the next Continue finishes with the same key; the backup created and its key's storing failed, and the backup step failed with the re-check failing: no Continue, no restore claim, a forced submit sends nothing; `bootstrapSecretStorage` failing shows the key with "may"; the warned reset cancelled at the password: the cancel's message, the key, a new default key, the homeserver's master key unchanged and secret storage's master key no longer the account's, then Continue and the password finish the reset with the same key |
| `tests/unit/components/KeyBackupGuardOverlay.focusTrap.test.tsx` (new, fifth review) | 9     | the real `focus-trap-react` (`getClientRects` stubbed: jsdom has no layout): in each of the eight panels, Tab from the last control wraps to the first, Shift+Tab wraps back, and a focus on the page behind is pulled back in; the same across checking → setup and offer_reset → checking → reset; no ref warning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `tests/unit/components/DeviceVerificationSetup.deletesBackup.test.tsx` (new)         | 2     | the fact (above) through the three SDK calls, real crypto; the component refuses before its first write against the same account, real crypto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/app/features/settings/security/encryptionPosture.test.ts` (updated)             | 19    | the two existing cases pass `accountState` and keep every assertion; the three refusing rows; whole-text pins; the negative wording pin; the unknown text names both checks; row 2 names no next screen; the overlay text map; (third review) rows 1 and 2 say whose keys a backup holds, row 1 that a later Blackout session doesn't add to it, row 2's "can't restore" is qualified; the nudge's overlay texts have no `offer`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `tests/unit/features/settings/security/keyBackupNudge.test.ts` (updated)             | 6     | the three existing cases pass `accountState` and keep every assertion; the three refusing rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

143 tests in 10 files pass on the fixed tree, 0 unhandled errors (round 5: 139;
round 4: 119 in 8; round 3: 118; round 2: 100; round 1: 68 in 7).

### Fail without the fix

Round 1, with the `src` changes stashed (develop's code, the new tests in
place), the same 7 files: **27 failed, 19 passed**, and `keyBackupCheck.test.ts`
could not load (its module does not exist on develop). Per file: nudge 12/12
failed, chip 8/8, `EnableVerification` 4/5 (the "not visible renders nothing"
case holds on develop too), the selector's new rows 3/6; `deletesBackup` passed,
as it must; `encryptionPosture.test.ts` lives under `src` and so ran in its
develop form (14 pass) — its new assertions fail on develop by `TypeError` on the
undefined `KEY_BACKUP_NUDGE_TEXT`, as the first run before the stash showed.
Re-run on 2026-11-08 over all eight files with develop's five source files in
place (the two new modules stay, since develop's code imports neither):
**55 of 100 failed**; `keyBackupCheck.test.ts`'s 26 passed, as they must (they
test only the new module), and so did the two "goes on" cases of the guard file
and the SDK-fact case of `deletesBackup`
(`scratchpad/v60/r3/fail-all-on-develop.txt`). Many of the component failures
there are `TypeError`s on text constants develop does not have, so the per-entry
swaps and the mutations below are the behavioural evidence. Fourth review, the
same swap from `origin/develop` on `000667426d`'s tree: **74 of 119 failed**
(the nudge 28/28, the chip 17/17, `EnableVerification` 10/11, the guard file
8/10, `encryptionPosture.test.ts` 7/19, the selector file 3/6,
`deletesBackup` 1/2: its SDK-fact case passes, as it must), and
`keyBackupCheck.test.ts`'s 26 passed (`scratchpad/v60/r5/fail-all-on-develop.txt`).
The new not-verified wording case fails against round 3's text (1 failed, 16
passed in the chip file) and passes with the fix
(`scratchpad/v60/r5/fail-without-chip-text.txt`).

Round 2, each source file swapped for its round-1 version (`0dc627f87b`; for
`DeviceVerificationSetup.tsx` the style commit `e884c29a7e`, the same code
reformatted), the named tests run, the file restored and compared byte-for-byte.
Run first by the round's first builder (`scratchpad/v60/r2/fail-without/`), then
again after the `waitFor` change above (`scratchpad/v60/r3/fail-*-2.txt`); the
counts are the second run's:

| Swap                                                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `KeyBackupNudge.tsx` (no re-check, no catch, overlay inside the banner) | 8 of 20 failed: the five stale-click cases, both rejecting-device-check cases, the overlay case                                                                                                                                                                                                                                                                                                              |
| `Verification.tsx` (Enable opens from the stored verdict)               | 3 of 8 failed: the stale click, the fresh-`'none'` re-check, the rejecting device check                                                                                                                                                                                                                                                                                                                      |
| `FallbackContent.tsx` (old text, no catch)                              | 2 of 10 failed: the rejecting device check, the chip text                                                                                                                                                                                                                                                                                                                                                    |
| `DeviceVerificationSetup.tsx` (no check before the first write)         | 8 of 11 failed: the seven refusal cases of the guard file, including the submit-time case, and the component-refuses case of `deletesBackup`. The two "goes on" cases and the SDK-fact case passed, as they must. (The first run failed the two "goes on" cases as well, by the 5 s test timeout: the earlier cases' 8 s `waitFor` loops were still polling in the same worker. Hence the `waitFor` change.) |

Round 3 (third review): the six source files swapped for their round-2 versions
(`b64b03ee62`) together, the eight files run, the source restored from `HEAD`
(`git diff` empty afterwards): **18 of 118 failed**
(`scratchpad/v60/r4/swap-round2.txt`): the reset-warning pin; the chip's rows 1
and 2, the backup-after-explanation case, the offer texts and its four ordering
cases; the nudge's three ordering cases; `EnableVerification`'s stale click (it
now expects its own text), its late click answer and its two text cases; and the
two selector cases that pin rows 1 and 2. The four snooze cases and the
real-crypto case pass on the round-2 source too: they pin behaviour this round
did not change (the snooze was unpinned; the real-crypto case needed the fake to
keep a created backup's `auth_data`).

Round 6 (sixth review): `DeviceVerificationSetup.tsx` swapped for round 5's
(`376d6d0450`, which imports a text constant this round removed, so its partway
line renders nothing), the partial and guard files run, the file restored and
compared by checksum: **9 of 18 failed** on the final test files
(`scratchpad/v60/r7/fail-without-dvs-3.txt`; the two earlier runs, before the
last assertions were added, gave the same 9):
the reset-warning pin and all 8 partial cases (seven waits for a partway
screen or the cancel's message that never came, one missing partway text); the
guard file's nine refusal and goes-on cases passed, as they must.
`FallbackContent.tsx` swapped for round 5's: 1 of 18 failed in the chip file,
the not-verified wording case (`scratchpad/v60/r7/fail-without-chip-text.txt`).

### Mutation checks (one line reverted, the named tests run, the line restored)

| #   | Mutation                                                                                                                                        | Result                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `checkBackupState`: any failure of `/room_keys/version` read as `'none'` (develop's behaviour through `getKeyBackupInfo`)                       | 18 failed: keyBackupCheck 6, nudge 7, chip 4, Enable 1                                                                                                                                                                                                                                                                           |
| 2   | `accountKeyVerdict`: the `'backup'` branch dropped                                                                                              | 17 failed: nudge 9, chip 6, keyBackupCheck 1, Enable 1                                                                                                                                                                                                                                                                           |
| 3   | `KeyBackupNudge`: the primary button rendered unconditionally                                                                                   | 9 of 12 nudge tests failed                                                                                                                                                                                                                                                                                                       |
| 4   | `selectKeyBackupNudge`: the unverified `'cross_signing'` row offers the action                                                                  | 3 failed: encryptionPosture 1, selector 1, nudge 1                                                                                                                                                                                                                                                                               |
| 5   | Chip: `'backup'` opens the setup                                                                                                                | 6 of 8 chip tests failed                                                                                                                                                                                                                                                                                                         |
| 6   | `EnableVerification`: `offered = visible` (the check ignored)                                                                                   | 3 of 5 failed                                                                                                                                                                                                                                                                                                                    |
| 7   | (round 2) `setupRefusal` always returns null                                                                                                    | 13 failed: keyBackupCheck 5, guard 7, deletesBackup 1 (the component refuses); the two "goes on" cases pass (first run: 14, the two "goes on" by the timeout artefact)                                                                                                                                                           |
| 8   | (round 2) `encryptionPosture.ts`: the two round-1 texts back (unknown names one check; row 2 names the next screen)                             | 2 of 19 failed                                                                                                                                                                                                                                                                                                                   |
| 9   | (round 2) `checkForSetup` without its try/catch                                                                                                 | 3 of 38 failed: one per entry, the rejecting-device-check case at the click                                                                                                                                                                                                                                                      |
| 10  | (round 2) `handleSubmit` drops the promise again                                                                                                | 9 of 9 passed, 7 unhandled rejections, exit 1 (the suite-level error the second review reported)                                                                                                                                                                                                                                 |
| 11  | (round 2) `accountKeyVerdict` always returns `'none'` (the guard's core removed, the form's check kept)                                         | 24 of 100 failed: nudge 11, chip 5, Enable 4, keyBackupCheck 4: at least one case of every row that offers nothing (`'backup'`, `'unknown'`, unverified `'cross_signing'`) in each entry, and the reset row in the nudge and the chip; the guard file's refusals all pass, because the form's own check does not use the verdict |
| 12  | (round 3) the guard keeps no turns (`open()` sets the panel from every answer; `close()` takes none)                                            | 5 of 118 failed: the chip's three late-answer cases, the nudge's late click answer, `EnableVerification`'s late click answer                                                                                                                                                                                                     |
| 13  | (round 3) the nudge's refresh applies its account answer whatever its turn                                                                      | 1 of 118 failed: the refresh that answers after a click                                                                                                                                                                                                                                                                          |
| 14  | (round 3) the nudge's refresh does not wait for a click's check in flight                                                                       | 1 of 118 failed: the refresh that waits                                                                                                                                                                                                                                                                                          |
| 15  | (round 3) the nudge's click takes no account turn                                                                                               | 1 of 118 failed: the refresh that answers after a click. A second check of the click's own turn before applying its answer was also tried: 0 failed, because the guard already drops a superseded click and no refresh starts while a click is in flight; that check was removed (`f1f047f0a9`)                                  |
| 16  | (round 3) the chip passes no `offer`                                                                                                            | 5 of 118 failed: rows 1 and 2, the backup-after-explanation case, the offer's late answer, the legitimate path                                                                                                                                                                                                                   |
| 17  | (round 3) the hook ignores `offer` (`offerFirst` skipped)                                                                                       | the same 5 of 118                                                                                                                                                                                                                                                                                                                |
| 18  | (round 3) the reset's warning back to "your encryption backup will be lost"                                                                     | 1 of 118 failed                                                                                                                                                                                                                                                                                                                  |
| 19  | (round 3) rows 1 and 2 back to their round-2 texts                                                                                              | 2 of 118 failed: the two selector cases                                                                                                                                                                                                                                                                                          |
| 20  | (round 3) `EnableVerification` back to the nudge's texts                                                                                        | 1 of 118 failed: its texts case                                                                                                                                                                                                                                                                                                  |
| 21  | (round 5) `KeyBackupSetupGuard.tsx` back to round 4's (`KeyBackupExplanation` without `forwardRef`, no key on the trap)                         | 7 of 9 failed in the focus-trap file: the six explanation and offer panels and the transition case (Tab from the last control stayed put); setup and reset passed, as on develop (`scratchpad/v60/r6/focustrap-without-fix.txt`)                                                                                                 |
| 22  | (round 5) the `FocusTrap`'s `key` removed, `forwardRef` kept                                                                                    | 1 of 9 failed: the transition case, with focus-trap's "must have at least one container with at least one tabbable node" (`scratchpad/v60/r6/focustrap-without-key.txt`)                                                                                                                                                         |
| 23  | (round 5) the logic of both partial-setup changes reverted (`DeviceVerificationSetup.tsx` from round 4, `setupRefusal` without the form's key)  | 4 of 4 failed in the partial file: no partway text after the first attempt (`scratchpad/v60/r6/partial-without-fix.txt`)                                                                                                                                                                                                         |
| 24  | (round 5) `setupRefusal` ignores `ownMasterKey`                                                                                                 | 2 of 4 failed: the keep case and the redo case (refused with the cross-signing text); the two refusal cases passed (`scratchpad/v60/r6/mut-a-refusal-ignores-own-key.txt`)                                                                                                                                                       |
| 25  | (round 5) the form never keeps its own cross-signing                                                                                            | 1 of 4 failed: the keep case (a second upload and the password prompt) (`scratchpad/v60/r6/mut-b-never-keeps.txt`)                                                                                                                                                                                                               |
| 26  | (round 5) an unfinished cross-signing step is kept too                                                                                          | 1 of 4 failed: the redo case (no password prompt; the half-uploaded identity kept) (`scratchpad/v60/r6/mut-c-keeps-unfinished.txt`)                                                                                                                                                                                              |
| 27  | (round 5) develop's choice in `KeyBackupGuardOverlay`: the setup panel renders `DeviceVerificationReset` once `useCrossSigningActive()` is true | 1 of 18 failed in the chip file: the real-crypto case, waiting for the recovery-key screen (`scratchpad/v60/r6/mut-chip-account-data-choice.txt`)                                                                                                                                                                                |
| 28  | (round 6) every attempt makes a new recovery key (the held key not used again)                                                                  | 4 of 8 failed in the partial file: the keep case, the redo case, the secret-storage case and the reset-cancel case (the finished key differs from the one shown partway) (`scratchpad/v60/r7/mut-M28-new-key-each-attempt.txt`)                                                                                                  |
| 29  | (round 6) the backup step's re-check ignored (always `backup_none`)                                                                             | 2 of 8 failed: the two `backup_unclear` cases (`scratchpad/v60/r7/mut-M29-no-backup-recheck.txt`)                                                                                                                                                                                                                                |
| 30  | (round 6) Continue always offered                                                                                                               | the same 2 of 8 (`scratchpad/v60/r7/mut-M30-continue-always.txt`)                                                                                                                                                                                                                                                                |
| 31  | (round 6) the account confirmation's cancel passed straight through again (it rejects with the click event)                                     | 1 of 8 failed: the reset-cancel case, no cancel message (`scratchpad/v60/r7/mut-M31-cancel-without-error.txt`)                                                                                                                                                                                                                   |
| 32  | (round 6) the partway key not kept (`setHeldKey` removed)                                                                                       | 8 of 8 failed (`scratchpad/v60/r7/mut-M32-key-not-kept.txt`)                                                                                                                                                                                                                                                                     |
| 33  | (round 6) `handleSubmit` not guarded when no Continue is offered                                                                                | 1 of 8 failed: the backup-created case, whose forced submit reached the check and its refusal (`scratchpad/v60/r7/mut-M33-submit-unguarded.txt`)                                                                                                                                                                                 |

Each source file was compared byte-for-byte with its pre-mutation copy
afterwards; in round 3 each mutation was undone with `git checkout HEAD -- src`
and `git diff` was empty after each (`scratchpad/v60/r4/mut-*.txt`). Mutations 7 and 11 were run again over all eight files after the
`waitFor` change (`scratchpad/v60/r3/mut-*.txt`).
In round 6 each mutated file was restored from a saved copy and checked against
its SHA-256 afterwards (`scratchpad/v60/r7/tools/mut.sh`). Mutations 28 to 30
and 32 ran before two assertions were added (the forced submit in the
backup-created case, secret storage's master key in the reset-cancel case),
which only add checks; mutations 31 and 33 and the swap above were run again on
the final file, with the same results.

## Gates

Round 1, observed on the fixed tree (commit `0dc627f87b`), Node 22, from
`apps/blackout-client` unless noted.

| Gate                            | Command                                                                                                                                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| client typecheck                | `npx tsc --noEmit` (covers `src`); the new test files were type-checked once through a temporary tsconfig that included them, then it was removed | exit 0 for `src`. This row first said "exit 0, both"; the second review's equivalent run found one error in the test files, `DeviceVerificationSetup.deletesBackup.test.tsx(107,47): TS2554` (`checkKeyBackupAndEnable(true)`: the public `CryptoApi` method takes no argument and always forces the check, `rust-crypto.js:1212-1216`; the argument was dead). Fixed in round 2; see the round-2 row. CI type-checks `src` only (`tsconfig.json` `include`) |
| eslint, changed `src` files     | `npx eslint --max-warnings=0` on the six changed or new `src` files                                                                               | exit 0. The client's eslint config covers `src/**` only, so the test files are not linted by it                                                                                                                                                                                                                                                                                                                                                              |
| client unit suite, as CI        | `pnpm --filter @blackout/client run test:coverage`, after `@blackout/core` and `@blackout/design` were built as CI does                           | 524 files, 3694 passed, 3 skipped (pre-existing; none in the files of this change), 0 unhandled errors; coverage 45.54 % statements, 36.63 branches, 36.43 functions, 46.61 lines, above the floors 41.3 / 32.2 / 32.5 / 42.3; 236 s                                                                                                                                                                                                                         |
| client integration suite, as CI | `pnpm --filter @blackout/client run test:integration`                                                                                             | 3 files, 13 passed                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| client build                    | `pnpm --filter @blackout/client run build`                                                                                                        | both Vite bundles built (9.5 s and 0.9 s), exit 0                                                                                                                                                                                                                                                                                                                                                                                                            |
| prettier                        | root `npx prettier --check` on every changed file                                                                                                 | clean. This record needed two passes: prettier re-indents a nested list on the second                                                                                                                                                                                                                                                                                                                                                                        |
| trust page                      | `node tools/ci/build-trust-page.mjs --check` after the rebuild                                                                                    | OK                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| gitleaks 8.21.2                 | `gitleaks git --log-opts="0367abdd69..HEAD"` before this record's commit                                                                          | 17 commits scanned, no leaks; rerun over the whole branch after the docs commit, reported with the branch                                                                                                                                                                                                                                                                                                                                                    |
| load rule                       | the heavy suites started when the 1-minute load was 0.29 (poll log kept in the scratchpad)                                                        | kept                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Round 2, before the merge of develop (commit `e5566ebdc5`): the eight guard
files, 100 passed, 0 unhandled errors; the test files type-check through a
temporary tsconfig (`scratchpad/v60/r3/tsconfig.tests.json`: extends the
client's, includes the 7 guard test files, the 2 helpers and `src/**/*.d.ts`),
exit 0. The first builder of the round had found two errors in that run, the
TS2554 above and a `process` reference in the new helper (no Node types in the
client's tsconfig; typed locally), and fixed both. Develop
(`27d8c17051`, #998: lodash 4.18.1, the fork's hosting helpers removed; no file in
common with this branch) was then merged (`b917bc89ba`), the lockfile installed
with `pnpm install --frozen-lockfile --offline` (lodash 4.18.1 added from the
store), and the gates ran on that merged head, Node 22, the `pnpm` commands from the
repository root and the `npx` ones from `apps/blackout-client` (logs in
`scratchpad/v60/r3/gates/`):

| Gate                            | Command                                                                                                                                | Result                                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core and design builds          | `pnpm --filter @blackout/core run build`, `pnpm --filter @blackout/design run build`, as CI does before the client's jobs              | exit 0, both                                                                                                                                                                        |
| client typecheck                | `pnpm --filter @blackout/client run typecheck` (`tsc --noEmit`, covers `src`)                                                          | exit 0                                                                                                                                                                              |
| test files typecheck            | `npx tsc -p scratchpad/v60/r3/tsconfig.tests.json` (the temporary tsconfig above)                                                      | exit 0                                                                                                                                                                              |
| eslint, changed `src` files     | `npx eslint --max-warnings=0` on the eight changed or new files under `apps/blackout-client/src`                                       | exit 0                                                                                                                                                                              |
| guard tests                     | `npx vitest run` on the eight files of the Tests table                                                                                 | 100 passed, 6.2 s                                                                                                                                                                   |
| client unit suite, as CI        | `pnpm --filter @blackout/client run test:coverage`                                                                                     | 525 files, 3726 passed, 3 skipped (pre-existing; none in this change's files), 0 unhandled errors; coverage 45.59 % statements, 36.66 branches, 36.46 functions, 46.65 lines; 214 s |
| client integration suite, as CI | `pnpm --filter @blackout/client run test:integration`                                                                                  | 3 files, 13 passed                                                                                                                                                                  |
| client build                    | `pnpm --filter @blackout/client run build`                                                                                             | both Vite bundles built (8.8 s and 0.08 s), exit 0                                                                                                                                  |
| prettier                        | root `npx prettier --check` on the 22 files the branch changes against develop                                                         | clean                                                                                                                                                                               |
| trust page                      | `node tools/ci/build-trust-page.mjs --check` (`TRUST.md` unchanged this round)                                                         | OK, `public/trust.html` matches                                                                                                                                                     |
| gitleaks 8.21.2                 | `gitleaks git --log-opts="origin/develop..HEAD"`, run before this record's last commit and again after it                              | no leaks (7 commits before; the two merge commits carry develop's own content)                                                                                                      |
| load rule                       | each heavy step waited for a 1-minute load under 3.5 (`scratchpad/v60/r3/gates/load.txt`): typecheck at 3.42, unit at 3.10, build 3.04 | kept                                                                                                                                                                                |

Round 3 (third review), on `45e1bc7d5c`'s tree plus the record (develop had not
moved: `origin/develop` was still `27d8c17051`, already merged, so no merge
commit this round). Node 22, from `apps/blackout-client` unless noted; logs in
`scratchpad/v60/r4/gates/`:

| Gate                                                                                | Command                                                                                                               | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| client typecheck                                                                    | `pnpm run typecheck` (`tsc --noEmit`, covers `src`)                                                                   | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| test files typecheck                                                                | `npx tsc -p scratchpad/v60/r3/tsconfig.tests.json` (the 7 guard test files, the 2 helpers)                            | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| eslint, changed `src` files                                                         | `npx eslint --max-warnings=0` on the 8 files under `apps/blackout-client/src` that the branch changes against develop | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| guard tests                                                                         | `npx vitest run` on the eight files of the Tests table                                                                | 118 passed, 0 unhandled errors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| prettier                                                                            | root `npx prettier --check` on the 24 files the branch changes against develop                                        | clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| trust page                                                                          | `node tools/ci/build-trust-page.mjs` then `--check` (`TRUST.md` changed)                                              | OK, `public/trust.html` matches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| gitleaks 8.21.2                                                                     | `gitleaks git --log-opts="origin/develop..HEAD"`                                                                      | 12 commits scanned, no leaks; run before this paragraph's commit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| client unit suite as CI, `test:integration`, client build and the bundle-size check | —                                                                                                                     | **not run.** The task's rule is to stop below 1 GB free before a heavy step. Free space on `/` was 276 to 447 MB for the fifteen minutes polled (05:30 to 05:45 UTC, `scratchpad/v60/r4/diskpoll.log`), with other sessions writing to the same disk; earlier in the round it reached 0 MB once, which truncated one file being written (rewritten from `HEAD` and redone, checked before commit). So nothing in round 3 shows that the full suite, the integration suite, `vite build` or `MAX_BUNDLE_KB=29696` still pass on this head; round 2's runs of them (above) were on `b917bc89ba`, before this round's changes |
| load rule                                                                           | each test run here started under a 1-minute load of 3.5 (the highest seen was 3.18)                                   | kept                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Round 4 (fourth review). Free space on `/` was 7.2 GB at the start and never
under 6.8 GB. The fixes (`000667426d`, `5b9664202f`) were committed first;
then develop was merged twice, because it moved while the gates ran: `0f9df74349`
(#999, #1000) in `b3b07a2d76`, where the full set below ran once and passed
with the same counts (`scratchpad/v60/r5/gates-b3b07a2d76/`), and `97756ff4ec`
(#1001, metro 0.83.8, a lockfile change) in `a5b9a21dd2`, after
`pnpm install --frozen-lockfile --offline`. The table is the run on
`a5b9a21dd2`. Develop's baseline ran in a detached worktree of `97756ff4ec`
(the second merge's develop parent), installed the same way, the same CI
steps, and was removed afterwards. Node 22, `pnpm` from the repository root,
`npx` from `apps/blackout-client`; logs in `scratchpad/v60/r5/gates/`.

| Gate                            | Command                                                                                                                       | Merged head `a5b9a21dd2`                                                                                                                                  | develop `97756ff4ec`                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| core and design builds          | `pnpm --filter @blackout/core run build`, `pnpm --filter @blackout/design run build`                                          | exit 0, both                                                                                                                                              | exit 0, both                                                              |
| client typecheck                | `pnpm --filter @blackout/client run typecheck` (`tsc --noEmit`, covers `src`)                                                 | exit 0                                                                                                                                                    | exit 0                                                                    |
| test files typecheck            | `npx tsc -p scratchpad/v60/r3/tsconfig.tests.json` (the 7 guard test files, the 2 helpers)                                    | exit 0                                                                                                                                                    | — (the files are new)                                                     |
| eslint, as CI                   | `pnpm --filter @blackout/client exec eslint "src/**/*.{ts,tsx}" --max-warnings=0` (every client `src` file, not only changed) | exit 0                                                                                                                                                    | exit 0                                                                    |
| guard tests                     | `npx vitest run` on the eight files of the Tests table                                                                        | 119 passed                                                                                                                                                | —                                                                         |
| client unit suite, as CI        | `pnpm --filter @blackout/client run test:coverage`                                                                            | 525 files, 3745 passed, 3 skipped, 0 unhandled errors; coverage 45.68 % statements, 36.74 branches, 36.56 functions, 46.75 lines; 277 s                   | 519 files, 3643 passed, 3 skipped; coverage 45.31 / 36.36 / 36.23 / 46.36 |
| client integration suite, as CI | `pnpm --filter @blackout/client run test:integration`                                                                         | 3 files, 13 passed                                                                                                                                        | 3 files, 13 passed                                                        |
| client build                    | `pnpm --filter @blackout/client run build`                                                                                    | both Vite bundles built, exit 0                                                                                                                           | the same                                                                  |
| bundle size, as CI              | `du -sk --exclude='*.map' apps/blackout-client/dist`, threshold `MAX_BUNDLE_KB` 29696                                         | 25320 KB                                                                                                                                                  | 25312 KB                                                                  |
| prettier                        | root `npx prettier --check` on the 24 files the branch changes against develop                                                | clean                                                                                                                                                     | —                                                                         |
| trust page                      | `node tools/ci/build-trust-page.mjs --check` (`TRUST.md` changed this round, rebuilt with the script)                         | OK, `public/trust.html` matches                                                                                                                           | —                                                                         |
| gitleaks 8.21.2                 | `gitleaks git --log-opts="origin/develop..HEAD"`, before this record's last commit                                            | 15 commits scanned (the range's 19 less its 4 merges, which `git log -p` shows no diff for), no leaks                                                     | —                                                                         |
| load rule                       | each step waited for a 1-minute load under 3.5, polling every 30 s (`scratchpad/v60/r5/gates/load.txt`)                       | kept; the highest start was 3.48 (the integration suite). The first run's core build waited 8.5 min while other sessions' suites held the load at 7 to 14 | kept; the highest start 3.45                                              |

The difference in the unit suite is this branch's tests and nothing else:
six new files, 94 tests (26 + 28 + 17 + 11 + 10 + 2), and 8 more in the two
updated files (`encryptionPosture.test.ts` 14 → 19, `keyBackupNudge.test.ts`
3 → 6), 102 in all, the same 3 skipped. No test of develop's fails or was
removed.

Round 5 (fifth review). Develop had not moved past `97756ff4ec`, so nothing
was merged, and round 4's develop baseline on that commit stands as the
comparison. Free space on `/` was 6.4 GB at the start of the round and 5.3 GB
during the gates. The gates ran
on `4aa3183d97` (the fixes and this record before this paragraph), Node 22,
`pnpm` from the repository root, `npx` from `apps/blackout-client`; logs in
`scratchpad/v60/r6/gates/`.

| Gate                            | Command                                                                                                   | `4aa3183d97`                                                                                                                            | develop `97756ff4ec` (round 4's run)                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| core and design builds          | `pnpm --filter @blackout/core run build`, `pnpm --filter @blackout/design run build`                      | exit 0, both                                                                                                                            | exit 0, both                                                  |
| client typecheck                | `pnpm --filter @blackout/client run typecheck` (`tsc --noEmit`, covers `src`)                             | exit 0                                                                                                                                  | exit 0                                                        |
| test files typecheck            | `npx tsc -p scratchpad/v60/r6/tsconfig.tests.json` (the 9 guard test files under `tests/`, the 2 helpers) | exit 0                                                                                                                                  | —                                                             |
| eslint, as CI                   | `pnpm --filter @blackout/client exec eslint "src/**/*.{ts,tsx}" --max-warnings=0`                         | exit 0                                                                                                                                  | exit 0                                                        |
| guard tests                     | `npx vitest run` on the ten files of the Tests table                                                      | 10 files, 139 passed                                                                                                                    | —                                                             |
| client unit suite, as CI        | `pnpm --filter @blackout/client run test:coverage`                                                        | 527 files, 3765 passed, 3 skipped, 0 unhandled errors; coverage 45.86 % statements, 36.89 branches, 36.79 functions, 46.92 lines; 362 s | 519 files, 3643 passed, 3 skipped; 45.31, 36.36, 36.23, 46.36 |
| client integration suite, as CI | `pnpm --filter @blackout/client run test:integration`                                                     | 3 files, 13 passed                                                                                                                      | 3 files, 13 passed                                            |
| client build                    | `pnpm --filter @blackout/client run build`                                                                | both Vite bundles built, exit 0                                                                                                         | the same                                                      |
| bundle size, as CI              | `du -sk --exclude='*.map' apps/blackout-client/dist`, threshold `MAX_BUNDLE_KB` 29696                     | 25324 KB                                                                                                                                | 25312 KB                                                      |
| prettier                        | root `npx prettier --check` on the 27 files the branch changes against develop                            | clean                                                                                                                                   | —                                                             |
| trust page                      | `node tools/ci/build-trust-page.mjs --check` (`TRUST.md` not changed this round)                          | OK, `public/trust.html` matches                                                                                                         | —                                                             |
| gitleaks 8.21.2                 | `gitleaks git --log-opts="origin/develop..HEAD"`, before this paragraph's commit                          | 21 commits scanned (the range's 25 less its 4 merges), no leaks                                                                         | —                                                             |
| load rule                       | each step waited for a 1-minute load under 3.5, polling every 30 s (`scratchpad/v60/r6/gates/load.txt`)   | kept; the highest start was 3.42 (the unit suite); the core build waited 1 min and the test files' typecheck 4 min                      | —                                                             |

The unit suite's difference from develop is this branch's tests and nothing
else: round 4's 102, and this round's 20 (6 in `keyBackupCheck.test.ts`, the
new focus-trap file's 9, the new partial-setup file's 4, the chip's new
real-crypto case), in 2 new files; the same 3 skipped. The load rule held for
the gates above. It did not hold for every single-file run this round: the
focus-trap file's first run, the `src` and test-file type-checks before the
fix commits, and some mutation and reproduction runs started with the 1-minute
load between 3.7 and 10.2, while other sessions' suites ran. None of those is
a full suite; the type-checks and the new files' tests were repeated inside the
gates above, where the load rule was kept, and the mutation and reproduction
runs were not repeated.

Round 6 (sixth review). Develop had not moved past `97756ff4ec`, so nothing
was merged, and round 4's develop baseline on that commit stands as the
comparison. Free space on `/` was 5.2 GB at the start of the round and 4.7 GB
during the gates. The gates ran on `cc40a96954` (the fixes and this record
before this paragraph), Node 22, `pnpm` from the repository root, `npx` from
`apps/blackout-client`; logs in `scratchpad/v60/r7/gates/`.

| Gate                            | Command                                                                                                   | `cc40a96954`                                                                                                                            | develop `97756ff4ec` (round 4's run)                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| core and design builds          | `pnpm --filter @blackout/core run build`, `pnpm --filter @blackout/design run build`                      | exit 0, both                                                                                                                            | exit 0, both                                                  |
| client typecheck                | `pnpm --filter @blackout/client run typecheck` (`tsc --noEmit`, covers `src`)                             | exit 0                                                                                                                                  | exit 0                                                        |
| test files typecheck            | `npx tsc -p scratchpad/v60/r7/tsconfig.tests.json` (the 9 guard test files under `tests/`, the 2 helpers) | exit 0                                                                                                                                  | —                                                             |
| eslint, as CI                   | `pnpm --filter @blackout/client exec eslint "src/**/*.{ts,tsx}" --max-warnings=0`                         | exit 0                                                                                                                                  | exit 0                                                        |
| guard tests                     | `npx vitest run` on the ten files of the Tests table                                                      | 10 files, 143 passed                                                                                                                    | —                                                             |
| client unit suite, as CI        | `pnpm --filter @blackout/client run test:coverage`                                                        | 527 files, 3769 passed, 3 skipped, 0 unhandled errors; coverage 45.88 % statements, 36.94 branches, 36.82 functions, 46.95 lines; 293 s | 519 files, 3643 passed, 3 skipped; 45.31, 36.36, 36.23, 46.36 |
| client integration suite, as CI | `pnpm --filter @blackout/client run test:integration`                                                     | 3 files, 13 passed                                                                                                                      | 3 files, 13 passed                                            |
| client build                    | `pnpm --filter @blackout/client run build`                                                                | both Vite bundles built, exit 0                                                                                                         | the same                                                      |
| bundle size, as CI              | `du -sk --exclude='*.map' apps/blackout-client/dist`, threshold `MAX_BUNDLE_KB` 29696                     | 25324 KB                                                                                                                                | 25312 KB                                                      |
| prettier                        | root `npx prettier --check` on the 28 files the branch changes against develop                            | clean                                                                                                                                   | —                                                             |
| trust page                      | `node tools/ci/build-trust-page.mjs --check` (`TRUST.md` not changed this round)                          | OK, `public/trust.html` matches                                                                                                         | —                                                             |
| gitleaks 8.21.2                 | `gitleaks git --log-opts="origin/develop..HEAD"`, before this paragraph's commit                          | 26 commits scanned (the range's 30 less its 4 merges), no leaks                                                                         | —                                                             |
| load rule                       | each step waited for a 1-minute load under 3.5, polling every 30 s (`scratchpad/v60/r7/gates/load.txt`)   | kept; the highest start was 3.49 (the guard tests); the test files' typecheck waited 4.5 min, the integration suite 1 min               | —                                                             |

The unit suite's difference from develop is this branch's tests and nothing
else: round 5's 122 and this round's 4 new cases in the partial-setup file, the
same 3 skipped. The load rule held for the gates above. It did not hold for
every single-file run this round: the verifiers' probes (09:52 to 09:55 UTC)
and the second of the three swap runs started with the 1-minute load between
3.7 and 7.8 while other sessions' suites ran; the mutation runs started between
0.8 and 2.3.
None of those is a full suite, and every test file they touched passed again
inside the gates above.

## Second review, 2026-11-08

Fourteen findings; each is fixed above or explained here.

| Finding                                                                                                   | Severity | What changed                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The nudge opened the unwarned setup from a verdict that could be hours old; `EnableVerification` the same | medium   | S9-2: `KeyBackupSetupGuard`, the click re-asks in every entry; `SetupVerification` checks once more before its first write; tests in both files and a new file; the fail-without and mutation rows above |
| `refresh` fired with `void`, no catch                                                                     | low      | try/catch; hidden, one warning; `checkForSetup` catches for the click path and `EnableVerification`'s mount; tests pin that nothing escapes                                                              |
| The record said the nudge is on every screen (twice)                                                      | low      | "What was found" and "Effects" corrected: `ClientLayout`, the chat surface; the AppShell chrome imports it and does not render it (that unused import is pre-existing and left)                          |
| The `'unknown'` texts named the wrong failed check in one reachable sub-case                              | low      | Both texts name both checks (wording above); the whole-text pins follow the constants; the `src` selector test's regex pins the new sentence                                                             |
| The fake's UIA rule, and "as Synapse does", hold only under MSC3967                                       | low      | The fake's header, the deletesBackup test's header and "Reproduced how" say so, with the default-config behaviour                                                                                        |
| `CHIP_TEXT` "doesn't have its key" is not true of every `m.bad.encrypted` event                           | low      | "Can't decrypt this message on this device."; the comment names the other causes; a test pins the text                                                                                                   |
| The record misstated why `isCrossSigningReady()` is false on a new device                                 | low      | "What was found" names `identity.isVerified()` and what `secretStorageContainsCrossSigningKeys` does check                                                                                               |
| Row 2 pointed to a next screen that says a backup will be lost                                            | low      | The clause is dropped and pinned absent; the reset screen's own sentence is listed under "What remains"                                                                                                  |
| `docs/features/data-export.md` still sent people to "Settings → Encryption"                               | low      | Corrected (wording above). The API's `MATRIX_HISTORY_HOW` string is the same pointer in `packages/api`; left for the key-export follow-up, under "What remains"                                          |
| KNOWN_ISSUES dated the fix note 2026-11-02                                                                | low      | "2026-11-08 (finding S9 of 2026-11-02): …", and the note now says the click re-asks and the form checks once more                                                                                        |
| `checkKeyBackupAndEnable(true)` in a committed test: TS2554, dead argument                                | medium   | `checkKeyBackupAndEnable()`, comment corrected; the round-1 typecheck row corrected to what was observed; round 2's temporary-tsconfig run exit 0                                                        |
| The "format-only" commit `b72164697f` did change tokens (`{' '}`)                                         | low      | Recorded under "What remains"; this round's style commit for `DeviceVerificationSetup.tsx` states its own `{' '}` move in its body                                                                       |
| The tree contradicts itself on "Settings → Encryption" (doc and API string)                               | low      | As two rows above: the doc corrected here, the API string named under "What remains"; not changed in this PR                                                                                             |

## Third review, 2026-11-08

Eleven findings; each is fixed above or explained here. Severity as the
reviewers gave it.

| Finding                                                                                                                                                                                  | Severity | What changed                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A late answer from a superseded or closed guard check overwrote the fresh answer: a stale "none" could open the setup and bring back the nudge's button (the form's check still refused) | low      | S9-3: `useAnswerTurns`; the guard drops an answer whose turn is not the latest and `open()` resolves null; the nudge orders refreshes and clicks and a refresh waits for a click in flight; `EnableVerification` takes turns; seven ordering cases; mutations 12-15 |
| The warned reset, reached from row 2, said "your encryption backup will be lost", false whenever the reset can proceed                                                                   | low      | Reworded (above); pinned; mutation 18; What remains corrected                                                                                                                                                                                                       |
| TRUST.md said a backup lets another app restore older messages, with no word that a Blackout session that didn't set it up never adds to it                                              | medium   | TRUST.md hedged and the trust page rebuilt; KNOWN_ISSUES BO-1 and rows 1 and 2 say whose keys a backup holds; What remains has the caveat                                                                                                                           |
| KNOWN_ISSUES' note said the nudge and chip otherwise offer nothing, but row 2 offers the warned reset                                                                                    | low      | The note names the reset's row                                                                                                                                                                                                                                      |
| The chip's "Why?" explained nothing in rows 1 and 2 and never said the setup won't make the message readable                                                                             | low      | The chip explains first (`texts.offer`, `CHIP_SETUP_WONT_FIX`); "Set up backup" re-checks; the departure from §6.9 is recorded                                                                                                                                      |
| Unqualified "Blackout can't restore from a backup" sentences ignored the SDK's automatic per-session download on the device that holds the backup key                                    | low      | Row 2 qualified as row 1; the three record sentences (table row 3, Effects, What remains) corrected                                                                                                                                                                 |
| Record precision: "the guard never reaches the upload unless the verdict is 'none'", the stale merge base, "caches for the life of the client"                                           | low      | All three corrected here and in the fake's header; `keyBackupCheck.ts`'s comment had the same "life of the client" claim and is corrected too                                                                                                                       |
| The overlay texts reused on the unmounted Devices page would be false there                                                                                                              | low      | `ENABLE_VERIFICATION_GUARD_TEXTS`; pinned; What remains says the "no screen" sentences need re-reading when those screens are mounted                                                                                                                               |
| Docs not reconciled with the new BO-1 cause (TRANSMUTATION_NOTES §5, KNOWN_LIMITATIONS)                                                                                                  | low      | Both updated (Wording)                                                                                                                                                                                                                                              |
| The build, the bundle size, `test:integration`, a clean run of develop and the verifier's three probes were not run (disk under 1 GB)                                                    | medium   | The probes ran here (below). The full suite, `test:integration`, the build and the bundle-size check were again not run: free space stayed under 1 GB for the fifteen minutes polled ("Gates", round 3). Not fixed by this round                                    |
| No test checked the nudge's snooze, and round 2 rewrote the code that renders it                                                                                                         | low      | Four snooze cases (`KeyBackupNudge.test.tsx`); they pass on the round-2 source too                                                                                                                                                                                  |

The round-2 verifier's probes were run once on this round's tree, copied into
`tests/unit/` and deleted afterwards. Reachability (`verify-r2-reachability`)
became the committed ordering cases. Regressions
(`verify-r2-regressions/probe/zzVerifyR2Regressions.probe.test.tsx`): 12 of 14
passed as written (`scratchpad/v60/r4/probe-regressions.txt`). The two that
failed are the probe's own: its snooze remount renders with a fresh jotai store,
and the snooze atom reads localStorage once at start-up, so the committed case
remounts on one store as the app does; its default-Synapse case (UIA on the
first upload) never filled the password, because jsdom has no form
named-property getter and `PasswordStage` reads `form.passwordInput` (the shim
of "Reproduced how"). With that shim both real-crypto cases passed: the setup
completes in one pass and with the password step
(`scratchpad/v60/r4/probe-uia-shim.txt`). P3's five unknown answers held in the
nudge, the chip, the form and `EnableVerification`.

## Fourth review, 2026-11-08

Six findings; each is fixed above or explained here. Severity as the
reviewers gave it.

| Finding                                                                                                                                                                                                             | Severity | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The reachability checks (every path to the setup's three writes, a fresh device of an account with a backup and cross-signing, a failing or slow backup endpoint, the fix reverted) were not run: about 337 MB free | high     | Nothing to change in the code for it. Free space was 7.2 GB at the start of this round. On `000667426d`'s tree: the reproduction on develop's five files and on the fixed tree, and the swap over the eight guard files ("Reproduced how", "Fail without the fix"); a grep of every client, desktop and mobile source for `DeviceVerificationSetup`, `DeviceVerificationReset`, `setupNewSecretStorage`, `setupNewCrossSigning` and `resetKeyBackup` finds the three calls only in `SetupVerification`, behind its own check, reached only through `KeyBackupGuardOverlay` (the nudge, the chip, `EnableVerification`) and the unmounted Devices page's Reset (mode `reset`); `ManualVerification` is listed under "What remains". The verifiers' own lens is theirs to re-run                                       |
| TRUST.md, the trust page and "What remains" said a Blackout session that didn't set the backup up doesn't add its keys to it, false of a Blackout session that holds the account's cross-signing identity           | low      | "a Blackout session you sign in to later, which Blackout can't verify, doesn't add its keys to it"; the trust page rebuilt; "What remains" names the exception with the SDK lines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CHIP_NOT_VERIFIED`'s "so it can't get this message's key" was absolute                                                                                                                                             | low      | Names what is closed (a backup, the other sessions) and what can still happen (a key the sender's device sends later); a test pins it and fails on the round-3 text ("Wording"). Sixth review: "what can still happen" was overstated, since a key shared later cannot open a message sent before this device signed in; the text now promises a late key only what a delayed key can do (S13-2, "Wording")                                                                                                                                                                                                                                                                                                                                                                                                          |
| `DeviceVerificationReset`'s JSX comment said "so no backup is lost", against "What remains"' password-prompt window                                                                                                 | low      | The comment says a backup that exists when the form is submitted is not deleted, and names the window                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| S9-2 and `KeyBackupSetupGuard.tsx`'s header said the SDK re-checks its backup "only" at three points; there are five forced checks and an unforced one                                                              | low      | Both list them all, and say why none refreshes the screen on a new device (a re-check that finds an untrusted backup enables nothing and emits nothing); `KeyBackupNudge.tsx`'s "nothing tells this device" reads "nothing refreshes it", since the SDK does learn of a new identity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Typecheck, eslint, the unit suite as CI, the build and a develop baseline were not run for `68fa9fe692`: about 337 MB free                                                                                          | high     | Run this round on the merged head `a5b9a21dd2` and on develop `97756ff4ec` ("Gates", round 4): all pass; the unit suite differs from develop's only by this branch's 102 tests. The three behaviour checks the lens named are committed cases in that run: a brand-new account is still offered the setup (the nudge's and the chip's "nothing on the server" cases, and the nudge's real-crypto case that creates backup 1 and a master key and deletes nothing), an `'unknown'` answer shows the could-not-check text and opens no flow (the nudge's unreachable, 500, non-`M_NOT_FOUND` 404 and click-time cases, the chip's failed-check and rejecting-device cases, the form's three refusals on a failed check, `EnableVerification`'s failed check), and the snooze (four cases in `KeyBackupNudge.test.tsx`) |

The orchestrator's note for this round also named a commit `ce5fc7f661` and
uncommitted edits to `KNOWN_ISSUES.md`, `docs/features/data-export.md` and this
record, left by a builder cut off by a usage limit. `ce5fc7f661` is round 2's
commit, already an ancestor of `68fa9fe692` and described under "Second review";
the working tree was clean at the start of this round (`git status`, no stash),
so there was nothing left to finish.

## Fifth review, 2026-11-08

Eight findings; each is fixed above or explained here. Severity as the
reviewers gave it. The reachability lens found the guard clean.

| Finding                                                                                                                                                                            | Severity | What changed                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KNOWN_ISSUES.md`'s BO-1 notes still called the cause undiagnosed and kept "restore failing" as a triage outcome, against `TRANSMUTATION_NOTES.md` §5 and this record              | low      | A dated BO-1 note: a new device has no restore (no restore, verification or key-request path; `roomKeyRequestsEnabled = false`), so `active=no` there follows from that alone; `failures` counts refused uploads to this device's own active backup (`KeyBackupFailed`, `backup.js:426-435`); what live numbers can still tell is narrower. `encryptionHealth.ts`'s header, which carries the same triage rule, has the same note |
| `keyBackupCheck.ts`'s header and "What was found" said `getKeyBackupInfo()` keeps a failed answer until the next forced check                                                      | low      | Both say a successful answer is kept until the next forced check and a failed request is asked again on the next call (`checkedForBackup` is set only on success, `backup.js:259-266`); the conclusion stands                                                                                                                                                                                                                     |
| The BO-1 item said "Blackout can't yet" restore from the backup the nudge starts, unqualified                                                                                      | low      | "Blackout can't restore from it after you sign in on a new device", as row 1 says                                                                                                                                                                                                                                                                                                                                                 |
| The reproduction's wait matched "Recovery Key" in the setup form's own text, so its write list stopped at the backup's `POST` and "the recovery-key screen followed" was not shown | low      | The repro waits for the screen's own sentence (nudge) and for the stored `m.megolm_backup.v1` (chip) and says what the overlay shows; re-run on develop's files: six account-data `PUT`s, the last under the new default key; the nudge reached the recovery-key screen, the chip's overlay switched to the Reset warning (S9-4, now pinned)                                                                                      |
| The mutation table's rows 12-20 were cut off from it by a blank line                                                                                                               | low      | The blank line is gone; rows 1-27 are one table                                                                                                                                                                                                                                                                                                                                                                                   |
| Row 1's "nothing to replace" said more than the check establishes, which never reads secret storage                                                                                | low      | `encryptionPosture.ts` and row 1 say "no backup and no cross-signing to replace"; "What remains" names the secret-storage case and what would close it                                                                                                                                                                                                                                                                            |
| A brand-new account whose setup failed partway could not finish it from the same form; the way on was the warned reset                                                             | low      | The form keeps the master key its own attempt made and, when the homeserver holds it and there is no backup, goes on and keeps that identity (Fixed how); a text says to press Continue; closing the window first, and a backup this attempt created, are under "What remains"                                                                                                                                                    |
| `KeyBackupGuardOverlay`'s checking, explanation and offer panels had no focus trap, because `KeyBackupExplanation` dropped the ref                                                 | low      | `forwardRef` to its `Dialog`, and the trap keyed by the child's component type (Fixed how); a test with the real `focus-trap-react`                                                                                                                                                                                                                                                                                               |

The round-4 regression verifier's two probes ran once on this round's tree
(`3f4a80ab88`), copied into `tests/unit/`
and deleted afterwards (`scratchpad/v60/r6/probes-r4-on-r5.txt`). The
partial-setup probe now reads "second submit: refusedWithCrossSigningText=false
recoveryKeyShown=true backup=1 masterKeyChanged=false". The focus-trap probe's
three cases now fail with focus-trap's "must have at least one container with
at least one tabbable node": the trap now has a container, and in jsdom, which
has no layout, `tabbable` finds every node hidden. The committed test stubs
`getClientRects` for that reason; in a browser each panel has visible buttons,
as the setup and reset dialogs, trapped the same way on develop, always had.

## Sixth review, 2026-11-08

Four findings; each is fixed above or explained here. Severity as the
reviewers gave it. The regressions lens found round 5 clean.

| Finding                                                                                                                                                                                          | Severity | What changed                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHIP_NOT_VERIFIED` said a message becomes readable if the sender's device sends the key later; for a message sent before this device signed in, the usual case for that row, that never happens | high     | S13-2: "If this message's key was only delayed, it becomes readable here when the key arrives; a message sent before this device signed in stays unreadable here." The comment above the constant, the fourth-review paragraph of "Wording" ("used at once" → "tried at once") and the fourth-review row below are corrected; the chip test pins the new sentence and the old one's absence, and fails on round 5's text           |
| After a partway failure the form said to press Continue; if the backup had been created, that Continue was refused with a sentence pointing to a recovery key that was never shown               | medium   | S9-5: the form decides by the step that failed and, for the backup step, asks the homeserver again; where a backup may exist it offers no Continue and says the backup's key may not be in secret storage; in every partway stop it shows this attempt's recovery key and the next Continue uses it ("Fixed how"); `keyBackupCheck.ts`'s comment is rewritten; "What remains" says what the screen now says and what is still open |
| The warned reset replaces secret storage before the password prompt; a cancel there left the change, never showed the new key, and showed an empty error                                         | low      | S9-5: the cancel rejects with `SETUP_CONFIRM_CANCELLED_TEXT`; the form shows the new key under the `cross_signing` text and offers Continue, which finishes the reset with that key (a real-crypto test walks it); the reset screen and its JSX comment say secret storage changes before the confirmation. Reordering was considered and rejected ("Fixed how")                                                                   |
| `docs/e2ee.md` (on develop) said Blackout enforces recovery setup through an onboarding gate that requires cross-signing and recovery, and pointed to an Encryption tab                          | low      | Rewritten: the gate exists, checks only this device's cross-signing, and nothing calls it; the Encryption-tab paragraph is marked as Element's. Prettier re-indented one list in that file, unchanged in content. Listed with the other pointers in "What remains"                                                                                                                                                                 |

`KNOWN_ISSUES.md` BO-1 now says the nudge's backup can be restored by other
apps "once the setup finishes", and its 2026-11-08 note says a setup or reset
that stops after its first write keeps its new recovery key on screen and,
where it may have created a backup, offers no way on. `TRUST.md` and
`KNOWN_LIMITATIONS.md` describe neither the partway screen nor the chip's
not-verified sentence, so they are unchanged and the trust page is not rebuilt.

The round-5 verifiers' two probes ran once on this round's tree, copied into
`tests/unit/components/` and deleted afterwards. The reset-cancel probe now
ends on the partway screen: "The account confirmation step was cancelled, so
the setup stopped there." with the `cross_signing` text, the key and "Press
Continue to try the rest again with this same recovery key."; 500 ms after the
cancel the form was still in its loading state (Continue disabled), and the
partway screen came about 1 s after the cancel; the probe takes its snapshot at
500 ms (`scratchpad/v60/r7/probe-resetcancel-timing.json`).
The partway probe's first Continue now ends on the `backup_unclear` screen with
no Continue; its second, a submit it dispatches on the form, now starts
nothing, so the probe times out waiting for a refusal that no longer comes
(`scratchpad/v60/r7/probe-partway-on-fix-2.txt`). That forced submit reached
the check in the first run of the probe, before `handleSubmit` refused to start
an attempt when no Continue is offered; the guard and its test (mutation 33)
came from it.

## What remains

-   **The restore path (BO-1).** Blackout still has no screen that restores keys
    from a backup, receives them from another session, or verifies this device,
    and the SDK's room-key requests are off (`lib/rust-crypto/index.js:87`,
    `roomKeyRequestsEnabled = false`). Until that changes, on a new device a
    backup is useful only through another Matrix app; on the device that set it
    up, the SDK fetches a missing key from it by itself once another session has
    uploaded that key (`rust-crypto.js:2118-2121`). Every line here says so.
    Design revision 3's D13 (b) is the next PR.
-   **A backup stops growing once only Blackout sessions signed in after it
    are left** (third review, narrowed by the fourth). A Blackout session
    signed in after the backup was set up, which Blackout can't verify, neither
    trusts it nor holds its key, so the SDK never enables it there
    (`backup.js:282-292`) and never uploads to it (`maybeUploadKey`,
    `backup.js:333-337`, needs an active version). Someone who set a backup up
    in another app, signed that session out and now uses only such Blackout
    sessions has a backup that no longer gains keys: messages from then on
    cannot be restored from it anywhere. The exception, found by the fourth
    review: a Blackout session that holds the account's cross-signing identity,
    because it ran the from-scratch setup or the warned reset, trusts a backup
    that another app later creates in place of its own. That app signs the
    backup with its device key and, when it has it, the account's master key
    (`rust-crypto.js:1276-1291`, `signObject` → `olmMachine.sign`; the
    crypto-wasm 17.1.0 typings: "Sign the given message using our device key
    and if available cross-signing master key"), and a valid signature from
    "our own user identity, provided the identity is trusted" or from a trusted
    own device makes the backup trusted (`matrix_sdk_crypto_wasm.d.ts:3770-3780`).
    That session switches to it at its next check and uploads every key it has
    (`backup.js:282-306`); an upload to the deleted version forces the check
    (`backup.js:428-439`). The third review's "a Blackout session that did not
    set the backup up neither trusts it nor holds its key" was false of that
    session, and TRUST.md said the same; both now say "signed in later". TRUST.md,
    KNOWN_ISSUES BO-1 and the nudge's rows say whose keys a backup holds; the
    restore and verification path is what changes this.
-   **Sign out and the session list** (task #43): not built here; they wait for
    the operator's decisions. This record covers only the guard, which the
    design ships "in every option".
-   **`src/client/encryptionHealth.ts`** (follow-up S17 of the design) still
    classifies through `getKeyBackupInfo()`, so a diagnostics report can say
    `backup=no` when the check failed. `BackupRestore.tsx` (unmounted) uses
    `useKeyBackupInfo` the same way and must move to `checkAccountKeyState` before
    it is mounted.
-   **Two sentences of the warned reset flow** are untouched:
    `DeviceVerificationReset`'s "unless you have lost Recovery Key …" and
    `RecoveryKeyDisplay`'s "you will need it to verify your identity", which
    presume screens Blackout does not mount. Neither says anything false; both
    go with the restore-path PR. The third, "your encryption backup will be
    lost", was false in every run the guarded form lets through and is replaced
    (third review, "Wording").
-   **Two pointers to "Settings → Encryption"** remained after round 1 (the
    sixth review found a third, `docs/e2ee.md`'s Encryption tab, and an
    onboarding gate that doc said Blackout enforces; both corrected there):
    `docs/features/data-export.md:82`, corrected here, and
    `packages/api/src/services/dataExport/index.ts:91` (`MATRIX_HISTORY_HOW`, the
    `howToExport` note inside the export file), left for the key-export follow-up:
    it is outside the client and has its own tests, and the follow-up decides what
    to point to. Until then the export file names a screen that does not exist.
-   **`EnableVerification`** still renders nothing before a click when the verdict
    is not `'none'`, because its page is unmounted and its header row has no room
    for a sentence; after a click the overlay shows what the check found, in its
    own texts (third review; it showed the nudge's, which say Blackout has no
    screen that verifies the device or restores keys, false on that page). If
    the Devices page is mounted, give it the row text before the click too.
-   **"No screen" sentences hold only while those screens stay unmounted.** The
    nudge's rows (and the chip's offers, which repeat rows 1 and 2),
    `CHIP_BACKUP_EXISTS`, `CHIP_NOT_VERIFIED`, `SETUP_REFUSED_TEXT.backup`,
    TRUST.md and KNOWN_ISSUES say Blackout cannot restore keys or has no screen
    that verifies a device or restores keys. When `BackupRestore`,
    `ManualVerification`, `DeviceVerification` or `ReceiveSelfDeviceVerification`
    is mounted anywhere, every one of them must be re-read. The same goes for
    `LocalBackup` (the Devices page's key-file import,
    `importRoomKeysAsJson`): `CHIP_NOT_VERIFIED`'s "a message sent before this
    device signed in stays unreadable here" (sixth review) holds only while no
    screen imports keys.
-   **Two departures from the reviewed design, both deliberate** (third
    review). The chip no longer opens rows 1 and 2's flows straight from its
    overlay (§6.9's last line): "Why?" promised an explanation and the flows
    gave none, nor said the setup won't make the message readable; it now
    explains first. And rows 1 and 2's texts differ from §6.9's table: they say
    whose keys a backup holds and qualify "can't restore". The design's §4.10
    table also gives, for the unverified `'cross_signing'` row, "Blackout cannot
    use the new backup on this device anyway", which is not true of the device
    that runs a reset; this record's table no longer says it.
-   **`AppShell.tsx` imports `KeyBackupNudge` and never renders it** (pre-existing
    on develop, not this change's debt). Left so the diff stays on the guard.
-   **A narrower window inside the setup.** The form checks right before its
    first write, but its writes are not one step: `bootstrapSecretStorage`, then
    `bootstrapCrossSigning`, which with the fork's default Synapse config stops
    at the password prompt (above) for as long as the person takes, then
    `resetKeyBackup`. A backup that another Matrix app creates while the
    password prompt is open would still be deleted by `resetKeyBackup`, and
    cross-signing set up there in that window would be replaced by the upload
    the password unlocks. Closing
    it means re-checking before `resetKeyBackup` and, if a backup appeared,
    skipping it while still showing the new recovery key; the sixth review's
    partway screen now shows that key whenever an attempt stops after its first
    write, but the re-check before `resetKeyBackup` is still left for the
    restore-path PR.
-   **The account check does not read secret storage** (fifth review). Row 1
    goes on when the homeserver has no backup and no master key, and the setup
    then runs `bootstrapSecretStorage({ setupNewSecretStorage: true })`, which
    writes a new default key (`m.secret_storage.default_key`) over any that
    exists. The old key's description and the secrets stored under it stay in
    account data, readable with the old recovery key, but clients look under
    the default key. An account with secret storage but neither cross-signing
    nor a backup is rare (secret storage is normally set up with cross-signing,
    and a client cannot remove a master key), but the check does not rule it
    out. Reading `m.secret_storage.default_key` and treating a present key as
    not `'none'` would; it needs its own row text and is left for the
    restore-path PR.
-   **A setup that failed partway, then closed** (fifth review). The same form
    now finishes its own failed attempt (Fixed how). Its memory of the master
    key it uploaded lives in the form, so if the person closes the window
    first, the next click finds cross-signing that this device trusts and no
    backup, and opens the warned reset (row 2), whose text ("Anyone you have
    verified with will see security alerts … You almost certainly do not want
    to do this") overstates a reset of an identity minutes old; going through
    with it makes a new identity and a backup. The form's text after such a
    failure says to press Continue in that window, and (sixth review) shows the
    attempt's recovery key, which the next Continue uses again. If the person
    closes the window without saving it, the account's secret storage opens
    only with a key nobody has; after a `cross_signing` stop (a cancel at the
    password, say) it also holds cross-signing keys the homeserver never
    received, so it cannot verify the account's identity until a reset, here or
    in another app, replaces it.
-   **A backup the setup may have created, then stopped** (sixth review). If
    the backup's creation reached the homeserver and a later step failed (the
    answer was lost, or storing its key in secret storage failed), or the
    re-check after the failure did not answer, the form now says so
    (`backup_unclear`): the new cross-signing is on, secret storage opens only
    with the key shown, a backup this attempt created may exist whose key may
    not be in secret storage, and Blackout won't set up another. It offers no
    Continue, and nothing in Blackout can finish that setup: its backup key, if
    saved at all, is on this device only (`saveBackupDecryptionKey` runs before
    the store), and Blackout has no screen that stores it in secret storage or
    deletes the backup. The nudge then shows its backup row for that backup,
    whose "Another Matrix app … may be able to restore them" may not hold for
    it; the homeserver's answer does not say whether a backup's key is in
    secret storage, and reading `m.megolm_backup.v1` to tell would need its own
    row text. On the device that ran the attempt, the SDK may enable that
    backup at its next forced check, since the device holds its key and the
    backup is signed by it.
-   **`ManualVerification`** (on the unmounted Devices page only) calls
    `bootstrapCrossSigning({})` and `bootstrapSecretStorage({})` after the person
    enters a recovery key. Without `setupNew…` these keep what exists, but
    `bootstrapCrossSigning` creates new cross-signing keys when neither this
    device nor secret storage holds the private ones
    (`lib/rust-crypto/CrossSigningIdentity.js`), which would replace an identity
    whose keys are kept only elsewhere. It never touches the backup and does not
    open the setup, so it is outside this guard; it needs the account check too
    before that page is mounted.
-   **The Devices page's Reset** now refuses while a backup exists (behaviour
    change above). Decide, when that page is mounted, whether a reset the person
    chose there, with its warning, may delete a backup.
-   **Not an e2e.** The reproduction and the guard tests fake the homeserver at
    the HTTP level; nothing here ran against a Synapse. The 404 `M_NOT_FOUND`
    shape and the UIA shape are taken from the fork's Synapse source, and the
    design's §7.4 e2e (aborting `/room_keys/version`) is still to be written.
-   **The two style commits.** `b72164697f` (Verification.tsx) said prettier made
    "no non-whitespace change"; it re-wrapped two JSX lines (7+/2- under
    `git diff -w`) and, to keep the space between an inline element and the
    following text across the new line break, inserted a `{' '}` JSX expression
    between `</i>` and "button": one token added, rendered output unchanged. The
    round-1 fix commit's "no token changed" was therefore not literally true; this
    paragraph replaces it, not an amend. This round's `e884c29a7e`
    (DeviceVerificationSetup.tsx) moved one `{' '}` for the same reason and says so
    in its body, from a whitespace-stripped token comparison.
