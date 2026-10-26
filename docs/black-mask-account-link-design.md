# Black Mask account link (B4 and B5) — design

**Status 2026-10-24: design, not built.** This document replaces the B4/B5
design sent to the operator on 2026-10-12, whose only copy is gone, and the
build follows it. It covers section 4 of
`docs/black-mask-chat-panel-and-account-link.md` (the spec) and steps B4
("optional account link") and B5 ("unlink or expiry") of the launch plan
(free-black-market `docs/BLACK_MASK_LAUNCH_PLAN.md` §6). Sections 1 to 3 of the
spec describe B1 to B3, which this design builds on and does not change.

It was checked against three trees, read only except for this file: this
repository at `develop` 6ea67c4, the Black Mask repository (the Bitwarden
clients fork) at `main` aa8bbe11, and free-black-market (FBM) at 0f100c7.
While it was written, `develop` moved on to 6f8b008: PR #967 added migration
102 and moved the API's background loops onto one leader process. Section 1.6
and the API steps take that into account.

## Decisions this design follows

**Decision 1 (operator, 2026-10-24): option A.** One panel sign-in per link,
and the link lasts exactly as long as that sign-in. No homeserver (Synapse)
code. Two options were rejected:

-   **B:** one link for the whole account. It needs homeserver code.
-   **C:** linking a panel that is already signed in. It needs a small
    homeserver endpoint, because B3 records a device's length once and
    answers 409 to any second length
    (`apps/blackout-server/blackout_runtime/session_length.py`, `bind`).

Under A, a link is created during a fresh panel sign-in. Its length is the
session length that B3 already binds to that new device. Its end is the end
that B3's homeserver module and the API already enforce. Ending a link means
ending that sign-in.

Decisions 2 to 10 were recorded with recommended answers. This design assumes
each answer. None turned out to be impossible in the code. Where the code adds
a condition, the table says so, and the condition becomes a question in
section 6.

| #   | Recommended answer (assumed)                                | How the design applies it                                                                                                             | What the code adds                                                                                                                                  |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | Blackout's own sign-up runs inside the flow                 | The panel's Create account tab and its anonymous account-number sign-up both run in link mode. Black Mask never creates the account   | A new account can be linked only where the API is allowed to create accounts on exchange (`BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS`). See Q2            |
| 3   | Black Mask shows a code; the person types it into the panel | The API mints the code for Black Mask. The panel claims it after sign-in                                                              | Black Mask has to poll while its code screen is open, because the panel sends its frame nothing (section 2.2, step 9)                               |
| 4   | The vault pulls link state at launch                        | `POST /v1/integrations/black-mask/links/state` runs at browser start and when the Blackout chat screen opens                          | The vault deletes what it stored for a link the next time it launches, not when the link ends                                                       |
| 5   | Black Mask may end links                                    | `POST /v1/integrations/black-mask/links/end`, using the vault's link credential                                                       | —                                                                                                                                                   |
| 6   | Nothing identifying is shared                               | Neither side is sent the other side's account. The API refuses any extra field                                                        | Blackout still learns that the account uses Black Mask, and the Black Mask extension can see the pages it runs on, the panel included (section 4.2) |
| 7   | Unlink lives in the panel and in Settings                   | The panel gets a link-status page and an "Unlink and sign out" button. Blackout's Settings → Account gets a list of links with Unlink | "Settings" is read here as Blackout's Settings. Black Mask's own End link is decision 5                                                             |
| 8   | Linking is not offered under MAS                            | Linking needs B3 fully on, and the claim needs a recorded session length. A MAS homeserver cannot record one                          | What happens to links made before a flip to MAS is Q5                                                                                               |
| 9   | Pre-existing defects are triaged separately                 | Section 7 lists them. None is fixed here                                                                                              | Whether an open panel promptly notices a link ended elsewhere depends on D1 (Q7)                                                                    |
| 10  | FBM `/link` gaps go to FBM's `docs/AUDIT_DEBT.md`           | Section 5.5 lists the rows to add                                                                                                     | FBM needs no code for B4 or B5                                                                                                                      |

## 1. Where things stand, verified

### 1.1 What B1 to B3 built

All of this is built and not deployed, and all of it is off by default.
Details are in the spec, sections 1 to 3.

| Step | What exists                                                                                                                                                                                                                                                                                                                        | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1   | The panel at `/embed`: canopies, text dens and DMs, the New canopy and New den screens, and sign-in inside the panel. `main.tsx` decides once, from the path the page loaded on, whether to render the panel or the full app                                                                                                       | `apps/blackout-client/src/app/features/black-mask-embed/` (`EmbedApp.tsx`, `EmbedLayout.tsx`, `embedRoutes.tsx`, `embedPaths.ts`, `embedScope.ts`, `EmbedNew.tsx`). The `EMBED_*` paths are in `apps/blackout-client/src/app/pages/paths.ts`                                                                                                                                                                                                                                                                                                                                                                           |
| B2   | `/embed` and `/embed/*` may be framed only by the origins in `BLACK_MASK_FRAME_ANCESTORS`. Every other route refuses framing. The front proxies pass the panel's policy through                                                                                                                                                    | `apps/blackout-client/docker-nginx.conf`, `apps/blackout-client/nginx/{frame-deny,embed-frame}.conf`, `apps/blackout-client/nginx/docker-entrypoint.d/40-black-mask-frame-ancestors.sh`; `infra/nginx` and `infra/single-server-baseline/nginx`; `tools/ci/check-embed-proxy-framing.mjs`                                                                                                                                                                                                                                                                                                                              |
| B3   | Session lengths behind three switches. The client picks a length, binds it on the homeserver and keeps its own session names. The homeserver records the length, caps the device's tokens and sweeps the device at the end. The API caps the JWT (`exp`, `sxp`) and the refresh-token family (`session_expires_at`, migration 100) | Client: `apps/blackout-client/src/client/{panelSessionLengthsFlag,storageNamespace,sessionManager,sessionLength,auth,initMatrix,blackoutApiSession}.ts` and `apps/blackout-client/src/app/components/bmc/auth/{LoginPage,LoginForm,RegisterForm,SessionLengthPicker}.tsx`. API: `packages/api/src/services/{sessionLength,auth,refreshToken}.ts`, `packages/api/src/routes/auth.ts`, `packages/api/src/integrations/matrix-client.ts` (`sessionLength`). Homeserver: `apps/blackout-server/blackout_runtime/session_length.py`, tested by hand in `apps/blackout-server/tests/blackout_runtime/test_session_length.py` |

The parts of B3 that this design relies on:

-   **The bind.** `POST /_synapse/client/blackout/session/length` takes the new
    device's own token. It records the length once and caps that device's
    access and refresh tokens in the same transaction. A second length is
    refused with 409. It answers `{device_id, session_length, expires_at_ms}`.
    `GET` on the same path returns the same three fields for the calling
    device, or nulls when no length is recorded.
-   **The sweep.** At the end, the module's sweep calls
    `DeviceHandler.delete_devices`. That is Synapse's normal sign-out of a
    device: its access and refresh tokens, its end-to-end encryption keys and
    its pushers go.
-   **MAS.** Under MAS (`experimental_features.msc3861`) the module refuses to
    start (`delegated_auth_enabled`), so both paths answer 404.
-   **The panel's client.** It binds before it stores or uses any token
    (`establishSession` in `apps/blackout-client/src/client/auth.ts`). Its
    Sign out first asks the API to refuse its JWT, then signs the device out
    and deletes its stores (`signOutPanel`). A session found past its end is
    ended at load (`endPanelSession` in `initMatrix.ts`).
-   **The API.** It never takes a length from the client. The exchange asks
    the homeserver when the session ends (`matrixClient.sessionLength`) and
    caps what it issues at that end (`issueSession` in `routes/auth.ts`).

### 1.2 The panel's session under B3's three switches

The switches:

-   the web client's build-time `VITE_BLACKOUT_PANEL_SESSION_LENGTHS`
    (`panelSessionLengthsFlag.ts`);
-   `session_lengths_enabled` in the homeserver's `blackout_runtime` config;
-   the API's `BLACKOUT_SESSION_LENGTHS`, together with migration 100.

No in-repo deployment sets any of them. The only in-repo homeserver config
that loads `blackout_runtime` is the example
`apps/blackout-server/docs/homeserver.blackbox.yaml`, and it does not turn
session lengths on. No deployment's config loads the module (spec, section 3).

| Client switch     | Homeserver and API                                                            | What a panel sign-in does                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Off (the default) | Any                                                                           | Signs in as before B3. There is no length choice and no Sign out bar, and the panel uses the full app's storage names (`blackout.matrix.sessions.v1`, `blackout.api.token`). Whether it shares a Blackout tab's session depends on how the browser partitions storage for extension frames, which has not been checked                                                                                                   |
| On                | Either one does not answer (404 or 503; under MAS the homeserver answers 404) | Uses the panel's own names (`blackout.matrix.sessions.embed.v1`, `blackout.api.token.embed`, and per-device IndexedDB names). The picker enables only "Until I sign out" and says the server can't end sessions on a timer. No bind request is sent, because the choice is not `enforcedByServer` (`toPanelSessionChoice`). The panel has a Sign out bar. The session ends only through Sign out or the device's removal |
| On                | Both answer                                                                   | All five lengths are offered (1 hour, 1 day, 7 days, 30 days, "Until I sign out"; nothing preselected). Each is bound before anything is stored, "Until I sign out" included (recorded with no end). The servers end a timed session on time even with the panel closed. The panel's own timer, which uses the device clock, signs it out at the end too                                                                 |

Linking is offered only in the third row, and only when the link switches in
section 2.6 are also on.

### 1.3 What B4 and B5 need and do not have

-   **No link exists anywhere.** There is no record, table, route or client
    code for one. Searches of `packages/api/src`, `packages/sdk/src`,
    `packages/core/src`, `apps/blackout-client/src` and
    `apps/blackout-server/blackout_runtime` find "Black Mask" only in B3's
    session-length files. `KNOWN_LIMITATIONS.md` lists "account linking
    (B4/B5)" under "Not there yet".
-   **The API cannot sign a device out.** `integrations/matrix-client.ts` has
    no device call. It does hold the bot token, which must belong to a Synapse
    admin (`packages/api/.env.example`, the `MATRIX_BOT_TOKEN` comment). The
    API already uses that token for admin calls such as
    `PUT /_synapse/admin/v2/users/…` (`registerUser`) and for the startup
    probe `adminPreflight`.
-   **API sessions do not know their device.** The exchange's `whoami` returns
    `deviceId`, but `POST /v1/auth/matrix/exchange` ignores it. Neither
    `AuthTokenPayload` (`services/auth.ts`) nor `RefreshTokenRecord`
    (`db/types.ts`) carries a device or a link.
-   **The panel has nothing for linking.** It has no code field and no link
    page, and `PanelSignedOutReason` (`app/state/auth.ts`) is only
    `session_ended | signed_out`.
-   **Black Mask has no panel host and no Blackout code** (section 1.5).

### 1.4 The bridge the spec points to, read in full

The spec calls for "a signed handshake, like the existing FBM↔Blackout
bridge". Read in full, that bridge is not a signed handshake.

**FBM's `POST /v1/integrations/blackout/link`**
(`backend/src/api/v1/integrations/blackout/link/route.ts`):

-   It accepts `ENTITLEMENTS_SERVICE_TOKEN`, or an integration JWT that FBM
    issues itself (`iss: fbm`, `aud: blackout`, signed with FBM's own
    `JWT_SECRET` by `/v1/integrations/blackout/oauth/token`;
    `backend/src/lib/blackout-oauth.ts`). Both are bearer credentials for a
    deployment. Neither proves anything about a user.
