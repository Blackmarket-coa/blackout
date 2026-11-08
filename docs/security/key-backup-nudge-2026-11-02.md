# The key-backup nudge deleted the account's key backup — S9, 2026-11-02

Finding S9 of the sign-out design review (task #43, design revision 3, §4.10 and
§6.9), live on `develop` at `0367abdd69`, high. Found by reading the code while
designing Sign out, which would have made the path below a step people take on
purpose. Fixed on the branch this record ships with; the standing rule applies:
fixed and explained, nothing baselined.

| ID  | Finding                                                                                                                                                                                                      | Where                                                                                                                                                                                                                            | Status                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| S9  | On a new device, the key-backup nudge and the undecryptable-message chip opened a setup that replaced the account's secret storage and cross-signing and deleted its server-side key backup, with no warning | `apps/blackout-client/src/app/features/settings/security/KeyBackupNudge.tsx`, `src/app/components/message/content/FallbackContent.tsx`, `src/app/features/settings/devices/Verification.tsx` (`EnableVerification`, not mounted) | fixed; restore path still missing (BO-1) |
| S13 | The nudge, the chip, TRUST.md and KNOWN_ISSUES.md said a backup does something Blackout cannot do                                                                                                            | the same two components, `TRUST.md`, `KNOWN_ISSUES.md`                                                                                                                                                                           | fixed                                    |

## What was found

`KeyBackupNudge` (mounted at `ClientLayout.tsx:792`, so on every screen of the
shipped app) decided what to show from two answers of the crypto layer:
`crypto.isCrossSigningReady()` and `crypto.getActiveSessionBackupVersion()`.
Both describe **this device**. On a device that has just signed in, neither
cross-signing's private keys nor the backup decryption key are present, so both
are false whatever the **account** has on its homeserver (matrix-js-sdk 40.2.0,
`lib/rust-crypto/rust-crypto.js:653-666`: cross-signing is "ready" only when the
identity is verified and the private keys are cached or reachable through secret
storage, which a new device has not unlocked).

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
`null`), and it caches a success for the life of the client
(`backup.js:122-125`), so the answer can be old. A guard built on it fails open
when the homeserver is unreachable. The second design review caught this in
revision 2.

### Effects

For a person who had set up cross-signing and a backup in another Matrix app
and then signed in to Blackout on a new browser: one click on a banner that
every screen showed, then "Continue" (and their password, which Synapse asks for
before a master key is replaced), and their backup was gone, their cross-signing
identity was replaced, and every device and contact that had verified them saw a
security warning. Blackout could not even use the new backup on that device
(there is no restore screen, BO-1), so the person gained nothing and lost the
only server-side copy of their message keys.

## Reproduced how

Two ways, both in `apps/blackout-client` with Vitest (jsdom), both through a
real `MatrixClient` whose `fetchFn` is a fake homeserver
(`tests/unit/helpers/fakeKeyHomeserver.ts`), so the SDK's own HTTP layer, error
classes and timeouts are what the code under test sees. The fake answers
`GET /room_keys/version` (the current version, or 404 `M_NOT_FOUND`),
`POST /keys/query` (`master_keys` with or without the account), the backup
`DELETE`/`POST`, `POST /keys/device_signing/upload` (401 with a password flow when
a master key already exists, as Synapse does), and account data (stored, and
echoed back after the answer, because secret storage waits for the echo). It
records every call and lists the destructive ones.

