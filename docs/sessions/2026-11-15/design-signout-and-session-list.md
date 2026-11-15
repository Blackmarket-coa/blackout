No feature flag has to be flipped and no fork change is needed to make Sign out and the session list reachable, so the design continues below.

# v57 design, revision 3: Sign out and the session list in the shipped app (task #43)

-   Worktree `/home/user/blackout/.claude/worktrees/v57-signout-sessions`, branch
    `claude/bmc-transmutation-strategy-6jenal-v57`, from `origin/develop` `65ceaa7483`.
-   Operator decision of 2026-11-02: schedule #43 ("mount sign-out and the session list in
    the shipped app"). Origin: PR #989, "Decisions for the operator", item 2.
-   Inputs: `scratchpad/v57/scout.md`, the first design (`scratchpad/v57/design-r1.md`), the
    second (`scratchpad/v57/design-r2.md`), and the critic's reviews of both. I re-read every
    point of the second review against the tree at `65ceaa7483`, the installed
    `matrix-js-sdk@40.2.0` and the fork's Synapse. All sixteen held. §0.3 lists them with
    what I checked and where each is answered. Nothing here was run in a browser; "read"
    means read from the tree.
-   Client paths are relative to `apps/blackout-client/src/` unless they start with `apps/`,
    `packages/`, `playwright`, `node_modules/` or a document name. `SDK/` means
    `node_modules/.pnpm/matrix-js-sdk@40.2.0/node_modules/matrix-js-sdk/lib/`.
-   Rules the build follows: never flip a flag or set an env in committed config; never skip,
    disable or quarantine a test; never widen a lint or type exclusion; never push, amend or
    rebase. Run heavy suites only when the 1-minute load average is under 3.5 (poll every
    30 s, at most 15 min), and never two at once. Every user-facing sentence must be true.
    Each finding gets a fix or an explanation in `docs/security/`.

---

## 0. Decisions, and what changed since the earlier designs

### 0.1 Decisions left for the operator

**Blocks the build** (answer before the build starts):

| #   | Question                                                                                                                                                                                                                                                                                                      | Options                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Recommendation                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| D12 | On a multi-replica API (the Helm chart defaults to `api.replicaCount: 3`, `deploy/helm/blackout/values.yaml:15`; `deploy/kubernetes/phase4/blackout-api.yaml:17` sets `replicas: 3`), can the new screens say Blackout's server _refuses_ a token, or that "Sign out every Blackout session" _ends_ sessions? | **W-A**: schedule the build after #58's store work lands, and ship the outcome wording ("refuses this token from now on", "ends both"). **W-B**: build now, with wording that claims only what holds on every supported deployment: what the server answered, plus the 24-hour expiry that every token carries in its signature. W-B also rewords the two revoke-all strings already on Release keys, because the Sessions screen reuses that component (§6.7). | W-B now. Switch to W-A in a small follow-up once #58 has landed and been verified. |

The reason D12 exists must not go into any committed text, commit message or PR body.
§6 gives both wordings in full. W-B's sentences describe requests and answers, and the
signed 24-hour expiry, which is enough to make them true and reveals nothing.

**Blocks merge** (the build follows the default; the operator confirms or overturns it
before merge):