-   The body is `{blackoutUserId, mxid?, customerId?, sellerId?}`.
-   It refuses to move a customer or seller already linked to a different
    Blackout id (`forbidden()`, 403). With no match, it creates a customer
    (`resolveOrCreateCustomerForBlackoutUser` in
    `backend/src/lib/blackout-identity.ts`).
-   There is no body signature, no timestamp and no unlink.
-   Nothing in Blackout calls it. Blackout calls FBM's coalition, reputation,
    entitlements and commerce routes and never `/link`.

**The channels that are signed:**

-   FBM to Blackout webhooks are an HMAC over the body only, `x-fbm-signature`
    (`verifyWebhook` in `packages/api/src/integrations/marketplace/freeblackmarket.ts`).
-   FBM's Black Mask provisioning webhook is an HMAC over
    `{timestamp}.{raw_body}`, with a key id and a ±300-second window
    (FBM `docs/BLACK_MASK_PROVISIONING_CONTRACT.md` §5).

**Why the link cannot be HMAC-signed.** Both signed channels run between two
servers that hold a shared secret. The vault side of this link is the Black
Mask client: a browser extension that anyone can unpack, so a secret shipped
inside it signs nothing. The Black Mask repository holds only the clients.
Vaultwarden and the provisioning service are elsewhere, so no Black Mask
server component is in reach. Black Mask's rule against adding encryption
logic (its repository instructions) also rules out a client keypair.

**What the handshake is instead.** It follows the shape of the OAuth device
authorization grant (RFC 8628). Every secret is minted by Blackout's API and
kept there only as a SHA-256 hash, as `pending_oauth_links` already does
(`packages/api/src/db/migrations/008_linked_accounts.up.sql`). The shape of
the FBM model survives in the record: a Blackout user id plus a target. Here
the target is a Matrix device and an opaque Black Mask credential rather than
an FBM customer id. See Q1.

### 1.5 Black Mask as it stands

-   **Scope.** Black Mask ships as the browser extension and the web vault
    (`CONSOLIDATION.md`). Its v1 has "no coalition/Blackout dependency"
    (`docs/black-mask/README.md`).
-   **No panel host.** Nothing frames `/embed`. A search of `apps` and `libs`
    for `blackout`, `/embed` and Matrix finds nothing relevant. In
    `apps/browser/src/manifest.v3.json` the side panel's default path is
    `sidepanel-disabled.html`. `bootstrap()` in
    `apps/browser/src/background/main.background.ts` turns the side panel off
    everywhere and turns it on per tab only for autofill triage. The side
    panel runs the popup app with `?uilocation=sidepanel`
    (`apps/browser/src/platform/browser/browser-popup-utils.ts`). Privacy
    screens are popup routes in `apps/browser/src/popup/app-routing.module.ts`.
-   **What it can store.** There are three places:
    1. **Vault items (ciphers),** through `CipherService`. Existing code
       encrypts them, they sync to the vault server, and reading them needs
       an unlocked vault. Personas are Identity ciphers tagged with a custom
       field (`apps/browser/src/privacy/popup/services/persona.service.ts`).
    2. **The state framework** (`libs/state`). A `StateDefinition` is
       registered in `libs/state/src/core/state-definitions.ts`, and a
       per-account `UserKeyDefinition` takes `clearOn: ["lock" | "logout"]`.
       In the extension, "disk" means `chrome.storage.local`, through
       `BrowserLocalStorageService`, which adds no encryption.
    3. **`chrome.storage.session`,** which the fingerprint and tracker
       features use. It is cleared when the browser closes.
-   **Calling other servers.** It uses `ApiService.nativeFetch(Request)`
    (`libs/common/src/services/api.service.ts`), as `AuditService` already
    does for the HIBP range API.
-   **Content scripts and permissions.** `manifest.v3.json` injects
    `content/trigger-autofill-script-injection.js` into every frame
    (`all_frames: true`) on `*://*/*`, and grants host permissions on
    `https://*/*` and `http://*/*`.

### 1.6 The migration number

-   On 6ea67c4 the API's migrations run up to
    `101_scheduled_message_body_retention`.
-   PR #967 added `102_deadman_backlog_grace` and was merged into `develop` on
    2026-10-24.
-   No pull request was open on 2026-10-24 (checked through the GitHub REST
    API), so none claims 103.

This design's migration is therefore **103**. The API change has to be based
on a `develop` that already contains 102.

## 2. The flow under option A

### 2.1 The credentials

| Credential                                    | Minted by                       | Held by                                                        | Stored as                                                                                        | Lives                                                                                              | Lets its holder                                       |
| --------------------------------------------- | ------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Link code (`BCDF-GHJK`)                       | API, `POST …/links`             | Black Mask shows it; the person types it into the panel        | API: SHA-256 of the normalized code on the pending row, cleared at the claim                     | 10 minutes, one use                                                                                | Bind **their own** panel sign-in to that pending link |
| Link credential (`bml_` plus 32 random bytes) | API, in the same answer         | Black Mask, per vault account, on that device                  | API: SHA-256 only. Black Mask: as returned, in its account's disk state (`chrome.storage.local`) | Until the row is deleted, 30 days after the link ends                                              | Read that link's state and end it. Nothing else       |
| Panel Matrix tokens                           | Synapse `/login` or `/register` | The panel                                                      | Panel localStorage under its own names (B3)                                                      | B3, capped at the link's end                                                                       | Everything a Blackout device can do                   |
| Panel API JWT                                 | API exchange                    | The panel                                                      | `blackout.api.token.embed`                                                                       | At most 24 hours and capped at the end. It is also refused once the link ends (`lnk`, section 3.6) | `/v1` features                                        |
| Panel API refresh token                       | API exchange                    | Thrown away by the panel (B3). A modified client could keep it | API: the hash. Its family now carries `black_mask_link_id`                                       | At most 30 days, reset on each refresh, and capped at the end. Revoked when the link ends          | A new JWT                                             |

**Invariant:** the link credential gives no access to the Blackout account.
It cannot read or send messages, cannot mint any token and cannot learn who is
linked. Its only powers are reading the link's state and ending the link. Any
later vault extra that needs more must come with its own design.

### 2.2 Linking an existing Blackout account

| #   | Who calls                                                  | Request                                                                                                                                                 | Auth                                                                                                                          | Returns                                                                                            | What is stored, and where                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Black Mask, when the person opens its Blackout chat screen | `GET /v1/integrations/black-mask/config`                                                                                                                | None                                                                                                                          | `{enabled, codeLength, codeTtlSeconds, pollIntervalSeconds, newAccountsLinkable}`, or 404 when off | Nothing                                                                                                                                                                                                                                                                                                                                                                   |
| 1   | Black Mask, when the person chooses Link                   | `POST /v1/integrations/black-mask/links` with the body exactly `{}`                                                                                     | None. Limited per IP                                                                                                          | `{linkCredential, userCode, codeExpiresAt, pollIntervalSeconds}` (201, `cache-control: no-store`)  | **API:** a pending row holding the SHA-256 of the credential and of the code, and the code's expiry. No IP, no user agent, no account. **Black Mask:** `{credential, blackoutOrigin, status: "pending", codeExpiresAt}` in that vault account's disk state, so that a restart does not lose the ability to cancel                                                         |
| 2   | Black Mask                                                 | Shows the code and opens the panel at `/embed/link` in its frame                                                                                        | —                                                                                                                             | —                                                                                                  | Nothing                                                                                                                                                                                                                                                                                                                                                                   |
| 3   | The panel (signed out, link mode)                          | The person types the code. The panel normalizes it and checks its form locally, without asking any server. The person chooses the length in B3's picker | —                                                                                                                             | —                                                                                                  | Nothing                                                                                                                                                                                                                                                                                                                                                                   |
| 4   | The panel                                                  | Synapse `POST /_matrix/client/v3/login`, with a password or an account number                                                                           | Credentials                                                                                                                   | Access token, refresh token, device id                                                             | Nothing yet. The tokens stay in memory, as in B3                                                                                                                                                                                                                                                                                                                          |
| 5   | The panel                                                  | Synapse `POST /_synapse/client/blackout/session/length` with `{session_length}` (B3, unchanged)                                                         | The new access token                                                                                                          | `{device_id, session_length, expires_at_ms}`                                                       | **Homeserver:** the length (`blackout_session_lengths`), with the device's tokens capped at the end. On failure the panel signs the device out again and keeps nothing (B3)                                                                                                                                                                                               |
| 6   | The panel                                                  | API `POST /v1/integrations/black-mask/links/claim` with the body `{userCode}`                                                                           | `x-matrix-access-token: <new access token>`, never `Authorization` (as the exchange does). Limited per IP and per Matrix user | `{link: {id, sessionLength, linkedAt, endsAt}}` (201)                                              | **API:** the pending row turns active in one compare-and-swap. It gets the Blackout user id, the Matrix user id and device id from `whoami`, and the length and end from the homeserver's `GET …/session/length`, never from the client. The code hash is cleared. On any failure the panel signs the new device out (`signOutDeviceByToken`), keeps nothing and says why |
| 7   | The panel                                                  | Stores the session and starts the client                                                                                                                | —                                                                                                                             | —                                                                                                  | **Panel:** the session under its own names, with `sessionLength`, `sessionEndsAt` (device clock, as in B3) and the new `blackMaskLink: {id, linkedAt, endsAt}` (server values)                                                                                                                                                                                            |
| 8   | The panel (boot, unchanged call)                           | API `POST /v1/auth/matrix/exchange`                                                                                                                     | `x-matrix-access-token`                                                                                                       | JWT and refresh token                                                                              | **API:** as today, plus the device's active link is found, so the JWT carries `lnk: <link id>` and the refresh family carries `black_mask_link_id`. Both are capped at the end, as in B3. **Panel:** keeps the JWT under `blackout.api.token.embed` and throws the refresh token away, as today                                                                           |
| 9   | Black Mask, every 5 seconds while the code screen is open  | `POST /v1/integrations/black-mask/links/state` with the body `{linkCredential}`                                                                         | The credential, in the body                                                                                                   | `{status: "active", sessionLength, linkedAt, endsAt}`                                              | **Black Mask:** the record becomes `active` with those values. Polling stops and the screen shows "Linked"                                                                                                                                                                                                                                                                |

Black Mask has to poll in step 9 because nothing else can tell it that the
code was used. The panel sends its frame nothing (`THREAT_MODEL.md` §6c). This
was checked: `apps/blackout-client/src/app/features/black-mask-embed/` and
`apps/blackout-client/src/client/` contain no `postMessage`, `window.parent`
or `window.top`. The polling is bounded:

-   it runs only while the code screen is open;
-   it stops after at most 10 minutes;
-   it is the only polling in the design.

At every other time the vault pulls only at launch (decision 4).

### 2.3 Signing up inside the flow

Steps 0 to 3 and 5 to 9 do not change. Step 4 is one of the panel's two
existing sign-up paths, which already run inside the panel:

-   **4a, Create account.** `RegisterForm` calls `registerUser`, which walks
    Synapse's `/register` stages. On an invite-only homeserver this needs a
    registration token, as it does outside the flow. The new device's access
    token has no expiry by default, and the bind in step 5 caps it for a timed
    length (spec, section 3, table).
-   **4b, anonymous account number.** The API's `POST /v1/auth/account-number`
    creates the Matrix account and returns the number once. The person saves
    it, then "I've saved it — sign in" runs `/login` with the number
    (`apps/blackout-client/src/client/accountNumberAuth.ts`).

**What differs is step 6.** A brand-new account has no Blackout API account
yet. The claim follows the exchange's rule for that case
(`matrixExchangeProvisioningTrusted` in `routes/auth.ts`):

-   It creates the API account only when the operator has set
    `BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS`, that is, has asserted that this
    homeserver's accounts are minted only through Blackout.