1. **Develop's code, real Rust crypto in memory** (`initRustCrypto({
useIndexedDB: false })`), not committed because it asserts the defect:
   `scratchpad/v60/s9.repro.test.tsx`, run with the fix stashed. The account has
   backup version `3` and master key `nqOvzeuGWT/…`; the device is new. - Nudge: `isCrossSigningReady()` false, `getActiveSessionBackupVersion()`
   null; the nudge rendered "Turn on encrypted message backup … Set up backup".
   Click → "Setup Device Verification" → Continue → "Account Password" (the
   fake's UIA, as Synapse) → password → the fake saw, in order: five
   account-data `PUT`s (new secret-storage key, default key, three
   cross-signing secrets), `POST /keys/device_signing/upload` twice (401, then
   with auth), `DELETE /room_keys/version/3`, `POST /room_keys/version`. After:
   backup version `4`, master key `xKi+3rU3…`. The recovery-key screen
   followed. No warning anywhere. 4.2 s. - Chip (account with a backup, no cross-signing): the chip read "Can't decrypt
   this message — it was sent before this device had your encrypted-message
   backup. Set up backup"; click → setup → Continue → the same writes without
   the UIA round trip; backup `3` deleted, `4` created. - One test-side shim: `PasswordStage` reads `form.passwordInput`, the form's
   named-property getter, which browsers provide and jsdom does not; the repro
   defines that property on the form before submitting. Nothing else is
   mocked besides `focus-trap-react`, which every overlay test in this
   repository renders as a pass-through because jsdom has no layout.
2. **Committed, on the fixed tree, still real crypto**:
   `tests/unit/components/DeviceVerificationSetup.deletesBackup.test.tsx` renders
   the real `DeviceVerificationSetup`, submits its form against an account with
   backup `3` and no master key, and asserts `DELETE /room_keys/version/3`,
   `POST /room_keys/version`, `POST /keys/device_signing/upload`, backup version
   `4`, a new master key and new secret storage. It is the fact that makes the
   guard necessary; it passes before and after the fix (the setup flow itself is
   unchanged, and no screen may open it without the account check).

The round-1 probe of 2026-11-02 (`scratchpad/v60/probe-calls.txt`) had already
shown the three SDK calls producing `DELETE /_matrix/client/v3/room_keys/version/3`
against the same fake; it ran in 2.4 s, which is what made real crypto in the
suite affordable.

## Fixed how

The reviewed plan is design revision 3, §4.10 ("The key-backup guard") and §6.9
(the wording table), with §0.3 point 1 (only a 404 `M_NOT_FOUND` means "no
backup"). Built as designed; one addition (the `EnableVerification` entry).

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
screen open the from-scratch setup.

### What each verdict offers (the same in every entry)

| verdict           | this device trusts the account's cross-signing | offered       | flow                      | why it is safe                                                                                                     |
| ----------------- | ---------------------------------------------- | ------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `'none'`          | —                                              | Set up backup | `DeviceVerificationSetup` | The homeserver answered 404 `M_NOT_FOUND` for the backup and has no master key for the account: nothing to replace |
| `'cross_signing'` | yes                                            | Set up backup | `DeviceVerificationReset` | No backup exists (the check answered), so none is deleted; the reset's own warning and confirm step stay           |
| `'cross_signing'` | no                                             | nothing       | —                         | A reset would replace the account's cross-signing, and Blackout cannot use the new backup on this device anyway    |
| `'backup'`        | —                                              | nothing       | —                         | Any setup or reset deletes the existing backup                                                                     |
| `'unknown'`       | —                                              | nothing       | —                         | The check failed                                                                                                   |

-   `encryptionPosture.ts`: `selectKeyBackupNudge` now requires `accountState`
    and returns the row above; `actions` is empty except in the two rows that
    offer one. The text of every verdict is in `KEY_BACKUP_NUDGE_TEXT`.
-   `KeyBackupNudge.tsx`: `refresh` runs the account check alongside the two
    device checks and renders nothing until all three have answered, so no action
    flashes that the answer would remove. The primary button and the overlay
    render only when the verdict has an action; "Not now" and ✕ always render.
-   `FallbackContent.tsx`: the chip reads `CHIP_TEXT` ("Can't decrypt this
    message: this device doesn't have its key.") with a `Why?` chip. A click opens
    the overlay with `CHIP_CHECKING`, runs the same inputs, then shows the setup
    (row 1), the reset (row 2) or a short explanation (`CHIP_BACKUP_EXISTS`,
    `CHIP_NOT_VERIFIED`, `CHIP_CHECK_FAILED`) with Close. `useCrossSigningActive`
    is no longer used to choose.
-   `Verification.tsx` `EnableVerification` (the unmounted third entry): the
    Enable button renders only once the account check answered `'none'`.
-   Behaviour change, deliberate: an unverified device of an account that has
    cross-signing is no longer offered the warned reset from the chip (develop
    offered it from account data alone). The person can still reset from another
    Matrix app, where the reset's consequences are visible.

### Wording (S13)

Every backup line now says what a backup does today: it keeps copies of message
keys on the homeserver, locked with a recovery key; another Matrix app signed in
with that key can restore older messages from it; Blackout has no screen that
restores from a backup, so here a backup does not bring older messages back after
a new sign-in. The two verdicts that promised recovery "when you sign in on a new
device" and said "so you don't lose access" are gone, and a test pins that no
verdict matches those phrases. The comments in both components, which called the
nudge "the forward fix" and the setup "non-destructive", are rewritten.

`TRUST.md` ("Open, not hidden"): the BO-1 sentence no longer says the problem
happens "without key backup set up"; it says Blackout has no restore screen, so
it happens even when a backup exists, and that a backup still lets another
Matrix app restore. The trust page is rebuilt from it. `KNOWN_ISSUES.md` BO-1: the
cause and workaround are corrected (the old workaround pointed to a "Settings →
Encryption" that never existed and to the "Set up backup" action above), and a
dated note points here. `docs/audits/2026-08-10-encryption-audit.md` is a dated
record and is not edited.

## Tests

All in `apps/blackout-client`, Vitest. `fakeKeyHomeserver.ts` is the seam for
every one of them (the design's §7: fake the endpoint through a real client,
not the SDK call). `keyBackupRender.tsx` renders a component under
`MatrixClientProvider` with that client, and `stubCrypto` stands in for this
device's crypto state with spies on the three setup calls.

| File                                                                         | Tests | What it pins                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/client/keyBackupCheck.test.ts` (new)                             | 18    | every answer of both endpoints, incl. 404 `M_UNRECOGNIZED`, 500 JSON, 502 HTML, a rejected fetch, no answer in 10 s (fake timers), 200 without `version`; no cache; every row of the precedence                                                                                                            |
| `tests/unit/features/settings/KeyBackupNudge.test.tsx` (new)                 | 12    | the setup's three calls when the one safe row is submitted; S9's exact scenario offers nothing and reaches none of them; failed check (rejected, 500, 404 other) offers nothing; each row's text; nothing renders before the answer; nothing once this device's backup is active; the negative wording pin |
| `tests/unit/components/FallbackContent.chip.test.tsx` (new)                  | 8     | label and text; checking; each verdict's panel or flow; no destructive call in the three refusing rows; Close                                                                                                                                                                                              |
| `tests/unit/features/settings/devices/EnableVerification.test.tsx` (new)     | 5     | Enable only on `'none'`; nothing on backup, failed check or a server master key; nothing asked when not visible                                                                                                                                                                                            |
| `tests/unit/components/DeviceVerificationSetup.deletesBackup.test.tsx` (new) | 1     | the fact (above), real crypto                                                                                                                                                                                                                                                                              |
| `src/app/features/settings/security/encryptionPosture.test.ts` (updated)     | 18    | the two existing cases pass `accountState` and keep every assertion; the three refusing rows; whole-text pins; the negative wording pin                                                                                                                                                                    |
| `tests/unit/features/settings/security/keyBackupNudge.test.ts` (updated)     | 6     | the three existing cases pass `accountState` and keep every assertion; the three refusing rows                                                                                                                                                                                                             |