| #   | Question                                                                                                                                                                                                                                                                      | Default the build follows                                                                                                                                                                                                                                                                                                                                                               | Alternatives                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D13 | Signing out turns BO-1 into something the user can trigger. The shipped app cannot restore message keys after a sign-in (§6.2.3), and its backup nudge deletes the account's existing backup on a new device (finding S9). What ships with Sign out?                          | **(a) Guard**: in this PR, the nudge and the decryption-failure chip open the from-scratch setup only when the homeserver answered that the account has no backup and no cross-signing (§4.10). Every backup text says what a backup does today. The sign-out dialog says plainly that Blackout cannot restore keys, and when this browser may hold the only copy.                      | **(b)** Mount a reviewed restore path first (recovery key entry, backup restore, incoming self-verification: a narrowed D11) as its own PR, and hold Sign out until it ships. **(c)** (a) now, (b) as the next PR. **(d)** (a), plus mount the existing `LocalBackup` component ("Export message keys" / "Import message keys": a password-protected file, the standard Matrix key-export format) in Sessions, and point the sign-out dialog to it (§4.12). This is the smallest complete way to keep keys across a sign-out: it needs no verification, no secret storage and no server backup. Its cost is a file holding every message key this browser has, on the person's disk, which the panic wipe cannot delete. §4.12 has the review of `util/cryptE2ERoomKeys.js` and the strings, so (d) is one add-on commit either way. Recommended: **(d) in this PR, then (b) as the next PR.** If the operator answers (d) before the build reaches §4.12, the build includes it; otherwise (a) ships and (d) is offered as that commit. |
| D4  | Other accounts stored on the device (burner identities)                                                                                                                                                                                                                       | Sign out ends only the account in use. The confirmation names the other accounts. The app then opens on the sign-in screen, which lists every account still stored on this device with "Continue as …". The automatic end of a session (`handleSessionLoggedOut`) also leaves no account active in the full app, so the app never opens as another identity unless the person picks it. | (a) Open as the next stored account, which is what a reload does today. (b) Also add "Sign out of every account on this device". The default makes the sign-in screen show which accounts are stored here. Today a reload opens as one of them, which reveals more.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D7  | What else Sign out removes from this browser                                                                                                                                                                                                                                  | Keep everything else, and list it in the confirmation (§6.2.4).                                                                                                                                                                                                                                                                                                                         | (b) Also remove unsent drafts, which are keyed per room, so the next account to open that room here sees them. (c) Recommended: run the panic wipe's `SENSITIVE_TRACE_PREFIXES` removal (drafts, burner list, primary marker, steganography passphrases, data-broker request details, ephemeral view counts, reading positions) when no other account stays stored on the device. Remove only drafts when another account stays, because removing the burner list would orphan the burners that are still stored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D6  | Should the panic wipe's "Also forget this device's sign-ins" now end the sessions on the server? (#989 decision 1)                                                                                                                                                            | No change in behaviour. Its text now points to Settings → Sessions.                                                                                                                                                                                                                                                                                                                     | Make the wipe end server sessions (best effort, with a timeout). That needs its own design: offline use, several accounts, speed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D10 | Accept THREAT_MODEL residual risk R12: "Ending a device's Matrix session leaves the Blackout API tokens it already holds working until they expire (at most 24 hours), and a refresh token that a modified client kept working until it goes unused for 30 days (by default)" | Write it in KNOWN_LIMITATIONS and the A7 cell. Add an R12 row only if the operator accepts it.                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Recommendations** (the build follows them; the operator can overturn them in review):

| #   | Question                                                   | Default                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Where Sign out lives                                       | A ⚙ Settings link in the AppShell top bar on every page (`PrimaryNavBar` above 750 px, `MobileTopBar` at 750 px or less). It opens a new static `/settings` route that renders `SettingsPage`. A new **Sessions** section there holds Sign out and the session list. In the DM/den view, the quick switcher's Settings results open that view's own Settings overlay. |
| D2  | Does this device's Sign out ask the API to refuse its JWT? | Yes, `POST /v1/auth/sign-out`, as the panel does.                                                                                                                                                                                                                                                                                                                     |
| D3  | `POST /logout` fails or gets no answer                     | Nothing changes and the person stays signed in. The screen says the homeserver did not confirm. A second, explicit step, "Forget this device here anyway", says the session stays valid and listed.                                                                                                                                                                   |
| D5  | "Sign out all other sessions"                              | No new button. The existing multi-select in `OtherDevices` does it, with UIA. After a success the screen shows "Sign out every Blackout session" right there.                                                                                                                                                                                                         |
| D8  | MAS (`SYNAPSE_AUTH_MODE=mas`, off by default)              | Do not mount `AuthMetadataProvider`. Under MSC3861, `delete_devices` is not registered (`synapse/rest/client/devices.py:563-567`), so the screen says this homeserver does not let apps sign other sessions out. Record that MAS is untested.                                                                                                                         |
| D9  | How the e2e runs                                           | A committed spec with its own Playwright config. It is run by hand once, against a homeserver started from this repo's fork, a local API and the production client build, and the run is recorded in the security document. CI does not run it, because CI has no homeserver.                                                                                         |
| D11 | Mount the whole legacy `Devices` page?                     | No. Mount only the session parts: `DeviceTile`, `OtherDevices`, `useDeviceList` and the rewritten `LogoutDialog`. Verification and recovery stay unmounted; D13 (b) is the place to mount a reviewed subset. Key export and import (`LocalBackup`) are mounted only under D13 (d).                                                                                    |
| D14 | Which sign-in method the "getting back in" line names      | One line that covers every method the full app offers: the password, the single sign-on used, or the account number (§6.2.2). The alternative, recording the method at sign-in and naming only that one, needs a new stored-session field and a migration of the session map for one sentence.                                                                        |

### 0.2 The first review (of revision 1), point by point

| #   | Critic's point                                                                                      | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Where it is answered                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The backup lines promise a recovery the app cannot do, and the nudge deletes the existing backup    | Holds. One correction: the "Set up backup" chip picks its flow from account data (`useCrossSigningActive`, `FallbackContent.tsx:62,95`), not from `isCrossSigningReady`. So it opens the warned reset flow when the account has cross-signing, and the unwarned setup flow only when it has none. The nudge (`KeyBackupNudge.tsx:71,185-188`) uses `isCrossSigningReady`, which is false on every new device (`SDK/rust-crypto/rust-crypto.js:653-666`). So it opens the setup flow, which resets secret storage and cross-signing and deletes every backup with no warning (`DeviceVerificationSetup.tsx:146-158`; `SDK/rust-crypto/rust-crypto.js:1232-1245`; `SDK/rust-crypto/backup.js:497-509,537-551`). | §6.2.3 (new key lines), §4.10 (guard), D13, finding S9, A7 cell §8.2, TRUST.md and KNOWN_ISSUES §8.4-8.5                                                                                                                                                                                                         |
| 2   | Nothing says the person needs their credentials back; for a burner, signing out is final            | Holds (`burnerSession.ts:46-71`; `accountNumberAuth.ts:16-31`; the API discards the burner's password, `packages/api/src/services/burnerIdentities.ts:44-45,95`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | §6.2.2, tests §7.1                                                                                                                                                                                                                                                                                               |
| 3   | `clearClientStores` never settles while another tab holds a store, so the sign-out hangs            | Holds (`SDK/client.js:702-750`: the Rust-store delete only logs on `blocked`; `SDK/store/indexeddb-local-backend.js:320-334`; `SDK/crypto/store/indexeddb-crypto-store.js:182-200`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | §4.2 step 5: no `clearStores` call at all; every database goes through a tracked delete with a timeout. Unit case 17, mandatory e2e test 3.                                                                                                                                                                      |
| 4   | Multi-replica API: the refusal lines may not be true                                                | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | D12, W-A/W-B strings throughout §6                                                                                                                                                                                                                                                                               |
| 5   | "The browser's copy" ignores copies earlier sessions left                                           | Holds (`initMatrix.ts:188-207`: the full app never prunes its SDK-prefixed sync DBs; the legacy name lacks the `matrix-js-sdk:` prefix)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | §4.2 step 5 (enumerate `indexedDB.databases()`, with an exact user-match rule), narrowed text when the browser cannot list databases, unit cases 15-16, e2e test 3 seeds stale stores                                                                                                                            |
| 6   | The "what stays" lists leave out privacy-relevant data, including the burner list                   | Holds (`app/features/panic/localTraces.ts:20-28`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | §6.2.4 lists every `PANIC_REMOVES` item and says drafts are per room; D7 (c); step 6c also removes the SDK's sync-filter keys, which name the user                                                                                                                                                               |
| 7   | Signing out a lost device leaves its other accounts signed in, and nothing says so                  | Holds. Worse: the app lists a burner only on the device that made it (`burnersAtom` is in localStorage, `burnerAtoms.ts:14`; the client never calls `GET /v1/identities`), so the suggested "burn them from Settings → Burner identities" is not possible from another device.                                                                                                                                                                                                                                                                                                                                                                                                                                | `OTHERS_OTHER_ACCOUNTS` §6.5, `RELEASE_KEYS_LOST_DEVICE` §6.8, A7, KNOWN_LIMITATIONS                                                                                                                                                                                                                             |
| 8   | Sign out is missing while the list loads or fails                                                   | Holds (`DeviceTile.tsx:33-43`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | §3.1: the button is outside the tile and renders in every state; unit cases in §7.1                                                                                                                                                                                                                              |
| 9   | "Already ended" can be false with two tabs (a refreshed token is deleted while the device lives on) | Holds (`client/auth.ts:225,265` request refresh tokens; Synapse default `refreshable_access_token_lifetime` 5m, `config/registration.py:155-161`; `replace_refresh_token`, `storage/databases/main/registration.py:1841-1847`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | §4.2 step 2: retry with the stored token, then with a fresh token from the stored refresh token. The outcome `already_ended` is gone; `token_refused` makes no claim that the device was deleted. A `SessionLoggedOut` during the attempt also maps to `token_refused`.                                          |
| 10  | `/v1/auth/sign-out` does not answer 200 for any token                                               | Holds (`packages/api/src/index.ts:180`, `middleware/auth.ts:15-27`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | §4.2 step 4: 401 `session_revoked` and 401 `unauthorized` map to `refused`; unit case 9                                                                                                                                                                                                                          |
| 11  | Strings false on edge paths                                                                         | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `othersNotConfirmed` with reloaded/not-reloaded variants; `otherSessionsLeft(n)` from the last loaded list; "30 days by default" (`REFRESH_TOKEN_TTL_SECONDS`, `packages/api/src/services/refreshToken.ts:6-13`); the PasswordStage hint names the account number (§6.6)                                         |
| 12  | Reuse claims that were wrong; e2e nondeterminism                                                    | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | §3.1 (SessionsSettings splits the list), §4.8.7 (`onBusyChange` and a busy ref in the trap owner), §4.7 (`switchToSession`), §2.4 (the quick switcher opens ClientLayout's overlay), §7.4 (`serviceWorkers: 'block'`; server-side checks by `GET /devices` from another session; `whoami` only with a pre-check) |

### 0.3 The second review (of revision 2), point by point

| #   | Critic's point                                                                           | What I checked                                                                                                                                                                                                                                                                                                                                                                                                               | Verdict                                                                                                 | Where it is answered                                                                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A failed backup check reads as "no backup"                                               | `SDK/rust-crypto/backup.js:254-266`: `doCheckKeyBackup` catches the `requestKeyBackupVersion` error, sets `serverBackupInfo = undefined` and returns, without setting `checkedForBackup`. `:88-96` returns that field, and `rust-crypto.js:1188-1193` turns `undefined` into `null`. `backup.js:810-823` maps only `M_NOT_FOUND` to `null`. `:122-125` skips the request once a check succeeded, so the answer can be stale. | Holds                                                                                                   | New `client/keyBackupCheck.ts` (§4.8.11): its own `GET /room_keys/version` and `POST /keys/query`, where only a 404 `M_NOT_FOUND` means "none". Used by the dialog, the nudge and the chip. `getKeyBackupInfo()` is no longer read anywhere this change touches. Unit tests fake the endpoints (§7.1); e2e Test 1 aborts `/room_keys/version` (§7.4). |
| 2   | "You'll need the password" is wrong for single sign-on                                   | `LoginForm.tsx:163-179` offers `m.login.sso`/`m.login.cas` in the full app; `client/auth.ts:254-283` `loginWithToken`. Synapse offers the password stage only when the account has a password hash (`handlers/auth.py:424-431`).                                                                                                                                                                                             | Holds                                                                                                   | §6.2.2 `SIGN_OUT_CREDENTIALS`, D14, §8.1 "Getting back in", unit test                                                                                                                                                                                                                                                                                 |
| 3   | The nudge's text promises a recovery Blackout cannot do                                  | `encryptionPosture.ts:119-126`; `KeyBackupNudge.tsx:28-46` ("the forward fix", "recoverable on future devices"); the chip's "sent before this device had your encrypted‑message backup" (`FallbackContent.tsx:67-70`)                                                                                                                                                                                                        | Holds                                                                                                   | §6.9 rewrites every nudge verdict and the chip text; the comments in both files (§4.10); KNOWN_ISSUES BO-1 (§8.5); TRUST.md (§8.4)                                                                                                                                                                                                                    |
| 4   | `LocalBackup` is missing from D11/D13                                                    | `devices/LocalBackup.tsx:24,26,175`; `Devices.tsx:158` is its only mount. `util/cryptE2ERoomKeys.js` is a port of matrix-react-sdk's `MegolmExportEncryption.js` (header comment, line 1).                                                                                                                                                                                                                                   | Holds                                                                                                   | D13 (d), §4.12 (review notes, mount, strings), D11                                                                                                                                                                                                                                                                                                    |
| 5   | Forget-anyway can leave a fresh API token behind                                         | `blackoutApiSession.ts:162-189` (an exchange started after a bump keeps its token), `:212-233` (`restoreActiveSession()`), `app/sdk/client.ts:70-87`                                                                                                                                                                                                                                                                         | Holds                                                                                                   | A sign-out latch (§4.2 step 3a, §4.8.3): from that point this tab neither reads nor mints an API token until the next account change. Unit case 22.                                                                                                                                                                                                   |
| 6   | The dialog never says when the loss is total                                             | §6.2.3 of revision 2 varied only with the backup check                                                                                                                                                                                                                                                                                                                                                                       | Holds                                                                                                   | §6.2.3: the dialog loads the session list itself when it opens and shows `SIGN_OUT_KEYS_LAST_COPY`, `signOutKeysOthersHold(n)` or `SIGN_OUT_KEYS_SESSIONS_UNKNOWN`; unit cases for 0, >0 and unknown                                                                                                                                                  |
| 7   | An exchange in flight at sign-in or switch still writes the previous account's JWT       | `blackoutApiSession.ts:147-154` (no bump), `:178-189`; `sessionSwitch.ts:27-30`                                                                                                                                                                                                                                                                                                                                              | Holds                                                                                                   | `resetApiSessionForAccountChange()` (bump + clear + latch off) at sign-in, `switchToSession` and the automatic end (§4.8.3-4.8.4). The 401-retry path keeps the plain clear, and §4.8.3 says why. Unit cases.                                                                                                                                         |
| 8   | Step 4 may refuse another account's token                                                | One key per namespace (`blackoutApiSession.ts:14-16`). The JWT's `username` claim is the Matrix localpart on every path that mints the full app's token (`routes/auth.ts:679,736`, `services/auth.ts:279-300`).                                                                                                                                                                                                              | Holds                                                                                                   | §4.2 step 4: a token is sent only when its `username` claim is this account's localpart; one that isn't is neither sent nor removed. `API_NONE` (§6.4) for "no token of this account". Unit case 11b. The wider single-key problem is finding S15, explained (§8.3).                                                                                  |
| 9   | Hiding the actions leaves the button                                                     | `KeyBackupNudge.tsx:103,162-171,185-189`                                                                                                                                                                                                                                                                                                                                                                                     | Holds                                                                                                   | §4.10: the primary button and the setup overlay render only when `verdict.actions.length > 0`; KeyBackupNudge test                                                                                                                                                                                                                                    |
| 10  | Push stops after Sign out on the mobile shell                                            | `NotificationTokenBroker.tsx:8-9,76-77`; Synapse deletes the pusher with the device                                                                                                                                                                                                                                                                                                                                          | Holds. The same happens after the automatic end, which this change makes reachable from another device. | §4.2 step 6d and §4.7: remove `blackout.mobile.pushToken.registered` (keep `blackout.mobile.pushToken`) on sign-out and in `handleSessionLoggedOut`; unit cases. Finding S16.                                                                                                                                                                         |
| 11  | "Still signed in on this device" can be false                                            | `sessionManager.ts:60-84` checks nothing                                                                                                                                                                                                                                                                                                                                                                                     | Holds                                                                                                   | §6.8 `STORED_ACCOUNTS_HEADING` = `Saved sign-ins on this device` + `STORED_ACCOUNTS_STALE`                                                                                                                                                                                                                                                            |
| 12  | Wrong e2e count; no encrypted room; Test 2 checks too little                             | `synapse/rest/admin/users.py:654` passes the body to `_create_registration_details`; `rest/client/register.py:801` logs a device in unless `inhibit_login`                                                                                                                                                                                                                                                                   | Holds                                                                                                   | §7.4: `inhibit_login: true`; Node creates an encrypted room; the abort case; Test 2 asserts no `/v1/auth/sign-out` and an unchanged token; new Test 4 (only session, no backup)                                                                                                                                                                       |
| 13  | `isUserStoreName` deletes another account's legacy store                                 | `initMatrix.ts:171-172` (legacy names are `${prefix}${userId}`). The same flaw is live in `cleanupStaleStoresForUser`'s `startsWith(`${prefix}${userId}:`)` (`initMatrix.ts:186-201`), which runs at every sign-in.                                                                                                                                                                                                          | Holds, and wider than stated                                                                            | §4.8.6: the rule matches only `userId + ':' + d` where `d` has no colon and is not all digits (a port is always all digits; Synapse's device IDs are ten upper-case letters, `handlers/device.py:519`). Legacy names only by explicit name. Boot pruning uses the same rule (finding S14). Unit case 14.                                              |
| 14  | A session list already ships                                                             | `DataTransparencySettings.tsx:38,120-160`, the same `['devices']` query                                                                                                                                                                                                                                                                                                                                                      | Holds                                                                                                   | §3.0; a "To sign a session out, open Sessions" link there; its error state; e2e step                                                                                                                                                                                                                                                                  |
| 15  | The flow picker takes the server's first flow                                            | `ActionUIA.tsx:62-74` uses `supportedFlows[0]`; `pickUIAFlow` has no caller. Synapse builds the flow list from a `set` (`handlers/auth.py:419-431`), so its order is not fixed.                                                                                                                                                                                                                                              | Holds                                                                                                   | §5.1 step 4: `ActionUIAFlowsLoader` uses `pickUIAFlow(supportedFlows) ?? supportedFlows[0]`; unit case                                                                                                                                                                                                                                                |
| 16  | `LOCAL_PENDING` blames a tab it can't name; a signed-out burner still offers "Switch to" | `sessionSwitch.ts:24-26` throws; `BurnerIdentitiesPanel.tsx:108-121`; `useBurnerIdentities.ts:101-115` burns with the primary's token                                                                                                                                                                                                                                                                                        | Holds                                                                                                   | §6.4 `LOCAL_BLOCKED` vs `LOCAL_PENDING`; §4.7 and §6.8 (the panel hides "Switch to" when no session is saved); §6.2.2 `signOutBurner`                                                                                                                                                                                                                 |

---

## 1. Flags and the fork

-   `SettingsPage` and its sections carry no flag. The new section gets no `flag` field
    (`SettingsPage.tsx:44-51`). `PrimaryNavBar` and `MobileTopBar` render whenever
    `shellAppShell` is on, and it is on by default (`app/core/features/featureFlags.ts:431`).
    The new `/settings` route goes in `destinationRoutes` (`main.tsx:263-311`), which is not
    flag-gated, as `EXPLORE_PATH` is. It is not a registry route: registry customizations
    require a `capabilityGate`, and a static route keeps working when the API is down.
-   `DialogHost`'s `__BLACKOUT_AUDIT__` is a runtime switch that Playwright sets. This change
    does not depend on it.
-   Do not add a flag. A default-off flag would leave the task undone, and a default-on flag
    would be a flag decision.
-   Fork: only upstream Synapse endpoints are used: `POST /logout`
    (`synapse/rest/client/logout.py`), `POST /refresh`, `GET /devices`, `PUT /devices/{id}`
    and `POST /delete_devices` (`synapse/rest/client/devices.py`), and, for the backup check,
    `GET /room_keys/version` (`synapse/rest/client/room_keys.py`) and `POST /keys/query`. None
    is patched, so `PATCHES.md` needs no entry. API: `POST /v1/auth/sign-out`
    (`packages/api/src/routes/auth.ts:898-914`) and `POST /v1/auth/sessions/revoke`
    (`:916-925`) exist, so no API change is needed.

---

## 2. Where the user reaches it (D1)

Path: any page → ⚙ Settings in the top bar → `/settings` → Account & identity → **Sessions**.
In the DM/den view (ClientLayout), the existing Settings buttons open the same `SettingsPage`
in that view's overlay, so Sessions is there too.

### 2.1 `/settings` route

-   New `app/pages/settings/SettingsRoute.tsx`: renders `SettingsPage` (lazy; it takes no props,
    `SettingsPage.tsx:219`) in a container with `padding: 16` and `min-height: 100%`.
-   `main.tsx` `destinationRoutes`: add `{ path: SETTINGS_PATH, element: <SettingsRoute /> }`
    before `...authRedirectRoutes`. Add `SETTINGS_PATH = '/settings'` to `app/pages/paths.ts`.
    The flag-gated registry routes under `/settings/...` are deeper paths and do not clash.
-   `resolveShellMode('/settings')` returns `'other'` (`modeRouter.ts`): the MobileTopBar title is
    empty and a back button shows. No change is needed there.
-   `tools/audit-navigation/route-manifest.ts`: add `{ id: 'settings', path: '/settings',
mode: 'other' }` so the crawler visits it.

### 2.2 Settings links in the AppShell chrome

-   `app/pages/shell/PrimaryNavBar.tsx`: a `<Link to={SETTINGS_PATH}>` between search and
    profile, with `aria-label="Settings"`, `title="Settings"`,
    `data-testid="primary-nav-bar-settings"`, glyph `⚙️` and `RIGHT_BUTTON_STYLE`. It sets
    `aria-current="page"` when `isShellPathActive(pathname, '/settings')`.
-   `app/pages/shell/MobileTopBar.tsx`: when `trailing` is undefined, render the same link
    (`data-testid="mobile-top-bar-settings"`, `BACK_BUTTON_STYLE`) in the trailing slot. This
    mirrors the default-leading pattern (`:84-111`). `AppShell` passes no `trailing` today
    (`AppShell.tsx:160`).
-   This covers 751-1124 px when the shell is on: AppShell is "desktop" above 750 px
    (`designBreakpoints.mobileMaxPx = 750`), so `PrimaryNavBar` shows there. ClientLayout
    renders inside AppShell, so the link shows above the DM/den view as well.

### 2.3 The Sessions section

-   `settingsAtoms.ts`: add `'sessions'` to `SettingsSectionId`.
-   `SettingsPage.tsx`: lazy `SessionsSettings` from `../sessions/SessionsSettings`. Add
    `{ id: 'sessions', label: SESSIONS_LABEL, summary: SESSIONS_SUMMARY, component }` with no
    `flag`. In group `identity`, put `'sessions'` second, right after `'account'`.
-   Account summary `'Profile, credentials, and active sessions'` → `'Profile and profile card'`
    (§6.8).

### 2.4 Quick switcher

-   `QuickSwitcher` is mounted only inside ClientLayout (`ClientLayout.tsx:785-789`), which has
    its own overlay. So the switcher opens that overlay instead of navigating away: - `app/features/navigation/QuickSwitcher.tsx`: add `{ id: 'sessions', title: 'Sessions',
subtitle: 'Sign out, see and end sessions' }` to `DEFAULT_SETTINGS` (`:203-213`), and a new
    optional prop `onSettingsPicked?: (id: SettingsSectionId) => void`, called in the Settings
    branch (`:581-583`) after `setSettingsPage(...)`. - `ClientLayout.tsx`: widen `openSettingsSection` (`:485-488`) to take any
    `SettingsSectionId`, and pass `onSettingsPicked={openSettingsSection}`. Today these
    results set the section and open nothing.

### 2.5 Unchanged, and recorded

-   With `shellAppShell` off (not the default) there is no top bar. Settings then opens only
    from ClientLayout, and not at 751-1124 px. KNOWN_LIMITATIONS says so (§8.1). ClientLayout's
    tablet layout is out of scope.

---

## 3. The Sessions section: what it shows

New folder `app/features/sessions/`:

-   `SessionsSettings.tsx` (default export)
-   `sessionsText.ts`: every string in §6, exported so tests can pin them, as `PanicSettings.tsx`
    does
-   `SignOutButton.tsx`: owns the overlay and focus trap, §4.8.7
-   `RevokeAllBlackoutSessions.tsx`: extracted, §3.4
-   `SignOutNotice.tsx` and `StoredAccounts.tsx`: §4.7

It does not mount `Devices` (D11).

### 3.0 The list that already ships, and how the two relate

-   Settings → Privacy & notifications → **Your data** (`DataTransparencySettings`, always
    listed) already shows the account's sessions: name, device ID, last seen time and IP, and
    "(this device)", from the same `['devices']` query (`DataTransparencySettings.tsx:38,
120-160`; `useDeviceList.ts:19-35`). It is read-only: it offers no way to end one.
-   It stays where it is, as the "what is stored about you" view. This change adds, under its
    "Sessions / devices" heading, `DATA_SESSIONS_LINK` (§6.8): a text button that sets
    `settingsPageAtom` to `'sessions'`, which switches the open Settings page to Sessions. It
    works the same in the `/settings` route and in ClientLayout's overlay, because both render
    `SettingsPage` from that atom.
-   It reads the new third element of `useDeviceList()` (§3.2). On a load error it shows
    `devicesLoadFailed(detail)` instead of "Loading sessions…" for ever, which is what it shows
    today when the query fails (`devices === undefined` on error, `:124-125`).
-   The two lists share one query, so a sign-out under Sessions refreshes both.

### 3.1 Layout (top to bottom)

1. `<h3>Sessions</h3>` and `sessionsIntro(userId)`.
2. **This device**: `<h4>This device</h4>`, then by list state:

    - loading: `DeviceTilePlaceholder` and `SESSIONS_LOADING`;
    - error: `devicesLoadFailed(detail)` and **Try again** (calls `refresh`);
    - loaded with this device: one `DeviceTile` for it (expand shows Device ID, last IP
      address and Device Key, as today);
    - loaded without it: `THIS_DEVICE_NOT_LISTED`.

    Below that, **in every state**, `<SignOutButton />` with the label `SIGN_OUT_BUTTON`. It is
    not placed in the tile's `options`, so it does not depend on the list. It takes no
    session count: the dialog loads its own when it opens (§4.8.7), so the count it shows and
    reports is fresh even when the section's list is old, failed or still loading. The heading
    is what marks the current device.

3. **Other sessions**: `SessionsSettings` splits the list itself with
   `useSplitCurrentDevice(devices)` (`app/hooks/useDeviceList.ts:61-70`), as `Devices.tsx:48`
   does. `OtherDevices` does no split. Then
   `<OtherDevices devices={others} refreshDeviceList={refresh} showVerification={false}
onSignedOut={…} />`. `OtherDevices` sorts by `last_seen_ts` where both rows have one
   (`OtherDevices.tsx:134-137`), so the text never says "newest first". With no other
   devices it shows `OTHER_SESSIONS_NONE`, instead of the `null` `OtherDevices` returns today.
   Nothing renders here while the list is loading or failed.
4. **Blackout API sessions**: `<h4>Blackout API sessions</h4>`, `API_SESSIONS_TEXT`, and
   `<RevokeAllBlackoutSessions apiClient={createAuthorizedApiClient(null)} />`.

### 3.2 Data

-   `useDeviceList()`: `GET /_matrix/client/v3/devices` (`useDeviceList.ts:21-53`). Change the
    return to `[devices, refresh, state]`, with
    `state: { status: 'loading' | 'error' | 'success'; error?: unknown }` from react-query.
    `refresh` returns `Promise<boolean>`: `true` when the refetch succeeded (`!result.isError`).
    Existing callers destructure two elements and ignore the result, so they are unchanged,
    except `DataTransparencySettings`, which now reads the state (§3.0).
-   Each row (from Synapse) shows `display_name`, or else `device_id`, and "Last activity"
    (`last_seen_ts`). Expanding a row shows `device_id` and `last_seen_ip`. Every Blackout
    login names its device "Blackout Client" (`client/auth.ts:224,264,310`), so the time, ID
    and IP are what tell them apart, together with Rename.
-   Rename stays as it is (`PUT /devices/{id}`, `DeviceTile.tsx:118`), with the hint in §6.6.

### 3.3 `OtherDevices.tsx` changes

-   Strings per §6.5. Give `DeviceDeleteBtn` an `aria-label` (it is an icon-only chip today).
-   Prop type `refreshDeviceList: () => Promise<unknown>`. The component reads a `boolean`
    result when there is one.
-   New optional prop `onSignedOut?: (count: number) => void`, called on success before
    `setDeleted(new Set())`.
-   Error branch: classify `deleteError` (§5.3) instead of the raw "Failed to logout devices!
    …". After any error other than UIA, `const reloaded = await refreshDeviceList()`, and show
    `OTHERS_LIST_RELOADED` only when `reloaded === true`, else `OTHERS_LIST_NOT_RELOADED`.
-   The MAS branch (`authMetadata`) stays as it is. It stays dead because no provider is
    mounted (D8).

### 3.4 `RevokeAllBlackoutSessions`

-   Extract the "If a device is lost" revoke-all block from `ReleaseKeysPanel.tsx`: the
    section at `:1084-1112`, `revokeAllSessions` at `:650-664`, and the `busy`/`notice`
    handling it needs. Same DOM and the same SDK call
    (`createAuthActions(apiClient).revokeAllSessions()` → `POST /v1/auth/sessions/revoke`).
    The strings `REVOKE_ALL_SESSIONS`, `REVOKE_ALL_SESSIONS_CONFIRM` and
    `REVOKE_ALL_SESSIONS_DONE` move to `sessionsText.ts` and are re-exported from
    `ReleaseKeysPanel.tsx`, so existing imports keep working. Under W-B, the CONFIRM and DONE
    texts change (§6.7).
-   `ReleaseKeysPanel` renders the new component in "If a device is lost".
    `ReleaseKeysPanel.test.tsx` (26 tests) must keep passing. Its pinned strings change only
    where §6 changes them.

---

## 4. Sign out of this device: exactly what it does, in order

### 4.1 New module `client/signOut.ts`

It lives in `client/` because the no-direct-fetch lint guard covers `features/`, `pages/`,
`components/` and `platform/` (comment at `app/sdk/client.ts:101-102`), and
`sessionLength.ts` already makes bare homeserver calls from here.

```ts
export type HomeserverOutcome =
  | { kind: 'ended' }                          // 200 from POST /logout, on any attempt
  | { kind: 'token_refused' }                  // every attempt refused (§4.2 step 2), or SessionLoggedOut seen during the attempt
  | { kind: 'not_confirmed'; detail: string }  // no answer, timeout, or any other status
  | { kind: 'not_told' };                      // "Forget this device here anyway"
export type ApiOutcome = 'refused' | 'not_confirmed' | 'none';   // 'none': no unexpired token of this account was found
export type LocalOutcome = 'deleted' | 'blocked' | 'pending' | 'failed';
// 'blocked': some delete got a `blocked` event (another connection holds it);
// 'pending': none did, but some delete had no answer within 5 s
export interface SignOutReport {
  userId: string; deviceId: string;
  homeserver: HomeserverOutcome; api: ApiOutcome;
  local: LocalOutcome; localScope: 'all' | 'this_session';
  localSettled: Promise<'deleted' | 'failed'>;
  otherAccounts: string[];                     // user ids still stored on this device
  otherSessionCount: number | undefined;       // from the dialog's own load (§4.8.7), passed in
}
export interface SignOutInput { otherSessionCount?: number }
export const signOutOfThisDevice = (store: AtomStore, input?: SignOutInput): Promise<SignOutReport>;
export const forgetThisDeviceHere = (store: AtomStore, input?: SignOutInput): Promise<SignOutReport>;
```

On `not_confirmed`, `signOutOfThisDevice` resolves with that outcome and has changed
nothing. Otherwise it has finished every step and set the logged-out state. Its promise
always settles: every network step and every database delete is bounded by a timer (step 2:
30 s in all; step 4: 10 s per token; step 5: 5 s per database before it counts as pending).

### 4.2 Steps and their order

| Step | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Why this order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Capture: `client = store.get(matrixClientAtom)`, `userId`, `deviceId`, `baseUrl`, `token0 = client.getAccessToken()`, `apiToken0 = readBlackoutApiToken()`, `otherSessionCount` from the input                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Later steps must not depend on state a concurrent teardown could clear                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1    | `suspendSessionLoggedOut(client)` (new in `initMatrix.ts`, §4.8.2). While suspended, `handleSessionLoggedOut` does nothing for this client and records that the event fired.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Once the server deletes the device, any in-flight request on the running client gets `M_UNKNOWN_TOKEN`. The SDK then emits `SessionLoggedOut`, and today's handler would clear the API token before step 4 can refuse it, clear the session, and unmount the router in the middle of the flow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2    | Homeserver, with bare `fetch`, each request with its own 15 s `AbortController` and the whole step capped at 30 s. **2a**: `POST /_matrix/client/v3/logout` with `Authorization: Bearer token0`, `Content-Type: application/json`, body `{}`. **2b**: if 2a got 401 `M_UNKNOWN_TOKEN`, read `getSessionForUser(userId)` from localStorage. If its `accessToken` differs from `token0`, repeat the logout with it. **2c**: if that also got 401 `M_UNKNOWN_TOKEN` (or 2b had no different token) and the stored session has a `refreshToken`, send `POST /_matrix/client/v3/refresh` with it. If that returns an `access_token`, repeat the logout with it. Nothing from this refresh is saved. Outcomes: any logout 200 → `ended`. Every attempt refused (a 401 `M_UNKNOWN_TOKEN` on the logouts, and the refresh absent or answered 401/403) → `token_refused`. Anything else (network error, abort, any other 4xx, 5xx, 404 `M_UNRECOGNIZED` under MAS without compat) → `not_confirmed`, with `detail` = `'no answer'` or `` `it answered ${status} ${errcode ?? ''}` ``. If the outcome is `not_confirmed` but step 1 saw `SessionLoggedOut`, the outcome is `token_refused`: the SDK found the token unusable, which shows this device can no longer use it, not that the device was deleted.                    | First, because the Matrix token is what mints new API tokens (`/v1/auth/matrix/exchange` checks it with `whoami`). Once the device is gone, nothing can mint a new JWT from it, so refusing the JWT afterwards sticks. Synapse accepts an expired access token here (`allow_expired=True`, `logout.py`) and deletes the device with its access and refresh tokens, pushers and E2E keys (`handlers/device.py:563-590`). The retries exist because logins ask for refresh tokens (`client/auth.ts:225,265`) and Synapse's default access-token lifetime is 5 minutes. A refresh by another tab deletes the access token this tab holds (`registration.py:1841-1847`), while the device and the newest token live on. The refresh function saves each new token to the session map (`initMatrix.ts:263-277`), so the stored token is the newest one. A bare fetch avoids the SDK's refresh-and-retry and its events, and makes the timeout real.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2x   | On `not_confirmed` (and no event seen): `resumeSessionLoggedOut(client)` re-arms the handler. Return the report. Change nothing else.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | D3: the person is still signed in and nothing local changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 3a   | `beginApiSignOut()` (§4.8.3): bump the session generation and set the module-level sign-out latch. From here until the next account change in this tab, `ensureBlackoutApiToken` resolves `null` without reading storage or starting an exchange, `readBlackoutApiToken` returns `null`, and any exchange that resolves drops its token and asks the API to refuse it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Steps 3-5 can take several seconds (step 5 up to 5 s per pending delete), the router is still mounted, and under "Forget this device here anyway" the Matrix token is still valid on the homeserver. Without the latch, any `/v1` call in that window would mint a new JWT through `restoreActiveSession()` (the account is still in the session map until 6a) and write it after the screen says this device deleted its copy, and the API would also mint a 30-day refresh token for it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3    | `stopMatrixClient(client)`. It stops sync and crypto. The Rust crypto stop closes the OlmMachine, which closes its IndexedDB connections (`SDK/rust-crypto/rust-crypto.js:154-171`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | So the deletes in step 5 are not blocked by this tab's own Rust store connection. The SDK's two JavaScript stores close on `versionchange` by themselves (`SDK/store/indexeddb-local-backend.js:181`, `SDK/crypto/store/indexeddb-crypto-store-backend.js:37-42`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4    | API: `revokeBlackoutApiTokens(userId, [apiToken0])` (§4.8.3). Candidates: the distinct tokens in `{apiToken0, the token in storage now}` (the storage read bypasses the latch). A candidate is **this account's** only when `apiTokenOwner(t)` (the JWT payload's `username` claim, decoded as `isBlackoutTokenExpired` decodes `exp`) equals `localpartOf(userId)` (the text between `@` and the first `:`). For each candidate that is this account's: remove it from `apiTokenKey()` if it is the one stored there now, and, if it is unexpired, send `POST /v1/auth/sign-out` with `Authorization: Bearer <t>`, with a 10 s cap each. A candidate that is not this account's (another tab running another account wrote it, or its payload can't be read) is neither sent nor removed. The legacy `blackoutApiToken` key is removed in every case: nothing in the tree writes it. Per sent token: 200 → refused; 401 with `code` `session_revoked` or `unauthorized` → refused; anything else, or no answer → not confirmed. All sent refused → `refused`. Any not confirmed → `not_confirmed`. Nothing sent → `none`.                                                                                                                                                                                            | Removal comes before the request, so no feature request sends this account's JWT again. The token is read twice because an exchange may have written a newer one since step 0. The owner check exists because the full app keeps one token key for every account (`blackoutApiSession.ts:14-16`), so with two tabs on two accounts the key can hold the other account's JWT, and refusing it would sign that tab out of the API while leaving this account's token unrefused. The `username` claim is the Matrix localpart for every token the full app holds: it gets them only from `/v1/auth/matrix/exchange`, which takes the localpart from `whoami` and finds the user by it (`routes/auth.ts:679,736`), and `signJwtWithMeta` writes that username into the payload (`services/auth.ts:279-300`). One API serves one homeserver, so a localpart names one account there. How the API answers: `authMiddleware` runs on `/v1/*` before the handler (`packages/api/src/index.ts:180`). It answers 401 `unauthorized` for a token that does not verify (bad signature or expired) and 401 `session_revoked` for one that is denylisted or older than the user's cutoff (`middleware/auth.ts:15-27`). Either way that server refuses the token. Otherwise the handler denylists the token's `jti` and answers 200 (`routes/auth.ts:898-914`). What the screen may say about a `refused` outcome depends on D12 (§6.4). |
| 5    | Local databases, through `deleteIndexedDbTracked` only (§4.8.6), all in parallel. **`clearStores` is not called.** Names: (i) always the explicit names: this device's `matrix-js-sdk:${syncStoreDbName(u,d)}`, `${syncStoreDbName(u,d)}` and `${cryptoStoreDbName(u,d)}`; the legacy un-suffixed `${syncStorePrefix()}${u}` and `${cryptoStorePrefix()}${u}`, each with and without `matrix-js-sdk:`; and the full app's Rust store, `matrix-js-sdk::matrix-sdk-crypto` and `matrix-js-sdk::matrix-sdk-crypto-meta` (`initMatrix.ts:322-325`; `storageNamespace.ts:45`). (ii) If `indexedDB.databases` is a function and doesn't throw, also every listed name for which `isUserStoreName(name, u)` holds (§4.8.6): the device-suffixed sync and crypto stores of this account's earlier sessions, with and without the prefix. `localScope = 'all'`. If it is missing or throws, only (i): `localScope = 'this_session'`. A name in (i) that doesn't exist deletes as a no-op success. Each delete settles its `first` result on `success`, `error` or `blocked`, or after 5 s with no event (`timeout`). All `deleted` → `deleted`. Any `error` → `failed`. Otherwise any `blocked` → `blocked`, else any `timeout` → `pending`. `localSettled` resolves once every unsettled delete reaches `success` or `error`. | `clearStores` resolves only on success or error: on `blocked` it only logs, so another tab holding a store would leave the sign-out hanging for ever (§0.2 point 3). The full app's Rust store uses the SDK's default name for every account. The store this client just loaded holds this account's keys, since the Rust SDK refuses to open a store made for another account. `deleteIndexedDb` resolves on `onblocked` (`initMatrix.ts:146-157`), which would let the screen say "deleted" while another tab still holds the database.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 6    | Session map and traces. **6a**: `forgetSession(userId)` (new in `sessionManager.ts`) deletes `sessions[userId]` and sets `activeUserId = null`. `otherAccounts = Object.keys(loadSessionMap().sessions)`. **6b**: D7 removals, if the operator chose (b) or (c). **6c**: remove the SDK's sync-filter keys for this user, `mxjssdk_memory_filter_FILTER_SYNC_${userId}` and `mxjssdk_memory_filter_FILTER_SYNC_${userId}_LEFT_ROOMS` (`SDK/sync.js:81-85`, `SDK/store/memory.js:232-257`). **6d**: remove `MOBILE_PUSH_TOKEN_REGISTERED_STORAGE_KEY` (`blackout.mobile.pushToken.registered`, `platform/NotificationTokenBroker.tsx:9`). Keep `blackout.mobile.pushToken`, the shell's own push token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | D4: never open as another identity unasked; the others stay reachable through §4.7. The filter keys hold no content but name the account in this browser's storage, and the SDK's own delete does not remove them. 6d: the homeserver deletes the device's pushers with the device (`handlers/device.py:563-590`), but the broker skips `setPusher` whenever the registered marker equals the token (`NotificationTokenBroker.tsx:76-77`). So on the mobile shell, the next sign-in on that phone would silently get no push. With the marker gone, the next sign-in registers a pusher for its new device (finding S16).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 7    | Service worker and fallback keys: `pushSessionToSW(undefined, undefined)` (`sw-session.ts`; `sw.ts:32-39` deletes the client's session) and `removeFallbackSession()` (`app/state/sessions.ts:46`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | The full app never writes the fallback keys (only a Cinny-migration path reads them, `sessions.ts:50-66`), so in practice the SW holds no token. This covers a browser that still has old `cinny_*` keys, at no cost.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 8    | In-memory caches: call the `resetQueryCache` callback that `main.tsx` registers. `main.tsx` owns `queryClient` (`:123`), and the callback runs `queryClient.clear()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Otherwise `['devices']` and other cached queries would show the old account's data if another account continues in this page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 9    | `store.set(signOutReportAtom, report)` (new atom in `app/state/auth.ts`), then `applyLoggedOutAtoms(store)`: `matrixClientAtom = null`, `authStateAtom = 'logged_out'`, `userIdAtom = null`. The client listener stays suspended, since the client is dead. The sign-out latch stays set: the next sign-in or "Continue as" clears it (§4.8.3), and a reload starts without it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The router unmounts and the bootstrap card shows the report (§4.7). The report is held only in memory, so a reload drops it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### 4.3 What the UI shows for each outcome

-   `not_confirmed`: the dialog stays open, the router stays mounted and the person stays signed
    in. It shows §6.3 with **Try again** (re-runs from step 1), **Forget this device here anyway**
    (§4.6) and **Cancel**.
-   Every other outcome: the dialog disappears with the router. The signed-out card shows
    `SignOutNotice` (§6.4): one line each for the homeserver, the API and local data, the
    other-sessions line, `STAYS_ON_DEVICE`, and `StoredAccounts` when `otherAccounts` is not
    empty.
-   `local: 'blocked'` or `'pending'`: `SignOutNotice` awaits `localSettled` and swaps the line
    for the deleted or the failed line. If this tab closes first, the screen claims nothing
    more.

### 4.4 Homeserver unreachable or refusing

Covered by steps 2 and 2x and §6.3. The screen never says the homeserver ended the session
without a 200. "Nothing on this device was changed" holds because steps 3-9 have not run and
step 1 is undone in 2x.

### 4.5 API unreachable

Step 4 always removes this account's token locally before it asks (another account's token
in the shared key is left alone, §4.2 step 4). The screen then says the API did not confirm,
and that the token stops working by itself within 24 hours of when it was issued. Every JWT is
signed with a 24 h `exp` (`packages/api/src/services/auth.ts:279-291`, the default every caller
uses, `routes/auth.ts:182,186,830-831`), or less when capped by `sxp`, and `verifyJwt` rejects
an expired token on every replica, with no store involved.

### 4.6 "Forget this device here anyway" (`forgetThisDeviceHere`)

Shown only after `not_confirmed`, behind its own confirmation (§6.3). It runs steps 0, 3a, 3,
4, 5, 6, 7, 8 and 9 with `homeserver: { kind: 'not_told' }`, in that order. It sends no
homeserver request and re-arms nothing, since the client is dead locally. Step 3a comes
first because this is the one path where the Matrix token is certainly still valid on the
homeserver while steps 3-5 run, so an exchange in that window would succeed (§0.3 point 5).

### 4.7 Other accounts on the device (D4)

-   The confirmation lists `otherAccounts`, computed when the dialog opens: `loadSessionMap()`
    minus the current user.
-   New `StoredAccounts` component, rendered in `BootstrapStatus`'s logged-out card
    (`main.tsx:463-476`, under `details`, above `<LoginPage />`). It renders whenever
    `loadSessionMap().sessions` is not empty, not only after a sign-out, so a stored session is
    never unreachable. It shows `STORED_ACCOUNTS_HEADING`, `STORED_ACCOUNTS_STALE` and one
    **Continue as {id}** button per stored account. A button calls `switchToSession(store, id)`
    (`sessionSwitch.ts:20-31`), which stops any client, resets the API session (§4.8.3), sets
    the active user and initialises the client. Nothing checks a saved sign-in before it is
    used (`sessionManager.ts:60-84`), so one that was ended elsewhere or has expired fails on
    its first request into the existing `handleSessionLoggedOut` path, which (with D4) forgets
    it and shows the sign-in form. The heading and `STORED_ACCOUNTS_STALE` say exactly that.
-   `SignOutNotice` renders there too, above `StoredAccounts`, when `signOutReportAtom` is set.
    **Dismiss** clears it. Signing in or continuing as an account clears it too.
-   `handleSessionLoggedOut` (`initMatrix.ts:372-393`): in the full-app namespace
    (`!storageNamespace().embed`), call `forgetSession(userId)` instead of `clearSession(userId)`,
    so the automatic end of a session also leaves no account active; call
    `resetApiSessionForAccountChange()` instead of `clearBlackoutApiToken()` (§4.8.3); and remove
    `blackout.mobile.pushToken.registered` as step 6d does. The marker removal matters more now:
    this change makes "sign out another session" reachable, and a phone signed out from a
    desktop arrives here, so its next sign-in would otherwise get no pusher (S16). The panel
    branch is unchanged. `initMatrix.sessionLoggedOut.test.ts` passes unchanged: it already
    expects `activeUserId` to be null with one session, and only that the other session stays
    with two.
-   Burner identities after a burner signs out (`BurnerIdentitiesPanel.tsx:98-121`): the burner
    stays in `burnersAtom` (localStorage), so today the panel would still offer **Switch to**,
    which throws `No stored session for …` (`sessionSwitch.ts:24-26`). The panel now reads
    `getSessionForUser(burner.burnerUserId)` for each row. When it is `null`, the row shows
    `BURNER_SIGNED_OUT` (§6.8) in place of **Switch to**, and keeps **Burn**. Burning still
    works from the primary: `burn` deactivates through the primary's API token and
    `purgeBurnerLocal` is a no-op for a session that is gone (`useBurnerIdentities.ts:101-115`,
    `burnerSession.ts:73-93`).
-   Visual specs: the logged-out card changes only when sessions are stored or a report exists,
    and visual specs have neither, so no screenshot diff is expected. Run the visual projects
    anyway, because `main.tsx` changes.

### 4.8 Code changed or removed

1. **`logoutClient` is deleted** (`client/initMatrix.ts:587-609`). Its only caller,
   `LogoutDialog`, moves to `signOutOfThisDevice`. This removes the path behind latent findings
   S1-S3 (§8.3).
2. **`initMatrix.ts`**: register the `SessionLoggedOut` handler (`:529`) through a module-level
   `WeakMap<MatrixClient, { suspended: boolean; fired: boolean }>`. Export
   `suspendSessionLoggedOut(client)` and `resumeSessionLoggedOut(client): boolean` (which returns
   `fired`). `handleSessionLoggedOut` checks the map first. Panel behaviour is unchanged.
3. **`blackoutApiSession.ts`**, and a new leaf module `client/apiSessionLatch.ts`:
    - `apiSessionLatch.ts` holds the module state both sides need, with no imports, so
      `useMarketplaceAuth.ts` can read it without an import cycle: `sessionGeneration`
      (renamed from `panelSessionGeneration`, `blackoutApiSession.ts:95-102`, comment updated:
      bumping it in the full app is now intended), `signedOutLatch: boolean`, and
      `bumpGeneration()`, `currentGeneration()`, `setSignedOutLatch(v)`, `isSignedOutLatched()`.
    - **`beginApiSignOut()`** (new, step 3a): `bumpGeneration()`, `setSignedOutLatch(true)`,
      `inFlightExchange = null`. It touches no storage; step 4 does.
    - **`resetApiSessionForAccountChange()`** (new): `bumpGeneration()`,
      `setSignedOutLatch(false)`, then `clearBlackoutApiToken()`. Called wherever the account
      this tab runs changes: sign-in (`establishSession`, item 4), `switchToSession`
      (`sessionSwitch.ts:28`, replacing `clearBlackoutApiToken()`), and the full-app branch of
      `handleSessionLoggedOut` (`initMatrix.ts:378`). The bump makes an exchange still running
      for the previous account drop its JWT and ask the API to refuse it (`runExchange`,
      `:178-186`), so it can no longer land in storage after the switch and let `/v1` calls run
      as the previous account. That matters most for burners: "Continue as" or "Exit burner
      mode" while an exchange runs would otherwise link a burner to its primary on the API.
    - `clearBlackoutApiToken()` keeps its meaning (no bump) because the 401-retry path in
      `app/sdk/client.ts:82,119` calls it in the middle of a feature request: a bump there
      would make one feature's retry refuse the token a concurrent exchange for the same
      account is about to deliver. It now also removes the legacy `blackoutApiToken` key;
      `readBlackoutApiToken` reads it (`useMarketplaceAuth.ts:11-13`) and nothing writes it.
    - `ensureBlackoutApiToken`: if `isSignedOutLatched()`, resolve `null` at once (no storage
      read, no exchange). `runExchange`: drop the result and ask the API to refuse it when the
      generation changed **or** the latch is set.
    - `readBlackoutApiToken` (`useMarketplaceAuth.ts`): return `null` while latched. This
      covers the 387 feature call sites in the seconds between steps 3a and 9, while the router
      is still mounted.
    - `signOutApiToken` returns the outcome per token (`'refused' | 'not_confirmed'`, mapped as in
      step 4).
    - New `apiTokenOwner(token): string | null` (the payload's `username`, decoded as
      `isBlackoutTokenExpired` decodes `exp`) and `localpartOf(userId)`.
    - New `revokeBlackoutApiTokens(userId: string | null, extra: string[]): Promise<ApiOutcome>`
      (step 4; with `userId === null`, the panel's behaviour: every candidate is treated as
      its own, since the panel keeps its own key per namespace). `revokeBlackoutApiToken()`
      becomes `revokeBlackoutApiTokens(null, [])`, so the panel's `void` callers stay valid.
4. **Sign-in resets the API session** (`client/auth.ts` `establishSession`, before
   `saveFromLoginResponse` and so before `initMatrixFromStoredSession` starts the new
   session's exchange, on both branches): `resetApiSessionForAccountChange()`. This is the root
   fix for S1: whatever is cached belongs to whoever was signed in before, and an exchange
   still running for them is dropped. Burner provisioning signs in through
   `loginWithPassword`, so it gets this reset too; its own later `clearBlackoutApiToken()`
   (`burnerSession.ts:66-68`) stays, and does no harm.
    - Considered and not taken: binding every `readBlackoutApiToken` call to its owner, which
      would touch 387 call sites and needs the tab's account in places that have no store.
      Instead every transition that changes the active account resets the API session, and
      step 4 checks the owner of what it refuses. The remaining multi-tab case is S15
      (§8.3), explained.
5. **`sessionManager.ts`**: new `forgetSession(userId)` (step 6a, §4.7).
6. **Tracked delete and the user-match rule** (`initMatrix.ts`): - `deleteIndexedDbTracked(name)` returns `{ first: Promise<'deleted'|'blocked'|'failed'|'timeout'>,
settled: Promise<'deleted'|'failed'> }`. `first` takes the first of `onsuccess`, `onerror`,
   `onblocked`, or a 5 s timer. `settled` takes `onsuccess` or `onerror`, and may never
   settle. Only the new sign-out uses it; `deleteIndexedDb` is unchanged for its other callers. - `isUserStoreName(name, userId)` matches **only device-suffixed** names. After stripping an
   optional `matrix-js-sdk:` prefix and then `blackout-sync-store:` or
   `blackout-crypto-store:` (the namespace's prefixes, `syncStorePrefix()` /
   `cryptoStorePrefix()`), the rest must be exactly `userId + ':' + d`, where `d` is
   non-empty, contains no `:`, and is **not all digits**. The un-suffixed legacy names are
   never matched by the rule; step 5 deletes them by their explicit names only.
   Why this is exact: a Matrix server name is a host with an optional `:port`, and a port is
   always digits. So any other user ID that starts with `userId + ':'` is `userId + ':' +
digits` (for `@alice:example.org`, the user `@alice:example.org:8448`). Its legacy store
   `blackout-sync-store:@alice:example.org:8448` gives `d = '8448'`, which the rule refuses,
   and its device-suffixed stores give a rest of `userId + ':8448:' + device`, whose `d`
   contains a colon, which the rule also refuses. Blackout never chooses a device ID: every
   login lets Synapse generate one, ten upper-case letters (`handlers/device.py:519`;
   `client/auth.ts:221-226,261-266` send no `device_id`), so no Blackout device ID is all
   digits. - **Boot pruning uses the same rule** (finding S14). `cleanupStaleStoresForUser`
   (`initMatrix.ts:167-215`) runs at every sign-in and today selects
   `name.startsWith(`${prefix}${userId}:`)`, which also matches every store of
   `@alice:example.org:8448` when `@alice:example.org` signs in on the same browser,
   including that account's legacy JS crypto store with its message keys. Replace the
   sync and crypto `startsWith` tests (and the panel's SDK-prefixed sync test) with
   `isUserStoreName(name, userId) && name !== <the active store's name>`. The explicit
   legacy names it deletes (`${prefix}${userId}`) are exact already. The panel's Rust-prefix
   test has the same flaw: `rustCryptoUserPrefix(userId)` is
   `blackout-embed-rust:${userId}:` (`storageNamespace.ts:58`), so it too matches
   `@alice:example.org:8448`'s Rust stores. It gets the same rule through
   `isUserRustStoreName(name, userId)`: after `blackout-embed-rust:`, the name must be
   `userId + ':' + d + '::' + rest`, with `d` as above. The panel's sign-out is not changed
   otherwise. - Export the store-name helpers `signOut.ts` needs.
7. **`app/components/LogoutDialog.tsx` rewritten.** It keeps its name, its export, its
   `handleClose` prop and `data-testid="modal-logout"`, which `DialogHost`, the legacy
   `Settings.tsx`, `DeviceLogoutBtn` and the nav-audit `KNOWN_MODALS` 'logout' entry use.
    - New optional prop `onBusyChange?: (busy: boolean) => void`. It calls `onBusyChange(true)`
      when the sign-out starts, and `onBusyChange(false)` when it ends with `not_confirmed` or
      throws. It takes no session count (revision 2 did): the dialog
      loads what it shows itself, when it opens, through `useSignOutChecks(mx)` (new, in the
      same file): in parallel, `checkAccountKeyState(mx)` (item 11) and the session count,
      `mx.getDevices()` → the number of devices whose `device_id` is not `mx.getDeviceId()`,
      with a 10 s cap; any error or the cap gives `undefined`. While either runs, the key
      block shows `SIGN_OUT_CHECKING` and the Sign out button stays enabled (the checks
      inform the text; they never gate the action).
    - It uses `useStore()` and calls `signOutOfThisDevice(store, { otherSessionCount })` with
      the count it loaded.
    - It reads `isBurnerActiveAtom` and `burnersAtom` for §6.2.2, `loadSessionMap()` for the
      other accounts, and `typeof indexedDB.databases === 'function'` for the `ENDS[2]` scope.
    - The key lines (§6.2.3) are shown when `crypto` exists and some room
      `hasEncryptionStateEvent()`. They are chosen from the two checks above. The dialog never
      reads `crypto.getKeyBackupInfo()`: that call answers `null` both for "no backup" and for
      "the check failed" (§0.3 point 1).
    - `SignOutButton` (new, `features/sessions/`) owns the `Overlay` and `FocusTrap`. It keeps a
      `busyRef` that `onBusyChange` sets, and passes `focusTrapOptions` whose
      `clickOutsideDeactivates` is `() => !busyRef.current` and whose `escapeDeactivates` is
      `(e) => busyRef.current ? false : stopPropagation(e)`. Both are evaluated when the event
      fires, so they need no re-render. `DeviceLogoutBtn` (legacy, unmounted) gets the same
      treatment so the dialog behaves the same wherever it opens.
8. **`DialogHost.tsx` comment** (`:1-11`): "Production logout/timeout flows continue to render
   their own dialog instances from feature contexts (Settings, …)" was false. Now it says
   Settings → Sessions renders it.
9. **`AccountSettings.tsx:15`**: new intro text (§6.8).
10. **`PasswordStage.tsx:60-62`**: new hint (§6.6).
11. **New `client/keyBackupCheck.ts`: `checkAccountKeyState(mx)`**, the one place the
    dialog, the nudge and the chip learn what the account has on the homeserver.
    `ts
    export type BackupState = 'backup' | 'none' | 'unknown';
    export type CrossSigningState = 'yes' | 'no' | 'unknown';
    export interface AccountKeyState { backup: BackupState; crossSigning: CrossSigningState; detail?: string }
    export const checkAccountKeyState = (mx: MatrixClient): Promise<AccountKeyState>;
    export const accountKeyVerdict = (s: AccountKeyState, crossSigningReady: boolean):
      'none' | 'backup' | 'cross_signing' | 'unknown';
    ` - **Backup**: `mx.http.authedRequest(Method.Get, '/room_keys/version', undefined,
undefined, { prefix: ClientPrefix.V3, localTimeoutMs: 10_000 })`, sent every time
    (no cache). An answer whose `version` is a non-empty string → `'backup'`. A rejection
    that is a `MatrixError` with `httpStatus === 404` and `errcode === 'M_NOT_FOUND'` →
    `'none'`. Anything else (another status or errcode, a network error, the timeout, or a
    200 without a `version`) → `'unknown'`, with `detail` = `no answer` or
    `it answered ${status} ${errcode ?? ''}`. Synapse answers 404 `M_NOT_FOUND` exactly when
    the account has no current backup version (`handlers/e2e_room_keys.py:340-368`). - **Cross-signing**: `mx.http.authedRequest(Method.Post, '/keys/query', undefined,
{ device_keys: { [userId]: [] } }, { prefix: ClientPrefix.V3, localTimeoutMs: 10_000 })`.
    A 200 with `master_keys[userId]` → `'yes'`; a 200 without it → `'no'`; anything else →
    `'unknown'`. Both requests are reads. They go through the SDK's HTTP layer, so a token
    refresh works as for any request, and a dead token ends the session through the
    existing `SessionLoggedOut` path. - Why not the SDK's own answers: `getKeyBackupInfo()` resolves `null` when its request
    failed (`SDK/rust-crypto/backup.js:254-266,88-96`; `rust-crypto.js:1188-1193`) and
    caches a success for the life of the client (`backup.js:122-125`), so "no backup" and
    "couldn't check" look the same and the answer can be old. - `accountKeyVerdict`, in this order: `backup === 'backup'` → `'backup'`; `backup ===
'unknown'` → `'unknown'`; (the backup check answered "none" from here) `crossSigning ===
'yes'` or `crossSigningReady` → `'cross_signing'`; `crossSigning === 'no'` → `'none'`;
    else `'unknown'`. Only `'none'` lets any screen open the from-scratch setup (§4.10).
12. **`ActionUIA.tsx` `ActionUIAFlowsLoader`** (`:62-74`): `const ongoingFlow =
pickUIAFlow(supportedFlows) ?? supportedFlows[0]`. Today it takes the server's first
    supported flow, and Synapse builds that list from a `set` (`handlers/auth.py:419-431`), so
    on a homeserver with both password and single sign-on the order is not fixed. With this,
    the password stage comes first whenever the account has one, as `pickUIAFlow` (`:11-15`,
    no caller today) intends. The other caller, `DeviceVerificationSetup.tsx:205`, gets the
    same order.
13. **`DataTransparencySettings.tsx`**: the link and error state of §3.0.
14. **`BurnerIdentitiesPanel.tsx`**: no **Switch to** for a burner with no saved sign-in (§4.7).
15. **`NotificationTokenBroker.tsx`**: no change in behaviour; its exported
    `MOBILE_PUSH_TOKEN_REGISTERED_STORAGE_KEY` is what step 6d and `handleSessionLoggedOut`
    remove.

### 4.9 What Sign out does not touch, and the screen says so

-   Other Matrix devices of the account.
-   Other stored accounts: their sessions and stores.
-   Blackout API refresh tokens. Every `/v1/auth/matrix/exchange` mints one, with a rolling life
    of 30 days by default (`routes/auth.ts:772-780`, `services/refreshToken.ts:6-13`). The full app
    keeps only the JWT (`blackoutApiSession.ts:188`), so it cannot revoke their families.
    `/token/refresh` never re-checks the Matrix device (`routes/auth.ts:813-838`).
-   Everything §6.2.4 lists (D7 aside), and the browser's own HTTP cache.
-   What the session already did: messages, files, joins, and what other devices received.

### 4.10 The key-backup guard (D13 (a), in every option)

Inputs, in both places below: `state = await checkAccountKeyState(mx)` (§4.8.11, the
homeserver's answer, fetched each time), `crossSigningReady = await
crypto.isCrossSigningReady()`, and `verdict = accountKeyVerdict(state, crossSigningReady)`.
Precedence inside `accountKeyVerdict` (item 11 states it; restated here because the guard
depends on it): a backup → `'backup'`; a backup check that failed → `'unknown'`; then
cross-signing (server `'yes'` or `crossSigningReady`) → `'cross_signing'`; then server
`'no'` → `'none'`; else `'unknown'`. A failed backup check wins over everything but a found
backup, because every setup and reset path deletes every backup version
(`SDK/rust-crypto/backup.js:497-509,537-551`) and "couldn't check" must never be treated as
"nothing to lose".

What each verdict may offer (the same in the nudge and the chip):

| verdict           | `crossSigningReady` | action offered    | flow it opens                                                              | why it is safe                                                                                                                                                     |
| ----------------- | ------------------- | ----------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `'none'`          | —                   | **Set up backup** | `DeviceVerificationSetup`                                                  | The homeserver answered 404 `M_NOT_FOUND` for the backup and has no master key for the account: there is nothing to replace                                        |
| `'cross_signing'` | true                | **Set up backup** | `DeviceVerificationReset` (today's, with its own warning and confirm step) | No backup exists (the check answered), so no backup is deleted; the cross-signing reset is warned, as today                                                        |
| `'cross_signing'` | false               | none              | —                                                                          | Reset would replace the account's cross-signing, so everyone who verified the account sees it change, and Blackout cannot use the new backup on this device anyway |
| `'backup'`        | —                   | none              | —                                                                          | Any setup or reset deletes the existing backup                                                                                                                     |
| `'unknown'`       | —                   | none              | —                                                                          | The check failed                                                                                                                                                   |

-   `encryptionPosture.ts` `selectKeyBackupNudge({ crossSigningReady, keyBackupReady,
accountState })`: `accountState` is the verdict above and is **required** (the two
    existing test files are updated to pass it, §7.2). `keyBackupReady` → `null`, as today.
    Otherwise it returns the §6.9 verdict for that row; `actions` is empty except in the two
    rows that offer one. Its doc comment (`:100-112`) is rewritten to say what a backup does
    today (§6.9) and to state the table above.
-   `KeyBackupNudge.tsx`:
    -   `refresh` (`:68-78`) also runs `checkAccountKeyState(mx)` and passes the verdict. The
        nudge stays hidden until the check has answered (`loaded`), so it never flashes an
        action that the answer would remove.
    -   **Render rule**: the primary button (`:162-171`) and the setup overlay (`:175-193`)
        render only when `verdict.actions.length > 0`. `Not now` and the ✕ always render. The
        overlay picks `DeviceVerificationReset` when `crossSigningReady` (row 2) and
        `DeviceVerificationSetup` otherwise (row 1), as today, and can only open from those rows.
    -   The comment block (`:28-46`) is rewritten: it calls the nudge "the forward fix" and says
        a backup makes history "recoverable on future devices", which is not true in Blackout
        today. The new comment says that a backup keeps message keys on the homeserver, locked
        with a recovery key, that another Matrix app with that key can restore from it, that
        Blackout has no restore screen yet (D13 (b)), and that the flows are offered only in the
        table's two rows.
-   `FallbackContent.tsx` `MessageBadEncryptedContent` (`:50-105`): the chip's label becomes
    `CHIP_LABEL` and its text `CHIP_TEXT` (§6.9). A click opens the overlay at once with
    `CHIP_CHECKING`, runs the same three inputs, then shows: row 1 → `DeviceVerificationSetup`;
    row 2 → `DeviceVerificationReset`; otherwise a short panel with `CHIP_BACKUP_EXISTS`,
    `CHIP_NOT_VERIFIED` or `CHIP_CHECK_FAILED` and **Close**. It no longer uses
    `useCrossSigningActive` (account data) to choose the flow: account data says cross-signing
    exists but not whether this device is verified, and never says whether a backup exists.
    The comment (`:51-59`) is rewritten to match.
-   Behaviour change, recorded in the security document under S9: an unverified device of an
    account that has cross-signing is no longer offered the warned reset from the chip. The
    person can still reset from another Matrix app.
-   Still out of scope, listed as a follow-up: `DeviceVerificationReset`'s "unless you have lost
    Recovery Key …" and `RecoveryKeyDisplay`'s "you will need it to verify your identity", which
    presume screens Blackout doesn't mount. Neither says "in Blackout", so neither is false;
    both are vague.

### 4.11 Several tabs

-   Another tab of the same account keeps running until its next request is refused. Its sync
    long-poll can take about 30 s to return, then it gets `M_UNKNOWN_TOKEN`, its refresh fails,
    and `handleSessionLoggedOut` stops it, which closes its stores. A delete it blocked then
    completes, and the `blocked` line in this tab turns into `deleted`.
-   If the other tab refreshes its token in the few milliseconds before this tab's logout reaches
    the server, its `saveSession` can write the account back into the session map and make it
    active (`sessionManager.ts:90-95`). That token is already dead. On the next start, sync gets
    `M_UNKNOWN_TOKEN` and the existing teardown removes it (with D4's change, leaving no account
    active). KNOWN_LIMITATIONS says so.
-   The sign-out latch (step 3a) is per tab. Another tab of another account is not affected,
    and step 4 leaves its token alone (owner check).

### 4.12 D13 (d): message-key export and import (built only if the operator picks (d))

Everything here is one commit on top of the rest, so it can be added or left out cleanly.

**What exists.** `app/features/settings/devices/LocalBackup.tsx` renders two tiles. Export
(`:15-60`, `:123-150`) calls `crypto.exportRoomKeysAsJson()` (every Megolm session this
browser's Rust store holds for the account), encrypts it with `encryptMegolmKeyFile(json,
password)` and saves `blackout-keys.txt` with FileSaver. Import (`:151-245`) reads a file,
`decryptMegolmKeyFile(file, password)`, and `crypto.importRoomKeysAsJson(keys)`. Its only
mount is the unmounted `Devices.tsx:158`. No unit test covers it or the crypto module.

**Review of `util/cryptE2ERoomKeys.js`** (read in full for this design; the builder repeats
it in the security document and records anything that differs):

-   It is a port of matrix-react-sdk's `MegolmExportEncryption.js` at commit `e78a1adb…`
    (line 1), which implements the Matrix spec's key-export format: version byte `1`, 16-byte
    random salt, 16-byte random IV with bit 63 cleared, a 4-byte round count, AES-256-CTR
    ciphertext, then HMAC-SHA-256 over everything before it (encrypt-then-MAC), armoured
    between `-----BEGIN/END MEGOLM SESSION DATA-----`. Keys come from PBKDF2-HMAC-SHA-512 over
    the password, 512 bits, split into the AES and HMAC keys (`:30-90`). Salt and IV come from
    `crypto.getRandomValues` (`:272-276`). Export uses 500,000 rounds (`:270`).
-   Decrypt verifies the HMAC with `subtle.verify` before it decrypts anything (`:229-238`),
    and refuses on a mismatch ("Incorrect password?").
-   The round count on import is read from the file and not bounded (`:223`). A crafted file
    can make this tab spend a long time in PBKDF2, or fail inside WebCrypto (a count with the
    high bit set is negative and is refused). That costs only the tab of the person who chose
    to import it. Explained, not changed: other Matrix apps write files with their own counts,
    and a bound could refuse a legitimate file.
-   Imported keys carry no proof that the original sender's device made them. matrix-sdk-crypto
    marks sessions imported this way, and Blackout shows no per-message authenticity marker:
    nothing under `apps/blackout-client/src` calls `getEncryptionInfoForEvent` or reads
    `EventShieldReason`. This matters only
    for a file from someone else: someone who can get the person to import their file and
    controls a homeserver can make forged history decrypt. `IMPORT_KEYS_DETAIL` says to import
    only a file you exported yourself.
-   No new encryption code is written. The module is used as it stands; only the tile text
    changes.

**Mount.** In Sessions, after "This device" and before "Other sessions": `<h4>Message
keys</h4>`, `MESSAGE_KEYS_TEXT`, then `<LocalBackup />`. Its strings move to
`sessionsText.ts` (§6.10). It shows only when `mx.getCrypto()` exists. Its error lines show
`error.friendlyText ?? error.message`, since the module's errors carry a readable
`friendlyText` (`:13-17`) and the tile shows the technical `message` today.

**Dialog.** With (d), §6.2.3's lines gain the "export first" sentence (`SIGN_OUT_KEYS_D`,
`SIGN_OUT_KEYS_LAST_COPY_D`), and the sign-out dialog shows an **Export message keys first**
button that closes the dialog and scrolls Sessions to the Message keys block.

**Panic wipe.** The file is on the person's disk, outside the browser's storage. The panic
wipe cannot delete it, and `EXPORT_KEYS_DETAIL` says so. `PanicSettings`'s "stays" list gains
`Files you saved, such as exported message keys` (pinned in `PanicSettings.test.tsx`).

**Tests (with (d) only).** `tests/unit/util/cryptE2ERoomKeys.test.ts` (new): a round trip
with a low round count passed as `options.kdf_rounds`; a wrong password is refused with the
HMAC message; a changed ciphertext byte is refused; the header byte and the stored round
count are what was asked for. `tests/unit/features/sessions/LocalBackup.test.tsx` (new):
export calls `exportRoomKeysAsJson` and saves a file (FileSaver mocked); import with the right
password calls `importRoomKeysAsJson` with the decrypted JSON; a wrong password shows
`friendlyText`. E2E Test 1 gains a step: export with a password, sign out, sign back in,
import, and the encrypted room's older message from Node decrypts.

---

## 5. Ending another session

### 5.1 Flow

1. Tick one or more sessions under Other sessions with the chip.
2. The sticky bar shows `selectedCount(n)` with **Sign out** and **Cancel**.
3. **Sign out** sends `mx.deleteMultipleDevices(ids)`, which is
   `POST /_matrix/client/v3/delete_devices` with no `auth` (`OtherDevices.tsx:79`; SDK
   `client.js:6255-6263`).
4. Synapse answers 401 with UIA flows (`validate_user_via_ui_auth`, `devices.py:117-125`):
   one single-stage flow per method the account can use, password only when the account has
   a password hash (`handlers/auth.py:419-431`), in no fixed order. `useUIAMatrixError` and
   `ActionUIAFlowsLoader` then pick the flow. Today the loader takes the first supported flow
   in the server's order (`ActionUIA.tsx:62-74`); with §4.8.12 it takes the password flow when
   there is one, then single sign-on (`pickUIAFlow`, `:11-15`).
5. The person completes `PasswordStage` (hint §6.6) or SSO, and the request is retried with
   `auth`.
6. On 200, Synapse has deleted each device with its tokens, E2E keys and pushers
   (`handlers/device.py:563-590`). A device ID that is already gone is a silent no-op. The
   list refreshes, and §5.4 shows.

### 5.2 UIA notes

-   `can_skip_ui_auth=True`: a recent UIA session may be reused for repeated deletes.
-   A burner identity cannot pass the password stage: Blackout never kept its password
    (`burnerSession.ts:57-65`, `services/burnerIdentities.ts:44-45`). An account made with an
    account number passes it with the normalized account number (`accountNumberAuth.ts:21-29`;
    `normalizeAccountNumber` lowercases and drops everything but letters and digits,
    `packages/core/src/auth/accountNumber.ts:49-50`). An account with no password (single
    sign-on only) is offered only the SSO flow, and completes it in `SSOStage` through the
    homeserver's fallback page (`ActionUIA.tsx:45-52`). KNOWN_LIMITATIONS says all three.

### 5.3 Errors (classify `deleteError`)

-   UIA flow with no supported stage → `UIA_UNSUPPORTED`. The request never completed.
-   404 `M_UNRECOGNIZED` → `OTHERS_UNRECOGNIZED`. The endpoint is absent, as under MSC3861.
-   Anything else, including a network failure → `othersNotConfirmed(detail)`, then
    `refreshDeviceList()`, then `OTHERS_LIST_RELOADED` or `OTHERS_LIST_NOT_RELOADED` (§3.3).
    A 5xx can leave a partial deletion, so the text points to the list rather than claiming
    "nothing was signed out".
-   Cancel inside UIA returns to the selection. Nothing has changed.

### 5.4 After success

Show `othersSignedOut(n)`, `OTHERS_OTHER_ACCOUNTS` and `OTHERS_API_NOTE`, with
`RevokeAllBlackoutSessions` right under them. The Matrix step comes first because a device
still signed in to Matrix gets a new Blackout session by itself
(`REVOKE_ALL_SESSIONS_CONFIRM`). Revoke-all asks the API to end every refresh token
(`revokeAllForUser`) and refuse every JWT issued before that second
(`revokeUserTokensBefore`). A JWT issued in the same second is not refused, as
KNOWN_LIMITATIONS:461 already says. This device re-exchanges on its next 401
(`app/sdk/client.ts:73-88`).

---

## 6. Exact user-facing strings, and why each is true

All of these go in `app/features/sessions/sessionsText.ts`, except where a row names another
file. `{userId}` is the full Matrix ID. The left column is the constant; tests pin these.
Where W-A and W-B differ (D12), both are given. A string with no W-B variant is the same under
both.

### 6.1 Settings section and This device

| Constant                    | Text                                                                                                                                                                                                                                   | Why it is true                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSIONS_LABEL`            | `Sessions`                                                                                                                                                                                                                             | —                                                                                                                                                   |
| `SESSIONS_SUMMARY`          | `Sign out of this device, and see and end your account's other sessions`                                                                                                                                                               | The section does these three things                                                                                                                 |
| `sessionsIntro(userId)`     | `Your homeserver keeps a session for each sign-in to ${userId} that hasn't been signed out, in Blackout or in another Matrix app. Signing a session out ends it on the homeserver. It doesn't undo anything that session already did.` | `GET /devices` lists the account's devices on the homeserver, whichever client made them. Deleting one removes it and its tokens. Sent events stay. |
| `THIS_DEVICE_HEADING`       | `This device`                                                                                                                                                                                                                          | The tile's device ID equals `mx.getDeviceId()` (`useSplitCurrentDevice`)                                                                            |
| `SIGN_OUT_BUTTON`           | `Sign out of this device`                                                                                                                                                                                                              | —                                                                                                                                                   |
| `SESSIONS_LOADING`          | `Loading your sessions from your homeserver…`                                                                                                                                                                                          | Shown only while the query is loading                                                                                                               |
| `THIS_DEVICE_NOT_LISTED`    | `Your homeserver's list doesn't include this device's session right now.`                                                                                                                                                              | Shown only when a loaded list lacks the current device ID                                                                                           |
| `devicesLoadFailed(detail)` | `Couldn't load your sessions from your homeserver (${detail}).` + button `Try again`                                                                                                                                                   | Shown only on a query error                                                                                                                         |

### 6.2 Sign-out confirmation (`LogoutDialog`)

#### 6.2.1 What it ends

| Constant                                                   | Text                                                                                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SIGN_OUT_TITLE`                                           | `Sign out of this device?`                                                                                                                                                                              |
| `SIGN_OUT_ENDS_HEADING`                                    | `Signing out:`                                                                                                                                                                                          |
| `SIGN_OUT_ENDS[0]`                                         | `ends this device's session on your homeserver, so its sign-in stops working here and in any copy of it`                                                                                                |
| `SIGN_OUT_ENDS[1]`                                         | `asks Blackout's server to refuse this device's Blackout API token`                                                                                                                                     |
| `SIGN_OUT_ENDS_LOCAL_ALL` (the browser can list databases) | `deletes this browser's copies of your rooms and messages for this account, including copies that earlier sign-ins left here, and the encryption keys this browser keeps for it`                        |
| `SIGN_OUT_ENDS_LOCAL_SESSION` (it can't)                   | `deletes this session's copy of your rooms and messages in this browser, and the encryption keys this browser keeps for this account. Copies that earlier sign-ins of this account left here may stay.` |
| `SIGN_OUT_ENDS[3]`                                         | `removes this account's saved sign-in from this browser`                                                                                                                                                |

Why:

-   ENDS[0]: step 2 sends `/logout`, which deletes the device's access and refresh tokens on the
    server. A copied token is the same token, so it stops working too. The confirmation describes
    the request; the result is reported from the answer (§6.4).
-   ENDS[1]: "asks", because the result is reported afterwards. It holds under W-A and W-B.
-   LOCAL lines: step 5 deletes exactly these databases and reports the result. "Keeps for it"
    holds because the Rust store this client loaded holds this account's keys.
-   ENDS[3]: step 6a.

#### 6.2.2 Getting back in

| Constant                        | Shown when                                            | Text                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SIGN_OUT_CREDENTIALS`          | the active account is not a burner                    | `To sign back in, you'll need what you signed in with: this account's password, or the single sign-on account you used, or, for an account made with an account number, that account number.`                                                                                                                                                                                                                                        |
| `signOutBurner(userId)`         | `isBurnerActiveAtom` is true (`burnerAtoms.ts:26-30`) | `${userId} is a burner identity. Blackout didn't keep its password, so once you sign out, this app can't sign back in to it, on this device or any other. To keep it, cancel and use “Exit burner mode”. To end it for good, burn it under Settings → Burner identities instead. If you sign out anyway, you can still burn it later from Settings → Burner identities on this device, while signed in as the account that made it.` |
| `SIGN_OUT_BURNERS_NEED_PRIMARY` | not a burner, and `burnersAtom` is not empty          | `Burner identities can be burned only while the account that made them is signed in on this device. If you want to burn yours, do it before you sign out.`                                                                                                                                                                                                                                                                           |

Why:

-   Credentials: the full app signs in with a password (`loginWithPassword`), with single
    sign-on or CAS (`LoginForm.tsx:163-179,194-250` → `loginWithToken`, `client/auth.ts:254-283`),
    or with an account number, whose password is the normalized number
    (`accountNumberAuth.ts:21-29`). The line names all three because the client does not
    record which one made this session (D14), and an account that signs in with single sign-on
    may have no password at all. Signing out leaves each of them as it was: nothing here
    changes a password or an identity-provider link.
-   Burner: the client uses the password once and never stores it (`burnerSession.ts:57-71`), and
    the API returns it once and keeps no copy (`services/burnerIdentities.ts:44-45,95`). "Exit
    burner mode" keeps the burner's session stored (`switchToSession` destroys nothing,
    `sessionSwitch.ts:10-17`). Burning is in Settings → Burner identities
    (`BurnerIdentitiesPanel.tsx`), and `burn` switches back to the primary first
    (`useBurnerIdentities.ts:101-115`). "Later, on this device, while signed in as the account
    that made it": the burner stays in this browser's burner list after it signs out
    (`burnersAtom`, localStorage), `burn` deactivates it with the primary's API token, and
    `purgeBurnerLocal` is a no-op for a session that is gone (`burnerSession.ts:73-93`). The
    list exists only in this browser, hence "on this device".
-   Primary: `requestBurnDeactivation` uses the active account's API token, and the API checks
    that the token belongs to the owner (`burnerSession.ts:73-84`, `routes/identities.ts:167-175`).
    The burner list exists only in this browser (`burnersAtom`, localStorage).

#### 6.2.3 Message keys (shown when `crypto` exists and some room has encryption)

The block shows `SIGN_OUT_KEYS`, then one backup line, then one session line, chosen from
`useSignOutChecks` (§4.8.7): `backup` from `checkAccountKeyState` and `n` = the other-session
count (`undefined` when the list could not be loaded).

| Constant                           | Shown when                           | Text                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SIGN_OUT_CHECKING`                | either check is still running        | `Checking your key backup and your other sessions on your homeserver…`                                                                                                                                                                                                                                                                                                                                                                    |
| `SIGN_OUT_KEYS`                    | always, in this case                 | `Signing out deletes the message keys this browser keeps for this account. After you sign back in, Blackout can't get them back: it has no screen that restores keys from a key backup or receives them from your other sessions. So encrypted messages from before you signed out will stay unreadable in Blackout.`                                                                                                                     |
| `SIGN_OUT_KEYS_BACKUP`             | `backup === 'backup'`                | `Your homeserver has a key backup for your account. Another Matrix app that you sign in to with your recovery key or passphrase may be able to restore the messages whose keys were backed up. Resetting your encryption or replacing the backup, in Blackout or in another app, deletes it, with any keys only it held.`                                                                                                                 |
| `SIGN_OUT_KEYS_NO_BACKUP`          | `backup === 'none'`                  | `Your homeserver answered that your account has no key backup, so no app can restore these keys from one.`                                                                                                                                                                                                                                                                                                                                |
| `signOutKeysBackupUnknown(detail)` | `backup === 'unknown'`               | `Blackout couldn't check whether your account has a key backup on your homeserver (${detail}).`                                                                                                                                                                                                                                                                                                                                           |
| `SIGN_OUT_KEYS_LAST_COPY`          | `n === 0` and `backup === 'none'`    | `Your homeserver lists no other session of your account, and there is no key backup. So this browser holds the only copy of these keys that your account can reach. After you sign out, expect your encrypted messages from before to stay unreadable for you, on every device and in every app, unless you saved their keys to a file with another Matrix app.`                                                                          |
| `SIGN_OUT_KEYS_MAYBE_LAST_COPY`    | `n === 0` and `backup === 'unknown'` | `Your homeserver lists no other session of your account. If there is no key backup either, this browser holds the only copy of these keys that your account can reach, and after you sign out you should expect your encrypted messages from before to stay unreadable for you everywhere.`                                                                                                                                               |
| `SIGN_OUT_KEYS_BACKUP_ONLY`        | `n === 0` and `backup === 'backup'`  | `Your homeserver lists no other session of your account, so that backup is the only other place your account may still have these keys.`                                                                                                                                                                                                                                                                                                  |
| `signOutKeysOthersHold(n)`         | `n > 0`                              | `Your homeserver lists 1 other session of your account. Signing out here doesn't touch it, so it can still read the messages it already has keys for. Blackout can't get keys from it after you sign back in.` / `Your homeserver lists ${n} other sessions of your account. Signing out here doesn't touch them, so each can still read the messages it already has keys for. Blackout can't get keys from them after you sign back in.` |
| `SIGN_OUT_KEYS_SESSIONS_UNKNOWN`   | `n === undefined`                    | `Blackout couldn't load your list of sessions, so it can't tell whether another session of yours still has these keys.`                                                                                                                                                                                                                                                                                                                   |

With D13 (d), `SIGN_OUT_KEYS_EXPORT` follows `SIGN_OUT_KEYS`: `To keep them, export them
first under Settings → Sessions → Message keys, and import that file there after you sign
back in.` In `SIGN_OUT_KEYS_LAST_COPY`, "unless you saved their keys to a file with another
Matrix app" becomes "unless you export them first, here or in another Matrix app". The
**Export message keys first** button (§4.12) shows with them.

Why:

-   `SIGN_OUT_KEYS`: step 5 deletes the Rust store, the only place this device's keys live. No
    shipped screen takes a recovery key, restores a backup or accepts a verification:
    `SecretStorageRecoveryKey` and `ManualVerificationTile` are reached only from
    `Verification.tsx`, and `BackupRestoreTile` only from `Devices.tsx:141`. Both are unmounted
    (D11). `ReceiveSelfDeviceVerification` (`DeviceVerification.tsx:302`) is rendered nowhere, and
    `AutoRestoreBackupOnVerification` is imported at `AppShell.tsx:23` but never rendered. The SDK
    downloads backed-up keys only when the backup is trusted and its key is known locally, and a
    new, unverified device has neither (`isCrossSigningReady` needs a verified own identity,
    `SDK/rust-crypto/rust-crypto.js:653-666`). The sign-in after a sign-out is always a new
    device ID, so its unverified state follows. "From before you signed out" is exact: messages
    that arrive after the new sign-in get keys for the new device. Under (d) the line stays
    true: the import screen restores from a file, not from a backup or another session.
-   Backup lines: each is shown only for the answer it names. `'none'` means the homeserver
    answered 404 `M_NOT_FOUND` to `GET /room_keys/version` (§4.8.11), hence "answered". Any
    failure is `'unknown'` and says it couldn't check, with the reason.
-   `SIGN_OUT_KEYS_BACKUP`: "may", because Blackout uploads keys only while this device's
    backup is active, so the backup can lack keys this device received. "Deletes it": every
    setup and reset path in Blackout ends in `resetKeyBackup` → `setupKeyBackup` →
    `deleteAllKeyBackupVersions` (`SDK/rust-crypto/backup.js:497-509,537-551`); with the guard
    (§4.10) Blackout offers neither while this backup exists, and another app's "reset" does
    the same deletion.
-   Session lines: `n` comes from `GET /devices` sent when the dialog opened, so "lists" is
    what the homeserver answered then. `SIGN_OUT_KEYS_LAST_COPY` says "the only copy … your
    account can reach" rather than "the only copy": the account keeps keys only in its
    sessions and its backup, and the answer had neither, but the person may have exported a
    file from another app, which the line names, and the people in those rooms keep their own
    copies, hence "for you". "Expect … to stay unreadable" rather than "can never be read",
    because the Matrix spec lets another member's app answer a key request in some cases, and
    this design does not claim to know what every app does (not verified here: the Rust crypto
    ships as WebAssembly in `node_modules`, without its source). The "maybe" variant is used
    when the backup check failed, so it states the condition instead of the conclusion.
-   The old "Verify your device before logging out" warning and "export your encrypted data from
    settings" pointed to screens that are not mounted (finding S7), so they are gone. These
    lines replace them; under (d) the export pointer comes back, now to a mounted screen.

#### 6.2.4 What it doesn't do

| Constant                                  | Text                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SIGN_OUT_KEEPS_HEADING`                  | `It doesn't:`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `SIGN_OUT_KEEPS[0]`                       | `sign out your other sessions, listed under “Other sessions”`                                                                                                                                                                                                                                                                                                                                                                                                        |
| `signOutKeepsAccounts(ids)` (only if any) | `sign out the other accounts on this device: ${ids.join(', ')}. They stay signed in, and the sign-in screen offers them.`                                                                                                                                                                                                                                                                                                                                            |
| `SIGN_OUT_KEEPS[1]` W-A                   | `end a Blackout API refresh token that a modified copy of this app kept. Such a token can keep working until it goes unused for 30 days (by default), unless you use “Sign out every Blackout session”.`                                                                                                                                                                                                                                                             |
| `SIGN_OUT_KEEPS[1]` W-B                   | `end a Blackout API refresh token that a modified copy of this app kept. Such a token can keep working until it goes unused for 30 days (by default). “Sign out every Blackout session”, under Blackout API sessions, asks Blackout's server to end it.`                                                                                                                                                                                                             |
| `SIGN_OUT_KEEPS[2]`                       | `undo anything already sent: messages, files, and what other people's devices received`                                                                                                                                                                                                                                                                                                                                                                              |
| `SIGN_OUT_KEEPS[3]`                       | `remove anything else Blackout keeps in this browser. That includes:` followed by a list: each value of `PANIC_REMOVES` (imported from `PanicSettings.tsx:18-27`, so the list follows `SENSITIVE_TRACE_PREFIXES`), then `Your settings`, `Your release keys and the list of people you compared safety codes with`, `Videos in the video vault`, `Images and files your browser may have cached`; with D13 (d) also `Files you saved, such as exported message keys` |
| `SIGN_OUT_DRAFTS_SHARED`                  | `Unsent drafts are saved per room, not per account, so the next account that opens the same room in this browser sees them.`                                                                                                                                                                                                                                                                                                                                         |
| `SIGN_OUT_PANIC_HINT`                     | `Settings → Panic wipe removes the items it lists. Use it before you sign out if you want them gone.`                                                                                                                                                                                                                                                                                                                                                                |

With D7 (b), the drafts item leaves the KEEPS list, `SIGN_OUT_DRAFTS_SHARED` is dropped, and
`SIGN_OUT_ENDS_DRAFTS` = `removes unsent drafts in this browser, for every account` is added.
With D7 (c), when no other account stays, every `PANIC_REMOVES` item moves to
`SIGN_OUT_ENDS_TRACES` = `removes from this browser:` + the same list. When another account
stays, D7 (c) behaves as (b).

Why:

-   KEEPS[0]: only this device ID is sent. Accounts: step 6a removes only `userId`.
-   KEEPS[1]: §4.9. The lifetime is `REFRESH_TOKEN_TTL_SECONDS` or 30 days
    (`services/refreshToken.ts:6-13`), hence "by default". W-A's "unless" is the revoke-all
    outcome; W-B describes the request only.
-   KEEPS[2]: nothing deletes events.
-   KEEPS[3]: steps 5-6 touch none of these (D7 aside). Drafts are keyed by room only
    (`MessageComposer.tsx:64,87`). "May have cached" because the HTTP cache is outside the app's
    reach.
-   Panic hint: the panic wipe removes exactly what it lists (`PanicSettings.tsx:36-39`).

Buttons: `Sign out` (critical), `Cancel`; while it runs, `Signing out…`, with both buttons
disabled and Escape and backdrop clicks ignored (§4.8.7).

### 6.3 Not confirmed, and forget anyway

| Constant                       | Text                                                                                                                                                                                                                                                                                                                                                                                                 | Why it is true                                                                                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SIGN_OUT_NOT_CONFIRMED_TITLE` | `Not signed out`                                                                                                                                                                                                                                                                                                                                                                                     | Steps 3-9 have not run                                                                                                                                                                                            |
| `signOutNotConfirmed(detail)`  | `Your homeserver didn't confirm that it ended this device's session (${detail}), so the session may still be valid. Nothing on this device was changed.`                                                                                                                                                                                                                                             | "May": a request that timed out may still have reached the server. If it did, the client's next request is refused and the existing teardown runs. `detail` is `no answer` or `it answered ${status} ${errcode}`. |
| buttons                        | `Try again`, `Forget this device here anyway`, `Cancel`                                                                                                                                                                                                                                                                                                                                              | —                                                                                                                                                                                                                 |
| `FORGET_ANYWAY_CONFIRM`        | `This removes this account's sign-in from this browser, with its copies of your rooms, messages and encryption keys, and asks Blackout's server to refuse this device's API token. Your homeserver isn't told: if it didn't end the session, the session stays valid and stays on your account's list until you sign it out from Settings → Sessions on another device, or from another Matrix app.` | §4.6 sends no homeserver request. The device row stays until it is deleted.                                                                                                                                       |
| buttons                        | `Forget it here`, `Back`                                                                                                                                                                                                                                                                                                                                                                             | —                                                                                                                                                                                                                 |

### 6.4 Signed-out notice (bootstrap card, `SignOutNotice`)

| Constant                   | Text                                                                                                                                                                                                                                                                                          | Shown when                                                              | Why it is true                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `signedOutTitle(userId)`   | `Signed out of ${userId} on this device`                                                                                                                                                                                                                                                      | always                                                                  | Steps 3-9 ran, so this device holds no sign-in for the account                                                                                                                                                                                                                                                                                               |
| `HS_ENDED`                 | `Your homeserver ended this device's session: its access and refresh tokens no longer work, including any copies of them.`                                                                                                                                                                    | a logout got 200                                                        | Synapse deleted them in that request                                                                                                                                                                                                                                                                                                                         |
| `HS_TOKEN_REFUSED`         | `Your homeserver no longer accepts this device's sign-in, so Blackout couldn't use it to end the session. If the session is still on your account's list, sign it out from Settings → Sessions on another device, or from another Matrix app.`                                                | `token_refused`                                                         | Every token this device had was refused. That does not show the device was deleted, so the line claims nothing about it.                                                                                                                                                                                                                                     |
| `HS_NOT_TOLD`              | `Your homeserver wasn't told. If it didn't end this session, the session is still valid and still on your account's list: sign it out from Settings → Sessions on another device, or from another Matrix app.`                                                                                | forget anyway                                                           | No request was sent                                                                                                                                                                                                                                                                                                                                          |
| `API_REFUSED` W-A          | `Blackout's server refuses this device's API token from now on.`                                                                                                                                                                                                                              | `refused`                                                               | Step 4's mapping, on a deployment where a revocation reaches every API process                                                                                                                                                                                                                                                                               |
| `API_ANSWERED` W-B         | `Blackout's server answered this device's request to refuse its API token. This device deleted its copy, and the token stops working by itself within 24 hours of when it was issued.`                                                                                                        | `refused`                                                               | It answered (200 or a 401 refusal). The removal ran first. The 24 h `exp` is in the token's signature (§4.5).                                                                                                                                                                                                                                                |
| `API_NOT_CONFIRMED`        | `Blackout's server didn't confirm that it refuses this device's API token. This device deleted its copy, and the token stops working by itself within 24 hours of when it was issued.`                                                                                                        | `not_confirmed`                                                         | Same reasons                                                                                                                                                                                                                                                                                                                                                 |
| `API_NONE`                 | `This browser held no unexpired Blackout API token for this account just now, so it had none to ask Blackout's server to refuse. A token it held earlier stops working by itself within 24 hours of when it was issued.`                                                                      | `none`                                                                  | Step 4 sent nothing: no candidate was this account's and unexpired. That includes the case where another tab's account overwrote this one's token in the shared key (S15), hence "just now" and the second sentence. Revision 2 showed no line here, which said nothing true or false; now the screen says what it did.                                      |
| `LOCAL_DELETED`            | `This browser deleted its copies of your rooms and messages for this account, and the encryption keys it kept for it.`                                                                                                                                                                        | all deleted, scope `all`                                                | Each tracked delete reached `onsuccess`, over every matching name                                                                                                                                                                                                                                                                                            |
| `LOCAL_DELETED_SESSION`    | `This browser deleted this session's copy of your rooms and messages, and the encryption keys it kept for this account. This browser can't list its databases, so copies that earlier sign-ins of this account left here may remain. Clearing this site's data in your browser removes them.` | all deleted, scope `this_session`                                       | Only the explicit names were deleted                                                                                                                                                                                                                                                                                                                         |
| `LOCAL_BLOCKED`            | `Something in this browser, most likely another Blackout tab or window, still has some of these copies open, so they aren't deleted yet. Close the other Blackout tabs and windows, and keep this one open until this says they're deleted.`                                                  | `blocked`: some delete got a `blocked` event                            | The browser fires `blocked` only while an open connection holds the database. After step 3 this tab's client holds none of these stores (§4.2 step 3), so the holder is most likely another tab or window, but the code can't see which, hence "most likely". A blocked delete completes once those connections close. The line updates from `localSettled`. |
| `LOCAL_PENDING`            | `Some of these copies aren't deleted yet. If another Blackout tab or window is open in this browser, close it. Keep this one open until this says they're deleted.`                                                                                                                           | `pending`: no `blocked` event, but some delete had no answer within 5 s | The code can't tell why a delete is slow, so the line names no cause; it says what to try. It updates from `localSettled`.                                                                                                                                                                                                                                   |
| `LOCAL_FAILED`             | `This browser couldn't delete some of its copies of your rooms, messages and encryption keys for this account. Clearing this site's data in your browser removes them.`                                                                                                                       | any `onerror`                                                           | —                                                                                                                                                                                                                                                                                                                                                            |
| `otherSessionsLeft(n)`     | `This didn't end the ${n} other session(s) on your account's list. To end them, sign in and open Settings → Sessions.` (singular and plural forms)                                                                                                                                            | `otherSessionCount > 0`                                                 | Only this device ID was ended. The count is the one the dialog loaded from the homeserver when it opened (§4.8.7).                                                                                                                                                                                                                                           |
| `OTHER_SESSIONS_UNTOUCHED` | `This didn't end any other session your account has. To see and end them, sign in and open Settings → Sessions.`                                                                                                                                                                              | `otherSessionCount` undefined (the dialog's load failed)                | True whether or not there are any                                                                                                                                                                                                                                                                                                                            |
| (no line)                  | —                                                                                                                                                                                                                                                                                             | `otherSessionCount === 0`                                               | The list had no other session                                                                                                                                                                                                                                                                                                                                |
| `STAYS_ON_DEVICE`          | `Everything else Blackout keeps in this browser stays: unsent drafts, the list of burner identities made here, the other items Settings → Panic wipe lists, your settings, release keys and the video vault.` (With D7 (b) or (c), the removed items are dropped from this line.)             | always                                                                  | §6.2.4                                                                                                                                                                                                                                                                                                                                                       |
| `DISMISS`                  | `Dismiss`                                                                                                                                                                                                                                                                                     | —                                                                       | —                                                                                                                                                                                                                                                                                                                                                            |

### 6.5 Other sessions (`OtherDevices.tsx`)

| Constant                     | Text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Replaces / why                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OTHER_SESSIONS_HEADING`     | `Other sessions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `Others`                                                                                                                                                                                                                                                                                                                                                                                              |
| `OTHER_SESSIONS_NONE`        | `Your homeserver lists no other sessions for this account.`                                                                                                                                                                                                                                                                                                                                                                                                                                        | From the loaded list                                                                                                                                                                                                                                                                                                                                                                                  |
| chip `aria-label`            | `Select ${name} to sign out` / `Keep ${name}` (the visible text stays `Undo`)                                                                                                                                                                                                                                                                                                                                                                                                                      | The icon chip had no accessible name                                                                                                                                                                                                                                                                                                                                                                  |
| `selectedCount(n)`           | `${n} selected to sign out`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `Logout from selected devices. (n selected)`                                                                                                                                                                                                                                                                                                                                                          |
| bar buttons                  | `Sign out`, `Cancel`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `Logout`, `Cancel`                                                                                                                                                                                                                                                                                                                                                                                    |
| `UIA_UNSUPPORTED`            | `Your homeserver asks for a sign-in step Blackout can't show here, so nothing was signed out.`                                                                                                                                                                                                                                                                                                                                                                                                     | The request never completed                                                                                                                                                                                                                                                                                                                                                                           |
| `OTHERS_UNRECOGNIZED`        | `Your homeserver doesn't let apps sign out other sessions, so nothing was signed out.`                                                                                                                                                                                                                                                                                                                                                                                                             | 404 `M_UNRECOGNIZED`: the endpoint is absent                                                                                                                                                                                                                                                                                                                                                          |
| `othersNotConfirmed(detail)` | `Your homeserver didn't confirm that it signed out the selected sessions (${detail}).`                                                                                                                                                                                                                                                                                                                                                                                                             | Replaces `Failed to logout devices! Please try again.`                                                                                                                                                                                                                                                                                                                                                |
| `OTHERS_LIST_RELOADED`       | `The list below is what your homeserver has now: a session still on it is still signed in.`                                                                                                                                                                                                                                                                                                                                                                                                        | Only after a refetch that succeeded                                                                                                                                                                                                                                                                                                                                                                   |
| `OTHERS_LIST_NOT_RELOADED`   | `Blackout couldn't reload the list either, so it may be out of date. Try again later to see which sessions are still signed in.`                                                                                                                                                                                                                                                                                                                                                                   | When the refetch failed and react-query kept the old list                                                                                                                                                                                                                                                                                                                                             |
| `othersSignedOut(n)`         | `Signed out 1 session. Your homeserver ended it: its access and refresh tokens no longer work.` / `Signed out ${n} sessions. Your homeserver ended them: their access and refresh tokens no longer work.`                                                                                                                                                                                                                                                                                          | 200 from `delete_devices`                                                                                                                                                                                                                                                                                                                                                                             |
| `OTHERS_OTHER_ACCOUNTS`      | `This ended only this account's sessions. Other accounts a signed-out device has, such as burner identities, stay signed in on it, and the app there can still open them. Blackout lists a burner identity only on the device that made it, so it can't burn those from here.`                                                                                                                                                                                                                     | `delete_devices` names this account's devices only. A device's other stored sessions are untouched, and whichever build runs there can open them: today's build makes the next stored account active (`initMatrix.ts:380`, `sessionManager.ts:123-126`), and with D4 its sign-in screen offers them. The burner list is local (`burnerAtoms.ts:14`), and the client never calls `GET /v1/identities`. |
| `OTHERS_API_NOTE` W-A        | `Those devices can't get new Blackout API tokens from their ended sessions, but tokens they already have keep working until they expire, within 24 hours, and a Blackout API refresh token that a modified app kept keeps working until it goes unused for 30 days (by default). “Sign out every Blackout session” below ends both, on every device, this one included; this device then gets a new one by itself.`                                                                                | The exchange needs a valid Matrix token (`whoami`). JWT `exp` ≤ 24 h.                                                                                                                                                                                                                                                                                                                                 |
| `OTHERS_API_NOTE` W-B        | `Those devices can't get new Blackout API tokens from their ended sessions. Tokens they already have stop working by themselves within 24 hours of when they were issued, and a Blackout API refresh token that a modified app kept can keep working until it goes unused for 30 days (by default). “Sign out every Blackout session” below asks Blackout's server to end all of your account's Blackout sessions, on every device, this one included; this device then gets a new one by itself.` | Same, describing the revoke-all request rather than its outcome                                                                                                                                                                                                                                                                                                                                       |

### 6.6 Device tile and password stage

-   `DeviceTile.tsx`: `IP Address:` → `Last IP address:` (the value is `last_seen_ip`).
-   Rename hint `Device names are visible to public.` → `Anyone signed in on your homeserver can
look up your device names.` Local `/keys/query` includes display names
    (`handlers/e2e_keys.py:456`). Over federation they are included only when
    `allow_device_name_lookup_over_federation` is on, and it defaults to off
    (`config/federation.py:50-51`).
-   Keep `Last activity:`, `Device ID:` and `Device Key:`.
-   `PasswordStage.tsx:60-62` (`PASSWORD_STAGE_HINT`, exported from that file):
    `To do this, enter your account's password. If you sign in with an account number, enter
your account number in lower case, with no dashes or spaces.` It replaces "…entering you
    account password." The UIA request sends the input unchanged, and an account-number account's
    password is the normalized number (§5.2). The stage is shared by every UIA flow; the hint
    holds for each of them.

### 6.7 Blackout API sessions block, and revoke-all

| Constant                      | W-A                                                                                                                                                                                                                                | W-B                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `API_SESSIONS_HEADING`        | `Blackout API sessions`                                                                                                                                                                                                            | same                                                                                                                                                                                                                                                                                                                                                                                             |
| `API_SESSIONS_TEXT`           | `Blackout's own server gives each signed-in device API tokens of its own, apart from its homeserver session. This screen can't list them. “Sign out every Blackout session” ends all of them, on every device, this one included.` | `… This screen can't list them. “Sign out every Blackout session” asks Blackout's server to end all of them, on every device, this one included.`                                                                                                                                                                                                                                                |
| `REVOKE_ALL_SESSIONS`         | `Sign out every Blackout session` (unchanged)                                                                                                                                                                                      | same                                                                                                                                                                                                                                                                                                                                                                                             |
| `REVOKE_ALL_SESSIONS_CONFIRM` | unchanged (`ReleaseKeysPanel.tsx:140-145`)                                                                                                                                                                                         | `This asks Blackout's server to end every Blackout session your account has right now, on every device, this one included, by revoking their refresh tokens and refusing their API tokens. It ends no Matrix session, and a device still signed in to Matrix, this one included, gets a new Blackout session by itself. So sign the lost device out of Matrix first, or this won't keep it out.` |
| `REVOKE_ALL_SESSIONS_DONE`    | unchanged (`:147-149`)                                                                                                                                                                                                             | `Blackout's server accepted the request to end every Blackout session your account had. This device gets a new one from its Matrix session when it next needs one.`                                                                                                                                                                                                                              |

Why: no API route lists sessions (`routes/auth.ts` has only `/logout`, `/sign-out`,
`/sessions/revoke` and `/token/refresh` for this), and revoke-all is account-wide. Under W-B,
"asks" and "accepted the request" describe what the client did and what the server answered
(`{ ok: true }`, `:916-925`).

### 6.8 Other text this change corrects

-   `SettingsPage.tsx:100` Account summary → `Profile and profile card`.
-   `AccountSettings.tsx:15` → `Edit your profile and preview your profile card. To sign out, or
to see and end your sessions, open Sessions.`
-   `PrimaryNavBar` and `MobileTopBar` link: `aria-label` and `title` = `Settings`.
-   `StoredAccounts`: `STORED_ACCOUNTS_HEADING` = `Saved sign-ins on this device`;
    `STORED_ACCOUNTS_STALE` = `A saved sign-in may have been ended from another device or have
expired. If one no longer works, Blackout forgets it and brings you back to this sign-in
form.`; `continueAs(id)` = `Continue as ${id}`. Each row is a stored session
    (`loadSessionMap`), and nothing checks it before it is used (§4.7), so the heading says
    "saved", not "signed in".
-   `BurnerIdentitiesPanel`: `BURNER_SIGNED_OUT` = `Signed out on this device` (shown in place
    of **Switch to** when `getSessionForUser(burnerUserId)` is `null`). True: the row exists
    and no session for it is saved here.
-   `DataTransparencySettings` (§3.0): `DATA_SESSIONS_LINK` = `To sign a session out, open
Sessions`, a text button under "Sessions / devices"; on a load error, `devicesLoadFailed`
    (§6.1) instead of "Loading sessions…".
-   `ReleaseKeysPanel.tsx` `RELEASE_KEYS_LOST_DEVICE[1]` → `First its Matrix session: in
Settings → Sessions, select that device under “Other sessions” and sign it out, or reset your
password with “Sign out of other devices”. Until then it can keep getting new Blackout
sessions by itself. Other accounts that device has, such as burner identities, stay signed in
on it either way, and this app can't end them from another device.`
-   `ReleaseKeysPanel.tsx` `RELEASE_KEYS_SIGN_OUT`: keep it. "Signing out of Blackout" is now
    something the full app does, and it still leaves release keys.
-   `PanicSettings.tsx` `PANIC_SIGN_IN_DETAIL` → `The app then opens on the sign-in screen, and
you need your credentials to sign back in. The homeserver is not told: those sessions are not
ended there, and they stay on your account's list of sessions until they are signed out, for
example from Settings → Sessions on another of your devices. To end this device's session on
the homeserver instead, use Settings → Sessions → “Sign out of this device”.` (D6 keeps the
    behaviour.)

### 6.9 Key-backup nudge and chip (D13 (a), in every option)

What every line here may say about a backup, and why: a backup keeps copies of message keys
on the homeserver, encrypted so that only the recovery key (or its passphrase) opens them.
Another Matrix app signed in with that key can restore older messages from it. Blackout has
no screen that restores from a backup (§6.2.3), so in Blackout a backup does not bring
older messages back after a new sign-in. None of these lines says or implies that it does.
They replace the two verdicts and the chip text that did (§0.3 point 3).

| Constant (in `encryptionPosture.ts` / `FallbackContent.tsx`) | Text                                                                                                                                                                                                                                                                                                                                                                                                | Why it is true                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| headline, `'none'`                                           | `Turn on encrypted message backup`                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                                                                  |
| detail, `'none'`                                             | `A backup keeps copies of your message keys on your homeserver, locked with a recovery key that you keep. Another Matrix app that you sign in to with that key can then restore your older encrypted messages. Blackout can't restore from a backup yet, so here it won't bring older messages back after you sign in on a new device. Setting it up also turns on cross-signing for your account.` | `DeviceVerificationSetup` creates secret storage from a new recovery key or passphrase, sets up cross-signing and creates the backup (`DeviceVerificationSetup.tsx:142-160`); it shows the key once (`RecoveryKeyDisplay`). Restore: §6.2.3. Shown only when the homeserver answered that neither a backup nor cross-signing exists (§4.10 row 1). |
| action, `'none'`                                             | `Set up backup`                                                                                                                                                                                                                                                                                                                                                                                     | Opens `DeviceVerificationSetup`                                                                                                                                                                                                                                                                                                                    |
| headline, `'cross_signing'` + `crossSigningReady`            | `Turn on encrypted message backup`                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                                                                  |
| detail, `'cross_signing'` + `crossSigningReady`              | `Your account has no message key backup. Turning one on here resets device verification and gives you a new recovery key; the next screen explains what that changes. Another Matrix app with the new key can then restore older messages from the backup. Blackout can't restore from a backup yet.`                                                                                               | Row 2 opens `DeviceVerificationReset`, whose own warning and confirm step stay. The existing tests' `/resets device verification/i` still matches. No backup exists (the check answered), so none is deleted.                                                                                                                                      |
| action, `'cross_signing'` + `crossSigningReady`              | `Set up backup`                                                                                                                                                                                                                                                                                                                                                                                     | Opens `DeviceVerificationReset`                                                                                                                                                                                                                                                                                                                    |
| headline, `'cross_signing'`, not ready                       | `This device isn't verified`                                                                                                                                                                                                                                                                                                                                                                        | Cross-signing keys exist and `isCrossSigningReady()` is false                                                                                                                                                                                                                                                                                      |
| detail, `'cross_signing'`, not ready                         | `Your account has cross-signing set up, but Blackout has no screen that verifies this device. Setting up backup here would reset your cross-signing and secret storage, so Blackout doesn't offer that here.`                                                                                                                                                                                       | `DeviceVerificationSetup` calls `setupNewSecretStorage` and `setupNewCrossSigning` (`:146-157`); no verification screen is mounted (§6.2.3)                                                                                                                                                                                                        |
| headline, `'backup'`                                         | `This device can't use your key backup`                                                                                                                                                                                                                                                                                                                                                             | The homeserver answered with a backup version, and the nudge shows only when this device's backup is not active (`getActiveSessionBackupVersion`)                                                                                                                                                                                                  |
| detail, `'backup'`                                           | `Your account has a key backup on your homeserver, but Blackout has no screen that restores keys from it, so older encrypted messages stay unreadable here. Another Matrix app that you sign in to with your recovery key or passphrase may be able to restore them. Setting up a new backup would delete the existing one, so Blackout doesn't offer that here.`                                   | §6.2.3                                                                                                                                                                                                                                                                                                                                             |
| headline and detail, `'unknown'`                             | `Key backup` / `Blackout couldn't check whether your account already has a key backup, so it doesn't offer to set one up right now.`                                                                                                                                                                                                                                                                | The backup or cross-signing check failed (§4.8.11)                                                                                                                                                                                                                                                                                                 |
| `CHIP_TEXT`                                                  | `Can’t decrypt this message: this device doesn’t have its key.`                                                                                                                                                                                                                                                                                                                                     | True of every undecryptable message, whatever the cause. It replaces "it was sent before this device had your encrypted‑message backup", which named one cause as if it were the only one and implied a backup would have avoided it.                                                                                                              |
| `CHIP_LABEL`                                                 | `Why?`                                                                                                                                                                                                                                                                                                                                                                                              | The click explains; it no longer always offers setup. Replaces `Set up backup`.                                                                                                                                                                                                                                                                    |
| `CHIP_CHECKING`                                              | `Checking your key backup on your homeserver…`                                                                                                                                                                                                                                                                                                                                                      | While the checks run                                                                                                                                                                                                                                                                                                                               |
| `CHIP_BACKUP_EXISTS`                                         | `Your account has a key backup on your homeserver, but Blackout has no screen that restores keys from it. Setting up a new backup would delete it, so Blackout doesn't offer that here. Another Matrix app that you sign in to with your recovery key or passphrase may be able to show this message.`                                                                                              | Same; "may", for the same reason as §6.2.3                                                                                                                                                                                                                                                                                                         |
| `CHIP_NOT_VERIFIED`                                          | `This device isn't verified, and Blackout has no screen that verifies it or restores keys, so it can't get this message's key. Another of your sessions that has the key can still read it.`                                                                                                                                                                                                        | Row 3. "Another of your sessions that has the key": a session's own keys are not affected by this device                                                                                                                                                                                                                                           |
| `CHIP_CHECK_FAILED`                                          | `Blackout couldn't check whether your account has a key backup, so it doesn't offer to set one up right now.`                                                                                                                                                                                                                                                                                       | A check failed                                                                                                                                                                                                                                                                                                                                     |

Rows 1 and 2 of §4.10 open their flows straight from the chip's overlay, as today.

### 6.10 Message keys block (D13 (d) only)

| Constant                                   | Text                                                                                                                                                                                                                                                                                                                                                                             | Why it is true                                                                                                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MESSAGE_KEYS_HEADING`                     | `Message keys`                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                                                                   |
| `MESSAGE_KEYS_TEXT`                        | `This browser keeps the keys that decrypt your encrypted messages. Signing out deletes them. You can save them to a file first and load them again after you sign back in.`                                                                                                                                                                                                      | §4.2 step 5; §4.12                                                                                                                                                                                  |
| `EXPORT_KEYS_TITLE` / `EXPORT_KEYS_DETAIL` | `Export message keys` / `Saves a file with every message key this browser has for this account, locked with a password you choose. Anyone who has the file and the password can read your encrypted messages from before. Choose a strong password, keep the file somewhere safe, and delete it when you no longer need it: Settings → Panic wipe can't delete files you saved.` | `exportRoomKeysAsJson` exports every session the store holds; the file is encrypted with a key derived from the password (§4.12); the panic wipe touches only browser storage (`PanicSettings.tsx`) |
| `IMPORT_KEYS_TITLE` / `IMPORT_KEYS_DETAIL` | `Import message keys` / `Loads message keys from a file you exported, from Blackout or another Matrix app, so this browser can read the messages they cover. Import only a file you exported yourself.`                                                                                                                                                                          | `importRoomKeysAsJson`; the last sentence: §4.12, imported keys carry no proof of who made them                                                                                                     |
| export and import buttons                  | `Export`, `Import`, `Decrypt` (unchanged)                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                   |
| `SIGN_OUT_EXPORT_FIRST`                    | `Export message keys first`                                                                                                                                                                                                                                                                                                                                                      | Closes the dialog and scrolls to the block                                                                                                                                                          |

---

## 7. Tests

### 7.1 New unit tests (vitest, jsdom; mocks in the style of `tests/unit/client/panelSignOut.test.ts`)

`tests/unit/client/signOut.test.ts`. Stub `fetch` for `/logout` and `/refresh`, mock
`@blackout/sdk` `createFetchApiClient` for `/v1`, use a fake `MatrixClient` (`getAccessToken`,
`getUserId`, `getDeviceId`, `stopClient`, `clearStores` as a spy), a fake `indexedDB` with
`databases()` and a `deleteDatabase` that can succeed, block, error or never fire, and a jotai
store.

1. 200: calls in order: suspend, `POST /logout` with `Bearer <token0>` and body `{}`,
   `stopClient`, `POST /v1/auth/sign-out` with the captured token, the deletes; then the session
   map has no user and `activeUserId === null`. Report `ended/refused/deleted`, scope `all`; the
   atoms are logged out and the report atom is set. `clearStores` was never called.
2. 401 `M_UNKNOWN_TOKEN` on token0, and the stored session has a newer token → a second
   `/logout` with it → 200 → `ended`.
3. 401 on both, and a stored refresh token → `POST /refresh` → 200 → `/logout` with the new
   token → `ended`. The session map is unchanged until step 6 (nothing saved by the refresh).
4. 401 on both, and `/refresh` 401 (or no refresh token) → `token_refused`, with the cleanup.
5. `fetch` rejects, or the 15 s abort fires (fake timers) → `not_confirmed` "no answer". Nothing
   changes: the session map, both API token keys, and the client (not stopped). No `/v1`
   request. The handler is re-armed, so a later `SessionLoggedOut` runs `handleSessionLoggedOut`.
6. 500, or 404 `M_UNRECOGNIZED` → `not_confirmed` with `it answered 500` /
   `it answered 404 M_UNRECOGNIZED`.
7. `SessionLoggedOut` fires during the attempt and the fetch then rejects → `token_refused`
   (never `ended`). The cleanup runs once; `handleSessionLoggedOut` does not run separately.
8. While suspended, `SessionLoggedOut` neither clears the API token nor sets logged-out atoms
   before step 4.
9. `/v1/auth/sign-out`: 200 → `refused`; 401 `{code:'session_revoked'}` → `refused`; 401
   `{code:'unauthorized'}` → `refused`; 500 or a rejection → `not_confirmed`. In every case
   this account's token is gone from `blackout.api.token`, and `blackoutApiToken` is gone.
10. No token, or an expired one → `none`, and no `/v1` request.
11. A newer token of this account written between capture and step 4 → both are sent to
    `/sign-out`. (Test JWTs are unsigned three-part strings whose payload carries `username`
    and `exp`; the client never checks signatures.)
    11b. Owner check: `apiToken0` is alice's and storage now holds bob's (`username: 'bob'`) →
    only alice's is sent, bob's stays in `blackout.api.token`. Only bob's present → nothing
    sent, bob's stays, outcome `none`. A token whose payload can't be decoded → not sent, not
    removed.
12. An exchange in flight when step 3a runs resolves afterwards: its token is not written,
    and it is sent to `/sign-out` (full-app namespace; the bump and the latch).
13. Another stored account → `otherAccounts` lists it, it is still stored, and
    `activeUserId === null`.
14. Store names, user `@alice:example.org`, device `DEV1`. `databases()` returns: alice's
    `matrix-js-sdk:blackout-sync-store:@alice:example.org:DEV1` and `…:OLD2` (an earlier
    session), `blackout-crypto-store:@alice:example.org:OLD2`, alice's legacy
    `blackout-sync-store:@alice:example.org` and `matrix-js-sdk:blackout-sync-store:@alice:example.org`,
    the two Rust names; and, **not** to be deleted: `blackout-sync-store:@alice:example.org:8448`
    and `blackout-crypto-store:@alice:example.org:8448` (another user's legacy stores, the
    critic's case), `matrix-js-sdk:blackout-sync-store:@alice:example.org:8448:DEVX` (that
    user's device store), `…@bob:example.org:BOB`, and an unrelated DB. Exactly alice's and the
    Rust names are deleted. `isUserStoreName` unit cases on their own: `d` all digits → false;
    `d` with a colon → false; empty `d` → false; un-suffixed → false.
15. `indexedDB.databases` is undefined, or throws → only the explicit names; scope
    `this_session`.
16. A delete reports `blocked` → `blocked`; `localSettled` resolves `deleted` when the fake
    completes. An `onerror` → `failed`.
17. A delete that never fires any event → the report still arrives after 5 s (fake timers) with
    `pending` (not `blocked`). With `clearStores` gone nothing else can hang.
18. `forgetThisDeviceHere` sends no homeserver request, reports `not_told`, and does the API and
    local steps.
19. `pushSessionToSW(undefined, undefined)` and `removeFallbackSession` run.
20. The two sync-filter keys for this user are removed; another user's are not.
21. `otherSessionCount` passes through to the report.
22. Latch (§0.3 point 5): in `forgetThisDeviceHere`, with one delete held open, call
    `ensureBlackoutApiToken()` and `readBlackoutApiToken()` while step 5 waits → both `null`,
    no `POST /v1/auth/matrix/exchange` is sent, and `blackout.api.token` stays empty after the
    report. The same in `signOutOfThisDevice` after a 200.
23. Step 6d: `blackout.mobile.pushToken.registered` is removed and `blackout.mobile.pushToken`
    stays.
24. After a sign-out, `resetApiSessionForAccountChange()` (as sign-in calls it) lifts the latch:
    `ensureBlackoutApiToken(session)` exchanges again and writes the new token.

`tests/unit/client/blackoutApiSession.test.ts` (extend): `clearBlackoutApiToken` also removes
`blackoutApiToken` and does **not** bump the generation (an in-flight exchange for the same
account still writes its token: the 401-retry path's behaviour, pinned);
`resetApiSessionForAccountChange` does bump it (an exchange in flight resolves afterwards,
writes nothing, and its token is sent to `/sign-out`); `apiTokenOwner` and `localpartOf`;
`revokeBlackoutApiTokens` returns `refused`, `not_confirmed` and `none` in the right cases,
including the two 401 codes; with `userId === null` (the panel) every candidate is its own.

`tests/unit/client/auth.signInClearsApiToken.test.ts` (new): `loginWithPassword`, then a cached
`blackout.api.token` from another account is gone before the new session's first exchange; the
same for `loginWithToken`; and an exchange still running for the previous account when
sign-in starts resolves afterwards and writes nothing.

`tests/unit/client/sessionSwitch.reset.test.ts` (new): the same in-flight case across
`switchToSession` (burner "Continue as" / "Exit burner mode").

`tests/unit/client/initMatrix.staleStores.test.ts` (new, S14): `cleanupStaleStoresForUser` for
`@alice:example.org` with `@alice:example.org:8448`'s legacy and device stores present deletes
none of them, and still deletes alice's older-device stores and her legacy names. Panel
namespace: `blackout-embed-rust:@alice:example.org:8448:DEVX::matrix-sdk-crypto` survives
alice's sign-in, alice's other-device Rust stores do not.

`tests/unit/client/keyBackupCheck.test.ts` (new). A real `MatrixClient` from `createClient({
baseUrl, accessToken, userId, fetchFn })`, with `fetchFn` answering per URL, so the SDK's own
HTTP layer turns each answer into what the helper sees (this fakes the endpoint, not the
SDK call, per §0.3 point 1):

-   `GET /room_keys/version` 200 `{version:'3', …}` → `'backup'`; 404 `M_NOT_FOUND` → `'none'`;
    404 `M_UNRECOGNIZED` → `'unknown'`; 500 → `'unknown'` with `it answered 500`; `fetchFn`
    rejects → `'unknown'` with `no answer`; no answer within 10 s (fake timers) → `'unknown'`;
    200 without `version` → `'unknown'`.
-   `POST /keys/query` with `master_keys[@alice]` → `'yes'`; without → `'no'`; failing →
    `'unknown'`.
-   Each call sends a new request (no cache).
-   `accountKeyVerdict`: every row of its precedence, including backup `'unknown'` with
    cross-signing `'no'` → `'unknown'` (never `'none'`).

`tests/unit/client/sessionManager.forgetSession.test.ts` (new): removes only that user and
leaves `activeUserId` null; `clearSession` is unchanged (the next account becomes active).

`tests/unit/client/initMatrix.sessionLoggedOut.d4.test.ts` (new): in the full-app namespace,
`handleSessionLoggedOut` with two stored sessions leaves the other stored and `activeUserId`
null, removes `blackout.mobile.pushToken.registered`, and bumps the generation (an exchange in
flight writes nothing). The existing `initMatrix.sessionLoggedOut.test.ts` and `initMatrix.panelSession.test.ts`
pass unchanged.

`tests/unit/features/sessions/SessionsSettings.test.tsx` (new; mock `useMatrixClient` and
`useDeviceList`):

-   loading: placeholder, `SESSIONS_LOADING`, and the Sign out button;
-   error: `devicesLoadFailed`, Try again calls `refresh`, and the Sign out button;
-   loaded: This device with the current device, the others without it (the split), and the
    Sign out button; `THIS_DEVICE_NOT_LISTED` when the current ID is absent; the none text;
-   the Blackout API sessions block renders the revoke-all button;
-   after `onSignedOut(2)`: `othersSignedOut(2)`, `OTHERS_OTHER_ACCOUNTS` and `OTHERS_API_NOTE`,
    with the revoke-all button right after them;
-   the Sign out button renders the same in every list state and takes no count.

`tests/unit/features/sessions/SignOutButton.test.tsx` (new): with the dialog busy (mocked
`onBusyChange(true)`), Escape and a backdrop click do not close it; after `onBusyChange(false)`
they do.

`tests/unit/features/settings/OtherDevices.test.tsx` (new):

-   Select → `selectedCount`. Sign out → `deleteMultipleDevices(ids, undefined)`.
-   A 401 with a password flow renders the password stage with `PASSWORD_STAGE_HINT`; submit →
    called again with `auth`.
-   Unsupported flow → `UIA_UNSUPPORTED`. 404 `M_UNRECOGNIZED` → `OTHERS_UNRECOGNIZED`.
-   500 → `othersNotConfirmed`, then `OTHERS_LIST_RELOADED` when refresh resolves `true`, and
    `OTHERS_LIST_NOT_RELOADED` when it resolves `false`.
-   Success → `onSignedOut(n)` and refresh.
-   The chip's `aria-label`.

`tests/unit/components/ActionUIA.flowOrder.test.tsx` (new): flows `[[m.login.sso],
[m.login.password]]` → `PasswordStage` renders; `[[m.login.sso]]` → `SSOStage`;
`[[m.login.recaptcha]]` → the `unsupported` render.

`tests/unit/components/LogoutDialog.test.tsx` (new; mock `client/keyBackupCheck` and
`mx.getDevices`, since the helper is tested against the endpoints on its own):

-   Every `SIGN_OUT_ENDS*` line, with `SIGN_OUT_ENDS_LOCAL_ALL` or `_SESSION` according to
    `indexedDB.databases`.
-   `SIGN_OUT_CREDENTIALS` for a normal account, its text pinned whole (it names the password,
    single sign-on and the account number); `signOutBurner` instead when the active user is in
    `burnersAtom`; `SIGN_OUT_BURNERS_NEED_PRIMARY` only when burners are listed and the active
    account is not one of them.
-   The other-accounts line only when other accounts are stored.
-   Key lines: `SIGN_OUT_CHECKING` while the checks are pending; then `SIGN_OUT_KEYS` plus
    exactly one backup line and one session line, for every pair of backup
    {`'backup'`, `'none'`, `'unknown'`} × count {0, 2, `undefined`}: e.g. `'none'` + 0 →
    `SIGN_OUT_KEYS_NO_BACKUP` + `SIGN_OUT_KEYS_LAST_COPY`; `'unknown'` + 0 →
    `signOutKeysBackupUnknown` + `SIGN_OUT_KEYS_MAYBE_LAST_COPY`; `'backup'` + 0 →
    `_BACKUP_ONLY`; any + 2 → `signOutKeysOthersHold(2)`; any + `undefined` →
    `SIGN_OUT_KEYS_SESSIONS_UNKNOWN`. `mx.getDevices` rejecting gives `undefined`. No key lines
    without encrypted rooms. The Sign out button is enabled while the checks run.
-   KEEPS[3] renders every `PANIC_REMOVES` value; `SIGN_OUT_DRAFTS_SHARED` and
    `SIGN_OUT_PANIC_HINT` are present.
-   Confirm calls `signOutOfThisDevice` with `{ otherSessionCount }` equal to the count the
    dialog loaded (2, or `undefined` when the load failed); buttons are disabled and
    `onBusyChange(true)` is called while it runs; `onBusyChange(false)` after `not_confirmed`.
-   `not_confirmed` renders the title, the detail and three buttons; Try again re-runs; Forget
    anyway → confirmation → `forgetThisDeviceHere`; Cancel calls `handleClose`.

`tests/unit/features/sessions/SignOutNotice.test.tsx` and `StoredAccounts.test.tsx` (new):

-   every homeserver, API and local outcome maps to its line, including `token_refused`,
    `API_NONE`, `LOCAL_DELETED_SESSION`, and `LOCAL_BLOCKED` for `blocked` vs `LOCAL_PENDING`
    for `pending`;
-   `otherSessionsLeft(n)`, `OTHER_SESSIONS_UNTOUCHED` and no line for 0;
-   `blocked` and `pending` swap to deleted or failed when `localSettled` resolves;
-   Dismiss clears the atom;
-   StoredAccounts shows `STORED_ACCOUNTS_HEADING` (`Saved sign-ins on this device`) and
    `STORED_ACCOUNTS_STALE`, lists the stored accounts; Continue calls `switchToSession(store,
id)`; it renders nothing with no sessions.

`tests/unit/features/burner-identity/BurnerIdentitiesPanel.signedOut.test.tsx` (new): a burner
in `burnersAtom` with no saved session shows `BURNER_SIGNED_OUT` and **Burn**, and no
**Switch to**; with a saved session, **Switch to** as today.

`tests/unit/features/data-transparency/DataTransparencySettings.test.tsx` (new or extended):
`DATA_SESSIONS_LINK` sets `settingsPageAtom` to `'sessions'`; a failed device query shows
`devicesLoadFailed`, not "Loading sessions…".

Key-backup guard:

-   `encryptionPosture.test.ts` (extend): `selectKeyBackupNudge` for every row of §4.10's
    table, each verdict's headline and detail pinned whole (§6.9), actions only in rows 1 and
    2; `null` when `keyBackupReady`. A negative pin: no verdict's detail matches
    `/recover(ed|able)? when you sign in on a new device|don.t lose access/i`, the two promises
    revision 2 kept.
-   `tests/unit/features/settings/KeyBackupNudge.test.tsx` (new). The component with a real
    `MatrixClient` whose `fetchFn` fakes the endpoints (as in `keyBackupCheck.test.ts`) and a
    stubbed `getCrypto()` (`isCrossSigningReady`, `getActiveSessionBackupVersion` → `null`):
    -   `/room_keys/version` **fails** (`fetchFn` rejects, and separately a 500) and
        `/keys/query` has no master key → the `'unknown'` text, and **no** `Set up backup` button
        and no overlay. This is the case revision 2 got wrong;
    -   a backup → the `'backup'` text and no primary button;
    -   404 `M_NOT_FOUND` and no master key → `Set up backup` opens `DeviceVerificationSetup`;
    -   404 and a master key, `isCrossSigningReady` true → `Set up backup` opens
        `DeviceVerificationReset`; `isCrossSigningReady` false → no primary button;
    -   `Not now` and ✕ render in every case.
-   `tests/unit/components/FallbackContent.chip.test.tsx` (new), same fakes: the chip reads
    `CHIP_LABEL` and `CHIP_TEXT`; a click shows `CHIP_CHECKING`; then `/room_keys/version`
    failing → `CHIP_CHECK_FAILED` and no setup; a backup → `CHIP_BACKUP_EXISTS`; cross-signing on
    an unverified device → `CHIP_NOT_VERIFIED`; nothing → `DeviceVerificationSetup`; cross-signing
    on a verified device with no backup → `DeviceVerificationReset`.

Shell, routing and the switcher:

-   `PrimaryNavBar.test.tsx`: the link exists with `href="/settings"` and `aria-label="Settings"`,
    and has `aria-current="page"` on `/settings`.
-   `MobileTopBar.test.tsx`: the link appears with no `trailing`; an explicit `trailing` replaces
    it.
-   `tests/unit/pages/settings/SettingsRoute.test.tsx`: renders `SettingsPage`.
-   QuickSwitcher (existing file or new `QuickSwitcher.settings.test.tsx`): picking "Sessions"
    sets the section to `sessions` and calls `onSettingsPicked('sessions')`.
-   `ClientLayout.test.tsx` (existing, 17 tests): add one case that `onSettingsPicked` opens the
    overlay on that section.
-   `SettingsPage.test.tsx`: "Sessions" is listed under Account & identity right after Account,
    with `SESSIONS_SUMMARY`, and the Account summary reads `Profile and profile card`.
-   `PasswordStage` (new small test): the hint is `PASSWORD_STAGE_HINT`.

### 7.2 Existing tests that must be updated, not skipped

-   `tests/unit/components/LogoutDialog.reliability.test.tsx`: its mock targets `logoutClient`,
    which is deleted. Mock `../../../src/client/signOut` instead and keep both cases: the heading
    test looks for `Sign out of this device?` (Cancel is unchanged), and the listener-leak loop
    stays as it is. Wrap in a jotai `Provider` if `useStore` needs one.
-   `PanicSettings.test.tsx`: the pinned `PANIC_SIGN_IN_DETAIL`.
-   `ReleaseKeysPanel.test.tsx`: the pinned `RELEASE_KEYS_LOST_DEVICE`, under W-B the two
    revoke-all strings, and the extraction (§3.4). Every other assertion stays.
-   `Settings.reliability.test.tsx` (legacy Settings): its import chain now reaches
    `client/signOut.ts`. Add mocks if needed; never `skip`.
-   `panelSignOut.test.ts`, `initMatrix.panelSession.test.ts`, `initMatrix.tokenRefresh.test.ts`:
    must pass unchanged. The generation rename, the latch module and the handler map must not
    change panel behaviour. If `initMatrix.panelSession.test.ts` seeds store names that the
    narrower S14 rule now keeps (an all-digit or colon-bearing suffix), that is a test of the
    old flaw: say so in the commit and change only that fixture.
-   `src/app/features/settings/security/encryptionPosture.test.ts` (`:97-121`) and
    `tests/unit/features/settings/security/keyBackupNudge.test.ts`: `selectKeyBackupNudge` now
    requires `accountState`. Pass `'none'` in the "not set up at all" cases and
    `'cross_signing'` in the "cross-signed, no backup" cases. Their assertions still hold
    (severity `warn`, action `enable_key_backup`, headline `/backup/i`, detail `/resets device
verification/i`, `null` once `keyBackupReady`); keep them, and add the new rows beside them.
-   With D13 (d): `PanicSettings.test.tsx` also pins the new "Files you saved" item.
-   The baseline is 16 files and 175 tests, all passing at `65ceaa7483`
    (`scratchpad/v57/baseline/`). Re-run the same 16 files after the change. Every baseline test
    must still pass, and only the pinned strings named above may change.

### 7.3 Mutation checks

For each: revert one line, show that the named test fails, then restore it. Record the results
in the security document.

-   Drop the `resetApiSessionForAccountChange()` in `establishSession` →
    `auth.signInClearsApiToken` fails.
-   Replace the bump in `resetApiSessionForAccountChange` with a plain clear →
    `sessionSwitch.reset` and the in-flight case of `auth.signInClearsApiToken` fail.
-   Treat any `/logout` answer as `ended` → signOut case 4, 5 or 6 fails.
-   Map a `SessionLoggedOut` seen during the attempt to `ended` → case 7 fails.
-   Skip the stored-token retry → case 2 fails.
-   Skip `suspendSessionLoggedOut` → case 8 fails.
-   Map 401 `session_revoked` to `not_confirmed` → case 9 fails.
-   Skip the generation bump in the full app → case 12 fails.
-   Drop the latch check in `ensureBlackoutApiToken` → case 22 fails.
-   Drop the owner check in step 4 → case 11b fails.
-   `forgetSession` sets the next account active → case 13 or the `forgetSession` test fails.
-   Loosen `isUserStoreName` to a plain `startsWith`, or drop its all-digits test → case 14
    and `initMatrix.staleStores` fail (the `:8448` stores are deleted).
-   Await `client.clearStores()` in step 5 → case 1 (spy not called) and case 17 fail.
-   `deleteIndexedDbTracked` reports `blocked` as `deleted` → case 16 fails.
-   Remove the guard's `'backup'` branch → `KeyBackupNudge.test` fails.
-   Make `checkAccountKeyState` treat any `/room_keys/version` failure as `'none'` (revision 2's
    behaviour through `getKeyBackupInfo`) → `keyBackupCheck.test` and the failing-endpoint case
    of `KeyBackupNudge.test` fail.
-   Render the nudge's primary button unconditionally → `KeyBackupNudge.test` fails.
-   Revert `ActionUIAFlowsLoader` to `supportedFlows[0]` → `ActionUIA.flowOrder` fails.
-   Drop step 6d → case 23 fails.
-   `clearBlackoutApiToken` without the legacy key → the `blackoutApiSession` test fails.

### 7.4 Playwright e2e (D9)

-   Spec `playwright/live/sessions.spec.ts`, config `playwright.sessions.config.ts` at the root:
    `testDir: 'playwright/live'`, `workers: 1`, `retries: 0`, `use: { ...devices['Desktop
Chrome'], viewport: { width: 1280, height: 800 }, baseURL: process.env.BLACKOUT_E2E_BASE_URL,
serviceWorkers: 'block' }`. Blocking service workers makes `page.route` see every request. - It is outside `playwright/e2e`, so `playwright.launch-smoke.config.ts` (`testDir:
'playwright/e2e'`) does not collect it, and the root config collects only
    `apps/blackout-client/tests/e2e` and `visual.spec.ts`. No existing config's exclusion
    changes. - The spec **fails**, never skips, when its env is missing. It is only ever run on purpose. - Env: `BLACKOUT_E2E_BASE_URL`, `BLACKOUT_E2E_HOMESERVER_URL`, `BLACKOUT_E2E_API_URL`,
    `BLACKOUT_E2E_REGISTRATION_SHARED_SECRET`.
-   Environment for the recorded run (all in `scratchpad/v57/e2e/`, nothing committed):
    1. Production build: `pnpm --filter @blackout/client build`. Copy `dist` to scratch and write
       a `config.json` there with `homeserverList: ["http://127.0.0.1:8008"]` and
       `blackoutApiBaseUrl: "http://127.0.0.1:<api port>"`. Never edit the committed
       `apps/blackout-client/config.json`. Serve it with the SPA-fallback static server used on
       2026-10-23 (`scratchpad/e2e/serve.mjs`).
    2. Homeserver from this worktree's `apps/blackout-server`, using an existing Synapse venv from
       earlier sessions (for example `scratchpad/v48/venv-r5`), SQLite, a generated config in
       scratch with `registration_shared_secret`, open registration off, relaxed `rc_login`, and
       the default `refreshable_access_token_lifetime` (so the refresh path is the real one).
       Record the Synapse version and the HEAD commit.
    3. API: `pnpm --filter @blackout/api exec tsx src/index.ts` with the in-memory store (one
       process), `MATRIX_HOMESERVER=http://127.0.0.1:8008`, `BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS=1`,
       a throwaway JWT secret, and CORS allowing the client's origin. The builder reads the
       required env from `packages/api` config and records it. If the API cannot be booted, run
       the Matrix parts and assert only that `/v1/auth/sign-out` was _sent_ with the right bearer
       (`page.on('request')`), and say so in the record.
    4. Browser: the pre-installed Chromium. Do not install browsers.
-   Server-side checks use a separate Node session C (`POST /login` as alice, kept for the whole
    test) and `GET /_matrix/client/v3/devices` with C's token. That list is what decides whether a
    device exists. `whoami` checks are secondary and always paired with a check, made just
    before the action, that the same token answered 200.
-   Accounts: every account is created with the shared-secret admin register
    (`POST /_synapse/admin/v1/register`) with **`inhibit_login: true`** in the body. The admin
    servlet passes the body to `_create_registration_details` (`rest/admin/users.py:654`), which
    logs a device in unless `inhibit_login` is set (`rest/client/register.py:801`). Without it the
    registration's own device would sit on the list and every count below would be one higher.
    Test 1 asserts the list right after registration is empty.
-   Test 1, "signs out another session, then this device; the servers refuse the old tokens": 1. Node: register alice; log in session C and assert C's `GET /devices` is exactly `[C]`
    (no device left over from the registration); then log in session B (the "other
    session"). C creates a room with alice as its only member and `initial_state`
    `m.room.encryption` (`m.megolm.v1.aes-sha2`). The room needs no messages: the dialog's key
    lines and the nudge depend only on an encrypted room existing. 2. Browser: open the app, sign in as alice through the login form → device A. 3. Click `primary-nav-bar-settings`, then "Sessions". The "This device" tile shows device A's
    ID when expanded; "Other sessions" lists exactly B and C. 4. Tick B → Sign out → the password stage (with `PASSWORD_STAGE_HINT`) → alice's password →
    `othersSignedOut(1)`, `OTHERS_OTHER_ACCOUNTS` and `OTHERS_API_NOTE` are visible. 5. **Server**: C's `GET /devices` is exactly `[A, C]`. **Browser**: Settings → Your data
    lists A "(this device)" and C, not B; `DATA_SESSIONS_LINK` opens Sessions. 6. Read `blackout.api.token` (JWT J) from localStorage. **Server**: an authed `/v1` route with
    J → 200. 7. Backup check that fails: `page.route('**/_matrix/client/v3/room_keys/version', r =>
r.abort())`. (a) Open the encrypted room at `/communities/-/dens/<roomId>` (ClientLayout):
    the key-backup nudge shows the `'unknown'` text, and **no** `Set up backup` button is on
    the page. (b) Back to Settings → Sessions → Sign out of this device: the dialog shows
    `SIGN_OUT_KEYS`, `signOutKeysBackupUnknown('no answer')` and `signOutKeysOthersHold(1)`, and
    no setup button. Cancel. `page.unroute(...)`. 8. Read A's current access token from the session map; `whoami` with it → 200. Sign out of
    this device again: now `SIGN_OUT_KEYS`, `SIGN_OUT_KEYS_NO_BACKUP` and
    `signOutKeysOthersHold(1)`, plus `SIGN_OUT_CREDENTIALS` and the KEEPS list → Sign out → the
    bootstrap card shows `signedOutTitle`, `HS_ENDED`, the D12 API line, `LOCAL_DELETED`,
    `otherSessionsLeft(1)` (C remains) and `STAYS_ON_DEVICE`. 9. **Server**: C's `GET /devices` is exactly `[C]`; `whoami` with the token from step 8 →
    401 `M_UNKNOWN_TOKEN`; the authed `/v1` route with J → 401 `session_revoked`. 10. **Local**: no `blackout.api.token` or `blackoutApiToken`; the session map has no alice;
    `indexedDB.databases()` lists no store of alice's and neither Rust name; no
    `mxjssdk_memory_filter_FILTER_SYNC_@alice…` key; the sign-in form is visible.
-   Test 2, "homeserver unreachable: nothing changes, then forget anyway":
    1. Sign in as alice (device D). Wait until `blackout.api.token` holds a JWT (J2) and record
       it. Start collecting requests with `page.on('request')`.
    2. `page.route('**/_matrix/client/v3/logout', r => r.abort())`.
    3. Sign out → `Not signed out` with `no answer`. Settings is still shown, the session map
       still has alice, `blackout.api.token` still equals J2, and **no** request to
       `/v1/auth/sign-out` was sent.
    4. **Server**: C's `GET /devices` lists D. J2 on the authed `/v1` route → 200.
    5. Forget this device here anyway → Forget it here → `HS_NOT_TOLD` is visible. Exactly one
       `/v1/auth/sign-out` request was sent, with `Bearer J2`. `blackout.api.token` is empty, and
       stays empty for 5 s more; no `/v1/auth/matrix/exchange` request was sent after "Forget it
       here" (the latch, §4.2 step 3a).
    6. **Server**: C's `GET /devices` still lists D. That is the screen's claim, checked. J2 on
       the authed `/v1` route → 401 `session_revoked`.
-   Test 3 (mandatory), "another tab and stale stores: the report still arrives, and every copy
    goes": 1. Sign in as alice (device E) in page 1. In page 1, create the stale databases
    `matrix-js-sdk:blackout-sync-store:@alice…:OLDDEV`, `blackout-crypto-store:@alice…:OLDDEV`,
    `matrix-js-sdk:blackout-sync-store:@alice…` (legacy), and two that must survive:
    `blackout-sync-store:@bob…:BOB` (another user) and `blackout-sync-store:@alice:<server
name>:8448` (the legacy store of a different user whose ID extends alice's), with
    `indexedDB.open` in `page.evaluate`. 2. Open page 2 in the same context at `/` and wait until it is signed in as alice. 3. In page 1, Sign out of this device → the signed-out card with a local line appears within
    20 s. This asserts the report is never stuck on "Signing out…". Record whether the line was
    `LOCAL_BLOCKED`, `LOCAL_PENDING` or `LOCAL_DELETED`. 4. Close page 2. Within 30 s, page 1 shows `LOCAL_DELETED`. 5. `indexedDB.databases()` in page 1 lists none of alice's databases, the seeded ones
    included, and still lists both survivors.
-   Test 4, "the only session, with no backup: the dialog says the loss is total": 1. Node: register bob; log in a device X; X creates a room with `m.room.encryption`; X logs
    out (`POST /logout`), so bob has no device. 2. Browser (a fresh context): sign in as bob. Read bob's token from the session map; `GET
/devices` with it is exactly one device, this one. 3. Settings → Sessions: "Other sessions" shows `OTHER_SESSIONS_NONE`. Sign out of this
    device: the dialog shows `SIGN_OUT_KEYS`, `SIGN_OUT_KEYS_NO_BACKUP` and
    `SIGN_OUT_KEYS_LAST_COPY`. Cancel; the session map still has bob.
-   Test 5, with D13 (d) only, "export, sign out, sign in, import: the old message reads again":
    carol is registered; browser context P1 signs in as carol (device P), context P2 signs in as
    carol (device Q); both open an encrypted room carol created from P1; Q sends `hello-before`;
    P shows it decrypted. In P1: Sessions → Export message keys with a password (the download is
    caught with `page.waitForEvent('download')`) → Sign out of this device → sign in as carol
    again (device P′) → the room shows `hello-before` as undecryptable → Import message keys
    with the file and password → within 30 s the message reads `hello-before`. **Server**:
    `GET /devices` lists P′ and Q, not P.
-   Record the command, the versions, the log and the per-step JSON in `scratchpad/v57/e2e/`, and
    summarize them in the security document.
-   Not run: the desktop (Tauri) and mobile (Capacitor) shells, Firefox, Safari, MAS, a
    multi-replica API, and these paths, which are unit-tested only: account-number and
    single-sign-on accounts, burners, the mobile push marker, the API owner check across two
    accounts, and the decryption-failure chip (an e2e would need an event this browser can't
    decrypt, which Node can't produce without its own crypto).

### 7.5 Gates and load discipline

-   For each heavy step, poll `uptime` every 30 s until the 1-minute load is under 3.5 (at most
    15 min). Never run two at once.
-   Client: `pnpm --filter @blackout/client lint`, `typecheck`, the targeted vitest files
    (§7.1-7.2), then the client's full unit suite (`test:unit`) and `build`.
-   Playwright: the CI smoke project (`chromium`), the `visual-*` projects (because `main.tsx` and
    the bootstrap card change), and the sessions spec (§7.4).
-   Root: `pnpm guard:feature-registry` (the registry is untouched; this confirms it). Because
    `TRUST.md` changes (§8.4): `pnpm build:trust-page`, then `pnpm guard:trust-page` and
    `pnpm test:guard:trust-page`.
-   Do not run the API suites: there is no API change. If the builder ends up touching
    `packages/api`, run them under the same load rule.

---

## 8. Records to update

### 8.1 `KNOWN_LIMITATIONS.md`

-   **New section `### Signing out and sessions (<build date>)`**, after "Panic wipe":
    -   **Where.** Settings → Account & identity → Sessions. Settings is the ⚙ in the top bar on
        every page (`/settings`) and the DM/den view's Settings buttons. With `shellAppShell` off
        there is no top bar, and nothing at 751-1124 px.
    -   **What "Sign out of this device" does, in order.** First the homeserver session
        (`POST /logout`, retried with the stored and then a refreshed token when the first is
        refused): the device, its access and refresh tokens, its E2E keys and its pushers. Then the
        API token (`POST /v1/auth/sign-out`). Then every copy of this account's Matrix stores in
        this browser, and this account's saved sign-in. The screen reports each, and never says the
        homeserver ended the session without its 200.
    -   **If the homeserver doesn't confirm.** Nothing changes. "Forget this device here anyway"
        leaves the session valid and listed.
    -   **If every token is refused.** The screen says so, and doesn't claim the session ended.
    -   **API unreachable.** The token is deleted locally and expires within 24 h of issue.
    -   **Message keys.** After signing back in, Blackout can't restore message keys, from a backup
        or from another session: it has no screen for either. Encrypted messages from before the
        sign-out stay unreadable in Blackout. Another Matrix app with the recovery key may restore
        the ones that were backed up. Resetting encryption or replacing the backup, in any app,
        deletes it. When the homeserver lists no other session and has no backup, the screen says
        this browser holds the only copy of these keys the account can reach. (With D13 (d): the
        keys can be exported to a password-protected file first and imported after; the file is
        outside the browser, and the panic wipe can't delete it.)
    -   **Backup checks.** The sign-out screen, the backup nudge and the decryption-failure chip
        ask the homeserver directly (`GET /room_keys/version`, `POST /keys/query`). Only an answer
        of "no backup" (404 `M_NOT_FOUND`) and "no cross-signing" lets the app offer to set up a
        backup; a failed check offers nothing and says it couldn't check.
    -   **Getting back in.** It needs what the account signs in with: its password, the single
        sign-on it uses, or, for an account made with an account number, that number. The screen
        names all three, because the app doesn't record which one made the session. A burner
        identity can't be signed back in to, because Blackout never kept its password; it can
        still be burned later from the account that made it, on the device that made it.
    -   **Not ended.**
        -   other sessions;
        -   other accounts on the device, which the sign-in screen offers. Burners can be burned only
            while the account that made them is signed in on that device;
        -   API refresh tokens: every exchange mints one, rolling for 30 days by default, that the app
            throws away. `/token/refresh` never checks the Matrix device, so one kept by a modified
            client works until it goes unused for that long (W-A: "or until 'Sign out every Blackout
            session'");
        -   what the session did.
    -   **Stays in the browser.** The `PANIC_REMOVES` items (drafts, which are per room, not per
        account; the burner list; steganography passphrases; data-broker request details; reading
        positions; ephemeral view counts), settings, release keys, the video vault and the browser's
        cache, unless D7 says otherwise. A store another open tab holds is deleted only when that
        tab closes, and the screen says so. Where the browser can't list its databases, only this
        session's copies are deleted, and the screen says so.
    -   **Several tabs.** §4.11's race: a tab that refreshes its token at that moment can put the
        dead session back in the stored list; the next start drops it.
    -   **Other sessions.**
        -   The list comes from `GET /devices` and shows name, last activity, ID and last IP as the
            homeserver recorded them.
        -   Signing them out uses `delete_devices` with the password (an account-number account uses
            its normalized number) or SSO. Burner identities can't do it.
        -   It leaves those devices' API tokens working until they expire (≤ 24 h) and kept refresh
            tokens until 30 days unused by default. The screen offers "Sign out every Blackout
            session".
        -   It ends only this account's sessions. Other accounts a signed-out device has, such as
            burner identities, stay signed in there, and the app can't end them from another device:
            it lists a burner only on the device that made it.
    -   **No list of Blackout API sessions.** No API route lists them.
    -   **MAS untested.** `delete_devices` is absent under MSC3861, and the screen says the
        homeserver doesn't offer it.
    -   **Mobile push.** Sign out, and the automatic end of a session, forget which push token was
        registered, so the next sign-in on that phone registers a pusher for its new device.
    -   **Two tabs, two accounts.** The full app keeps one Blackout API token for the whole
        browser, so two tabs running different accounts overwrite each other's token. Sign out
        refuses only a token whose owner is the account signing out (S15).
    -   **Verified.** Unit tests, plus one end-to-end run on `<date>` against a homeserver started
        from this repository with a local, single-process API. CI doesn't run that spec, because CI
        has no homeserver.
-   **Panic wipe** (`:294-298`): add that the sessions can be signed out from Settings → Sessions
    on another device, and that Settings → Sessions → "Sign out of this device" ends this one on
    the homeserver.
-   **Release keys, "A lost device"** (`:449-461`): "End its Matrix session from a Matrix client
    that lists your account's sessions" becomes "End its Matrix session under Settings → Sessions
    → Other sessions (or from another Matrix app)". Add that other accounts on that device, such
    as burner identities, stay signed in there and this app can't end them from elsewhere. Keep
    the rest. Under W-B, align any "ends every Blackout session" wording with §6.7.
-   **Black Mask panel** (`:237-245`): after "With the switch off (the default) the panel uses the
    full app's storage names…", add: "where it shares the session, it is the same Matrix device,
    so signing out in a tab (Settings → Sessions) ends the panel's session too."

### 8.2 `THREAT_MODEL.md`

-   **A7 cell (`:42`)** → `Partial — Settings → Sessions ends this device's session, or another
device's (after your password or single sign-on), on the homeserver, and “Sign out every
Blackout session” asks Blackout's server to end the account's Blackout API sessions. A
Matrix sign-out doesn't end the Blackout API tokens the device already holds (they expire
within 24 hours), an API refresh token a modified client kept (until 30 days unused, by
default), or other accounts the device holds, such as burner identities. Blackout has no
screen that verifies a device. Nothing undoes what the device already read or sent.` The
    "asks" wording holds under W-A and W-B, so the cell needs no D12 variant. "Per-device
    verification" is removed: no shipped screen offers it.
-   **R12** in §7, only if the operator accepts it (D10).
-   **"Last updated"**: `<build date> (sign-out and sessions: A7 says what Settings → Sessions ends,
what a Matrix sign-out leaves, and that no verification screen ships). Previous: 2026-10-26
(…)`, keeping the existing chain.

### 8.3 New `docs/security/sign-out-and-sessions-<build date>.md`

1. **Scope and origin.** #989 decision 2, task #43, the operator's decision of 2026-11-02, and
   the reachability before (§2 here, and scout §2).
2. **Findings.** Each gets: what, where, whether it was reachable on develop, the fix and the
   test.
    - **S1 Cross-account API token** (latent: reachable only through `__BLACKOUT_AUDIT__`).
      `logoutClient` left `blackout.api.token`, sign-in did not clear it, and
      `ensureBlackoutApiToken` reuses any unexpired token (`blackoutApiSession.ts:212-218`). The
      next account on that browser within 24 h would have called `/v1` as the previous one. Fix
      §4.8.3-4.8.4. High, had it been mounted.
    - **S2 Failed `/logout` reported as success** (latent). Fix: step 2/2x.
    - **S3 No transition after logout; a reload opened another stored account** (latent).
      Fix: steps 6a and 9, §4.7.
    - **S4 Legacy `blackoutApiToken` read and never cleared** (live, low: no writer in the tree).
      Fix: now cleared.
    - **S5 SW session** (not reachable: the full app never writes the fallback keys). Covered by
      step 7.
    - **S6 An exchange in flight at a full-app sign-out could write a new JWT after the revoke**
      (latent). Fix: the generation bump in every namespace.
    - **S7 Pointers to screens that don't exist, and overclaims** (live). Each is fixed by §6:
      LogoutDialog's "export your encrypted data from settings" and "verify your device"
      warnings; THREAT_MODEL A7 "per-device verification + session revocation"; the Account
      summary and intro; the DialogHost comment; "Device names are visible to public";
      quick-switcher Settings results that opened nothing; the PasswordStage typo.
    - **S8 IndexedDB "blocked" read as deleted** (`deleteIndexedDb`; latent on the sign-out
      path). Fix §4.8.6. Other callers are unchanged, and are listed.
    - **S9 The backup nudge deletes the account's key backup on a new device** (**live on
      develop, high**). `KeyBackupNudge` (rendered at `ClientLayout.tsx:792`) opens
      `DeviceVerificationSetup` whenever `isCrossSigningReady` is false. That is the case on
      every new, unverified device, even when the account has cross-signing and a backup. The
      flow runs `setupNewSecretStorage`, `setupNewCrossSigning` and `resetKeyBackup`, which
      deletes every backup version on the server (`backup.js:497-509,537-551`), with no warning.
      The component's comment calls this path non-destructive. Effects: the backup is gone,
      cross-signing is replaced, and people who verified this account see warnings. Any sign-in
      on a new browser reaches it, and Sign out makes that a step users take on purpose. The
      chip (`FallbackContent.tsx`) reaches the same flow when the account has a backup but no
      cross-signing. Fix §4.10 (D13 (a)): the from-scratch setup is offered only when the
      homeserver itself answered "no backup" (404 `M_NOT_FOUND`) and "no master key", through
      `checkAccountKeyState`, and the nudge's button renders only when an action is offered.
      The guard does not use the SDK's `getKeyBackupInfo()`, because it resolves `null` when its
      own request fails (`SDK/rust-crypto/backup.js:254-266`), so a guard built on it fails open
      when the homeserver is unreachable; the second review caught that in revision 2. Behaviour
      change: the chip no longer offers the warned reset on an unverified device of an account
      with cross-signing (§4.10). Tests §7.1, including a failing `/room_keys/version`.
    - **S10 `clearStores` never settles while another tab holds a store** (latent: `logoutClient`,
      and the panel's `logout`, which awaits `clearClientStores`, `client/auth.ts:427-461`, behind
      a build switch no build sets). The new sign-out does not call it. The panel path is
      explained, not changed here; follow-up §9.
    - **S11 The full app never prunes its earlier sessions' sync databases** (live, low: the
      filter misses the SDK's `matrix-js-sdk:` prefix, `initMatrix.ts:188-207`, and the legacy
      name lacks it too). Each new sign-in on a browser leaves the previous device's room and
      message cache behind. Sign-out now removes them for the account. Pruning at sign-in is
      explained, not changed here; follow-up §9.
    - **S12 The SDK's sync-filter keys name the account in localStorage** (live, low). Sign-out
      now removes them; the panic wipe does not (follow-up).
    - **S13 Records and screens overstate what a backup does** (live). TRUST.md says
      undecryptable history happens "without key backup set up"; KNOWN_ISSUES BO-1's workaround
      points to a "Settings → Encryption" that doesn't exist and to the "Set up backup" action of
      S9; the nudge says a backup stops you losing history "when you sign in on a new device";
      the chip says the message "was sent before this device had your encrypted‑message
      backup". In Blackout a backup restores nothing yet. Fixed in §6.9 and §8.4-8.5.
    - **S14 Store pruning at sign-in deletes another account's stores** (live, low-medium).
      `cleanupStaleStoresForUser` (`initMatrix.ts:167-215`) selects
      `startsWith(`${prefix}${userId}:`)`, so a sign-in as `@alice:example.org` deletes every
      store of `@alice:example.org:8448` on the same browser, its legacy JS crypto store (with
      message keys) included. The panel's Rust-prefix filter has the same flaw. Reachable
      only where two such user IDs share a browser. Fix §4.8.6; test
      `initMatrix.staleStores`.
    - **S15 One API token key for every tab** (live, explained). The full app keeps a single
      `blackout.api.token` (`blackoutApiSession.ts:14-16`), and `activeUserId` is shared too. Two
      tabs running different accounts (a burner in one, its primary in the other) overwrite each
      other's JWT, and a feature in one tab can send the other account's token, which links the
      two accounts on the API. Not fixed here: binding every read to the tab's account touches
      387 call sites, and many have no access to the tab's client. What this change does: sign-in
      and switches reset the token for this tab, sign-out refuses only this account's token
      (owner check, §4.2 step 4), and KNOWN_LIMITATIONS says it. Follow-up §9.
    - **S16 Push stops after a sign-out on the mobile shell** (live once remote sign-out is
      reachable). `blackout.mobile.pushToken.registered` survives the device's deletion, and the
      broker skips `setPusher` when it equals the token (`NotificationTokenBroker.tsx:76-77`).
      Fix: removed at sign-out (step 6d) and in `handleSessionLoggedOut`.
    - **S17 `encryptionHealth` reports "no server backup" when the check failed** (live, low:
      diagnostics only). `client/encryptionHealth.ts:79-91` maps a rejection to `unknown`, but
      `getKeyBackupInfo()` resolves `null` on a failed request, so a bug report's diagnostics
      say `no`. It drives no action. Explained; follow-up §9 (move it to
      `checkAccountKeyState`).
    - **S18 The UIA flow is the server's first** (live, low). §4.8.12. On a homeserver with both
      password and single sign-on, the stage shown could change between requests.
3. **Explained, not fixed here.**
    - `/v1/auth/matrix/exchange` mints a 30-day refresh token that no in-repo client keeps, and
      `/token/refresh` never re-checks the Matrix device. The follow-up is an API change: stop
      minting it for the full app, or bind refresh to the device.
    - MAS (D8). No API session list. The shell-off reachability gap. Drafts keyed per room (D7).
    - The multi-tab race of §4.11, and S15.
    - `util/cryptE2ERoomKeys.js` accepts any round count from an imported file (§4.12; only
      relevant under D13 (d)).
    - The full app's Rust store uses the SDK's default name for every account
      (`initMatrix.ts:322-325`), so stored accounts share one store name. This is pre-existing
      and affects burner switching. Sign-out's claim about it holds because the store this client
      loaded is this account's.
4. **What Sign out ends and doesn't**, with the server code references from §4.2.
5. **Verification.** The unit tests by name; the mutation checks and their results; the e2e run
   (date, commit, Synapse version, the API env with secrets redacted, commands, pass/fail per
   step, with the server-side assertions quoted); what was not run (§7.4).
6. **Decisions.** D1-D14 and the operator's answers. For D12, record only which wording shipped,
   not why it was a question.

### 8.4 `TRUST.md` (changes; rebuild the trust page)

-   BO-1 note (`:136-143`), first sentence → `Some users see "unable to decrypt" on older
messages when they sign in on a new device. Blackout doesn't yet have a screen that restores
message keys from a key backup or receives them from your other sessions, so this happens
even when a backup exists, and signing out and back in is one way to get there. A backup
still lets another Matrix app with your recovery key restore older messages.` The rest of
    the paragraph stays. The old sentence implied that a backup avoids it in Blackout, which is
    not true today. (With D13 (d), add: `Settings → Sessions can export your message keys to a
password-protected file before you sign out, and import them after.`)
-   Then `pnpm build:trust-page`, and `guard:trust-page` must pass. The new sentence needs the
    operator's wording review, like any trust-page line.

### 8.5 Other records

-   `KNOWN_ISSUES.md` BO-1 (`:32-38` and the table row `:48`): the description's "when no
    server-side key backup exists or it fails to restore" becomes "because Blackout can't yet
    restore keys from a backup or receive them from the account's other sessions, whether or not
    a backup exists". The workaround becomes `None in Blackout yet. Another Matrix app with the
account's recovery key may restore backed-up keys there. For an account with no backup and
no cross-signing, the nudge's “Set up backup” starts one, which other Matrix apps can restore
from; Blackout can't yet.` (With D13 (d): `Before signing out, export message keys under
Settings → Sessions, and import them after signing back in.`) The table row's workaround
    cell gets the short form: `None in Blackout yet (another Matrix app can restore a backup)`.
    Add a note pointing to S9 and to §4.10's guard, and that "Settings → Encryption" never
    existed. Status unchanged. `docs/audits/2026-08-10-encryption-audit.md:353` is a dated
    record and is not edited.
-   `docs/security/release-identities-2026-10-26.md` decision 18 (`:726-738`): append a dated note,
    without rewriting the record: "<build date>: Settings → Sessions now ends Matrix sessions (this
    device, or others after re-authentication); see `sign-out-and-sessions-<date>.md`. The
    separate API password still has no screen."
-   `apps/blackout-server/PATCHES.md`: no change (§1).

---

## 9. Out of scope (follow-ups for the operator)

1. D13 (b): a reviewed restore path (recovery key entry, `BackupRestoreTile`,
   `ReceiveSelfDeviceVerification`, `AutoRestoreBackupOnVerification`). With it, the key lines
   in §6.2.3 and §6.9 change.
2. The panic wipe ending server sessions (D6 / #989 decision 1). The panic wipe could also
   remove the sync-filter keys (S12).
3. API: stop minting unused refresh tokens at `/matrix/exchange`, or bind `/token/refresh` to
   the Matrix device; an API session list.
4. Under W-B: switch to the W-A wording once #58 has landed and been verified.
5. A CI homeserver service, so the sessions spec runs in CI (D9).
6. The MAS account-management link (D8).
7. The panel's `logout` awaiting `clearClientStores` (S10), and sign-in pruning of the
   SDK-prefixed sync databases (S11).
8. `DeviceVerificationReset`'s and `RecoveryKeyDisplay`'s recovery-key sentences (§4.10). The
   chip's own text is now changed in this PR (§6.9).
9. S15: bind the full app's API token to the tab's account (a per-account key, or a check on
   every read).
10. S17: move `client/encryptionHealth.ts` to `checkAccountKeyState`, so diagnostics stop
    saying "no backup" when the check failed. `BackupRestore.tsx` (unmounted, D13 (b)) uses
    `useKeyBackupInfo` the same way and must move too before it is mounted.
11. D13 (d) if not built here; D14's per-method line if wanted.
12. `AppShell.tsx:22-23` imports `KeyBackupNudge` and `AutoRestoreBackupOnVerification` and never
    renders them, so the nudge appears only inside ClientLayout.
13. One Rust store name for every full-app account (§8.3 item 3).

---

## 10. File-by-file change list

| File                                                                                                                                                                                                     | Change                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/blackout-client/src/client/signOut.ts`                                                                                                                                                             | **new**: `signOutOfThisDevice`, `forgetThisDeviceHere`, report types (§4)                                                                                                                                                                                                                                                            |
| `apps/blackout-client/src/client/initMatrix.ts`                                                                                                                                                          | delete `logoutClient`; handler map with suspend/resume; `deleteIndexedDbTracked`; `isUserStoreName` / `isUserRustStoreName`, also used by `cleanupStaleStoresForUser` (S14); `handleSessionLoggedOut` uses `forgetSession`, `resetApiSessionForAccountChange` and removes the push marker in the full app; export store-name helpers |
| `apps/blackout-client/src/client/apiSessionLatch.ts`                                                                                                                                                     | **new**: generation and sign-out latch (§4.8.3)                                                                                                                                                                                                                                                                                      |
| `apps/blackout-client/src/client/blackoutApiSession.ts`                                                                                                                                                  | generation via the latch module; `beginApiSignOut`, `resetApiSessionForAccountChange`; latch checks in `ensureBlackoutApiToken` and `runExchange`; `apiTokenOwner`, `localpartOf`; per-token outcome; `revokeBlackoutApiTokens(userId, extra)`; legacy key cleared                                                                   |
| `apps/blackout-client/src/client/keyBackupCheck.ts`                                                                                                                                                      | **new**: `checkAccountKeyState`, `accountKeyVerdict` (§4.8.11)                                                                                                                                                                                                                                                                       |
| `apps/blackout-client/src/client/sessionSwitch.ts`                                                                                                                                                       | `resetApiSessionForAccountChange()` in place of `clearBlackoutApiToken()`                                                                                                                                                                                                                                                            |
| `apps/blackout-client/src/app/features/monetization/marketplace/useMarketplaceAuth.ts`                                                                                                                   | `readBlackoutApiToken` returns `null` while latched                                                                                                                                                                                                                                                                                  |
| `apps/blackout-client/src/client/auth.ts`                                                                                                                                                                | `establishSession` calls `resetApiSessionForAccountChange()`                                                                                                                                                                                                                                                                         |
| `apps/blackout-client/src/client/sessionManager.ts`                                                                                                                                                      | `forgetSession`                                                                                                                                                                                                                                                                                                                      |
| `apps/blackout-client/src/app/state/auth.ts`                                                                                                                                                             | `signOutReportAtom`                                                                                                                                                                                                                                                                                                                  |
| `apps/blackout-client/src/main.tsx`                                                                                                                                                                      | `/settings` route; `SignOutNotice` and `StoredAccounts` on the logged-out card; register `resetQueryCache`                                                                                                                                                                                                                           |
| `apps/blackout-client/src/app/pages/paths.ts`                                                                                                                                                            | `SETTINGS_PATH`                                                                                                                                                                                                                                                                                                                      |
| `apps/blackout-client/src/app/pages/settings/SettingsRoute.tsx`                                                                                                                                          | **new**                                                                                                                                                                                                                                                                                                                              |
| `apps/blackout-client/src/app/pages/shell/PrimaryNavBar.tsx`, `MobileTopBar.tsx`                                                                                                                         | Settings link                                                                                                                                                                                                                                                                                                                        |
| `apps/blackout-client/src/app/pages/client/ClientLayout.tsx`                                                                                                                                             | `openSettingsSection` takes any section; `onSettingsPicked` to the switcher                                                                                                                                                                                                                                                          |
| `apps/blackout-client/src/app/features/sessions/{SessionsSettings,SignOutButton,RevokeAllBlackoutSessions,SignOutNotice,StoredAccounts}.tsx`, `sessionsText.ts`                                          | **new**                                                                                                                                                                                                                                                                                                                              |
| `apps/blackout-client/src/app/features/settings/SettingsPage.tsx`, `settingsAtoms.ts`, `AccountSettings.tsx`                                                                                             | section, id, text                                                                                                                                                                                                                                                                                                                    |
| `apps/blackout-client/src/app/features/settings/devices/OtherDevices.tsx`, `DeviceTile.tsx`                                                                                                              | strings, `onSignedOut`, error classes, reload result, aria-labels; `DeviceLogoutBtn` busy ref                                                                                                                                                                                                                                        |
| `apps/blackout-client/src/app/features/settings/security/encryptionPosture.ts`, `KeyBackupNudge.tsx`                                                                                                     | the guard, the render rule, the reworded verdicts and comments (§4.10, §6.9)                                                                                                                                                                                                                                                         |
| `apps/blackout-client/src/app/components/message/content/FallbackContent.tsx`                                                                                                                            | the chip's guard, label, text and comment                                                                                                                                                                                                                                                                                            |
| `apps/blackout-client/src/app/components/ActionUIA.tsx`                                                                                                                                                  | `ActionUIAFlowsLoader` uses `pickUIAFlow` (§4.8.12)                                                                                                                                                                                                                                                                                  |
| `apps/blackout-client/src/app/features/data-transparency/DataTransparencySettings.tsx`                                                                                                                   | link to Sessions; error state (§3.0)                                                                                                                                                                                                                                                                                                 |
| `apps/blackout-client/src/app/features/burner-identity/BurnerIdentitiesPanel.tsx`                                                                                                                        | no "Switch to" without a saved session (§4.7)                                                                                                                                                                                                                                                                                        |
| with D13 (d) only: `apps/blackout-client/src/app/features/settings/devices/LocalBackup.tsx`, `features/sessions/SessionsSettings.tsx`, `PanicSettings.tsx`                                               | strings, `friendlyText`, the mount, the "files you saved" item (§4.12, §6.10)                                                                                                                                                                                                                                                        |
| `apps/blackout-client/src/app/hooks/useDeviceList.ts`                                                                                                                                                    | third element (state); `refresh` resolves `boolean`                                                                                                                                                                                                                                                                                  |
| `apps/blackout-client/src/app/components/LogoutDialog.tsx`                                                                                                                                               | rewritten (§4.8.7, §6.2-6.3)                                                                                                                                                                                                                                                                                                         |
| `apps/blackout-client/src/app/components/uia-stages/PasswordStage.tsx`                                                                                                                                   | `PASSWORD_STAGE_HINT`                                                                                                                                                                                                                                                                                                                |
| `apps/blackout-client/src/app/shell/DialogHost.tsx`                                                                                                                                                      | comment                                                                                                                                                                                                                                                                                                                              |
| `apps/blackout-client/src/app/features/navigation/QuickSwitcher.tsx`                                                                                                                                     | Sessions entry; `onSettingsPicked`                                                                                                                                                                                                                                                                                                   |
| `apps/blackout-client/src/app/features/release-keys/ReleaseKeysPanel.tsx`                                                                                                                                | use the extracted component; `RELEASE_KEYS_LOST_DEVICE[1]`; W-B revoke-all strings via `sessionsText.ts`                                                                                                                                                                                                                             |
| `apps/blackout-client/src/app/features/panic/PanicSettings.tsx`                                                                                                                                          | `PANIC_SIGN_IN_DETAIL`                                                                                                                                                                                                                                                                                                               |
| `tools/audit-navigation/route-manifest.ts`                                                                                                                                                               | `/settings` entry                                                                                                                                                                                                                                                                                                                    |
| `playwright/live/sessions.spec.ts`, `playwright.sessions.config.ts`                                                                                                                                      | **new** (§7.4)                                                                                                                                                                                                                                                                                                                       |
| `apps/blackout-client/tests/unit/**`                                                                                                                                                                     | new and updated tests (§7.1-7.2)                                                                                                                                                                                                                                                                                                     |
| `KNOWN_LIMITATIONS.md`, `THREAT_MODEL.md`, `TRUST.md` (+ the generated trust page), `KNOWN_ISSUES.md`, `docs/security/sign-out-and-sessions-<date>.md`, `docs/security/release-identities-2026-10-26.md` | §8                                                                                                                                                                                                                                                                                                                                   |
| not touched                                                                                                                                                                                              | `featureFlags.ts` and any env or config defaults, `apps/blackout-server/**`, `packages/api/**`, `apps/blackout-client/config.json`, `apps/blackout-client/src/util/cryptE2ERoomKeys.js` (reviewed, used as is), `client/encryptionHealth.ts` (S17, follow-up), any lint, type or test exclusion                                      |