-   Otherwise it answers 403 `matrix_exchange_provisioning_disabled`. The new
    device is signed out again, and the account stays.

The config answer's `newAccountsLinkable` tells the panel which case applies,
so that the Create account tab can say before sign-up that a new account
cannot be linked on this server. See Q2.

Nothing from Black Mask goes into the new account: no email, no name, no
identifier. Decision 2 is how this design meets the spec's "accepts a Black
Mask registration (creating the Blackout account from the handshake)": the
person signs up with Blackout's own forms, inside the flow, and the handshake
carries no data about them.

### 2.4 Where the code comes from, and how it binds two accounts without identifying either

-   **How it is made.** The API makes it with `crypto.randomInt`: eight letters
    from the 20 consonants B C D F G H J K L M N P Q R S T V W X Z, shown as
    `XXXX-XXXX`. The set has no vowels, so no codes form words, and no digits
    or look-alike letters. Eight of them give 20⁸ codes, about 34.6 bits: the
    set and length of the example in RFC 8628 §6.1.
-   **How the panel reads it.** The panel accepts lower case, spaces and
    hyphens. It refuses anything else before sign-in, so a mistyped letter
    from outside the set never costs a sign-in.
-   **Uniqueness.** On a collision with another pending code, the API draws
    again (a partial unique index on pending rows).
-   **The other secret.** The link credential is 32 bytes from `randomBytes`,
    prefixed `bml_` so that secret scanners can recognise it.

How the binding works:

-   The pending row is created by an anonymous request and names nobody.
-   Black Mask keeps the credential in its account's state on that device.
-   The code is the one-time bridge between the two screens, carried by the
    person.
-   The claim writes the Blackout account and device onto the row. From then
    on the vault's credential points at a row whose Blackout fields no
    endpoint ever returns to it.

The Blackout account and the Black Mask account are linked only through that
secret, and neither side is ever sent the other side's identifier.

| Item                                                    | Blackout API row                                                                                       | Black Mask record | Sent from one side to the other               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------- | --------------------------------------------- |
| Blackout user id, Matrix user id, device id             | Yes                                                                                                    | No                | Never                                         |
| Black Mask account (email, vault user id, vault server) | No                                                                                                     | Its own           | Never                                         |
| Link credential                                         | SHA-256                                                                                                | Yes               | Once, to Black Mask, when the link is created |
| Link code                                               | SHA-256, until the claim                                                                               | Shown on screen   | Typed by the person                           |
| Length, start, end, status, end reason                  | Yes                                                                                                    | A copy            | To Black Mask, in state answers               |
| IP address                                              | Not stored. The rate limiter keys on it in memory or Redis for its window (`middleware/rate-limit.ts`) | —                 | —                                             |

### 2.5 What the panel shows, and still does not show

**New in the panel:**

-   Link mode on the signed-out screen at `/embed/link`: the code field, then
    B3's picker, then sign-in or sign-up.
-   The link-status page at `/embed/link` once signed in (section 3.3).
-   A linked form of the session bar: "Linked to Black Mask until …" with an
    "Unlink and sign out" button.
-   The new path belongs in `pages/paths.ts` as `EMBED_LINK_PATH`. Every panel
    route must stay under `/embed`, or it does not get the panel's headers.
    `/embed/link` falls under nginx's `location ^~ /embed/` and passes
    `isEmbedPath`.

**Still not shown in the panel:**

-   The list in section 1 of the spec does not change.
-   Settings and the device list stay in the full app.
-   A panel signed in without a link offers no way to link. Option C was
    rejected, so the link page says that linking needs signing out and
    signing in again with a code.
-   The panel still sends the framing page nothing: no `postMessage`, no link
    id and no account.

**The device name.** The device keeps the display name the panel already sets,
`Blackout Client` (`initial_device_display_name` in `client/auth.ts`). A name
such as "Black Mask panel" would tell anyone who shares an encrypted room with
the person, and so sees their device list, that the person uses Black Mask.

### 2.6 When linking is offered

The panel offers link mode only when all of the following hold. Otherwise
`/embed/link` says linking is not available here and shows the ordinary
sign-in.

1. B3's client switch is on, with both servers answering, as in row 3 of
   section 1.2. Under MAS the homeserver answers 404, so linking is never
   offered there (decision 8).
2. A new client build-time switch, `VITE_BLACKOUT_PANEL_ACCOUNT_LINK`, is on.
   It is off by default, accepts the same values as B3's switch, and has no
   effect while B3's switch is off.
3. The API answers `GET /v1/integrations/black-mask/config` with 200. That
   needs:

    - `BLACKOUT_BLACK_MASK_LINKS` on (off by default);
    - `BLACKOUT_SESSION_LENGTHS` on;
    - migrations 100 and 103 in Postgres mode;
    - the bot token passing `adminPreflight` (cached for 60 seconds).

    Otherwise the endpoint answers 503 with `{enabled: false, code}` naming
    what is missing, or 404 when the flag is off.

**The server enforces the same conditions,** whatever the panel shows:

-   The claim refuses a device with no recorded length: 409
    `session_length_required`. That covers MAS, a homeserver without the
    module, and a panel that skipped the bind.
-   The claim reads the device through the admin API first (section 5.1), so
    a link is never made that the API could not later sign out.

## 3. The link record and its lifecycle

### 3.1 The record

There is one table, `black_mask_links`. A row starts pending and becomes
active at the claim. The full SQL is in section 5.1.

| Field                                | Set at                                   | Notes                                                                              |
| ------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `id`                                 | Creation                                 | Random UUID. Shown in Blackout's Settings, never to Black Mask                     |
| `status`                             | Creation, claim, end                     | `pending`, `active` or `ended`                                                     |
| `link_secret_hash`                   | Creation                                 | SHA-256 of the link credential. Unique                                             |
| `user_code_hash`, `code_expires_at`  | Creation                                 | The hash is cleared at the claim, or when the code expires unused                  |
| `blackout_user_id`                   | Claim                                    | `users.id`, references `users` with `ON DELETE CASCADE`, as `linked_accounts` does |
| `matrix_user_id`, `matrix_device_id` | Claim                                    | From `whoami`. Checked against the `device_id` in the homeserver's answer          |
| `session_length`                     | Claim                                    | One of B3's five lengths, read from the homeserver                                 |
| `linked_at`, `ends_at`               | Claim                                    | `ends_at` is the homeserver's `expires_at_ms`, and is null for "Until I unlink"    |
| `ended_at`, `ended_reason`           | End                                      | The reasons are listed below                                                       |
| `device_signed_out_at`               | When the API confirms the device is gone | Null on an ended row means a device sign-out is still owed (section 3.7)           |

**End reasons:**

| Reason                    | What happened                                                      |
| ------------------------- | ------------------------------------------------------------------ |
| `code_expired`            | The code was never used                                            |
| `cancelled_by_black_mask` | The pending link was cancelled from Black Mask                     |
| `unlinked_in_panel`       | Unlinked from the linked panel                                     |
| `unlinked_in_settings`    | Unlinked from Blackout's Settings                                  |
| `ended_by_black_mask`     | Ended from Black Mask                                              |
| `expired`                 | The length ran out                                                 |
| `device_signed_out`       | The device was found gone: signed out in some other way            |
| `account_deleted`         | The Blackout account was deleted. The row is purged straight after |

**How status is read.** Every read goes through one function,
`effectiveStatus(row, now)`. An `active` row whose `ends_at` has passed reads
as `ended`/`expired` whether or not the stored row has been updated yet. No
background loop is needed for expiry. That matters because, since #967, the
loops run only on the leader process (`deploy/docker/production`'s `worker`).

**Rules for a device.** A device can be linked once, ever. The claim refuses
any device that already has a row, active or ended. An ended link is never
reopened, and linking again means signing in again.

**Retention:**

-   Pending rows are deleted one hour after their code expires.
-   Ended rows are deleted 30 days after they end. Both prunes run during the
    create request. The store's existing prune helpers have no callers (D2),
    so nothing else would remove the rows.
-   On account deletion the rows go with the account.

### 3.2 Durations and server-enforced expiry

-   **Choices.** The choices are B3's: 1 hour, 1 day, 7 days, 30 days, or
    until unlinked. Nothing is preselected, and Sign in and Create account
    stay disabled until one is chosen. Option A rules out any other length:
    a new one would be homeserver code, because the module accepts exactly
    those five (`SESSION_LENGTHS_MS`). In link mode the picker's legend reads
    "How long should this link last?" and the last choice reads "Until I
    unlink".
-   **How a timed link ends on the servers.** It ends whether the panel is
    open or closed, and whether Black Mask is running or not:
    -   The homeserver refuses the device's tokens from the end on, and its
        sweep deletes the device, every 60 seconds by default (B3).
    -   The API refuses the JWT (`sxp`) and the refresh family
        (`session_expires_at`) at the end (B3).
    -   The link reads as ended from the end on (section 3.1).
-   **The API's backstop.** If the device is still present five minutes after
    the end (the sweep is off or failing), the API deletes it through the
    admin API the next time anything reads the link.
-   **"Until I unlink"** has no end on any server. It lasts until it is ended
    in one of the ways in section 3.4.

### 3.3 The link-status screens

-   **In the panel, at `/embed/link`:**
    -   "Linked to Black Mask since 24 Oct, 14:02, until 25 Oct, 14:02" or
        "until you unlink". The times are the server's values from the claim.
    -   What is linked: "this panel's sign-in as @name:server" (the panel
        already knows the account) "and the Black Mask app that shows this
        panel".
    -   The claims in section 4.5.
    -   "Unlink and sign out".
-   **In Blackout's Settings → Account, next to Linked accounts**
    (`features/settings/account/Account.tsx` mounts `LinkedAccounts`), a new
    section, Black Mask chat panels:

    -   one line per active link: start, end, device id, and "This device"
        when it is the panel itself;
    -   links that ended in the last 30 days, with when and why;
    -   Unlink on each active one, after a confirmation.

    The full app's Settings → Devices may label the matching device "Black
    Mask chat panel (linked)" for the person themself, from the same list.

-   **In Black Mask's Blackout chat screen:**
    -   pending: the code, its countdown, "Get a new code" and "Cancel";
    -   active: "Linked since …, until …", "Last checked …" and "End link";
    -   ended, as found at launch: a one-time notice saying the link ended,
        why, and that Black Mask removed what it kept for it.

### 3.4 What happens when a link ends

On every row below, the Blackout account, its Matrix account, its other
devices and sessions, its rooms and its messages are untouched (section 3.5).

| Trigger                                                                                                                             | Link record                                                                                                   | The device (chat session)                                                                                                                                                                             | The panel's API tokens                                                                                                                               | The panel in the browser                                                                                                                       | The vault                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unlink in the panel**: `DELETE /v1/integrations/black-mask/links/:id` with the panel's JWT, then B3's sign-out                    | `ended`, `unlinked_in_panel` (the JWT's `lnk` names this link)                                                | The API deletes it through the admin API. The panel's own logout afterwards finds it gone, and that is ignored                                                                                        | `lnk` refused at once. The refresh family is revoked                                                                                                 | Stores deleted at once (`signOutPanel`). It says "You unlinked this panel from Black Mask, so it was signed out"                               | Learns at its next launch. Deletes its record                                                                                                      |
| **Unlink in Blackout's Settings**: the same `DELETE` with the full app's JWT                                                        | `ended`, `unlinked_in_settings`                                                                               | Deleted through the admin API                                                                                                                                                                         | Same as above                                                                                                                                        | If open, it is signed out on its next request with a dead token (subject to D1). If closed, the next time it opens. It then deletes its stores | Next launch                                                                                                                                        |
| **Black Mask ends it**: `POST …/links/end` with the credential                                                                      | `ended`, `ended_by_black_mask`                                                                                | Deleted through the admin API                                                                                                                                                                         | Same as above                                                                                                                                        | Same as above                                                                                                                                  | Deletes its record as soon as the API confirms. If the API cannot be reached, it keeps the record with `endPending` and retries at the next launch |
| **Expiry** (a timed length)                                                                                                         | Reads `ended`, `expired` from `ends_at` on                                                                    | Refused at the end, swept within the sweep interval, and deleted by the API's backstop if still there after five minutes (section 3.2)                                                                | Refused at the end (B3 `sxp` and `session_expires_at`, and `lnk`)                                                                                    | The panel's own timer signs it out at the end if it is open. Otherwise it is ended at the next load (B3). It says the link's length is up      | Next launch                                                                                                                                        |
| **The device is signed out some other way** (Settings → Devices, `/logout/all`, a password change that signs devices out, an admin) | Ended `device_signed_out` when the API next finds the device gone (a state pull, the Settings list or an end) | Already gone                                                                                                                                                                                          | JWTs with `lnk` refused once the record is ended. Until then they are honoured, with a JWT lasting at most 24 hours, as for any device removed today | As for Settings                                                                                                                                | Next launch. The pull checks the device                                                                                                            |
| **The Blackout account is deleted** (the existing two-step deletion)                                                                | Every link ends with `account_deleted`, then the rows are purged with the account                             | Every linked device is deleted through the admin API before the purge. Account deletion does not yet deactivate the Matrix account (`KNOWN_LIMITATIONS.md`, "Deleting your account"), so this matters | Already refused by account deletion                                                                                                                  | As for Settings                                                                                                                                | Its next pull gets 401 `link_unknown`, which it treats as ended                                                                                    |
| **The code is never used**                                                                                                          | Reads `ended`, `code_expired`                                                                                 | None was made                                                                                                                                                                                         | None                                                                                                                                                 | —                                                                                                                                              | Next pull. Deletes the pending record                                                                                                              |

