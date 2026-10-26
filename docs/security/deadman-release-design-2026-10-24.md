# Dead-man switch release — design, 2026-10-24

Design record for N2 in
[`deadman-and-feeds-triage-2026-10-12.md`](deadman-and-feeds-triage-2026-10-12.md):
what a dead-man switch releases, to whom, and how the key reaches them. On
2026-10-24 the operator chose the third option set out there, a real release,
and asked for a design before the build. Nothing described here is built. This
record says what exists, what each way of building the release can and cannot
promise, and recommends one as PR-sized steps.

**Status, 2026-10-26:** PR 1 (§8) is merged (#979). Before PR 2, the
composition in §4(a) was reviewed in
[`release-identities-2026-10-26.md`](release-identities-2026-10-26.md), which
changed §4(a) steps 1, 3 and 5 and the safety code; those passages say so.
**PR 2, release identities, is built** (migration 104); what it holds and how
it is tested is in that record, §6. An independent review of PR 2 on the same
day found two high, five medium and seven low findings; that record's section
"Independent review, 2026-10-26" says what was done about each. It changed
§4(a) steps 2 and 5, the safety-code row in §4 and in §7, and PR 2's entry in
§8; those passages say so. Arming stays closed until PR 4.

The switch may be relied on for someone's physical safety. Every property
below is stated with its limits, and §7 gives the wording the app may use and
the claims it must never make.

**State read:** `origin/develop` at `6f8b0085cc`, which includes #966 (the
`x-blackout-capabilities` header only narrows) and #967 (the production worker
loads the store; the 72-hour backlog window, migration 102), both merged on
2026-10-24. Line numbers are at that commit; paths are from the repository
root unless a section has just named the directory. **Read** means a claim
rests on the code. **Observed** means it was also seen by driving the API in
memory mode with a probe script kept outside the repository, run at `6ea67c4`;
the files it exercised are the same at `6f8b0085cc`. Nothing was run against a
deployment.

## Summary

-   **Who gets what.** Each person the owner names who has a Blackout account
    on this homeserver, has set up release keys and has compared a safety code
    with the owner can open the owner's message in Blackout once the switch
    fires, and the Blackout bot tries to tell them there is something to open.
    Nobody else gets anything. Blackout's server keeps the timer, an encrypted
    copy, and who named whom and when.
-   **How the key reaches them.** There is no separate key to hand over. On the
    owner's device the message is encrypted under a fresh key, and that key is
    sealed to each recipient's public release key with the X25519 + ML-KEM-768
    construction the dead-drop code already has; each sealed copy is signed
    with the owner's release key. The sealed copies wait on the server next to
    the ciphertext. Once the switch fires, the server gives each recipient
    their own sealed copy, and only the private key on that recipient's device
    opens it.
-   **What no option here can promise: that the release happens.** Whoever
    keeps the timer can hold a release back, delay it or bring it forward, and
    nobody is told. Someone who keeps the owner from reaching Blackout long
    enough makes it fire. A coerced owner can be made to check in or cancel.
-   **Recommendation:** option (a), with a required safety-code comparison,
    owner signatures, a plaintext notice that only points, and opt-in
    reminders, in five PRs (§8). The first makes today's switch honest and lets
    owners check in and cancel; arming opens only with the release.

## 1. Today, verified

### Arming

-   `POST /v1/deadman/switches` (`packages/api/src/modules/deadman.ts:155-217`,
    schema at `:25-41`) needs `deadman.write`. It accepts a `roomId` that is
    any string (nothing checks the room or the caller's membership), an
    interval of 60 seconds to 365 days and a grace period of 0 to 30 days
    (`packages/api/src/services/deadmanScheduler.ts:19-23`), 1 to 64
    recipients that are any non-empty strings, an `encryptedPayload` that is
    any non-empty string up to the 16 MiB body limit
    (`packages/api/src/middleware/body-limit.ts:13`), and an optional
    `headline` of up to 280 characters. **Observed:** a plaintext payload, a
    `roomId` that names no room and a recipient on another homeserver were all
    accepted.
-   No session token carries `deadman.write`. `deriveUserCapabilities`
    (`packages/api/src/services/auth.ts:238-255`) leaves it out, it is not an
    admin-only scope (`packages/api/src/modules/authz.ts:35-43`), and the
    `admin.*` grant is minted nowhere. **Observed:** a default token naming
    `deadman.write` in `x-blackout-capabilities` gets 403 `missing_capability`.
-   Until #966 that header added scopes (H1 in
    [`capability-header-triage-2026-10-23.md`](capability-header-triage-2026-10-23.md)),
    so any signed-in account could arm a switch through the API. Switches armed
    that way may exist in deployed stores; how many is not known here. The app
    has never had an arming form.

### Check-in, cancel, grace and trigger

-   Check-in and cancel are owner-only (`deadman.ts:219-268`, `:270-309`).
    Check-in returns an armed or grace switch to armed with new deadlines and
    ends a backlog window; a triggered or cancelled switch gets 409. Cancel ends
    an armed or grace switch and leaves the payload in the store. Both need
    `deadman.write`, so nobody can do either today.
-   The sweep runs in the process that leads the background loops
    (`packages/api/src/backgroundLoops.ts:274-293`), every 30 seconds by
    default. In `deploy/docker/production` that is the `worker` service, since
    the app replicas set `BLACKOUT_BACKGROUND_WORKERS_DISABLED`
    (`deploy/docker/production/docker-compose.yml:26`).
    `evaluateSweepTransition` (`deadmanScheduler.ts:105-130`) moves an armed
    switch past `triggerAt` to grace and a grace switch past `releaseAt` to
    `triggered`. A switch the sweep reaches more than 15 minutes late (by
    default) goes to grace with at least 72 hours left instead, once per missed
    check-in (migration 102; R10 in `THREAT_MODEL.md`).
-   Triggering sets the status and records a domain event in the memory of the
    process that ran the sweep (`deadman.ts:103-150`). Nothing reacts to it:
    nothing is posted and nobody is told.
-   `POST /v1/deadman/process-overdue` (`deadman.ts:352-405`) runs the plain
    transitions, without the backlog window, over the caller's own switches,
    against a `now` the caller may supply (D6). Outside tests only the SDK's
    `processOverdue` calls it, and nothing calls that.
