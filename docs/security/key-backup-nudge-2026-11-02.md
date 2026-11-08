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
same branch, new commits only.

| ID   | Finding                                                                                                                                                                                                                                                                                                                               | Where                                                                                                                                                                                                                            | Status                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| S9   | On a new device, the key-backup nudge and the undecryptable-message chip opened a setup that replaced the account's secret storage and cross-signing and deleted its server-side key backup, with no warning                                                                                                                          | `apps/blackout-client/src/app/features/settings/security/KeyBackupNudge.tsx`, `src/app/components/message/content/FallbackContent.tsx`, `src/app/features/settings/devices/Verification.tsx` (`EnableVerification`, not mounted) | fixed; restore path still missing (BO-1) |
| S9-2 | The guard's verdict was fetched once, and the nudge's and the Devices page's buttons opened the setup from that stored answer, so cross-signing and a backup created on another device after the check were replaced and deleted without warning; a rejecting device check escaped as an unhandled rejection                          | the same `KeyBackupNudge.tsx` and `Verification.tsx`; `src/app/components/DeviceVerificationSetup.tsx` (the form itself checked nothing)                                                                                         | fixed (second review, 2026-11-08)        |
| S9-3 | A check's late answer replaced a later one: the answer to a superseded click, or to a click whose overlay was closed, set the overlay (the setup over a fresh "backup" answer, or a closed overlay reopened) and brought the nudge's button back; the chip's "Why?" opened the setup or the reset in rows 1 and 2 with no explanation | `src/app/components/KeyBackupSetupGuard.tsx`, `KeyBackupNudge.tsx`, `Verification.tsx`, `FallbackContent.tsx`                                                                                                                    | fixed (third review, 2026-11-08)         |
| S13  | The nudge, the chip, TRUST.md and KNOWN_ISSUES.md said a backup does something Blackout cannot do                                                                                                                                                                                                                                     | the same two components, `TRUST.md`, `KNOWN_ISSUES.md`                                                                                                                                                                           | fixed                                    |

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
`null`), and it keeps its last answer until the SDK's next forced check (at
start-up, `rust-crypto.js:124`; on the user's own identity update, `:1872`;
after `resetKeyBackup`, `:1244`; after an upload failure of an active backup,
`backup.js:439`; or when the app calls `checkKeyBackupAndEnable`, `:1215`), so
the answer can be hours old. (Rounds 1 and 2 said "for the life of the
client", citing `backup.js:122-125`; that is the unforced path, and every call
above forces the check.) A guard built on it fails open
when the homeserver is unreachable. The second design review caught this in
revision 2.

### S9-2: the verdict was stale at the click (second review)

The first fix asked the homeserver in `refresh`, at mount and on
`CryptoEvent.KeyBackupStatus`, stored the verdict, and the "Set up backup" and
"Enable" buttons opened `DeviceVerificationSetup` from that stored value. Nothing
refreshes it when another device of the account sets things up: the SDK re-checks
its own backup only at init (`rust-crypto.js:124`), on the user's own identity
update (`rust-crypto.js:1872`) and after an upload failure of an active backup
(`backup.js:439`), and it emits `KeyBackupStatus` only when THIS device enables or
disables backup (`backup.js:322,345`). A verdict could therefore be hours old.
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
      because a master key exists) → password → the fake saw, in order: five
      account-data `PUT`s (new secret-storage key, default key, three
      cross-signing secrets), `POST /keys/device_signing/upload` twice (401,
      then with auth), `DELETE /room_keys/version/3`, `POST /room_keys/version`.
      After: backup version `4` and a new master key. The recovery-key screen
      followed. No warning anywhere. 4.2 s.
    - Chip (account with a backup, no cross-signing): the chip read "Can't
      decrypt this message — it was sent before this device had your
      encrypted-message backup. Set up backup"; click → setup → Continue → the
      same writes; the fake asked for no password because the account had no
      master key (the MSC3967 shape; default Synapse would have asked here too);
      backup `3` deleted, `4` created.
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

| verdict           | this device trusts the account's cross-signing | offered       | flow                      | why it is safe                                                                                                                     |
| ----------------- | ---------------------------------------------- | ------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `'none'`          | —                                              | Set up backup | `DeviceVerificationSetup` | The homeserver answered 404 `M_NOT_FOUND` for the backup and has no master key for the account: nothing to replace                 |
| `'cross_signing'` | yes                                            | Set up backup | `DeviceVerificationReset` | No backup exists (the check answered), so none is deleted; the reset's own warning and confirm step stay                           |
| `'cross_signing'` | no                                             | nothing       | —                         | A reset would replace the account's cross-signing, and every device and contact that verified the account would see a new identity |
| `'backup'`        | —                                              | nothing       | —                         | Any setup or reset deletes the existing backup                                                                                     |
| `'unknown'`       | —                                              | nothing       | —                         | The check failed                                                                                                                   |

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