**What "the vault is told to delete what it stored" means.** Black Mask is
told at its next launch (decision 4). Today it stores one thing for a link:
its record with the credential, which it deletes. The spec mentions a
"Blackout recovery key it stored". That is a Phase 2 vault extra, and
precondition P1 gates it on BO-1 (spec, preconditions). It is not part of B4
or B5, and nothing stores such a key today.

What is built is the place where such an extra would be removed: one cleanup
hook that runs whenever Black Mask finds its link ended. The extra's own
design has to decide whether its key belongs to one link or to the account.
Under option A, the spec's rule means "delete it when the link it was stored
through ends", which happens at the vault's next launch rather than at once.

### 3.5 The Blackout account is never deleted

Ending a link never does any of the following:

-   deletes or deactivates the Blackout account (`users`) or the Matrix
    account;
-   calls `/logout/all`;
-   calls the per-user cutoffs `revokeRefreshTokensForUser` or
    `revokeUserTokensBefore`, which would sign the full app out of the API;
-   removes the person from any room.

It acts on one device and on the API tokens bound to that device's link.
Account deletion is the person's own act through the existing flow. It ends
the links as a consequence; links never cause it.

### 3.6 API tokens bound to a link

These are needed so that an early end (an unlink or Black Mask ending the
link) also ends the panel's API session. A timed end is already covered by
B3.

-   **The exchange.** After `whoami`, `POST /v1/auth/matrix/exchange` looks
    up the device's link:
    -   An active link stamps `lnk: <link id>` on the JWT and
        `black_mask_link_id` on the refresh family. Both are still capped at
        the session end.
    -   An ended link (the device is still present because its sign-out
        failed) gets 401 `black_mask_link_ended`, and the device sign-out is
        retried.
    -   With no link, nothing changes: the full app's exchange stays exactly
        as it is.
-   **Refresh.** `POST /v1/auth/token/refresh` gives the successor the same
    `black_mask_link_id` and mints the JWT with `lnk`, as it already carries
    `session_expires_at` forward.
-   **Every `/v1` request.** `authMiddleware` refuses (401 `session_revoked`)
    a JWT whose `lnk` names a link that is not active, or a link that no
    longer exists. This is one map lookup next to the existing
    `isSessionRevoked(jti)` and per-user cutoff checks.
-   **Ending a link** revokes the refresh families carrying its id, with the
    reason `black_mask_link_ended`.
-   **Turning the flag off does not weaken any of this.** These checks run
    whenever a token or family carries a link, whatever
    `BLACKOUT_BLACK_MASK_LINKS` says. This copies B3's rule that "a bound
    already issued is enforced whatever the flag says".

### 3.7 When something cannot be reached

-   **The admin API fails during an end** (the homeserver is down, or the bot
    has lost its admin rights).

    -   The link still ends and its tokens are refused.
    -   The row keeps `device_signed_out_at` null, and the answer says
        `deviceSignedOut: false`.
    -   Settings and Black Mask say: "The link has ended, but Blackout
        couldn't sign the chat panel out yet. It will try again; you can also
        remove the device under Settings → Devices."
    -   The API retries on every later read of the link: a state pull, the
        Settings list, or an exchange from that device.

    No background loop is added (Q6). Until a retry succeeds, an "Until I
    unlink" device stays signed in on the homeserver. It gets no new API
    tokens.

-   **The panel cannot reach the API to unlink.** It still signs its own
    device out (Matrix logout works without the API). It says that Black Mask
    will see the link has ended the next time it starts. That is true because
    the state pull checks the device.
-   **Black Mask cannot reach the API at launch.** It keeps its record and
    shows when it last checked.
-   **The state pull cannot check the device** (admin API unreachable). The
    API answers 503 `link_state_unavailable` without changing the row, and
    Black Mask treats that the same way.

## 4. Security and privacy

### 4.1 Threats to the code exchange

-   **Phishing (RFC 8628 §5.4, reversed).** An attacker starts a link on
    their own Black Mask and talks someone into typing that code into their
    own panel sign-in.

    -   What the attacker gets: their vault can see that link's state (a
        length and times, no identity) and can end it, which signs the
        victim's panel out.
    -   What the attacker does not get: any access to the victim's account,
        or who the victim is.

    The invariant in section 2.1 is what keeps phishing this cheap to absorb.
    The panel's copy says to type only a code Black Mask is showing right now
    on this device, and says what linking lets Black Mask do.

-   **Guessing codes (RFC 8628 §5.1).**
    -   _Setting._ A claim needs a Matrix access token whose device has a
        recorded length, that is, a panel-style sign-in. The search space is
        20⁸, about 2.56 × 10¹⁰. A code lives 10 minutes and works once.
    -   _Limits._ The claim allows 5 per Matrix user per 15 minutes,
        fail-closed, on top of the existing `authRateLimit` (10 a minute per
        IP, fail-closed). Creating codes allows 5 per IP per 10 minutes, with
        at most 10,000 pending at once (503 `link_requests_full` beyond that).
    -   _What that means._ With P codes pending and G guesses inside one
        code's life, the chance of a hit is about G·P / 2.56 × 10¹⁰. A
        hundred accounts making 500 guesses per 15 minutes against 1,000
        pending codes hit with a probability of about 2 × 10⁻⁵ per 15 minutes,
        or about 2 × 10⁻³ per day.
    -   _What a hit buys._ It binds the attacker's own panel session to a
        stranger's Black Mask. That stranger can then see the link and end
        it. The stranger's own claim fails with "That code isn't waiting to
        be used", and the panel explains what to do. So the limits bound a
        nuisance, not a takeover.
    -   _Oracles._ Wrong, expired and already-used codes get one identical
        404 body. No endpoint says whether a code is pending.
-   **Replay.** Each secret behaves differently:
    -   The code works once: pending to active in one compare-and-swap.
        Repeating a successful claim gets the same 404.
    -   The link credential and the Matrix token are bearer secrets over TLS.
        The API keeps only their hashes or never stores them.
    -   The credential's power is limited by the invariant.
    -   No endpoint takes the credential in a URL, so it never lands in proxy
        access logs.
    -   All the vault's endpoints answer `cache-control: no-store`.
-   **Races.** Two claims of one code in the same process cannot both win:
    the swap runs in one synchronous step, as
    `consumeRefreshTokenForRotation` does. Across several API replicas on
    Postgres, each with its own in-memory copy, the store makes the same
    promise refresh rotation makes and no more (the comment on
    `consumeRefreshTokenForRotation` in `db/store.ts`). Such a deployment
    needs a conditional `UPDATE … WHERE status = 'pending'`, as noted for
    refresh tokens (section 4.6).
-   **CSRF and other sites.** No endpoint uses cookies. The vault's
    credential travels in the body, the claim in `x-matrix-access-token`, and
    the Settings calls in `Authorization`. Another site in the browser has
    nothing ambient to ride on.
-   **Clickjacking.** Framing is unchanged (B2): only listed origins may frame
    `/embed`. A listed origin could at worst trick a click on "Unlink and
    sign out". It cannot type a code.
-   **Denial of service.** Flooding code creation fills the 10,000 slots and
    blocks new links (503) until codes expire. It touches nothing else.
-   **A stolen link credential** (someone with the extension's
    `chrome.storage.local`) gives that link's state and the power to end it.
    Such a person also holds everything else in that storage.
-   **A modified panel that exchanges before it claims.** It gets API tokens
    that carry no `lnk`. An early end does not refuse them, although the
    session end still bounds them for a timed length. This is the same class
    of gap as B3's "an API exchange made before the length is set is not
    bounded". The panel claims before it stores or uses any token.
-   **A device id signed in again.** A client can ask `/login` for a
    particular device id, which needs the password. Such a device never gets
    API tokens again if it ever had a link (the exchange's ended-link check),
    and can never be linked again.

### 4.2 What each side learns

-   **The Blackout API** learns:

    -   that this Blackout account linked a Black Mask app, and when;
    -   the length chosen;
    -   the device;
    -   when the link ended and why;
    -   the times and IP addresses of the vault's requests. The front
        proxies log those and the rate limiter keys on them. The API stores
        neither.
    -   that the vault launched at each of those times, because each launch
        is a request.

    It is not told the Black Mask account's email, vault user id or vault
    server, or anything about the vault. The vault's requests carry the
    browser's user agent, and can carry the extension's `Origin`
    (`chrome-extension://<store id>`, the same for every install from one
    store listing).

-   **The Black Mask app, through the link,** learns that the link exists, its
    length, start, end and status, and the coarse end reason. It is not told
    the Blackout user id, Matrix id, device, display name or rooms. **Outside
    the link,** Black Mask is a browser extension with host permissions on
    every site. It injects a content script into all frames (section 1.5), so
    it can see Blackout pages it runs on, as any extension with that
    permission can. Linking does not add to that, and no copy may say Black
    Mask cannot see the Blackout account.
-   **The homeserver** learns nothing new. It logs the API's admin device
    requests, whose paths contain the Matrix user id and device id.
-   **FBM** learns nothing; it is not involved. If someone bought Black Mask
    through FBM using an FBM account linked to their Blackout account, FBM
    already knows both. The link neither changes that nor sends FBM anything.
    FBM's provisioning payload carries no Blackout identity
    (`docs/BLACK_MASK_PROVISIONING_CONTRACT.md` §3).
-   **Other people in the person's rooms** learn nothing. The device keeps the
    name `Blackout Client` (section 2.5).

### 4.3 What is logged

-   **API structured logs** (`telemetry/logger.ts`, which pseudonymises ids in
    production) record:

    -   `black_mask_link.created` (link id);
    -   `black_mask_link.claimed` (link id, user id);
    -   `black_mask_link.claim_refused` (reason only);
    -   `black_mask_link.ended` (link id, user id, reason, `deviceSignedOut`);
    -   `black_mask_link.device_sign_out_failed` (link id, reason).

    They never record the code, the credential, a Matrix token, an IP
    address or a user agent.

-   **API metrics:** a new counter,
    `black_mask_link_events_total{event,outcome}`, with no ids. Rate-limit
    hits are already counted by bucket. The API writes no access log. Its
    HTTP metrics use the route pattern (`telemetry/http-metrics.ts`).
-   **Outside the API.** The front proxies' access logs record the method,
    path, status, client IP and user agent of every vault request. Bodies,
    which hold the credential, are not logged in nginx's default formats.
    Synapse logs the admin device requests.
-   **The record itself** is the history: status, times, end reason. No audit
    table is added. Data export (`exportUserData` in
    `services/accountLifecycle.ts`) includes the person's links, without
    their hashes.

### 4.4 How it fits `THREAT_MODEL.md`

The build adds the following, under that file's release criterion 6 (a
feature that crosses a trust boundary or adds an asset):