-   **Together:** now that the production worker loads the store (#967), every
    armed or grace switch there will fire, because no owner can check in: one
    whose deadline had already passed gets at least 72 hours of grace from the
    first sweep that reaches it, the others release at their own times.
    Whether #967 is deployed is not known here.

### What a recipient can read

-   `GET /v1/deadman/switches?scope=recipient` and
    `GET /v1/deadman/switches/:id` (`deadman.ts:311-350`) return every switch
    whose recipient list holds the caller's Blackout account id as an exact
    string (`packages/api/src/db/store.ts:2417-2421`), in every status, with
    the owner id, room id, interval, grace, `lastCheckInAt`, `triggerAt`,
    `releaseAt`, every recipient and the headline. `encryptedPayload` is added
    only once the switch has triggered (`recordToPayload`, `deadman.ts:51-74`,
    the D3 fix).
-   **Observed:** a named recipient sees an armed switch, sees its
    `lastCheckInAt` change when the owner checks in, sees the other
    recipients, and still sees the switch after the owner cancels it. Before
    anything fires, then, a recipient can follow when the owner checks in and
    learn who else is named. D3 closed the payload, not this. **New in this
    record**; PR 1 (§8) closes it.
-   Session subjects are Blackout account ids, never `@…` or `!…` strings, so a
    recipient written as a Matrix id or room id matches nobody. No screen in
    the app shows a recipient anything.

### Stored, encrypted by whom, readable by whom

-   Table `deadman_switches` (migrations 021 and 102). Owner, room, status,
    timing, recipients and headline are plaintext to the operator.
    `encrypted_payload` is kept as sent: the server never decrypts it, but it
    cannot tell whether it is ciphertext, and no code in the tree produces one
    (the panel has no form; the SDK takes a string). `THREAT_MODEL.md` §5's
    "Payload is client-encrypted" holds only if whoever armed it encrypted it.
-   The owner reads all of it; a recipient reads the metadata at any time and
    the payload after the trigger; the operator reads whatever was stored.
-   The owner's data export lists their switches with a recipient count
    (`packages/api/src/services/accountLifecycle.ts:188-201`). Account deletion
    (`:270-290`) erases scheduled messages but leaves switches armed, so a
    deleted owner's switches fire later.

### What the app shows

-   The `/deadman` page (`apps/blackout-client/src/app/features/deadman/`) is
    in the navigation and in Settings for every account: the `deadman` flag is
    on by default (`apps/blackout-client/src/app/core/features/featureFlags.ts:383`)
    and the gate is `deadman.read` (`manifest.ts:14-17`).
-   `DeadmanSwitchPanel.tsx` lists the owner's own switches only: headline or
    id, status, "Trigger ‹ISO time› · Release ‹ISO time› · N recipient(s)",
    and Check in and Cancel buttons (`:108-171`). Both buttons get 403, shown
    as the SDK's "Request failed (403) for /v1/deadman/switches/…"
    (`packages/blackout-sdk/src/client/fetchClient.ts:77`).
-   Under the list the panel tells people to "Use @blackout/sdk
    createDeadmanActions().armSwitch to arm a new switch tied to this room", or
    to "Select a room to arm a new deadman switch", and "About arming" says the
    arming form "lives in feature integrations that own payload encryption"
    (`:173-201`). No such form exists, so all three describe something that is
    not there.

### Unused code that would leak if wired

-   `useDeadmanSwitch` (`features/deadman/useDeadmanSwitch.ts`) and the SDK's
    `createDeadmanMatrixActions`
    (`packages/blackout-sdk/src/deadman/matrixActions.ts:23-44`) would put a
    whole switch — owner, recipients, timing and, from the owner's view, the
    payload — into a `co.bmc.deadman` room state event. The SDK comment calls
    that "opaque to Synapse". Room state is something "Matrix never encrypts"
    (`TRUST.md` §1): the homeserver and every member of the room, later joiners
    included, would read it. Nothing calls either.

### What a design can build on

-   **The bot.** `createRoom` takes a required `encrypted` flag and `sendEvent`
    sends as the bot (`packages/api/src/integrations/matrix-client.ts:301-322`,
    `:1165`). The bot has no Megolm, so what it sends is plaintext even in an
    encrypted room (`TRUST.md` §1). Closest precedent: the FBM digital delivery
    creates a room and posts a generic `m.notice` with a pointer field, never a
    secret
    (`packages/api/src/services/fbmMatrixBridge/deadDropDelivery.ts:59-100`).
    `createRoom` takes no invite list and `inviteToRoom` sends no `is_direct`
    (`matrix-client.ts:562`). The worker already posts scheduled messages with
    a Matrix transaction id derived from the row
    (`packages/api/src/services/scheduledMessageDispatcher.ts:200`).
-   **Client crypto.** The dead-drop suite in
    `packages/blackout-protocol/src/deaddrop/crypto/`: WebCrypto X25519,
    HKDF-SHA-256 and AES-256-GCM, ML-KEM-768 through `@noble/post-quantum`
    0.6.1 (`mlkem768Provider.ts`), the hybrid combiner with a transcript input
    (`pqHybrid.ts`), padding buckets (`padding.ts`) and Shamir sharing over
    GF(256) (`quorum.ts`). Its envelopes are single-recipient and carry no
    sender signature (`docs/security/deaddrop-pq-hybrid.md`). None of it is in
    a shipped flow: `setKemProvider` is called only in tests, so the default
    KEM provider throws, and the SDK's `createDeadDropActions` has no importer.
    The client already verifies Ed25519 with WebCrypto for plugins
    (`apps/blackout-client/src/app/features/monetization/install/pluginSignature.ts:151`).
-   **Matrix crypto.** matrix-js-sdk 40.2.0 with the Rust crypto
    (`@matrix-org/matrix-sdk-crypto-wasm`) does Megolm, cross-signing, secret
    storage and key backup. The client verifies only the user's own devices
    (`apps/blackout-client/src/app/features/settings/devices/Verification.tsx:177`)
    and ignores a request from anyone else
    (`apps/blackout-client/src/app/components/DeviceVerification.tsx:313`);
    there is no screen for verifying another person.
-   **Not usable.** `encryptE2E` in `packages/core/src/crypto/index.ts:23-25`
    is an XOR with the first 16 characters of the "key", and `signMessage`
    (`:31-33`) joins two strings; neither is cryptography. A user record's
    `pubkeyEd25519` is a random hex string set at sign-up
    (`packages/api/src/routes/auth.ts:228`), not a key.
    `apps/deaddrop-appservice` has no authentication on its routes, its Matrix
    send is a placeholder, and its legacy flush logs message bodies
    (`src/index.mjs:78-83`); no tracked compose file runs it. That last point
    belongs to the dead-drop work and is noted here only so nobody builds on
    it.
-   The key-transparency log, the Matrix id bridge and the governance engine
    are covered where they matter: §4, §5 and §4(c).

## 2. Goals and non-goals

**Who it is for is an open input.** The panel launch doc records "dead drops
first" and leaves the switch's audience to be written down
(`docs/black-mask-chat-panel-and-account-link.md:772-774`). Two shapes pull
apart:

-   **Inheritance-style:** passwords and instructions for family or a lawyer.
    Long intervals, trusted recipients, reminders welcome. The main risk is
    that the message never becomes readable: a lost key, a missed notice.
-   **Whistleblower-style:** material for a journalist or lawyer, against an
    adversary who may compel the operator, read the owner's notifications or
    coerce the owner. Shorter intervals. The main risks are a release held
    back, one brought forward, and anything visible that gives the switch
    away.

The design serves both with defaults that are safe for the second (Q1 in §9).

**Goals**

1.  Blackout's server cannot read the message, given that the owner compared
    a safety code with each recipient.
2.  A recipient can tell the message came from the owner's release key, so
    the server cannot forge one in the owner's name.
3.  Before the release a recipient can read nothing and learns nothing about
    the switch.
4.  Recipients learn of a release from Blackout, through a notice that carries
    nothing sensitive.
5.  Owners can check in and cancel from the app, and can ask for reminders.
6.  Everything the app says is true (§7).
7.  Nothing depends on Blackout's Matrix encryption, which nothing may rely on
    until BO-1 is fixed
    (`docs/black-mask-chat-panel-and-account-link.md:752-754`;
    `KNOWN_ISSUES.md`). BO-1 is a key-backup and history-decryption defect,
    and this design uses neither.

**Not goals of this build**

-   Making the release happen whatever the server does. Disclosed instead.
-   Resisting coercion. There is no duress check-in.
-   Hiding who named whom, and when, from the server.
-   Recipients without a Blackout account on this homeserver: other
    homeservers, email addresses, phone numbers, rooms.
-   Publishing to the public. A switch releases to named people.
-   Attachments. Text only, padded to fixed sizes, capped.
-   M-of-N trustees, which come later (§4(c)).

## 3. Threat model for the release

The actors, with the adversary classes of `THREAT_MODEL.md` §2: the owner;
each recipient; a coerced owner; the server operator (A3), curious, or
compelled to hold a release back, delay it, release it early, substitute keys
or forge a release; a network attacker (A1, A2); someone holding the owner's
session or device (A7); an altered client (A11, and A3's "can serve malicious
clients"); and a recipient who loses their keys.

Two properties are kept apart. **Confidentiality and authenticity** — can
anyone but the recipients read it, can anyone fake it — can be taken away from
the server with cryptography. **Availability** — does it happen, and on time —
cannot, while the server keeps the timer. In every option the operator sees
who armed a switch, whom it names, its interval, every check-in, and when it
releases.

The options are (a) owner-sealed, (b) owner-sealed plus a server-held share,
(c) cryptographic M-of-N trustees and (d) server-held; §4 describes them.

**Confidentiality and authenticity**

| Threat                                                             | (a)                                                                                                                                                 | (b)                                                                          | (c)                                      | (d)                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| Operator reads the stored message                                  | No                                                                                                                                                  | No                                                                           | No                                       | **Yes**                                        |
| Operator swaps in its own key when the owner fetches a recipient's | Caught by the code comparison; without it the operator reads the message from arming on                                                             | As (a)                                                                       | As (a), per trustee                      | Not needed                                     |
| Operator forges a release in the owner's name                      | Caught: the recipient's client checks the owner's signature against the key it compared                                                             | As (a)                                                                       | As (a)                                   | **Not caught**                                 |
| Operator serves altered app code                                   | **Defeats it in a browser**, where the app's code (and every update to it) comes from the server; the desktop and mobile apps carry their own build | As (a)                                                                       | As (a)                                   | Not needed                                     |
| A recipient reads before the release                               | No, unless the server hands over the ciphertext early (a bug like D3, or on purpose)                                                                | No, even holding the ciphertext, unless the server also hands over its share | **M trustees together can, at any time** | No, unless the server lets them                |
| A database copy plus one recipient's private key                   | **Reads it**                                                                                                                                        | **Reads it**: the share is in the same database                              | Needs M trustees' keys                   | A database copy plus the server's key reads it |
| Network attacker reads or alters it                                | No (TLS, ciphertext, signatures)                                                                                                                    | No                                                                           | No                                       | No (TLS)                                       |

**Availability and control**

| Threat                                            | (a)                                                                                                                        | (b)                                       | (c)                                                                        | (d)                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| Operator holds the release back                   | **Yes, silently**                                                                                                          | **Yes**                                   | Not if the trustees already hold their shares and a copy of the ciphertext | **Yes**                       |
| Operator delays it                                | **Yes**: an outage alone delays it by the outage plus up to 72 hours (R10), a compelled operator for as long as it likes   | **Yes**                                   | As for holding back                                                        | **Yes**                       |
| Operator releases early                           | **Yes**, but only the named recipients can read it                                                                         | **Yes**, the same: it hands out its share | No: it needs M trustees                                                    | **Yes**, and it reads it      |
| Network attacker keeps the owner from checking in | **The switch fires**                                                                                                       | **Fires**                                 | Fires if the server's timer decides; trustees may wait                     | **Fires**                     |
| Owner forced to check in or cancel                | **The switch cannot tell**                                                                                                 | The same                                  | The same                                                                   | The same                      |
| Someone holding the owner's session (A7)          | Can check in or cancel; reading the message also needs the owner's release key                                             | As (a)                                    | As (a)                                                                     | Can check in, cancel and read |
| A recipient loses their release key               | Before release, the owner can re-seal to a new key after a new comparison; **after release that recipient cannot read it** | As (a)                                    | Any M of the N keys suffice                                                | Nothing to lose               |

## 4. Options

### The crux of (a): where recipients' keys come from

In (a) the ciphertext sits on the server from the moment of arming. A key the
server swapped in at that moment lets it read the message at once, not just at
release. Without a check the owner makes outside Blackout, (a) is no better
than (d) against an operator who substitutes keys.

| Source                                                                  | What exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | What it would give                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Verdict                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| A key directory on the API, checked with a safety code                  | Nothing yet (PR 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The owner's and the recipient's devices each compute a code from both release identities and both account ids (one 30-digit half per identity, 60 digits: `release-identities-2026-10-26.md` §2), and the two people compare it in person or on a call. A key the server swapped in, on either side, gives a different code, if all 60 digits are compared (a partial comparison is far weaker: `release-identities-2026-10-26.md` §2). Needs no trust in the server and no Matrix encryption. Costs a meeting or a call per recipient. | **Chosen**                    |
| The key-transparency log (`packages/api/src/routes/keyTransparency.ts`) | It holds cross-signing master keys, not encryption keys (`packages/api/src/services/keyTransparency.ts:41-48`). **Observed:** `POST /append` with no `Authorization` header stores any `userId` and key (the auth middleware lets token-less requests through, `packages/api/src/middleware/auth.ts:9-13`, and `docs/security/key-transparency.md` says "Any caller that can hit the API can currently append"); `lookup` returns it; `sth` answers `scheme: 'none'`. It is in memory unless `KT_LOG_FILE` is set and unsigned unless `KT_WITNESS_ED25519_SEED` is; no tracked deploy file sets either. The verifier lives in the API package on `node:crypto`, and no client fetches or checks a proof. | Even finished, it detects a swapped key after the fact, and only with a witness the operator does not hold                                                                                                                                                                                                                                                                                                                                                                                                                              | Not now; later hardening (§8) |
| Matrix cross-signing                                                    | The Rust crypto has cross-signing and the SDK has `requestVerificationDM` and `getUserVerificationStatus`, but the client has no screen for verifying another person, and the crypto API has no call that signs arbitrary data with a cross-signing key, so a release key could be tied to a Matrix identity only by sending it in an encrypted message                                                                                                                                                                                                                                                                                                                                                  | Reuses Matrix verification, but routes trust through Matrix encryption (BO-1)                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Not now                       |
| Trust the first key fetched, warn when it changes                       | Nothing beyond the directory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | The server can swap the very first key, which is when it matters most, and the app could only say "Blackout's server could read this if it gave you a false key"                                                                                                                                                                                                                                                                                                                                                                        | Rejected for this build (Q3)  |

The directory is not specific to the switch. Dead drops, which were decided
first, need recipients' public keys too (the SDK's `sendDeadDrop` takes one
and nothing provides it), so the identities and routes should not live under
`/v1/deadman`.

### (a) Owner-sealed release — recommended

1.  **Release identity.** Each person, owner and recipients alike, creates one
    on a device: an Ed25519 signing key, an X25519 key and an ML-KEM-768 key,
    signed with the first together with the person's Blackout account id, and
    published to the API. The private halves stay in the device's IndexedDB
    and in a passphrase-protected recovery file the person can save, together
    with the record of whom they have compared codes with. _(Changed by the
    2026-10-26 review: the signature covers the account id, and every message
    a release key signs starts with its own label. The format is fixed in
    `release-identities-2026-10-26.md` §1.)_
2.  **Adding a recipient.** The owner's client fetches the recipient's
    identity and the two people compare the safety code. No comparison, no
    recipient. Comparing tells the recipient the owner may name them; it does
    not tell them whether a switch exists or when the owner checks in.
    _(Added by the 2026-10-26 independent review: a comparison counts only
    for the identity that is the account's current one when it is used, and
    becomes stale once the device has seen a newer identity for that account
    or the directory lists the compared fingerprint as superseded; the client
    then asks for a new comparison. The API now refuses to make a replaced
    identity current again, but a compelled server can serve any key, so this
    check is the client's. `release-identities-2026-10-26.md`, H1.)_
3.  **Arming.** The client picks a release id and a random 256-bit content key
    K, and encrypts the padded message with AES-256-GCM under K, with the
    release id and owner id as associated data. For each recipient, and for
    the owner, it seals K with the dead-drop v2 construction (an ephemeral
    X25519 key and an ML-KEM-768 encapsulation, HKDF-SHA-256 with the release
    id, both account ids and both key fingerprints in the transcript,
    AES-256-GCM), refusing an all-zero X25519 output, then signs each sealed
    copy together with the ciphertext's hash, a commitment to K, the release
    id, both account ids and both fingerprints. The server receives the
    ciphertext, the sealed copies, the signatures and the timer settings.
    _(Changed by the 2026-10-26 review: the owner's fingerprint and the
    all-zero check are new, and so is the commitment to K, because AES-GCM
    does not commit to its key. One sealing function serves dead drops and
    releases. Details and the HPKE comparison:
    `release-identities-2026-10-26.md` §5.)_
4.  **Release.** The sweep marks the switch triggered, as today. From then on
    `GET /v1/deadman/releases` gives each recipient the ciphertext and their
    own sealed copy and signature, never anyone else's, and the bot sends the
    notice (§5).
5.  **Opening.** The recipient's client checks the signature against the
    owner identity it compared (a comparison still current, step 2), checks that the copy names its own account
    and fingerprint, opens its sealed copy, checks K against the commitment
    and decrypts. If any check fails, the app shows the failure and not the
    content.
6.  **Key changes.** When a recipient's identity changes, the owner's list
    says so; after a new comparison the owner's client re-seals K to the new
    key. Until then the old sealed copy stands, so recipients keep superseded
    private keys unless they delete them. After release nothing can be
    re-sealed.
7.  **Devices.** Checking in needs only a signed-in session, on any device.
    Arming, editing and re-sealing need the owner's release keys on that
    device.

**Exists:** the cipher suite and padding (not wired), the WebCrypto Ed25519
precedent, the sweep with its backlog window, the D3 read rule, and the bot's
room and send calls. **To build:** identities and their directory, the
envelope, the arming, comparison and opening screens, the release read, the
notifier and reminders (§8). **Verdict:** recommended. The server can hold a
release back, delay it, or release it early to the named recipients; it cannot
read it, swap a key without the comparison catching it, or forge it.

### (b) Owner-sealed plus a server-held share

As (a), but K is derived from two halves: one sealed to the recipients, and 32
random bytes the server holds in plaintext and hands out only after the
release. What it adds: a recipient who obtains the stored ciphertext early
still cannot read it. That would matter for a read bug like D3 (fixed on
2026-10-12), and if recipients were ever given the ciphertext ahead of time so
that only 32 bytes need to flow at release. It does not stop a compelled server
from releasing early (it hands out its half), it does nothing against holding a
release back, and a database copy holds both the half and the ciphertext.
"Neither side alone can decrypt early" is just as true of (a), where a
recipient has nothing to decrypt before the release.

Considered and not proposed: making the server's half a time-lock against a
public randomness beacon, so that the server could not hand it out early.
Every check-in moves the deadline, so every check-in would need a new
time-locked half, and a server that kept the old ones could open them when
their time came. It would also add an outside service and a library that is
not in the tree.

**Verdict:** not in this build. PR 1 removes the reads before release that a
D3-type bug would ride on, and the envelope's suite tag leaves room for (b) if
ahead-of-time copies are ever wanted, which belong with (c).

### (c) M-of-N trustees

Two different things go by this name.

-   **Approval through the governance engine.** The API's governance is a count
    the server keeps: proposals and votes are rows, `tallyVotes` counts them
    (`packages/core/src/governance/index.ts:17-29`), and the writes are
    admin-only until a community role model exists
    (`packages/api/src/modules/authz.ts:35-43`; O1 in the capability-header
    triage). The homeserver module records vote events from rooms
    (`GovernanceDecisionStore`,
    `apps/blackout-server/blackout_runtime/module.py:79`). Either way the
    server decides whether M approved. As a gate on a release it gives the
    server a rule to follow, not a guarantee.
-   **Cryptographic trustees.** The owner's client splits K with Shamir
    (`quorum.ts`), seals one share to each of N trustees' release identities
    and signs each. Any M trustees can rebuild K on a device; the server never
    can.

The cryptographic form is the only option that survives a server that holds a
release back or brings it forward, provided the trustees already hold their
shares and a copy of the ciphertext, and M of them agree. Costs: N trustees
with accounts, identities and compared codes; a human decision at release; M
colluding trustees can open it at any time; and `quorum.ts` has no integrity
check, so the owner would have to sign a hash of each share for a bad share to
be caught when they are combined, rather than showing only as a failed
decryption.
**Verdict:** a later phase for the whistleblower case, built on PR 2's
identities, not on a governance vote.

### (d) Server-held release — baseline

The owner sends the message to the server, which stores it encrypted at rest
under a server key and, at release, shows it to recipients or has the bot post
it. No keys to lose, nothing to compare. The server reads it, can forge it, and
can be made to disclose it at any time: the posture scheduled messages have
today. It is honest only with "Blackout's server can read this message" on
screen. **Verdict:** not proposed; recorded so the trade is on paper.

## 5. Delivery

### How a recipient learns

1.  **The Released to you view** in the app is the source of truth. It works
    without a notice.
2.  **A bot notice** in one standing room per account, "Blackout notices":
    created by the bot, not end-to-end encrypted because the bot cannot
    encrypt, the person invited as a direct message (which needs `is_direct`,
    missing today), and their power level below the room's `events_default` so
    nothing can be typed there. One `m.text` per recipient per release. An
    `m.notice` would be silent: the default rule `.m.rule.suppress_notices`
    drops it (`apps/blackout-server/rust/src/push/base_rules.rs:80-91`). The
    FBM delivery's pointer is an `m.notice` posted before the buyer is invited,
    so it notifies nobody; only its invite does. An `m.text` in a two-member
    room notifies (`.m.rule.room_one_to_one`, `:300-314`).
3.  **Push** happens only through the person's own Matrix pushers. The app's
    native push registration asks for `event_id_only`
    (`apps/blackout-client/src/platform/NotificationTokenBroker.tsx:58`), so
    the payload Apple or Google carry holds room and event ids, not the body:
    they learn that something arrived, and when. What a lock screen then shows
    is not settled in this repository: the gateway config
    (`deploy/docker/blackout-backend/sygnal/sygnal.yaml`) sets no alert text,
    and the app has no code that fetches the event to show it. Someone with
    email notifications on gets an email from Synapse that contains the body of
    an unencrypted message (`apps/blackout-server/synapse/push/mailer.py:551-591`).
    The API has no push channel of its own
    (`packages/api/src/services/coalitionNotifications.ts:1-8`), and this build
    adds no email or SMS.

### What the notice may carry

-   **Body, fixed:** "There is something new for you in Blackout. Open
    Blackout to see it. This room is not end-to-end encrypted, so please don't
    reply here."
-   **A pointer field,** `co.bmc.deadman.release`, holding a schema version and
    the release id. The client draws a card from it, the way it reads the FBM
    pointer
    (`apps/blackout-client/src/app/features/marketplace/marketplaceEventSchemas.ts:106`):
    "A dead-man switch that names you was released. Open it." The card is drawn
    in the app's timeline only, so its text is in no email and no push
    payload.
-   **Never:** the message or any part of it; key material, sealed or not; the
    owner's name, Matrix id or account id; the owner's label; other
    recipients; any time; the word "dead-man" in the body. The body reaches an
    email provider for anyone with email notifications on, and room-list
    previews in every client, so it is written to be safe if read by anyone.
    The homeserver already knows the rest.

### Sending it

-   The sweep writes one notice row per recipient as it marks the switch
    triggered, and the notifier also treats a triggered switch that lacks its
    rows as due, so a crash between the two loses nothing. Delivery does not
    hang off the domain event, which stays in the worker's memory
    (`KNOWN_LIMITATIONS.md`).
-   The notifier runs beside the sweep in the background-loop leader, with
    Matrix transaction id `deadman-release-<switch>-<recipient>`, so a resend
    after a crash is deduplicated the way scheduled messages are.
-   A late notice is still sent, unlike a scheduled message reached late
    (`expired_overdue`): the release has happened and the notice only points
    at it. It is retried with backoff for 30 days, then recorded as failed for
    the operator.
-   It does not go through `botPostingGate.ts`, which checks posts the bot
    makes in a user's name into that user's rooms. A notice is the bot's own
    post into its own room.

### Recipients named by Matrix id or room id

-   **This build:** a recipient is an account on this homeserver, picked in the
    form by Matrix id. The API resolves `@name:<MATRIX_HOMESERVER_DOMAIN>` and
    refuses any other server name. It must not reuse `resolveBlackoutUserId`,
    which drops the server name
    (`packages/api/src/services/userIdentity.ts:17-32`; **Observed:**
    `@alice:other.example` resolves to the local account `alice`, a different
    person). The switch stores the account id, and the account must have a
    release identity.
-   **Room ids are refused.** A room's members change, under the control of its
    admins and the homeserver, so releasing to a room releases to whoever the
    server says is in it.
-   **Other homeservers are refused.** No Blackout account, no release
    identity, and the notice would cross federation to a server we do not run.
-   **Existing switches** keep their strings. Those that are not account ids
    still match nobody, and no existing switch sends notices.

## 6. Check-in reminders and the backlog window

-   **Opt-in, per switch,** chosen at arming with nothing preselected (the
    panel's link-length choice is the precedent), and changeable later.
-   **Sent** by the bot into the owner's own notices room as `m.text`, with a
    fixed body: "Blackout reminder: something is due. Open Blackout to see
    it." A `co.bmc.deadman.reminder` field (switch id, kind, due time) lets the
    app draw "Check in by ‹time›". It is not in the body, so it is in no email
    and no push payload.
-   **When:** 24 hours before the check-in deadline (halfway through intervals
    shorter than two days), when grace starts, an hour before release when
    grace is longer than that, and when a backlog window starts: "Blackout's
    server was down when your check-in was due; you have until ‹time›". The
    last answers the reason migration 102 gives for the window, that the owner
    "never saw the switch go to grace in time". A reminder that cannot be sent
    before the moment it is about is dropped.
-   **Replies do nothing.** Check-in happens in the app only. The bot has no
    code path that reads messages (`TRUST.md` §1), and checking in by reply
    would need one.
-   **Best effort.** The switch fires on time whether or not a reminder
    arrived. A reminder never holds a release back: if it did, whoever can
    block Matrix could delay releases.
-   **What a reminder shows others:** the homeserver learns nothing new; Apple
    or Google learn that a notification arrived; an email provider (if email
    notifications are on) and anyone who sees the owner's screen see that
    Blackout wants something. The form says so (§7).
-   **The backlog window and release.** The sweep, the notifier and reminders
    run in the same process, so an outage stops all three. A switch reached
    late gets its window (R10) and then releases like any other; its notice
    does not mention the outage. Nothing in this design shortens the window.

## 7. What the UI may claim

Under the recommended design the app may say the following, and nothing
stronger. ‹…› marks a value filled in at run time; the limits come from the
API, so the text matches the deployment.

| Where                                                                       | Exact text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | True because                                                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Arming form, top                                                            | "If you stop checking in, this switch releases a message to the people you choose."                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | The sweep's trigger and PR 3's release read                                                        |
|                                                                             | "Your message is encrypted on this device for each person you choose. Blackout's server stores only the encrypted copy and cannot read it."                                                                                                                                                                                                                                                                                                                                                                                                                     | §4(a) step 3; every recipient needs a compared code (Q3)                                           |
|                                                                             | "You choose how often to check in and a grace period after each deadline. If both pass without a check-in, Blackout's server releases the switch. From then on each person you chose can open your message in Blackout with their release keys, and the Blackout bot tries to tell them."                                                                                                                                                                                                                                                                       | The sweep; §5                                                                                      |
|                                                                             | "You can only choose people who have a Blackout account on this server and have set up release keys, and you must compare a safety code with each of them first."                                                                                                                                                                                                                                                                                                                                                                                               | §5; PR 2                                                                                           |
|                                                                             | "If you delete your Blackout account, your switches are cancelled."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | PR 1                                                                                               |
| Arming form, always shown, under "What Blackout's server can and cannot do" | "It cannot read your message."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | As above                                                                                           |
|                                                                             | "It can see who you chose, roughly how long your message is, when you check in and when the switch releases. It can read the label you give the switch."                                                                                                                                                                                                                                                                                                                                                                                                        | The metadata is plaintext; padding hides only the exact length                                     |
|                                                                             | "It keeps the timer. If it is down, switched off, or made to hold your switch back, your message is released late or not at all, and nobody is told."                                                                                                                                                                                                                                                                                                                                                                                                           | §3                                                                                                 |
|                                                                             | "If it reaches your switch more than ‹tolerance› after a deadline because it was down, it gives you at least ‹72 hours› more from then, once for each missed check-in."                                                                                                                                                                                                                                                                                                                                                                                         | `evaluateSweepTransition`; R10                                                                     |
|                                                                             | "It could release your switch early. Only the people you chose could read your message."                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | §3; the sealed copies                                                                              |
|                                                                             | "If someone keeps you from reaching Blackout until your release time passes, your switch releases."                                                                                                                                                                                                                                                                                                                                                                                                                                                             | §3                                                                                                 |
|                                                                             | "If someone makes you check in or cancel, the switch cannot tell."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | There is no duress signal                                                                          |
|                                                                             | "In a web browser, this app's code comes from Blackout's server, and a server made to send altered code could read your message as you type it. The desktop and mobile apps carry their own copy of the code."                                                                                                                                                                                                                                                                                                                                                  | `blackout-desktop/src-tauri/tauri.conf.json:10`; `webDir` in `blackout-mobile/capacitor.config.ts` |
|                                                                             | "Do not rely on this switch alone for anyone's safety."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | All of the above                                                                                   |
| Safety code                                                                 | "Compare this code with ‹name› in person. If you can't, use a call where you know their voice, though a voice can be imitated and a call intercepted. Don't compare it over Blackout: this check is about Blackout's server, so it has to happen somewhere the server isn't." and "Read all twelve groups to each other, in order. If any group differs, stop." _(Changed by the 2026-10-26 independent review, for the operator to confirm: the approved text said "in person or on a call where you know their voice", and did not say to read every group.)_ | §4, the crux                                                                                       |
|                                                                             | "If all twelve groups match, you have each other's real keys, as long as neither of you is running altered app code. If any group differs, stop and don't add this person." _(Changed by the same review: the approved text said "If the codes match", which holds only for a full comparison on unaltered code.)_                                                                                                                                                                                                                                              | The same                                                                                           |
| Reminders                                                                   | "Remind me before a check-in is due?" with Yes and No, neither preselected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | §6                                                                                                 |
|                                                                             | "Reminders come from the Blackout bot in a room that is not end-to-end encrypted. They say only “Blackout reminder: something is due.” Anyone who sees your notifications, and your email provider if you get email notifications, can see that you got one. A reminder that doesn't arrive does not hold your switch back."                                                                                                                                                                                                                                    | §6                                                                                                 |
| Owner's list                                                                | "Armed. Check in by ‹local time›. If you don't, it releases at ‹local time›." and "Grace period. Check in before ‹local time› or it releases."                                                                                                                                                                                                                                                                                                                                                                                                                  | Status and deadlines                                                                               |
|                                                                             | "Released ‹local time›. ‹N› people were given access. Notices sent: ‹n› of ‹N›."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The release read; the notice rows                                                                  |
|                                                                             | "Cancelled. Your encrypted message was removed from Blackout's database."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | PR 1 clears it on cancel                                                                           |
|                                                                             | "‹name›'s release key changed. Compare a new code with them, then re-seal, or they won't be able to open this."                                                                                                                                                                                                                                                                                                                                                                                                                                                 | §4(a) step 6                                                                                       |
|                                                                             | For an existing switch: "Armed before Blackout could release messages. When it fires, nobody is notified, and people named by Blackout account can read the text you supplied, through the API only. Cancel it and arm a new one to use releases."                                                                                                                                                                                                                                                                                                              | §8, existing switches                                                                              |
| Released to you                                                             | "‹name› (‹@mxid›), released ‹date›."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | The release read                                                                                   |
|                                                                             | When the signature checks: "Signed with ‹name›'s release key, which you compared on ‹date›. Blackout's server stored only the encrypted copy."                                                                                                                                                                                                                                                                                                                                                                                                                  | §4(a) step 5                                                                                       |
|                                                                             | When it fails: "This did not come from ‹name›'s release key. Do not trust it." The content is not shown.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | The same                                                                                           |
|                                                                             | When no code was compared on this device: "Blackout can't confirm this came from ‹name›: you haven't compared codes with them on this device. It was signed by the key ‹fingerprint›." The content is shown only after a deliberate tap.                                                                                                                                                                                                                                                                                                                        | The same                                                                                           |
|                                                                             | "Blackout removes this from its database on ‹date›. Save the message if you need it after that."                                                                                                                                                                                                                                                                                                                                                                                                                                                                | PR 3's retention                                                                                   |
| Notice                                                                      | The body and card in §5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | §5                                                                                                 |

**The app must never:**

-   say a message "will" be released, or call a release guaranteed, certain or
    unstoppable;
-   say the server cannot stop, delay or bring forward a release;
-   say Blackout cannot see whom you named or when you check in;
-   call a notice, a reminder or a push private or end-to-end encrypted;
-   say anything was sent, delivered, published or shipped before it was (the
    D2 rule); a notice is "sent" only once the homeserver has accepted it;
-   say a recipient "received" or "read" a message, rather than "was given
    access";
-   suggest the switch protects anyone under coercion, or detects duress;
-   say a cancelled or expired message is gone everywhere: server backups keep
    it until they expire, and `KNOWN_LIMITATIONS.md` says so;
-   call the switch anonymous;
-   say a recipient on another homeserver, by email or by room gets anything;
-   say an existing switch notifies anyone;
-   advertise post-quantum or similar strength in the app; the cipher suite
    belongs in the security docs.

## 8. Recommendation and build plan

**Recommendation.** Build (a). The owner's device encrypts the message once
and seals its key to each recipient's release key, which the owner may use only
after comparing a safety code with that person, and signs each sealed copy. The
server keeps the ciphertext, the sealed copies and the timer; at release it
gives each recipient their own copy, and the bot sends a notice that only
points, in a room that is not encrypted. Reminders are opt-in. Nothing goes
through Matrix encryption, so BO-1 does not gate it. The app says plainly that
the server can hold a release back, delay it or bring it forward, and that
whoever can cut the owner off can make it fire. (b) adds too little without
ahead-of-time copies; (c), in its cryptographic form, is the follow-up for
owners who cannot accept a server that can hold a release back; (d) gives up
the server not reading the message, which is the point of the feature here.

**Decisions this design takes; veto them here rather than in review:**
recipients see nothing before release; cancel and account deletion erase the
payload (backups aside); `process-overdue` goes; new switches have no `roomId`
and an owner-only label; text only, padded and capped at 64 KiB, as free dead
drops are; a released ciphertext is kept for 365 days; the recovery file is the
only key backup in this build, since Matrix secret storage would put it behind
BO-1.

### The PRs

1.  **Today, made true; owners can check in and cancel.** No migration.
    -   API: mint `deadman.write`; `POST /switches` answers 409
        `arming_unavailable` until PR 4; recipient reads return triggered
        switches only, without the check-in history, interval, room or other
        recipients, and before release a recipient gets the same answer as a
        stranger; cancel clears the payload; account deletion cancels the
        owner's switches and clears their payloads and labels; remove
        `POST /process-overdue` (D6). Tests for each; H-1 and H-4 in
        `test/capability-header.integration.test.ts`, and the D3 test's
        assertion about the cancel envelope, change.
    -   Client: the existing-switch wording (§7) and "You can't arm a new
        switch yet" replace the SDK hint and "About arming"; times shown in
        local time; delete `useDeadmanSwitch`.
    -   Protocol and SDK: delete `createDeadmanMatrixActions` with its mirror
        types and comment, and `processOverdue`; correct the `recipients` field
        comment.
    -   Docs: `KNOWN_LIMITATIONS.md` (check-in and cancel work; arming is
        closed; deletion cancels; recipients see nothing before release);
        `THREAT_MODEL.md` §5 (the payload is whatever the caller sent); the
        triage record (N2 decided, linking here; D4 and D6 closed; the
        recipient-metadata finding); the C1 note in
        `docs/audits/pre-launch-readiness-audit-2026-07.md`.
2.  **Release identities.** Migration 104 (103 is #983's).
    -   Protocol and SDK: a `release` module in `packages/blackout-protocol`
        with the identity, its canonical bytes and fingerprint, the safety code
        over two identities, and fixed test vectors. It uses the dead-drop
        suite, WebCrypto Ed25519, and argon2id from `@noble/hashes` for the
        recovery file (in the lockfile through `@noble/post-quantum`; declare
        it). SDK calls to publish and fetch.
    -   API: `PUT /v1/release-identities/me` (one's own; its signature is
        checked; the previous one is kept as superseded, every one of them, and
        a replaced one is never made current again; at most 3 new ones in any
        24 hours), `GET /v1/release-identities/:accountId`, and a lookup by
        Matrix id on this server only (`POST /v1/release-identities/lookup`,
        the id in the body); table `release_identities`; erased with the
        account. _(The 2026-10-26 independent review changed the history rule,
        the limit and the lookup; it said "kept as superseded so a change
        shows", which held only for a client that reads the history.)_
    -   Client: Settings → Release keys: create them on this device, save and
        load the recovery file, compare a code with someone. Call
        `setKemProvider(mlKem768Provider)` at startup.
    -   Docs: `THREAT_MODEL.md` §4 asset and §5 row; `KNOWN_LIMITATIONS.md` (a
        lost device without its recovery file loses the key).
3.  **Release, recipient read and notices (API).** The next free migration.
    Behind `BLACKOUT_DEADMAN_RELEASES`, off by default, until PR 4.
    -   Protocol and SDK: the release envelope and its validators (§4(a) step
        3); `armReleaseSwitch`, `resealRecipient`, `listReleases`.
    -   API: `POST /switches` accepts the new format only, and checks that each
        recipient is an account with the identity its sealed copy names and
        that the owner's signatures verify. Those checks catch client bugs, not
        a hostile server, which would skip them. A re-seal route; the
        owner-only label; no `roomId`. `GET /v1/deadman/releases` (§4(a) step
        4). The sweep writes notice rows with the trigger, and the notifier
        sends them (§5). A released ciphertext is removed after 365 days. A
        limits route for the form (bounds, tolerance, backlog window).
        `is_direct` support in `createRoom` and `inviteToRoom`.
    -   The migration: `deadman_switches.release_format` (existing rows
        `legacy`), `released_at`, and `room_id` made nullable; tables
        `deadman_release_wraps` (switch, recipient, fingerprint, sealed key,
        signature) and `deadman_release_notices` (switch, recipient, room,
        attempts, last error, sent at).
    -   Docs: `TRUST.md` §1 (notices and reminders join the bot's plaintext
        posts); `THREAT_MODEL.md` §5 row and a new residual risk R11 (the
        server can hold a release back, delay it or bring it forward; the app
        says so); `KNOWN_LIMITATIONS.md`.
4.  **Arming and opening (client).** Turns `BLACKOUT_DEADMAN_RELEASES` on and
    lifts the 409.
    -   Client: the arming form (message; recipients by Matrix id, each behind
        the code comparison; interval and grace; reminders with nothing
        preselected; §7's text, always shown); the owner's list; Released to
        you; the notice card. Unit tests against a stub API, and one test that
        arms, sweeps and opens end to end.
    -   Docs: `KNOWN_LIMITATIONS.md` rewritten for the release; `README.md` and
        `docs/features/OVERVIEW.md` keep "experimental" until the release has
        been exercised on a deployment; the triage record closes N2; R10's
        rationale adds that a fired switch now also notifies its recipients.
5.  **Reminders.** The next free migration.
    -   API: the per-switch setting, the reminders of §6 through the notifier,
        and the one at the start of a backlog window. The migration holds the
        setting and the last reminder sent.
    -   Client: the choice in the form and on each switch; the reminder card.
    -   Docs: `KNOWN_LIMITATIONS.md`, `TRUST.md` §1.

**Later, each with its own design note first:** cryptographic trustees
(§4(c)) with ahead-of-time copies; release identities in the key-transparency
log, once it takes only authenticated appends, persists in Postgres, and has a
client verifier and a witness the operator does not hold; a duress check-in,
if one is wanted, with its own threat model.

### Migration ordinals

`origin/develop` holds 001 to 102; 102 is #967's `102_deadman_backlog_grace`.
**103 is the next free ordinal.** No remote branch and no local work in
progress holds a 103 today, but parallel work may take it first, so each PR
takes the next free number when it merges.

_2026-10-26:_ #983 merged `103_voice_room_sanctions` into `develop`, so PR 2
takes ordinal 104, and PR 3 and PR 5 each take the next free number when they
merge.

### Existing switches

They stay as they are (Q4). The server never had their plaintext, so it cannot
convert them, and their owners armed them to fire. PR 3's migration marks
every existing row `legacy`: on trigger it changes status only, as today; recipients
named by account id can read the payload through the API after the trigger;
there are no notices and no reminders. PR 1 lets their owners check in and
cancel, and the panel labels them (§7). Before PR 1 ships, count them:
`SELECT status, count(*) FROM deadman_switches GROUP BY status;`.

### `deadman.write`

Mint it in PR 1, with `POST /switches` refusing every arm until PR 4 (Q2).
Every route behind it is owner-scoped; what held it back (D4) was arming
without a recipient model, and the route's own refusal now covers that. A
separate scope for check-in and cancel was considered: `CapabilityAction` is
`read` or `write` only (`packages/api/src/modules/authz.ts:22`), so it would be
a wider change for nothing the refusal does not already give.

## 9. Open questions for the operator

1.  **Who is the switch for?** _Recommended:_ both, with defaults safe for the
    whistleblower case (a notice that names nobody, reminders only if chosen,
    nothing shown to recipients before release), which cost the inheritance
    case nothing. The app never presents it as a way to publish, or as
    something a person's safety can rest on.
2.  **Mint `deadman.write` now, with arming closed (PR 1)?** _Recommended:_
    yes, and soon. With #967 merged, every armed existing switch will fire,
    and its owner cannot check in or cancel until this ships.
3.  **Must every recipient compare a safety code before they can be added?**
    _Recommended:_ yes. Without it the server can read the message from
    arming on, and the app could only say so in a sentence people skim past.
4.  **Leave existing switches as they are** — no notices, labelled, with owners
    able to check in and cancel — rather than converting or cancelling them?
    _Recommended:_ yes.

## Not verified here

-   How many switches exist in deployed stores, and whether #967 is deployed.
-   Synapse's push and email behaviour: read in the fork's code
    (`base_rules.rs`, `mailer.py`), not run. What a phone's lock screen shows
    for an `event_id_only` push is not settled anywhere in this repository.
-   The matrix-js-sdk calls: read in the installed 40.2.0 type definitions,
    not exercised.
-   That the shipped desktop and mobile builds load their bundled code: read in
    their build configuration only.
-   Browser support for WebCrypto X25519 and Ed25519 on every target: this
    relies on `deaddrop/crypto/keys.ts` and the plugin verifier, not on a test
    matrix. _(2026-10-26: MDN's data per engine is in
    `release-identities-2026-10-26.md` §1; still no device was tested.)_
-   The cryptographic composition in §4(a) is a proposal. It needs review
    against HPKE (RFC 9180) and the dead-drop suite before any code is written.
    _(Reviewed on 2026-10-26 in `release-identities-2026-10-26.md`, which
    changed steps 1, 3 and 5 and the safety code. The seal is HPKE-shaped,
    not HPKE.)_

## Sources

-   Records: `docs/security/deadman-and-feeds-triage-2026-10-12.md` (D1 to D6,
    N2), `capability-header-triage-2026-10-23.md`, `key-transparency.md`,
    `deaddrop-pq-hybrid.md`, `release-signing.md`; `KNOWN_LIMITATIONS.md`
    (dead-man section), `THREAT_MODEL.md` (§2, §4, §5, R10), `TRUST.md` (§1),
    `KNOWN_ISSUES.md` (BO-1), `docs/black-mask-chat-panel-and-account-link.md`
    (preconditions, §6, decisions), C1 in
    `docs/audits/pre-launch-readiness-audit-2026-07.md`.
-   API, under `packages/api/src/`: `modules/deadman.ts`,
    `services/deadmanScheduler.ts`, `services/deadmanSweepScheduler.ts`,
    `services/backlogTolerance.ts`, `backgroundLoops.ts`, `db/types.ts`,
    `db/store.ts`, migrations 021 and 102, `services/auth.ts`,
    `modules/authz.ts`, `middleware/auth.ts`, `routes/keyTransparency.ts`,
    `services/keyTransparency.ts`, `services/keyTransparencyStorage.ts`,
    `services/botPostingGate.ts`, `services/scheduledMessageDispatcher.ts`,
    `services/fbmMatrixBridge/deadDropDelivery.ts`,
    `integrations/matrix-client.ts`, `services/userIdentity.ts`,
    `services/accountLifecycle.ts`, `modules/governance.ts`,
    `modules/deaddrop.ts`, `services/coalitionNotifications.ts`; and
    `deploy/docker/production/docker-compose.yml`.
-   Client, under `apps/blackout-client/src/`: `app/features/deadman/`,
    `app/features/deaddrop/`, `app/features/settings/devices/Verification.tsx`,
    `platform/NotificationTokenBroker.tsx`,
    `app/features/monetization/install/pluginSignature.ts`,
    `app/features/marketplace/marketplaceEventSchemas.ts`,
    `app/core/features/featureFlags.ts`.
-   Protocol, SDK and core: `packages/blackout-protocol/src/deadman/events.ts`,
    `packages/blackout-protocol/src/deaddrop/crypto/`,
    `packages/blackout-sdk/src/deadman/`,
    `packages/blackout-sdk/src/deaddrop/actions.ts`,
    `packages/blackout-sdk/src/client/fetchClient.ts`,
    `packages/core/src/crypto/index.ts`,
    `packages/core/src/governance/index.ts`.
-   Elsewhere: `apps/deaddrop-appservice/`,
    `deploy/docker/blackout-backend/sygnal/sygnal.yaml`,
    `blackout-mobile/src/mobile-bootstrap.ts`,
    `apps/blackout-server/rust/src/push/base_rules.rs`,
    `apps/blackout-server/synapse/push/mailer.py`,
    `apps/blackout-server/blackout_runtime/module.py`, the matrix-js-sdk 40.2.0
    type definitions, `blackout-desktop/src-tauri/tauri.conf.json`,
    `blackout-mobile/capacitor.config.ts`, and the branch of #967 (merged as
    `746c1a73a6`).