`TRUST.md` ("Open, not hidden"): the BO-1 sentence no longer says the problem
happens "without key backup set up"; it says Blackout has no restore screen, so
it happens even when a backup exists, and that a backup still lets another
Matrix app restore (third review: "restore the messages whose keys are in it; a
Blackout session that didn't set the backup up doesn't add its keys to it"). The
trust page is rebuilt from it. `KNOWN_ISSUES.md` BO-1: the
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

| File                                                                         | Tests | What it pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/client/keyBackupCheck.test.ts` (new)                             | 26    | every answer of both endpoints, incl. 404 `M_UNRECOGNIZED`, 500 JSON, 502 HTML, a rejected fetch, no answer in 10 s (fake timers), 200 without `version`; no cache; every row of the precedence; `setupRefusal` for every state in both modes, and its texts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tests/unit/features/settings/KeyBackupNudge.test.tsx` (new)                 | 28    | the setup's three calls when the one safe row is submitted; S9's exact scenario offers nothing and reaches none of them; failed check (rejected, 500, 404 other) offers nothing; each row's text; nothing renders before the answer; nothing once this device's backup is active; the negative wording pin; five stale-click cases (the click re-asks; the overlay and the banner follow the fresh answer; a fresh `'none'` opens the setup with one more `GET`); a rejecting device check at mount (hidden, one warning, nothing escapes) and at the click (the unknown text); the recovery key stays on screen when the banner hides; (third review) three ordering cases (a late click answer, a refresh that answers after a click, a refresh that waits for a click), four snooze cases ("Not now" stores a week and a remount on the same store stays hidden, the week's end shows it again, the ✕, the unknown banner, snoozing with the setup open), and a brand-new account with real crypto through the nudge (backup 1 and a master key, no `DELETE`, the banner hides) |
| `tests/unit/components/FallbackContent.chip.test.tsx` (new)                  | 16    | label and text; checking; each verdict's panel; no destructive call in the three refusing rows; Close; a rejecting device check (the check-failed text, nothing escapes); the chip text; (third review) rows 1 and 2 explain first and "Set up backup" re-checks before the flow; a backup created after the explanation; the offer texts; four ordering cases (a late answer after a re-click, after a close, after the offer's button and a close; the legitimate path still reaches the setup calls)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `tests/unit/features/settings/devices/EnableVerification.test.tsx` (new)     | 11    | Enable only on `'none'`; nothing on backup, failed check or a server master key; nothing asked when not visible; the stale click (the backup text, the button goes); a fresh `'none'` re-checks; a rejecting device check; (third review) a late click answer; its own texts say nothing about screens; the not-verified text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tests/unit/components/DeviceVerificationSetup.guard.test.tsx` (new)         | 10    | the form's own check: each refusal with its text and no write (backup, master key, failed backup check, failed cross-signing check), the goes-on case, the check at the submit rather than at the open (a backup created in between is refused); the warned reset goes on past cross-signing, refuses a backup and a failed check; (third review) the reset's warning says a backup stops it and no longer that a backup will be lost                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `tests/unit/components/DeviceVerificationSetup.deletesBackup.test.tsx` (new) | 2     | the fact (above) through the three SDK calls, real crypto; the component refuses before its first write against the same account, real crypto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/app/features/settings/security/encryptionPosture.test.ts` (updated)     | 19    | the two existing cases pass `accountState` and keep every assertion; the three refusing rows; whole-text pins; the negative wording pin; the unknown text names both checks; row 2 names no next screen; the overlay text map; (third review) rows 1 and 2 say whose keys a backup holds, row 1 that a later Blackout session doesn't add to it, row 2's "can't restore" is qualified; the nudge's overlay texts have no `offer`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tests/unit/features/settings/security/keyBackupNudge.test.ts` (updated)     | 6     | the three existing cases pass `accountState` and keep every assertion; the three refusing rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

118 tests in 8 files pass on the fixed tree, 0 unhandled errors (round 2: 100;
round 1: 68 in 7).

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
swaps and the mutations below are the behavioural evidence.

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

### Mutation checks (one line reverted, the named tests run, the line restored)

| #   | Mutation                                                                                                                  | Result                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `checkBackupState`: any failure of `/room_keys/version` read as `'none'` (develop's behaviour through `getKeyBackupInfo`) | 18 failed: keyBackupCheck 6, nudge 7, chip 4, Enable 1                                                                                                                                                                                                                                                                           |
| 2   | `accountKeyVerdict`: the `'backup'` branch dropped                                                                        | 17 failed: nudge 9, chip 6, keyBackupCheck 1, Enable 1                                                                                                                                                                                                                                                                           |
| 3   | `KeyBackupNudge`: the primary button rendered unconditionally                                                             | 9 of 12 nudge tests failed                                                                                                                                                                                                                                                                                                       |
| 4   | `selectKeyBackupNudge`: the unverified `'cross_signing'` row offers the action                                            | 3 failed: encryptionPosture 1, selector 1, nudge 1                                                                                                                                                                                                                                                                               |
| 5   | Chip: `'backup'` opens the setup                                                                                          | 6 of 8 chip tests failed                                                                                                                                                                                                                                                                                                         |
| 6   | `EnableVerification`: `offered = visible` (the check ignored)                                                             | 3 of 5 failed                                                                                                                                                                                                                                                                                                                    |
| 7   | (round 2) `setupRefusal` always returns null                                                                              | 13 failed: keyBackupCheck 5, guard 7, deletesBackup 1 (the component refuses); the two "goes on" cases pass (first run: 14, the two "goes on" by the timeout artefact)                                                                                                                                                           |
| 8   | (round 2) `encryptionPosture.ts`: the two round-1 texts back (unknown names one check; row 2 names the next screen)       | 2 of 19 failed                                                                                                                                                                                                                                                                                                                   |
| 9   | (round 2) `checkForSetup` without its try/catch                                                                           | 3 of 38 failed: one per entry, the rejecting-device-check case at the click                                                                                                                                                                                                                                                      |
| 10  | (round 2) `handleSubmit` drops the promise again                                                                          | 9 of 9 passed, 7 unhandled rejections, exit 1 (the suite-level error the second review reported)                                                                                                                                                                                                                                 |
| 11  | (round 2) `accountKeyVerdict` always returns `'none'` (the guard's core removed, the form's check kept)                   | 24 of 100 failed: nudge 11, chip 5, Enable 4, keyBackupCheck 4: at least one case of every row that offers nothing (`'backup'`, `'unknown'`, unverified `'cross_signing'`) in each entry, and the reset row in the nudge and the chip; the guard file's refusals all pass, because the form's own check does not use the verdict |

| 12 | (round 3) the guard keeps no turns (`open()` sets the panel from every answer; `close()` takes none) | 5 of 118 failed: the chip's three late-answer cases, the nudge's late click answer, `EnableVerification`'s late click answer |
| 13 | (round 3) the nudge's refresh applies its account answer whatever its turn | 1 of 118 failed: the refresh that answers after a click |
| 14 | (round 3) the nudge's refresh does not wait for a click's check in flight | 1 of 118 failed: the refresh that waits |
| 15 | (round 3) the nudge's click takes no account turn | 1 of 118 failed: the refresh that answers after a click. A second check of the click's own turn before applying its answer was also tried: 0 failed, because the guard already drops a superseded click and no refresh starts while a click is in flight; that check was removed (`f1f047f0a9`) |
| 16 | (round 3) the chip passes no `offer` | 5 of 118 failed: rows 1 and 2, the backup-after-explanation case, the offer's late answer, the legitimate path |
| 17 | (round 3) the hook ignores `offer` (`offerFirst` skipped) | the same 5 of 118 |
| 18 | (round 3) the reset's warning back to "your encryption backup will be lost" | 1 of 118 failed |
| 19 | (round 3) rows 1 and 2 back to their round-2 texts | 2 of 118 failed: the two selector cases |
| 20 | (round 3) `EnableVerification` back to the nudge's texts | 1 of 118 failed: its texts case |

Each source file was compared byte-for-byte with its pre-mutation copy
afterwards; in round 3 each mutation was undone with `git checkout HEAD -- src`
and `git diff` was empty after each (`scratchpad/v60/r4/mut-*.txt`). Mutations 7 and 11 were run again over all eight files after the
`waitFor` change (`scratchpad/v60/r3/mut-*.txt`).

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

## What remains

-   **The restore path (BO-1).** Blackout still has no screen that restores keys
    from a backup, receives them from another session, or verifies this device,
    and the SDK's room-key requests are off (`lib/rust-crypto/index.js:87`,
    `roomKeyRequestsEnabled = false`). Until that changes, on a new device a
    backup is useful only through another Matrix app; on the device that set it
    up, the SDK fetches a missing key from it by itself once another session has
    uploaded that key (`rust-crypto.js:2118-2121`). Every line here says so.
    Design revision 3's D13 (b) is the next PR.
-   **A backup stops growing once only Blackout sessions are left** (third
    review). A Blackout session that did not set the backup up neither trusts it
    nor holds its key, so the SDK never enables it there (`backup.js:282-292`)
    and never uploads to it (`maybeUploadKey`, `backup.js:333-337`, needs an
    active version). Someone who set a backup up in another app, signed that
    session out and now uses only Blackout has a backup that no longer gains
    keys: messages from then on cannot be restored from it anywhere. TRUST.md,
    KNOWN_ISSUES BO-1 and the nudge's rows now say whose keys a backup holds;
    the restore and verification path is what changes this.
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
-   **Two pointers to "Settings → Encryption"** remained after round 1:
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
    is mounted anywhere, every one of them must be re-read.
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
    skipping it while still showing the new recovery key (secret storage and
    cross-signing are already replaced by then, so failing there would lose the
    key that opens them); that needs its own screen text and is left for the
    restore-path PR.
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