-   **Adversary A14,** "Black Mask vault client, or anyone holding a link
    credential". It can read one link's state and end that link, and nothing
    else. It is in scope, mitigated by the invariant and the limits above.
-   **An asset:** Black Mask link records and link credentials. **A §5 posture
    row:**
    -   _Confidentiality:_ SHA-256 at rest on the server, plaintext in the
        extension's local storage.
    -   _Integrity:_ server-held status and a single-use code.
    -   _Availability:_ ending a link needs the homeserver admin API.
-   **A §6d narrow model,** "Black Mask account link", next to §6c. §6c's
    statement that the panel sends its frame nothing still holds and is
    restated there.
-   **Residual risks** (R11 onward on current `develop`, which already uses
    R10). Each is listed in section 4.6.

BO-1 gates "anything that routes trust through Blackout" (`KNOWN_ISSUES.md`,
BO-1 notes). The link routes no trust through Blackout's encryption: no key
or secret of either product's encryption crosses it. So B4 and B5 do not wait
for BO-1. Every vault extra that would use the link does wait for it.

Each relink does make a new device, and that device may not be able to read
older encrypted messages (BO-1). The panel says so (section 4.5).

### 4.5 Every claim the UI will make

Each line below is a commitment for the build. If the condition stops holding,
the copy changes.

| Where                             | Copy                                                                                                                                                                                                     | Why it is true                                                                                                           | Must never say instead                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Panel, code field                 | "Type the code Black Mask is showing you now, on this device. Don't type a code someone sent you."                                                                                                       | Instruction (the phishing defence in section 4.1)                                                                        | —                                                                                     |
| Panel, link mode                  | "Linking lets this Black Mask app see whether the link is active, and end it. It doesn't give Black Mask your messages or your account."                                                                 | The credential's powers are exactly state and end (section 2.1)                                                          | "Black Mask can't see your Blackout account" (the extension can see pages it runs on) |
| Panel, link mode                  | "Black Mask isn't told which Blackout account this is, and Blackout isn't told which Black Mask account you use."                                                                                        | No request or answer carries either (section 2.4). "Isn't told" is deliberate: both servers see IP addresses             | "Anonymous", "private", "untraceable", "Blackout doesn't know you use Black Mask"     |
| Panel, link mode                  | "This signs the panel in as a new device. Older encrypted messages may not be readable here."                                                                                                            | Option A makes a new device for each link. BO-1                                                                          | —                                                                                     |
| Picker, link mode, a timed length | "When the time runs out, the link ends and this panel is signed out. Blackout's server ends it then, even if this panel is closed."                                                                      | Link mode needs both servers enforcing lengths (section 2.6). B3 enforcement, and the link reads as ended from `ends_at` | Any promise about a length the servers did not list                                   |
| Picker, "Until I unlink"          | "The link lasts until you unlink it here, in Blackout's Settings, or in Black Mask."                                                                                                                     | Section 3.4                                                                                                              | —                                                                                     |
| Panel status page, session bar    | "Linked to Black Mask since …, until …" / "until you unlink"                                                                                                                                             | Server values from the claim                                                                                             | —                                                                                     |
| Panel, Unlink                     | "Unlinking ends the link and signs this panel out. Your Blackout account isn't deleted, and your other sign-ins stay signed in."                                                                         | Section 3.5                                                                                                              | —                                                                                     |
| Panel, signed out after a link    | "This panel was signed out, and its link to Black Mask has ended." / "The link length you chose is up, so this panel was signed out." / "You unlinked this panel from Black Mask, so it was signed out." | Under option A, a device that is gone means the link is over                                                             | A cause the panel cannot know                                                         |
| Settings, Unlink                  | "This signs that chat panel out of Blackout. Your account isn't deleted." When the sign-out failed: the text in section 3.7                                                                              | The admin delete, or its stated failure                                                                                  | "Signed out" when `deviceSignedOut` is false                                          |
| Black Mask, code screen           | "Type this code into the Blackout chat panel when you sign in. It works once, for 10 minutes."                                                                                                           | Single use and the time limit are enforced by the API                                                                    | —                                                                                     |
| Black Mask, linked                | "Linked. Black Mask checks the link each time it starts, so this can be out of date until then. Last checked …"                                                                                          | Decision 4                                                                                                               | "Live" or "real-time" status                                                          |
| Black Mask, End link              | "This signs the chat panel on that device out of Blackout. Your Blackout account isn't deleted."                                                                                                         | Section 3.4                                                                                                              | —                                                                                     |
| Black Mask, ended                 | "The link to Blackout ended (reason). Black Mask removed what it kept for it."                                                                                                                           | The record is deleted, and the cleanup hook has run                                                                      | —                                                                                     |

Nothing anywhere calls the link "secure", "encrypted" or "end-to-end". It
uses TLS, as every Blackout request does, and makes no further claim.

### 4.6 Residual risks, stated plainly

-   **Between an early end and the vault's next launch,** Black Mask still
    shows the link, labelled with when it was last checked.
-   **If the admin API stays unreachable,** an "Until I unlink" device stays
    signed in on the homeserver. It gets no new API tokens, and every later
    read of the link retries the sign-out (section 3.7).
-   **An open panel may not notice a server-side end** until it is reloaded
    (D1).
-   **A modified client** that exchanged before claiming keeps API tokens not
    tied to the link (section 4.1).
-   **A Matrix OpenID token** minted before the end still outlives it by up to
    an hour (B3, unchanged).
-   **Blackout learns** that the account uses Black Mask, and when the vault
    launches (section 4.2).
-   **The claim's compare-and-swap is atomic within one API process,** like
    refresh rotation. A deployment with several API replicas on Postgres
    needs a conditional update.
-   **A credential lifted from the extension's storage** can end the link.

## 5. Changes by repository

### 5.0 Order and dependencies

| Order | Change                                                 | Repository        | Depends on                                         |
| ----- | ------------------------------------------------------ | ----------------- | -------------------------------------------------- |
| 0     | C0: fix D1 (refresh refused means signed out)          | Blackout          | Its own triage (decision 9). Recommended before C1 |
| 1     | A1: link records and the code handshake (B4)           | Blackout          | `develop` with migration 102                       |
| 2     | A2: API tokens bound to a link (B5)                    | Blackout          | A1                                                 |
| 3     | C1: the panel's link flow, status page and unlink      | Blackout          | A1 (A2 for the full guarantees)                    |
| 4     | C2: Settings → Account → Black Mask chat panels        | Blackout          | A1                                                 |
| 5     | H1 (optional): pin the admin device deletion in a test | Blackout          | None. Test only                                    |
| 6     | M1: the chat panel host                                | Black Mask        | None (Phase 2 of the launch plan)                  |
| 7     | M2: link client, state and screens                     | Black Mask        | A1's contract, M1                                  |
| 8     | M3: launch pull, cleanup hook, logout                  | Black Mask        | M2, and the answers to Q3 and Q4                   |
| 9     | F1: `AUDIT_DEBT.md` rows                               | free-black-market | None                                               |

Everything ships dark. Nothing is switched on until A1, A2, C1 and M2 are
merged and the steps in section 5.6 are done.

### 5.1 Blackout API

**A1 — link records and the code handshake (B4).**

-   **Migration 103,** `packages/api/src/db/migrations/103_black_mask_links.up.sql`:

    ```sql
    -- Launch-plan steps B4 and B5: a Black Mask app links to one panel
    -- sign-in (docs/black-mask-account-link-design.md). A row starts pending,
    -- named by nobody, when Black Mask asks for a code; the panel's claim
    -- binds it to the Blackout account and the Matrix device it signed in as.
    -- Secrets are kept only as SHA-256. No IP, user agent or Black Mask
    -- identifier is stored.
    CREATE TABLE IF NOT EXISTS black_mask_links (
        id UUID PRIMARY KEY,
        status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'active', 'ended')),
        link_secret_hash CHAR(64) NOT NULL UNIQUE,
        user_code_hash CHAR(64),
        code_expires_at TIMESTAMPTZ NOT NULL,
        blackout_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        matrix_user_id TEXT,
        matrix_device_id TEXT,
        session_length VARCHAR(16)
            CHECK (session_length IN ('1h', '1d', '7d', '30d', 'until_sign_out')),
        linked_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        ended_reason VARCHAR(32) CHECK (ended_reason IN (
            'code_expired', 'cancelled_by_black_mask', 'unlinked_in_panel',
            'unlinked_in_settings', 'ended_by_black_mask', 'expired',
            'device_signed_out', 'account_deleted')),
        device_signed_out_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (status <> 'active' OR (blackout_user_id IS NOT NULL
            AND matrix_user_id IS NOT NULL AND matrix_device_id IS NOT NULL
            AND session_length IS NOT NULL AND linked_at IS NOT NULL)),
        CHECK (status <> 'ended' OR (ended_at IS NOT NULL AND ended_reason IS NOT NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS black_mask_links_pending_code
        ON black_mask_links (user_code_hash) WHERE status = 'pending';
    CREATE UNIQUE INDEX IF NOT EXISTS black_mask_links_device
        ON black_mask_links (matrix_user_id, matrix_device_id)
        WHERE matrix_device_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS black_mask_links_user
        ON black_mask_links (blackout_user_id) WHERE blackout_user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS black_mask_links_pending_expiry
        ON black_mask_links (code_expires_at) WHERE status = 'pending';
    -- A2: the refresh-token family of a linked panel session. No foreign key,
    -- like session_expires_at (migration 100), so the write-behind queue's
    -- ordering is not constrained.
    ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS black_mask_link_id UUID;
    CREATE INDEX IF NOT EXISTS refresh_tokens_black_mask_link
        ON refresh_tokens (black_mask_link_id) WHERE black_mask_link_id IS NOT NULL;
    ```

    The down migration drops the index and the column, then the table. The
    whole of 103 lands in A1, the `refresh_tokens` column included, so that
    there is one ordinal.

-   **The store:**
    -   `db/types.ts`: `BlackMaskLinkRecord`, and
        `RefreshTokenRecord.blackMaskLinkId?`.
    -   `db/store.ts`: a `blackMaskLinks` map and snapshot field; mutators
        (`createBlackMaskLink`, `claimBlackMaskLink`, a compare-and-swap like
        `consumeRefreshTokenForRotation`, `endBlackMaskLink`,
        `markBlackMaskLinkDeviceSignedOut`, `pruneBlackMaskLinks`); lookups
        by secret hash, code hash, id, device and user.
    -   `purgeUserAuthArtifacts` must cover the new map.
    -   The Postgres overrides, and `persistsBlackMaskLinks()`, which is true
        only when the table and the `refresh_tokens.black_mask_link_id`
        column exist, as `persistsRefreshTokenSessionEnds()` does for 100.
    -   `db/pgDescriptors.ts`: the map list and a `MUTATOR_SPECS` entry for
        every new mutator. The Postgres store persists only the mutators
        listed there (`installWriteThrough` in `db/store.ts`). The existing
        `test/postgres-store.integration.test.ts` checks only that each
        listed spec names a real method and map, so a missing entry is
        caught by A1's restart test, not by that one.