68 tests in 7 files pass on the fixed tree.

### Fail without the fix

With the `src` changes stashed (develop's code, the new tests in place), the
same 7 files: **27 failed, 19 passed**, and `keyBackupCheck.test.ts` could not
load (its module does not exist on develop). Per file: nudge 12/12 failed, chip
8/8, `EnableVerification` 4/5 (the "not visible renders nothing" case holds on
develop too), the selector's new rows 3/6; `deletesBackup` passed, as it must;
`encryptionPosture.test.ts` lives under `src` and so ran in its develop form
(14 pass) — its new assertions fail on develop by `TypeError` on the undefined
`KEY_BACKUP_NUDGE_TEXT`, as the first run before the stash showed.

### Mutation checks (one line reverted, the named tests run, the line restored)

| #   | Mutation                                                                                                                  | Result                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | `checkBackupState`: any failure of `/room_keys/version` read as `'none'` (develop's behaviour through `getKeyBackupInfo`) | 18 failed: keyBackupCheck 6, nudge 7, chip 4, Enable 1 |
| 2   | `accountKeyVerdict`: the `'backup'` branch dropped                                                                        | 17 failed: nudge 9, chip 6, keyBackupCheck 1, Enable 1 |
| 3   | `KeyBackupNudge`: the primary button rendered unconditionally                                                             | 9 of 12 nudge tests failed                             |
| 4   | `selectKeyBackupNudge`: the unverified `'cross_signing'` row offers the action                                            | 3 failed: encryptionPosture 1, selector 1, nudge 1     |
| 5   | Chip: `'backup'` opens the setup                                                                                          | 6 of 8 chip tests failed                               |
| 6   | `EnableVerification`: `offered = visible` (the check ignored)                                                             | 3 of 5 failed                                          |

Each source file was compared byte-for-byte with its pre-mutation copy
afterwards.

## Gates

Observed on the fixed tree (commit `0dc627f87b`; this record is added after
it), Node 22, from `apps/blackout-client` unless noted.

| Gate                            | Command                                                                                                                                           | Result                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| client typecheck                | `npx tsc --noEmit` (covers `src`); the new test files were type-checked once through a temporary tsconfig that included them, then it was removed | exit 0, both                                                                                                                                                                                                                         |
| eslint, changed `src` files     | `npx eslint --max-warnings=0` on the six changed or new `src` files                                                                               | exit 0. The client's eslint config covers `src/**` only, so the test files are not linted by it                                                                                                                                      |
| client unit suite, as CI        | `pnpm --filter @blackout/client run test:coverage`, after `@blackout/core` and `@blackout/design` were built as CI does                           | 524 files, 3694 passed, 3 skipped (pre-existing; none in the files of this change), 0 unhandled errors; coverage 45.54 % statements, 36.63 branches, 36.43 functions, 46.61 lines, above the floors 41.3 / 32.2 / 32.5 / 42.3; 236 s |
| client integration suite, as CI | `pnpm --filter @blackout/client run test:integration`                                                                                             | 3 files, 13 passed                                                                                                                                                                                                                   |
| client build                    | `pnpm --filter @blackout/client run build`                                                                                                        | both Vite bundles built (9.5 s and 0.9 s), exit 0                                                                                                                                                                                    |
| prettier                        | root `npx prettier --check` on every changed file                                                                                                 | clean. This record needed two passes: prettier re-indents a nested list on the second                                                                                                                                                |
| trust page                      | `node tools/ci/build-trust-page.mjs --check` after the rebuild                                                                                    | OK                                                                                                                                                                                                                                   |
| gitleaks 8.21.2                 | `gitleaks git --log-opts="0367abdd69..HEAD"` before this record's commit                                                                          | 17 commits scanned, no leaks; rerun over the whole branch after the docs commit, reported with the branch                                                                                                                            |
| load rule                       | the heavy suites started when the 1-minute load was 0.29 (poll log kept in the scratchpad)                                                        | kept                                                                                                                                                                                                                                 |

## What remains

-   **The restore path (BO-1).** Blackout still has no screen that restores keys
    from a backup, receives them from another session, or verifies this device.
    Until it does, a backup is useful to the person only through another Matrix
    app, and every line here says so. Design revision 3's D13 (b) is the next PR.
-   **Sign out and the session list** (task #43): not built here; they wait for
    the operator's decisions. This record covers only the guard, which the
    design ships "in every option".
-   **`src/client/encryptionHealth.ts`** (follow-up S17 of the design) still
    classifies through `getKeyBackupInfo()`, so a diagnostics report can say
    `backup=no` when the check failed. `BackupRestore.tsx` (unmounted) uses
    `useKeyBackupInfo` the same way and must move to `checkAccountKeyState` before
    it is mounted.
-   **Two vague recovery-key sentences** are untouched: `DeviceVerificationReset`'s
    "unless you have lost Recovery Key …" and `RecoveryKeyDisplay`'s "you will
    need it to verify your identity" presume screens Blackout does not mount.
    Neither says "in Blackout", so neither is false; both are vague (design §9).
-   **`EnableVerification` renders nothing** when the verdict is not `'none'`,
    with no explanation, because its page is unmounted and its header row has no
    room that could be checked here. If the Devices page is mounted, give it the
    nudge's text for the other rows.
-   **Not an e2e.** The reproduction and the guard tests fake the homeserver at
    the HTTP level; nothing here ran against a Synapse. The 404 `M_NOT_FOUND`
    shape and the UIA shape are taken from the fork's Synapse source, and the
    design's §7.4 e2e (aborting `/room_keys/version`) is still to be written.
-   The `style(client)` commit before the fix says prettier made "no
    non-whitespace change" to `Verification.tsx`; it also re-wrapped two JSX
    lines (7+/2- under `git diff -w`). No token changed. Recorded here and in the
    fix commit rather than amended.