-   **`integrations/matrix-client.ts`:** `adminGetDevice(userId, deviceId)`
    and `adminDeleteDevice(userId, deviceId)`. They call the upstream
    `GET`/`DELETE /_synapse/admin/v2/users/{userId}/devices/{deviceId}`
    (`synapse/rest/admin/devices.py`, unchanged) with the bot token:

    -   GET 200 means present and 404 means gone.
    -   DELETE answers 200 even for a device already gone: `delete_devices`
        swallows the store's 404.
    -   Anything else is "unknown".

    Synapse's `delete_devices` removes the device row first, then the
    device's access and refresh tokens (calling B3's `on_logged_out`, which
    then forgets the length) and its end-to-end keys
    (`synapse/handlers/device.py`).

-   **`services/blackMaskLink.ts`:** code and credential generation,
    normalization and hashing, `effectiveStatus`, create, claim, state
    (including the device check and the five-minute expiry backstop), end
    (admin delete, revoking the families, the retry rule), list, prune, and
    the limits in section 4.1.
-   **`routes/blackMaskLinks.ts`,** mounted at `/v1/integrations/black-mask`
    in `index.ts`:

    | Route               | Auth                                                                            | Body (strict: any other field is 400) | Answers                                                                                                                                                                                                                                                          |
    | ------------------- | ------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `GET /config`       | None                                                                            | —                                     | 200 `{enabled: true, …}`; 503 `{enabled: false, code}` (`session_lengths_off`, `session_end_storage_missing`, `link_storage_missing`, `homeserver_admin_unavailable`); 404 when the flag is off                                                                  |
    | `POST /links`       | None. 5 per IP per 10 minutes, fail-closed                                      | `{}`                                  | 201 (section 2.2, step 1); 503 `link_requests_full`; 404 when the flag is off                                                                                                                                                                                    |
    | `POST /links/state` | Credential in the body. 60 per IP a minute                                      | `{linkCredential}`                    | 200 `{status: "pending", codeExpiresAt}` / `{status: "active", sessionLength, linkedAt, endsAt}` / `{status: "ended", endedAt, endedReason}`; 401 `link_unknown`; 429 `slow_down` when polled more often than every 5 seconds; 503 `link_state_unavailable`      |
    | `POST /links/end`   | Credential in the body. 10 per IP a minute                                      | `{linkCredential}`                    | 200 `{status: "ended", endedAt, endedReason, deviceSignedOut}` (idempotent); 401 `link_unknown`                                                                                                                                                                  |
    | `POST /links/claim` | `x-matrix-access-token`. `authRateLimit`, plus 5 per Matrix user per 15 minutes | `{userCode}`                          | 201 (section 2.2, step 6); 400 `invalid_link_code`; 404 `link_code_unknown`; 409 `device_already_linked` or `session_length_required`; 401 `matrix_token_invalid`; 403 `matrix_exchange_provisioning_disabled`; 503 `link_unavailable`; 404 when the flag is off |
    | `GET /links`        | JWT (`requireUser`). `integrationsRateLimit`                                    | —                                     | 200 `{links: [{id, status, sessionLength, linkedAt, endsAt, endedAt, endedReason, matrixDeviceId, current}]}`, active links and those ended in the last 30 days                                                                                                  |
    | `DELETE /links/:id` | JWT. `integrationsRateLimit`                                                    | —                                     | 200 `{status: "ended", endedAt, endedReason, deviceSignedOut}`; 404 `not_found` for any id that is not one of the caller's links, whether or not it exists                                                                                                       |

    -   **The flag** gates only `POST /links` and `POST /links/claim`, so that
        existing links can still be read and ended after it is turned off.
    -   **The claim reads the device through the admin API before it
        swaps.** A 401 or 403 there gives 503 (the bot is not an admin). A
        404 gives 409.
    -   **No answer to the vault ever contains a user id, Matrix id, device
        id or display name.** A test pins the exact set of keys.

-   **Account deletion and export.** In `services/accountLifecycle.ts`,
    `confirmAccountDeletion` ends every link (`account_deleted`, admin delete
    per device) before `purgeUserAuthArtifacts`. `exportUserData` lists the
    links.
-   **Configuration:**
    -   `packages/api/.env.example` documents `BLACKOUT_BLACK_MASK_LINKS`
        (off by default; needs `BLACKOUT_SESSION_LENGTHS`, migrations 100 and
        103, and an admin bot token).
    -   `config/env.ts` warns in production when the flag is on and any of
        those is missing.
-   **A rollback script,** `packages/api/src/scripts/endBlackMaskLinks.ts`.
    It ends every active link through the same service (section 5.6).

A1 tests are in `packages/api/test/black-mask-link.integration.test.ts`
(`node:test`, in-memory store, with `matrixClient.whoami`, `sessionLength`,
`adminGetDevice` and `adminDeleteDevice` stubbed as
`test/session-length.integration.test.ts` stubs them):

1. **The flag.** Off: `POST /links` and `/links/claim` answer 404, and nothing
   asks the homeserver. Turned off after links exist: state, end, list and
   delete still work.
2. **Create:**
    - a body other than `{}` gives 400;
    - the answer's shape (the `bml_` prefix, the code form, an expiry of about
      10 minutes);
    - the stored row holds only hashes, no code or credential in plain text;
    - the per-IP limit gives 429, and a store error gives 429 (fail-closed);
    - the pending cap gives 503;
    - the prune runs.
3. **Codes.** Lower case, spaces and hyphens are accepted. Vowels, digits and
   wrong lengths give 400 before any homeserver call.
4. **A successful claim:**
    - the row becomes active with the homeserver's end, never the client's;
    - the code hash is cleared;
    - the answer has exactly the documented keys;
    - "Until I sign out" gives `endsAt: null`.
5. **Refused claims:**
    - unknown, expired and used codes all get the same 404 body, byte for
      byte;
    - a device that already has a row gets 409;
    - no recorded length (`session_length: null`) gets 409;
    - the homeserver answering 404 for the length (module off, or MAS) gets
      409;
    - the homeserver unreachable gets 503;
    - an invalid `whoami` gets 401;
    - provisioning disabled for a new account gets 403;
    - the sixth claim within 15 minutes from one Matrix user gets 429;
    - the admin device read answering 403 gets 503.
6. **The race.** Two claims of one code in the same tick: exactly one 201.
7. **State:**
    - each status's shape;
    - `slow_down` for polls less than 5 seconds apart;
    - expiry, by moving `Date.now`, as B3's tests do;
    - a device found gone gives `device_signed_out`;
    - admin unreachable gives 503 and leaves the row unchanged;
    - a device still present five minutes after the end gets an admin
      delete.
8. **End:**
    - active becomes `ended_by_black_mask`, with an admin delete for the right
      user and device, and a second call is a no-op;
    - pending becomes `cancelled_by_black_mask`, with no admin call;
    - a failed admin delete gives `deviceSignedOut: false` and is retried on
      the next state call.
9. **List and delete:**
    - a caller sees only their own links;
    - another account's id gets the same 404 as a missing id;
    - the reason is `unlinked_in_panel` when the JWT's `lnk` equals the id,
      and `unlinked_in_settings` otherwise.
10. **Account deletion and export.** Links are ended and their devices deleted
    before the purge, and the vault's next state call gets 401. The export
    lists the links without hashes.
11. **Postgres** (gated on a database, as the existing Postgres tests are):
    - rows survive a store restart;
    - without 103, `GET /config` answers 503 `link_storage_missing` and
      `POST /links` answers 503;
    - 103 up and down against PostgreSQL 16, plus the boot-time checksum
      audit, as was done for 100.

Each guard is broken once to confirm that a test fails, as was done for B1
and B3.

**A2 — API tokens bound to a link (B5).** Files:

-   `services/auth.ts`: `AuthTokenPayload.lnk?` and a `blackMaskLinkId`
    signing option.
-   `services/refreshToken.ts`: `blackMaskLinkId` through `issueRefreshToken`
    and `rotateRefreshToken`.
-   `routes/auth.ts`: `issueSession`, the exchange's lookup and refusal, and
    the refresh route minting `lnk`.
-   `middleware/auth.ts`: the `lnk` check.
-   The store: `revokeRefreshTokensForBlackMaskLink`, with its mutator spec.

A2 tests (`node:test`):

1. An exchange for a linked device gives a JWT with `lnk` and a family with
   the id. An exchange for an unlinked device gives exactly what it gives
   today (a regression test for the full app).
2. **After an end:**
    - a JWT with `lnk` gets 401 `session_revoked` on any `/v1` route;
    - the family's refresh is refused;
    - an exchange from the device, still present because the stubbed delete
      failed, gets 401 `black_mask_link_ended` and retries the delete.
3. Rotation carries the id, and the refreshed JWT carries `lnk`.
4. B3's `sxp` cap still applies to a linked session.
5. After the flag is turned off, bound tokens are still refused once their
   link ends.
6. A `lnk` naming a purged row is refused.

### 5.2 Blackout client and panel

**C0 — D1, triaged on its own.** In `apps/blackout-client/src/client/initMatrix.ts`,
`buildTokenRefreshFunction` would throw matrix-js-sdk's exported
`TokenRefreshLogoutError` when `/refresh` answers 401 or 403. It keeps
`MatrixInitError` for 429 and network failures. Then the SDK emits
`SessionLoggedOut`, and the existing `handleSessionLoggedOut` runs.

This changes the full app too: a session whose refresh token is gone would
land on the sign-in instead of failing quietly.

Tests:

-   a unit test that a refused refresh leads to `SessionLoggedOut`;
-   a unit test that 429 stays transient;
-   the existing panel sign-out tests.

**C1 — the panel's link flow.** Files:

-   **New:** `client/panelAccountLinkFlag.ts` (`VITE_BLACKOUT_PANEL_ACCOUNT_LINK`,
    documented in `apps/blackout-client/.env.example`), and
    `client/blackMaskLink.ts` (the alphabet, `normalizeLinkCode`,
    `fetchLinkConfig`, `claimLink`, `listLinks`, `unlink`).
-   **`client/sessionLength.ts`:** `PanelSessionChoice.linkCode?`.
-   **`client/auth.ts`:**
    -   `establishSession` claims after the bind and before
        `saveFromLoginResponse`;
    -   a failed claim signs the device out and throws
        `MatrixInitError('link_failed', …)`;
    -   `MatrixInitErrorCode` gains `link_failed`.
-   **`client/sessionManager.ts`:** `StoredSession.blackMaskLink?`, which
    `hasValidPanelFields` validates. A garbled link ends the session rather
    than running it.
-   **`client/initMatrix.ts`:** `buildTokenRefreshFunction` rebuilds the
    stored session field by field, so it must carry `blackMaskLink` forward as
    it carries `sessionLength`. Without that, the link fields are lost on the
    first refresh, five minutes in.
-   **`app/state/auth.ts`:** `PanelSignedOutReason` gains `unlinked`, and the
    texts for linked sessions.
-   **`components/bmc/auth/LoginPage.tsx`:** link mode at `/embed/link` or
    from "I have a code from Black Mask". It adds the code field, the
    picker's link wording (`SessionLengthPicker.tsx`) and the
    `newAccountsLinkable` notice on the Create account tab.
-   **`black-mask-embed/`:** the route in `embedRoutes.tsx`, a new
    `EmbedLinkStatus.tsx`, and the linked form of `EmbedSessionBar` in
    `EmbedLayout.tsx`.
-   **`pages/paths.ts`:** `EMBED_LINK_PATH`.

C1 tests (vitest, in `apps/blackout-client/tests/unit/client/` and next to the
embed components, as B3's are):

1. `normalizeLinkCode` against a table of inputs.
2. **`establishSession`:**
    - with a code, the claim comes after the bind and before anything is
      stored;
    - success stores `blackMaskLink`;
    - a failed claim calls `signOutDeviceByToken`, stores nothing and
      throws `link_failed`;
    - a failed bind sends no claim;
    - without a code, it is B3 unchanged.
3. A garbled stored link ends the session.
4. A token refresh keeps `blackMaskLink`.
5. **Link mode:**
    - the code is required;
    - the wording reads "How long should this link last?" and "Until I
      unlink";
    - sign-in stays disabled until both the code and a length are given;
    - an invalid code sends no request;
    - SSO is still not offered;
    - `newAccountsLinkable: false` shows its notice.
6. **The status page and session bar:**
    - the server's times are shown;
    - "Unlink and sign out" sends `DELETE`, then signs out;
    - a failed `DELETE` still signs out, with the copy in section 3.7.
7. The three signed-out texts.
8. **The switches.** With the link switch off there is no code field and no
   config request. With B3's switch off, the link switch does nothing.
9. **A Chromium run of the production build at `/embed/link`,** as B3 was
   checked. It uses a local homeserver from this fork with the module on and
   the API with both flags on. Link once with an existing account and once
   with each sign-up path. Check the API row. Unlink from the panel, from
   Settings and through `POST …/links/end` (with `curl` standing in for
   Black Mask). Each time, check through the admin API that the device is
   gone.

**C2 — Settings.** `features/settings/black-mask-links/BlackMaskLinks.tsx`
and its client, mounted in `features/settings/account/Account.tsx` next to
`LinkedAccounts`. It is shown only when `GET …/config` answers 200 and the
link switch is on. The optional device label described in section 3.3 goes
in `devices/`.

C2 tests:

-   the list, active and recently ended;
-   the confirmation;
-   a 404 from `DELETE`;
-   the copy when the device was not signed out;
-   the section is hidden when the config answers 404.

`pnpm guard:feature-registry` needs no new row. It checks
`features/*/manifest.ts` modules (`tools/ci/check-feature-registry.mjs`), and
neither the panel nor a Settings section adds one.

### 5.3 Homeserver

**None.** This is decision 1. The API uses upstream Synapse's admin device
endpoints with the token it already holds, so `apps/blackout-server/PATCHES.md`
does not change.

**H1 (optional) is test only.** It adds one test to
`apps/blackout-server/tests/blackout_runtime/test_session_length.py`: an admin
`DELETE /_synapse/admin/v2/users/{user}/devices/{device}` on a device with a
bound length removes the device's tokens and its `blackout_session_lengths`
row. This pins the upstream behaviour that B5 relies on. Like the rest of that
file, it runs only by hand: CI runs no `apps/blackout-server` tests (spec,
section 3).

### 5.4 Black Mask

The Black Mask side adds no encryption logic:

-   Every secret is minted by Blackout's API.
-   The vault hashes, signs and encrypts nothing for the link. It stores the
    credential as it receives it, in the state framework.
-   It sends no vault data anywhere: no cipher, no email, no vault user id.
-   It talks to Vaultwarden not at all for the link.

The Black Mask rules that apply (its repository instructions and the rule
files beside them):

-   standalone OnPush components;
-   Tailwind classes with the `tw-` prefix, theme tokens only;
-   new strings only in `apps/browser/src/_locales/en/messages.json`;
-   no code regions;
-   no logging of secrets.

The pieces:

-   **M1 — the chat panel host.** This is Phase 2 of the launch plan, and B4
    needs it, because there is nowhere to type a code without it.
    -   A Blackout chat screen under `apps/browser/src/privacy/popup/`, with
        a route in `popup/app-routing.module.ts`, framing
        `<Blackout origin>/embed`.
    -   The frame's `sandbox` is
        `allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox`
        and does not include `allow-top-navigation` (spec, section 1).
    -   The side panel is enabled for this screen; today `bootstrap()` turns
        it off everywhere.
    -   The Blackout origin is a build-time setting, defaulting to
        `https://chat.theblackout.app`. It is used for both `/embed` and
        `/v1/integrations/black-mask/*`, which works because both front
        proxies route `/v1/` on the chat host to the API (`location /v1/` in
        `infra/nginx/sites-available/theblackout.app.conf` and
        `infra/single-server-baseline/nginx/sites-available/theblackout.app.conf`).
    -   On the Blackout side, the operator lists the extension's
        `chrome-extension://` origin in `BLACK_MASK_FRAME_ANCESTORS`.
    -   Firefox cannot be listed, because its extension origins are
        per-install (spec, section 2). There, the screen opens `/embed` in a
        tab, and linking works the same way.
-   **M2 — the link client, state and screens,** in
    `apps/browser/src/privacy/blackout-link/`. It is browser-only for now and
    moves to a library when the web vault or desktop app needs it.
    -   A plain TypeScript API client over `ApiService.nativeFetch`, usable
        from both the background and the popup. Bodies are exactly `{}` or
        `{linkCredential}`, with no `Authorization` header. Answers are read
        through an allowlist of fields.
    -   `BLACKOUT_LINK_DISK = new StateDefinition("blackoutLink", "disk")` in
        `libs/state/src/core/state-definitions.ts`, and a per-account
        `UserKeyDefinition` holding
        `{credential, blackoutOrigin, status, codeExpiresAt?, linkedAt?, endsAt?, lastCheckedAt?, endPending?}`.
        Its `clearOn` follows Q3.
    -   The screens in section 3.3. The code screen polls every 5 seconds
        only while it is open. "Cancel" ends the pending link.
    -   A new `FeatureFlag.BlackMaskBlackoutChat`, following the fork's
        `black-mask-*` convention (`libs/common/src/enums/feature-flag.enum.ts`).
        The screen also needs the build's Blackout origin, and Blackout's
        config to answer 200.
-   **M3 — the launch pull, the cleanup hook and logout.**
    -   A background step called from `bootstrap()` next to
        `initTrackerCounting`. It runs once per browser session (a
        `chrome.storage.session` flag): at browser start, at install or
        update, and when the Blackout chat screen opens. It never runs on a
        timer.
    -   An MV3 service worker restarts often, which is why there is a flag
        rather than a pull on every `bootstrap()`.
    -   It runs for each account on the device that holds a record.
        `ended` or 401 deletes the record and runs the cleanup hooks.
        503 or a network error keeps the record.
    -   An `endPending` record is ended at that point.
    -   Logout follows Q3, and account switching follows Q4.

M2 and M3 tests (jest, `npm test -- apps/browser/src/privacy/blackout-link`):

-   **Request shapes:** exact bodies, no `Authorization` header, no account
    fields, only the configured origin.
-   **Answer parsing:** unknown fields are dropped.
-   **State:** a record is saved and cleared per account.
-   **The pull:**
    -   `active` updates the record;
    -   `ended` and 401 delete it and run the hooks;
    -   503 and network errors keep it and leave `lastCheckedAt` unchanged;
    -   once per browser session;
    -   no timer.
-   **The code screen:** polls only while open, stops when linked, expired or
    closed, and cancels.
-   **End link:** success deletes the record; a failure keeps it with
    `endPending` and retries at the next launch.
-   **The logout path** under Q3's answer.
-   **Templates** are linted for `tw-` classes and i18n keys.

Manual checks go in `docs/black-mask/browser-validation.md`:

-   framing on Chromium with the extension's id listed;
-   the Firefox tab fallback;
-   the pull at browser start.

The feature goes in `docs/black-mask/features.md`, and the side panel's new
use in `docs/black-mask/store-submission.md`.

### 5.5 free-black-market

FBM needs no code. The link involves only Blackout and Black Mask, and FBM's
provisioning payload carries no Blackout identity. These are the `/link`
gaps, found while reading the route as the model for the handshake. Under
decision 10, each becomes a row in FBM's `docs/AUDIT_DEBT.md` (F1), in its
usual found/done/why form:

-   **G1, the auth wording.** The route's comment says "the entitlements
    service token (or a valid Blackout JWT)". The JWT it accepts is FBM's own
    client-credentials token (`issueBlackoutToken`, `iss: fbm`,
    `aud: blackout`), not a Blackout-issued or user-bound token. Blackout's
    spec repeats the ambiguity ("service token or JWT"). The comment should
    say "the entitlements service token or an FBM-issued integration token",
    and record that no user-level proof exists.
-   **G2, it is not a signed handshake.** It uses bearer authentication only:
    no body signature, no timestamp or nonce, no replay window. Whoever holds
    either deployment credential can bind any not-yet-linked customer or
    seller to any Blackout id they name. The cross-member guard stops only
    re-linking to a different member. FBM's own Black Mask provisioning
    channel has the stronger recipe: HMAC over timestamp and body, ±300
    seconds, with a key id.
-   **G3, no unlink.** The route has only `POST`. Nothing removes
    `blackout_user_id` from a customer or seller, so an FBM↔Blackout link
    cannot be ended from either side.
-   **G4, no caller.** Nothing in Blackout's `packages/api` calls
    `/v1/integrations/blackout/link`. In practice, the mapping is set by
    create-on-miss in the Blackout checkout page and the reputation-events
    route (both call `resolveOrCreateCustomerForBlackoutUser`). Record the
    route as unused, or wire a caller.
-   **Already recorded:** under BM-8's "Open", the customer and seller writes
    are not one transaction. Not a new row.

D6 in section 7 is a defect in the same helper module, and is listed there.

### 5.6 Turning it on, and rolling back

**Turning it on** (operator; nothing is set anywhere):

1. **Turn B3 fully on** (spec, section 3, "Turning it on"):
    - load the module with `session_lengths_enabled: true`;
    - set `BLACKOUT_SESSION_LENGTHS=1` and run migration 100;
    - deploy a client built with `VITE_BLACKOUT_PANEL_SESSION_LENGTHS=1`.
2. **On the API:**
    - run migrations 102 and 103;
    - set `BLACKOUT_BLACK_MASK_LINKS=1`;
    - confirm `GET /health` reports the bot as a Synapse admin
      (`adminOk: true`);
    - set `BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS=1` only where accounts on that
      homeserver are made only through Blackout. Without it, existing
      accounts can link and new sign-ups cannot (Q2).
3. **Build the client** with `VITE_BLACKOUT_PANEL_ACCOUNT_LINK=1` as well.
4. **Set `BLACK_MASK_FRAME_ANCESTORS`** to Black Mask's Chromium extension
   origins and recreate the container (spec, section 2).
5. **Check:**
    - `curl https://<chat-host>/v1/integrations/black-mask/config` answers
      200 with `"enabled": true`;
    - a 503 names what is missing.
6. **Ship a Black Mask build** with the Blackout origin set.

**Rolling back:**

-   **API flag off.** New links can no longer be made or claimed. Existing
    links can still be read and ended, and their tokens stay bound.
-   **Link client switch off.** The panel stops offering links. A stored
    linked session still shows its link and its Unlink button, as long as
    B3's switch is on.
-   **B3's client switch off.** The panel goes back to the full app's names,
    as B3 describes. The linked session's tokens stay in that browser. A
    timed link still ends on time on the servers. An "Until I unlink" link
    lasts until it is ended from Settings or Black Mask.
-   **Reverting the code.** First run
    `pnpm --filter @blackout/api exec tsx src/scripts/endBlackMaskLinks.ts`,
    so that no linked device stays signed in without a record. Then, while
    this code is still deployed, run
    `DATABASE_URL=... pnpm --filter @blackout/api migrate:down -- --target 102`.
    As with 100, a boot-time checksum audit on code without 103 treats an
    applied 103 with no file as drift.

### 5.7 Documents each change updates

-   **A1:**
    -   the spec, section 4 (status and the corrected FBM wording);
    -   `KNOWN_LIMITATIONS.md`, "Black Mask chat panel": replace "account
        linking (B4/B5)" with what was built and what is not enforced;
    -   `THREAT_MODEL.md` (section 4.4);
    -   `packages/api/.env.example`.
-   **A2:** the same three files, for the token binding.
-   **C1 and C2:**
    -   the spec, section 1, the "Shown" list;
    -   `KNOWN_LIMITATIONS.md`;
    -   `apps/blackout-client/.env.example`;
    -   `TRUST.md`, if its panel paragraph mentions linking.
-   **M1 to M3:** Black Mask's `docs/black-mask/{features,browser-validation,store-submission}.md`.
-   **F1:** FBM's `docs/AUDIT_DEBT.md`.

## 6. Open questions the code forces

Each has a recommended answer. The build assumes the recommendation unless
told otherwise.

-   **Q1. The spec asks for a "signed handshake, like the existing
    FBM↔Blackout bridge". Can the link be signed?**
    -   _Why the code forces it:_ that bridge is bearer-authenticated
        (section 1.4). The vault side is a public client, with no Black Mask
        server in reach, and Black Mask may not add encryption logic.
    -   _Recommended:_ accept the device-code handshake in section 2.
        Blackout mints the secrets and stores them only as SHA-256; the
        person's typed code is the consent; the link credential's powers are
        limited as in section 2.1. Keep HMAC signing for channels between two
        servers that can hold a secret.
-   **Q2. Must a brand-new account made inside the flow always be linkable?**
    -   _Why the code forces it:_ the claim needs a Blackout API account. The
        exchange's rule creates one for a Matrix-only sign-up only when
        `BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS` is set, because a valid Matrix
        token does not prove that Blackout minted the account (the M4 note in
        `routes/auth.ts`).
    -   _Recommended:_ keep the rule. Report it as `newAccountsLinkable`, so
        that the panel says so before sign-up. Set the variable where the
        homeserver's accounts come only through Blackout. Account-number
        sign-up already requires it (`packages/api/.env.example`).
-   **Q3. What happens to the link when someone logs out of Black Mask?**
    -   _Why the code forces it:_ a per-account `UserKeyDefinition` with
        `clearOn: ["logout"]` deletes the credential at logout. That orphans
        a link that is still active on Blackout. Without `clearOn`, the
        credential stays on disk after logout.
    -   _Recommended:_ end the link at logout. Add one best-effort call, with
        a 10-second limit, in `logout()` in `main.background.ts`, before its
        `stateEventRunnerService.handleEvent("logout", …)` clears the state.
        Then clear. If Blackout cannot be reached, the link stays until its
        end or until it is unlinked from the panel or Blackout's Settings,
        and the logout dialog says so.
-   **Q4. Several Black Mask accounts in one browser profile.**
    -   _Why the code forces it:_ the extension switches between up to five
        accounts (`ACCOUNT_LIMIT = 5` in
        `apps/browser/src/auth/popup/account-switching/services/account-switcher.service.ts`).
        The panel's Blackout session belongs to the browser profile (its
        storage is per origin), not to a vault account.
    -   _Recommended:_ the link belongs to the vault account that made it.
        While any account on the device holds an active link, Black Mask
        shows the chat panel only to that account. The others see "The chat
        panel on this device is linked to another Black Mask account".
-   **Q5. What happens to links made before a homeserver moves to MAS?**
    -   _Why the code forces it:_ after the move, the module does not start,
        so no length can be checked. Synapse's admin device deletion may not
        end a session that MAS holds; that has not been verified.
    -   _Recommended:_ make "end every active link"
        (`endBlackMaskLinks.ts`) a step of the MAS move runbook (`syn2mas`,
        `docs/contracts/mas-identity.md`), before the move. After it,
        linking is not offered (decision 8).
-   **Q6. How is a failed device sign-out retried?**
    -   _Why the code forces it:_ nothing tells the API about device changes.
        Since #967, background loops run only on the leader process.
    -   _Recommended:_ no new loop. Retry on every later read of the link (a
        state pull, the Settings list, an exchange from that device), show
        the failure in Settings and in Black Mask, and point to Settings →
        Devices.
-   **Q7. Should C1 wait for D1?**
    -   _Why the code forces it:_ without D1's fix, a panel that is open when
        its device is deleted elsewhere often keeps failing instead of
        showing that it was signed out (section 7).
    -   _Recommended:_ fix D1 first as C0, which is its own small change and
        is also a B3 and full-app fix. If C0 is declined, C1's copy for
        server-side ends must say the panel may need reloading. The server
        side holds either way: the device is gone and nothing can be read or
        sent.

## 7. Defects found along the way

None of these is fixed here (decision 9). Each needs its own triage. That
triage is `docs/security/api-findings-triage-2026-10-25.md` (2026-10-25); it
fixes D1–D5 and hands D6 to FBM's ledger.

-   **D1 — a refused refresh is treated as a passing failure (Blackout
    client).**
    -   _The behaviour._ `buildTokenRefreshFunction` in
        `apps/blackout-client/src/client/initMatrix.ts` throws `MatrixInitError`
        when `/refresh` fails. matrix-js-sdk 40.2.0 (the lockfile's version)
        logs a session out only when the refresh function throws a
        `MatrixError` or `TokenRefreshLogoutError`; anything else counts as a
        transient `TokenRefreshOutcome.Failure` (`lib/http-api/refresh.js`).
        Synapse answers a deleted device's refresh with 401 `M_UNKNOWN_TOKEN`
        and an expired one with 403 `M_FORBIDDEN` (`synapse/handlers/auth.py`,
        `refresh_token`).
    -   _The effect._ When a device is deleted elsewhere, `SessionLoggedOut`
        fires only if the request that fails holds a token the SDK still
        believes has 60 seconds or more left. Otherwise the SDK keeps
        retrying. The client passes no expiry to `createClient`
        (`initClientForSession`), so until the first refresh, which happens
        only when the token the client started with is refused, the SDK does
        not know any expiry and always takes the refresh path.
    -   _Who it affects._ B3's panel today (a device removed under Settings →
        Devices), the full app, and B5's open panel.
    -   _How it was found._ By reading the SDK; it was not reproduced in a
        browser.
    -   _Status (2026-10-25):_ **fixed.** `buildTokenRefreshFunction` throws
        the SDK's `TokenRefreshLogoutError` on a 401 or 403 from `/refresh`, so
        the SDK signs the session out; 429 and 5xx stay transient
        (`apps/blackout-client/tests/unit/client/initMatrix.tokenRefresh.test.ts`).
        Still not reproduced in a browser.
-   **D2 — expired auth rows are never pruned (API).**
    `pruneExpiredRevokedSessions` and `prunePendingOAuthLinks` in
    `packages/api/src/db/store.ts` have no caller, on 6ea67c4 or on current
    `develop`. Expired denylist entries and pending OAuth rows are never
    removed. Only growth is affected: expiry is checked whenever they are
    read.
    -   _Status (2026-10-25):_ **fixed.** An hourly prune
        (`packages/api/src/services/authRowsPruneScheduler.ts`, started by
        `startBackgroundLoops`, `BLACKOUT_AUTH_ROWS_PRUNE=0` disables) calls
        both, and `prunePendingOidcLogins`, which had no caller either.
-   **D3 — account-number sign-up bypasses the invite gate (API).**
    -   _The behaviour._ `POST /v1/auth/account-number` creates Matrix
        accounts through the admin API with no invite check.
    -   _What the docs say._ `KNOWN_LIMITATIONS.md` ("Invite-only
        registration during the Test Flight") says sign-up is gated by
        one-time registration tokens.
    -   _The contrast._ The API's own `/register` honours
        `REQUIRE_INVITE_TOKEN`.
    -   _Why it matters here._ The panel offers this path ("Create an
        anonymous account (no email)"), so link mode inherits it.
    -   _Open:_ whether it is intended.
    -   _Status (2026-10-25):_ **fixed**, as not intended. The route takes an
        optional `inviteToken`, refuses `403 invite_required` without one when
        `REQUIRE_INVITE_TOKEN=1`, checks a presented token before minting and
        consumes one use after (`redeemInvitationForMatrixUser`, which also
        admits the new Matrix account to a room-bound invitation's room).
-   **D4 — `KNOWN_LIMITATIONS.md` is out of date (docs).** Its "Black Mask
    chat panel" section still lists "creating a canopy or a den from the
    panel" under "Not there yet". The New canopy and New den screens shipped
    (`EmbedNew.tsx`; spec, section 1; PR #965, merged 2026-10-24).
    -   _Status (2026-10-25):_ **fixed.** The section now says the screens
        shipped.
-   **D5 — FBM webhooks can be replayed (API).** Blackout's FBM webhook check
    (`verifyWebhook` in `packages/api/src/integrations/marketplace/freeblackmarket.ts`)
    is an HMAC over the body alone, with no timestamp. A captured delivery
    therefore verifies forever. Deduplication on the event id is the only
    defence against replay.
    -   _Status (2026-10-25):_ **fixed in Blackout; FBM's half pending.** The
        verifier accepts `x-fbm-timestamp` and then signs over
        `<timestamp>.<body>` with a 300-second window (the form FBM already
        uses for Blackstar); the body-only form stays accepted until the
        operator sets `FREEBLACKMARKET_WEBHOOK_REQUIRE_TIMESTAMP=1`, which
        needs FBM to send the header first (work order §1). Independently, a
        delivery whose event id was already processed is acknowledged before
        any handler runs — the tip, creator-subscription, canopy-plan and
        boost captures re-ran on every replay, and a replay re-activated a
        cancelled subscription.
-   **D6 — the coalition-tier lookup never finds a customer (FBM).**
    `resolveCustomerIdByMxid` in `backend/src/lib/blackout-identity.ts`
    queries `metadata->>mxid` with the key unquoted. Postgres reads that as a
    column reference, and `customer` has no `mxid` column. The error is
    caught and turned into null, so `coalitionKarmaTier` in
    `blackout-economic-standing.ts` never finds a customer by mxid and always
    answers `null`, "we cannot say". Per that function's comment, Blackout's
    coalition join gate then sends every joiner to a steward. This was read in
    code and not run. It belongs in FBM's ledger next to F1.

## 8. What was checked, and what was not

**Read in code**, at the commits named at the top:

-   every path cited above;
-   B3's client, API and homeserver code;
-   the exchange, refresh and sign-out routes;
-   the store's refresh-token and revocation code, and its descriptors;
-   Synapse's admin device servlets, `delete_devices` and the refresh errors;
-   matrix-js-sdk 40.2.0's token refresher;
-   FBM's `/link` route and its helpers;
-   Black Mask's manifest, background bootstrap, state framework, storage
    services and privacy services.

**Checked on GitHub on 2026-10-24:** PR #967 merged with migration 102;
`develop` at 6f8b008; no open pull requests.

**Checked against RFC 8628:** the section numbers cited (§3.2, a 5-second
default polling interval; §5.1, user code brute forcing; §5.4, remote
phishing; §6.1, the base-20 consonant set and eight-character codes with an
entropy of 20⁸).

**Inferred, not run:**

-   the guessing figures in section 4.1, which are arithmetic over the
    proposed limits;
-   the timing of D1, from the SDK's constants;
-   D6;
-   that Chromium injects Black Mask's all-frames content script into an
    `https` frame inside an extension page. It certainly runs in a top-level
    `/embed` tab;
-   that Firefox gives the extension host permission for its calls to the
    Blackout API. Without it, Firefox's CORS would refuse them, and the API's
    CORS list cannot name per-install extension origins.

**Not verified:**

-   anything running: no homeserver, API, browser or extension was run for
    this design;
-   how a browser partitions storage for extension-framed pages (open since
    B2);
-   Synapse's admin device deletion under MAS;
-   the Vaultwarden fork and Black Mask's provisioning service, which are not
    in any repository reached here.
