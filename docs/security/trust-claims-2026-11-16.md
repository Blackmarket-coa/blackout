# Claims that were not true: Tor and decoy traffic, the warrant canary, and the rest of the pass — 2026-11-16

A pass over what Blackout tells people about its own protections, started from
the two worst cases a survey of the repository's records turned up on
2026-11-15 and widened to the trust page, the threat model, and the strings the
app shows beside a purchase. The standing rule applies: every finding has a fix
or a written explanation, and nothing is baselined.

The rule this pass checks against is the one in `CLAUDE.md`: a claim that a
protection exists has to be true in the code, because the people who read it
may decide what to say, and to whom, on the strength of it.

## Summary

| #   | Where                                                                      | What it said                                                                     | What is so                                                                       | Outcome      |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------ |
| T1  | `TRUST.md`, the widget gallery, a marketplace listing, a tier tagline, SDK | Tor transport and decoy traffic are features of the paid tiers                   | Neither is built: no Tor, SOCKS or onion code, no cover-traffic generator        | Fixed        |
| T2  | `GET /v1/transparency/canary`, `TRUST.md`                                  | "Warrant canary is live and signed"                                              | The server wrote the statement itself on every request; it could not lapse       | Fixed        |
| T3  | The tip popover                                                            | "Sent $5.00 — they'll receive $4.85"                                             | A tip is recorded as pending; no payment is taken                                | Fixed (copy) |
| T4  | The widget gallery, the Coalition pulse widget                             | "Governance activity and shared-treasury health across your coalitions"          | The widget is static text with no data behind it                                 | Fixed (copy) |
| T5  | Settings, "What's stored about me"                                         | "The self-report below and the warrant canary are always available on your plan" | The app shows no canary anywhere                                                 | Fixed (copy) |
| T6  | The sign-in page                                                           | "Create an anonymous account (no email)"                                         | No email or name is asked; the homeserver keeps the IP addresses it is used from | Fixed (copy) |
| T7  | The composer in every encrypted room, `THREAT_MODEL.md`                    | "Not even the server can" read what is sent here; attachments are E2EE           | Files were uploaded unencrypted; only the message was encrypted                  | Part fixed   |
| T8  | A room with dead drop on: composer, indicator, settings                    | "Dead Drop: message will be queued"; "Anonymize delivery" on the Pro tier        | The message is sent at once; nothing queues or anonymizes                        | Fixed (UI)   |
| T9  | `TRUST.md`, the composer in an encrypted room                              | Private rooms are end-to-end encrypted                                           | Documents, proposals, objectives and playbooks are room state, unencrypted       | Said         |
| T10 | The room timeline, member panels, profile card, window and page            | (nothing said)                                                                   | Images were fetched from addresses other people chose                            | Fixed        |
| T11 | The composer's feature menu                                                | "Signature: enabled", "Encryption: preset", "view-once, 24h"                     | Nothing was signed or encrypted; "view-once" hid the file in this app only       | Removed      |
| T12 | The privacy tools panel                                                    | Metadata stripping and link cleaning are "always on"                             | Neither was: some uploads and formats kept metadata; links only in messages      | Fixed        |
| T13 | The welcome steps at the invite entry                                      | "An end-to-end-encrypted space"; "messages are end-to-end encrypted"             | New canopies and most new dens start public and unencrypted                      | Fixed (copy) |
| T14 | The vault panel (not mounted)                                              | "Your passphrase encrypts everything"; the server stores only ciphertext         | Labels go to the server as typed; the key needs this browser too                 | Fixed (copy) |
| T15 | Glossary; the purchase delivery notice                                     | A digital good is "delivered via an encrypted dead-drop"; "Open it in Blackout"  | It is downloaded from Library; nothing opens a dead drop                         | Fixed (copy) |
| T16 | `TRUST.md`: the bot                                                        | "No timeline-read capability at all"; a search with "no hits"                    | True of the code, not the token; the search has hits; other bots can read        | Fixed (copy) |
| T17 | `THREAT_MODEL.md` R2, `TRUST.md`, the voice UI                             | Call media E2EE "negotiated by default"; "Connected"; "Retry shortly"            | No call starts: the SDK lacks the method; a third-party page loaded unasked      | Fixed        |
| T18 | `THREAT_MODEL.md` A7, §3: devices                                          | Per-device verification (SAS/QR) and session revocation                          | No verification screen is mounted, QR is off; no one device can be ended         | Fixed (copy) |
| T19 | `THREAT_MODEL.md` §3, R4: tokens                                           | "Tokens are short-lived"                                                         | API: 24 h, refresh 30 days renewed on use; Matrix refresh: no expiry             | Fixed (copy) |
| T20 | `THREAT_MODEL.md` §3: boundaries                                           | The trust boundaries, listed                                                     | OpenStreetMap, reCAPTCHA, the FBM store and GIF hosts were missing               | Fixed (copy) |
| T21 | `THREAT_MODEL.md` A8, A11, §3, R5                                          | Signed releases, reproducible builds                                             | Signing never ran (no tag, no release); updater key is a placeholder             | Fixed (copy) |
| T22 | `THREAT_MODEL.md` §6a: plugins                                             | Bundles must carry a signature from a pinned key                                 | The only pinned key is a development secret in the client source                 | Said         |
| T23 | `THREAT_MODEL.md` §4, §5                                                   | Ballots: "Hash chain + sigs"; audit logs: "tamper-evident", "WORM"               | Ordinary rows; nothing chains, signs or write-protects them                      | Fixed (copy) |
| T24 | `docs/security/key-transparency.md`                                        | "Atomically rewritten"; witnesses on replicas; a cross-process test              | Rewritten in place; no witness setup; the test runs in one process               | Fixed (copy) |
| T25 | `docs/security/webauthn-passkeys.md`                                       | "Status: shipped"                                                                | Server only, off by default, no app calls it, no session                         | Fixed (copy) |
| T26 | `KNOWN_LIMITATIONS.md`: release signoff                                    | "The CI release gate"                                                            | No workflow runs it; its report is gitignored                                    | Fixed (copy) |

T7 was found while checking those sentences and outranks the rest: it has its
own record,
[`attachment-encryption-2026-11-16.md`](attachment-encryption-2026-11-16.md).

T8 is the room "Dead Drop" mode, which told people a message would be queued
and sent it at once. T9 and T10 came out of the independent review of T7's
fix: what an encrypted room does not encrypt, and images loaded from addresses
other people chose.

T11 to T15 are strings in the app that a first reading reported and a second
look confirmed: three composer options that said they protected a message, the
privacy tools panel's "always on", the welcome steps, the vault, and the
glossary with the purchase delivery notice. T16 onward are the documents'
own sentences, checked one by one. The trust
page's and the threat model's own sentences are being checked one by one; what
that first reading reported is listed under
[Reported, not yet checked](#reported-not-yet-checked) below.

## T1. Tor transport and decoy traffic

**Found.** `packages/blackout-protocol/src/hardening/entitlements.ts` assigns
the entitlement keys `features.hardening.torTransport` and
`features.hardening.decoyTraffic` to the pro, team and enterprise tiers.
Nothing implements either. A search of the tracked files for Tor, SOCKS,
onion routing and cover or decoy traffic finds entitlement keys, a gate,
labels and comments, and no transport code. The feature registry already said
so (`docs/features/feature_registry.json`, `privacy_hardening`: "keys + gate
only"), and so did `TRANSMUTATION_NOTES.md` §4, which on 2026-09-09 corrected
the one surface that reported Tor as _active_: the Privacy pulse widget.

That fix covered a status line. Five other places still said or implied that a
paid tier provides the two capabilities:

1. **`TRUST.md`** listed "Tor transport, decoy traffic" first among the
   privacy features that are tiered, and the policy changelog's initial record
   said the same.
2. **The widget gallery** (`homeWidgets.tsx`) described the Privacy pulse,
   beside its unlock button, as "Live status of your anonymized transport,
   decoy traffic, and hardening — a Signal-tier widget."
3. **A marketplace listing** (`ListingCard.tsx`) rendered each of a listing's
   feature keys as a bare label, so a listing that carries the key read
   "Unlocks: Tor Transport" beside a price. Listings come from the Free Black
   Market's catalog, which is not in this repository; no listing fixture here
   carries the key.
4. **The consumer tier ladder** (`consumerTiers.ts`) gave the Signal tier the
   tagline "Advanced per-person privacy: anonymized transport, persona roster,
   hardening." Nothing in this repository displays it; the module describes
   itself as the vocabulary "the marketplace and billing surfaces show to
   users".
5. **The SDK's hardening gate** (`checkHardeningEntitlements`) answered `ok` to
   an entitled caller that asked for Tor transport or decoy traffic, and told
   a free one "Anonymized transport requires the Pro tier or higher", with Pro
   as the tier to upgrade to. Nothing calls the gate with those requests
   today. A test pinned the `ok` ("allows perturbation + tor + decoy on pro").

**Fixed.**

-   The map that records which hardening capabilities exist,
    `HARDENING_CAPABILITY_IMPLEMENTED`, moves from the client to
    `@blackout/protocol`, beside the entitlement keys, with
    `isUnbuiltHardeningKey`. The client re-exports it, so the Privacy pulse
    reads the same map as before.
-   The gate refuses a request for a capability that is not built, on every
    tier, before it looks at entitlements: `tor_not_implemented`,
    `decoy_not_implemented`, a message that says the capability is planned and
    not built and that no tier provides it, and no suggested tier. The
    entitlement checks for the two stay for the change that builds them.
-   A listing's "Unlocks" line says "Tor Transport (planned, not built yet)"
    for a key whose capability is not built.
-   The gallery's description of the Privacy pulse names what the widget can
    report as on, and says the other two are planned and not built.
-   The Signal tier's tagline names persona roster, alias rotation and image
    perturbation, each of which the pro tier holds a key for and has code
    behind (`identities.ts` rotate, `PERSONA_QUOTAS`, the perturbation route).
-   `TRUST.md` lists the tiered features without the two, and says in its own
    paragraph that they are not built, that until today the page listed them,
    and what follows: the server a person uses sees the IP address they
    connect from. The policy changelog has the withdrawal as an entry
    (`docs/legal/CHANGELOG.md`, 2026-11-16).

The tiers keep the two entitlement keys. An entitlement says what a plan
grants once the capability exists; taking the keys out of the tier map is a
pricing decision (decision 2 below), and with the map above no surface in this
repository can present them as something a person has.

**Tests.** `hardeningGate.test.ts` (the gate refuses both on all four tiers,
suggests no tier, and refuses a request that mixes a built capability with an
unbuilt one; `isUnbuiltHardeningKey`), `listingCard.test.tsx` (the "Unlocks"
line), `premiumWidgetCopy.test.ts` (the gallery descriptions),
`privacyPulse.test.ts` (unchanged, still passing against the moved map).

## T2. The warrant canary

**Found.** `GET /v1/transparency/canary` built its statement inside the request
handler: "As of the generation date below, Blackout has not received any
National Security Letter, FISA court order, gag order, or other secret request
for user data that we are prohibited from disclosing…", with `periodStart` and
`periodEnd` set to the first days of the current and next month and
`generatedAt` set to now. So:

-   **It could not lapse.** A canary means something because a person has to
    keep saying it; when they cannot say it truthfully they stop, and the
    silence is the signal. This one was said by the server, to anyone who
    asked, for ever. Had an order of the kind it names arrived, the endpoint
    would have gone on denying it with that day's date.
-   **Nobody had made the statement.** No setting, file or person stood behind
    it. A deployment nobody had touched for a year affirmed it as of today.
-   **"Signed" was not true of any deployment made from this repository.** The
    signature needs `BLACKOUT_CANARY_SIGNING_KEY`. No deployment file sets it,
    and without it a production server sends the statement unsigned
    (`signatureKeySource: "unconfigured"`). `TRUST.md` said "Warrant canary is
    live and signed … Ed25519, public key travels with the response", and the
    policy changelog said "the latter Ed25519-signed".
-   **Where it was signed, the signature showed little.** The key is on the
    server, which signs as it answers, so a signature shows that the answer
    came from a holder of the key and not that a person signed anything. And
    "the public key travels with the response" is the weakness, not the
    check: whoever answers chooses the key, so it proves nothing unless the
    reader has a copy from somewhere else. None is published.

The app does not show the canary: no client code calls the endpoint. What the
app said about it is T5.

**Fixed.** The server no longer makes the statement
(`packages/api/src/services/warrantCanary.ts`). The operator issues it by
setting `BLACKOUT_CANARY_ISSUED_ON` to the day (UTC, `YYYY-MM-DD`) on which
they make it. The endpoint then answers one of:

-   `current`: the statement, "As of" the operator's date, the day it was
    issued and the last day it stands (35 days on, or
    `BLACKOUT_CANARY_VALID_DAYS`, 1 to 366);
-   `lapsed`: the same statement and dates, once that day has passed without a
    new date;
-   `not_issued`: no statement, digest or signature, where no date is set, the
    date is not a date, or it is in the future (a statement cannot be made as
    of a day that has not come).

The server never advances the date. The statement's wording is the one the
route had, with the operator's date in place of "the generation date below".
The digest and the signature cover the statement and both dates, so a signed
statement cannot be shown with a later last day. `periodStart`, `periodEnd`
and `generatedAt` are gone from the answer; `status`, `issuedOn`, `validUntil`,
`detail` (one sentence saying what the status means) and `checkedAt` are new.
No client in this repository read the old fields.

What the signature is worth is now written where it is made
(`canarySigning.ts`), in the route's comment, in `TRUST.md` and in
`KNOWN_LIMITATIONS.md` ("Warrant canary"). `packages/api/.env.example` tells
the operator what setting the date means, with the statement in full.

**What this does to a running deployment.** Its canary endpoint answers
`not_issued` from this change on, until its operator sets a date. That is the
truth of the matter: nobody had issued one.

**Tests.** `warrant-canary.integration.test.ts`, on a fixed clock: no date, no
statement, at any time; the same statement a month later (the server does not
advance it); the last day stands and the next does not, by the UTC date; the
days setting and what it refuses; dates that are not dates; a date that has
not come; the sentence for each state. `transparency-routes.integration.test.ts`,
through the route: each state, the old fields gone, the signature verifying
over the statement and its dates and failing for a later last day. Seven
mutations of `warrantCanary.ts`, each run against both files in a scratch
copy, each failing at least one test: the last day lapsing, a future date
allowed, the server dating the statement itself when none is set (the old
behaviour: fails "makes no statement of its own" in both files), a lenient
date parse, the dates left out of what is signed, a statement that never
lapses, and the days setting unbounded.

## T3. Tips: "Sent" with no payment

**Found.** The tip popover (`TipButton.tsx`) calls `POST /v1/tips` and then
shows "Sent $5.00 to Creator — they'll receive $4.85 after the 3% platform
fee." The API records the tip as `pending` and does nothing else
(`services/tips.ts`: "Money movement is delegated"); it is captured when the
Free Black Market reports a paid order for it, or an operator captures it with
the admin key, and nothing in the app starts that order
(`docs/coalitions/TASK0_AUDIT.md`: "Tips, gifts, aid pools and project support
never open the FBM checkout session — the money leg is missing today"). No
money had moved when the popover said "Sent".

The button is in the livestream viewer, behind the `streamsViewer` flag (off
by default, on under beta unlock).

**Fixed (copy).** The popover says the tip is recorded as pending, that no
payment has been taken and the recipient has not been paid, and what the
recipient receives once it is paid. It is shown in the neutral colour, not the
success one. `TipButton.test.tsx` pins the sentence and that the popover shows
it after the API answers.

**Not fixed here.** The same wrong assumption is in `RoomTipButton.tsx`, which
posts a `co.bmc.tip` message into the room when a tip is recorded: an
announcement, to everyone in the room, of a tip nobody has paid. It cannot be
reached: it sits in the room header, and the room view (`Room.tsx`,
`RoomView.tsx`, `RoomViewHeader.tsx`) is imported by nothing. It has to be put
right before that view is mounted or tips are charged, and
`KNOWN_LIMITATIONS.md` ("Tips: no payment is taken") says so. The money leg
itself is the Free Black Market checkout, outside this pass.

## T4. The Coalition pulse widget

**Found.** The gallery sells it, beside an unlock button gated on
`features.transparency.auditExport`, as "Governance activity and shared-treasury
health across your coalitions — a Coalition-tier widget." The widget
(`premiumWidgets.tsx`, `CoalitionPulseWidget`) is one paragraph of fixed text,
"…surface here. Open proposals and pending votes appear as they arrive." It
reads no proposals, votes or treasury figures, so nothing ever arrives.

**Fixed (copy).** Both texts say the widget shows no data yet and that the
summary is planned. Not a safety claim; fixed because the gallery text is what
a person sees before unlocking it.

## T5. "The warrant canary is always available on your plan"

**Found.** Settings → "What's stored about me" said "The self-report below and
the warrant canary are always available on your plan". The self-report is on
that screen. The canary is nowhere in the app.

**Fixed (copy).** The sentence now says the self-report is always available,
that the app does not show the server's warrant canary yet, and that the
server reports one only when its operator has issued it.

## T6. "Create an anonymous account (no email)"

**Found.** The sign-in page's button for the account-number sign-up. The
account is made with no email, no name and no password: the server mints an
account number and that is the whole credential. "Anonymous" says more than
that. The homeserver records the IP addresses each device connects from
(Synapse's `user_ips`; the fork keeps them 28 days unless `user_ips_max_age`
is set, `apps/blackout-server/synapse/config/server.py`, and no homeserver
template in this repository sets it), and the API's rate limiter keys on the
address, though its logs carry only a salted hash of it
(`docs/security/metadata-minimization.md`). So the operator of the server, or
whoever obtains its database, can tie the account to the address it was used
from. A person who took "anonymous" at its word and connected from home is
findable.

A first reading of this pass kept the label, on the grounds that "(no email)"
defines it and that the word is the usual one for such a sign-up. The
retention above is what changed that: the claim has to hold against the
server's own records, and it does not.

**Fixed (copy).** The button reads "Create an account without an email"
(`NO_EMAIL_SIGNUP_LABEL` in `LoginForm.tsx`). The chat panel's sign-in is the
same form, so it changes there too. The sign-up itself is unchanged.
`KNOWN_LIMITATIONS.md` and the design documents still call the route the
"anonymous sign-up"; that is a name for a code path, not something a person
is told at the moment of choosing, and it is left.

## T7. Files sent in encrypted rooms were not encrypted

**Claimed.** The composer, beside the message box of every encrypted room:
"End-to-end encrypted. Only people in this room can read these messages — not
even the server can." `THREAT_MODEL.md` §5: "Attachments: E2EE (Matrix file
encryption), AES-GCM AEAD".

**Found.** The app uploaded every attachment, voice note and hidden-message
image to the homeserver as it was, with its name and type, in encrypted rooms
too; only the message pointing to the file was encrypted. The timeline could
not open an encrypted file from any other Matrix app. The threat model's row
was wrong twice: nothing was encrypted, and the Matrix format is AES-CTR with
a separate hash, not AES-GCM.

**Done.** Fixed for files sent from now on; files already sent remain on the
server and are the operator's decision. The whole account (what was exposed
and to whom, the fix, what is not fixed, the tests, the decisions and what was
not verified) is in
[`attachment-encryption-2026-11-16.md`](attachment-encryption-2026-11-16.md).
`TRUST.md`, `THREAT_MODEL.md` §4 and §5, `KNOWN_LIMITATIONS.md` and
`docs/legal/CHANGELOG.md` now say so.

## T8. Dead drops: a message "will be queued", and was sent at once

**Claimed.** In a room whose state has dead drop switched on, three places
spoke:

-   above the message box: "Dead Drop: message will be queued", a "Delivery
    condition" selector (None, Deliver at time, Recipient online), and the
    placeholder "Message will be queued until next dead drop release…";
-   above the timeline: "Dead Drop: delivers every 60 min", "Next delivery:"
    with a countdown, and "Queue: 0";
-   in the settings panel, shown under the composer of every room: a schedule
    (interval, cron or manual), "Anonymize delivery via bot account", a queue
    size, "Flush queue" and "Clear queue", a tier banner, and two prompts:
    "Scheduled flush requires the Pro tier or higher" and "Anonymized delivery
    (cover sender) requires the Pro tier or higher".

`TRUST.md` listed "dead-drop anonymity padding and decoys" among the tiered
privacy features and said "Free dead-drops are capped at 64 KB, 24 hours, one
recipient, no decoys".

**Found.** Nothing queues, schedules or anonymizes a message.

-   The dead-drop composer was the ordinary composer under a banner. It sent
    the message to the room at once
    (`tests/unit/features/deaddrop/roomDeadDropTruth.test.tsx`, first test,
    which passed before any change). The "Delivery condition" value was read
    by nothing.
-   The room's `co.bmc.deaddrop` state is read only by this client's UI. No
    code in `packages/api/src` or `apps/deaddrop-appservice/src` reads it, and
    nothing writes the queue count the indicator showed.
-   The countdown was the interval counted from the current second
    (`new Date(Date.now() + minutes * 60_000)`), so it never reached zero.
-   The appservice has a queue (`POST /ingest`), which no client calls, and
    its flush "delivers" with `console.log` ("Replace with Matrix client
    `sendEvent` in production"). No deployment file, compose file or proxy
    config in the repository runs or routes that service.
-   The sealed dead drop (the envelope format in `@blackout/protocol`, the
    `/v1/deaddrop/send`, `/fetch` and `/open` routes of the appservice, the
    SDK's `createDeadDropActions`) exists and is tested, but no screen of the
    app sends or opens one: `createDeadDropActions`, `sendDeadDrop`,
    `encryptDeadDrop` and `decryptDeadDrop` have no caller under
    `apps/blackout-client/src`. The API's own `POST /v1/deaddrop` stores the
    `payload` string it is given, as it is.

So a person who typed under that banner believing the message was held had
already sent it, under their own name, and a person who switched on "Anonymize
delivery" or was told to upgrade for it was offered something no tier has.

**Done.**

-   The banner, the indicator and the panel now say one thing
    (`DEAD_DROP_NOT_BUILT_NOTICE`): "Dead drop is switched on in this room's
    settings, but queued and anonymized delivery are planned and not built yet.
    Messages here are delivered at once, under the sender's own name."
-   The delivery-condition selector, the schedule and countdown, the queue
    count, the form, "Flush queue", "Clear queue", the tier banner and both
    upgrade prompts are gone. The panel offers one action, for a room that has
    the state switched on: switch it off, which removes the notice. What the
    room had stored (schedule, limits) is kept.
-   The panel no longer sits under the composer of rooms that do not have dead
    drop switched on. On its own settings page it says there is nothing to
    switch on.
-   `TRUST.md`, `THREAT_MODEL.md` §5 and `KNOWN_LIMITATIONS.md` say that no
    dead drop can be sent or opened from the app.

Not changed: the entitlement keys for dead drops in the tier tables
(`packages/blackout-protocol/src/deaddrop/entitlements.ts`), the SDK gate, the
appservice and the envelope code. They are the parts of a feature that is not
finished, and none of them makes a claim to a user. Whether the tiers should
list dead-drop keys before anyone can use a dead drop is the operator's
decision, with T1's.

Also not changed, and still to check: the glossary's definition of a dead drop
("A way to hide ephemeral messages inside images that disappear after
delivery", `lib/blackoutTerminology.ts`), which describes neither this nor the
sealed envelope; and the marketplace's "dead-drop delivery" of a purchased
file, which is a third thing with the same name.

## T9. An encrypted room does not encrypt documents, proposals, objectives or playbooks

**Claimed.** `TRUST.md`: "Every private room and direct message is end-to-end
encrypted by default." The composer in an encrypted room: "not even the server
can" read what is sent there.

**Found.** Six features store what a person writes as Matrix room state: den
documents (title and text), governance proposals, objectives, playbooks,
compost records and role assignments
(`packages/blackout-sdk/src/{documents,governance,objectives,playbook,compost,roles}/matrixActions.ts`,
each a `sendStateEvent`). Matrix does not encrypt room state in any room. So in
an end-to-end encrypted den the homeserver reads all of these. The server also
sees which earlier message a reply, an edit or a reaction points to. Neither
was among the exceptions `TRUST.md` attaches to its encryption claim.

**Done.** Said, not changed. `TRUST.md` now lists what the homeserver sees in
an encrypted room, these included; the lock beside the message box names
documents and proposals; `KNOWN_LIMITATIONS.md` has the entry and what it
would take to change (send them as encrypted events, not state);
`docs/legal/CHANGELOG.md` withdraws the claim for them. Found by the
independent review of T7's fix and confirmed here by reading the six files.

## T10. Images loaded from addresses other people chose

**Claimed.** Nothing in so many words. The product's promise is that using it
does not tell third parties who you are talking to.

**Found.** An image address that someone else chose, given to the browser as
it is, makes the reader's device fetch it: the network address and the time of
every reader go to a server of that person's choosing.

-   The room timeline used each member's `avatar_url` as an image source for
    their messages and read receipts, and a video's `thumbnail_url` as its
    poster. Both are free text in a membership event or a message.
-   The member panel and the right panel passed the same raw avatar to the
    profile card.
-   A Blackout profile stores its avatar and banner as plain addresses, and
    the profile API accepts any URL for them. The profile card, the profile
    window, the profile page and the editor's preview showed them as they
    were. The marketplace producer profile takes an avatar address typed by
    hand.

Checked and sound: the forum, the members drawer and the reaction viewer
convert the address with the SDK's `mxcUrlToHttp`, which returns nothing for
an address that is not `mxc://`.

**Done.** The timeline and the two panels now load only media this homeserver
holds (`avatarThumbnailUrl` in `utils/media.ts`; `mxcToUrl` for the poster).
Tests: `tests/unit/utils/media.test.ts`, the avatar cases in
`PinToggle.test.tsx`, the thumbnail cases in
`encryptedMediaRenderers.test.tsx`.

The profile card, window and page, and the editor's preview, now go through
one rule, `profileImageSrc` in `features/profile/profileImage.ts`. An image is
loaded only when its address is an `mxc://` address, or this homeserver's own
media download or thumbnail address. The check is made on the parsed address,
so a `..` in the path, a look-alike host, a user name in front of the host,
another port or plain http does not pass, and the parsed address is what the
browser is given. The rest of the media API does not pass either: its
`preview_url` makes the homeserver fetch any address it is handed. The one
exception is the editor's `blob:` preview of a picture just picked on the
device, which reaches no network. Tests:
`tests/unit/features/profile/profileImage.test.ts` (the rule) and
`profileImages.test.tsx` (the four views, given a profile whose owner pointed
both images at a server of their own); 14 of the 20 tests in the second file
fail on the code before this change, and the 6 that pass are the cases that
should load. Sixteen mutations of the rule and its five call sites: fifteen
caught; the survivor removes a guard that the address parse already covers.

Checked and left as they are:

-   The producer profile is mounted in one place, the creator dashboard
    (`<ProducerProfile editable />`, with no user id), so it only ever shows
    producers their own avatar: the address it loads is one the viewer typed.
    A view that shows it to buyers would need the same rule.
-   The server-rendered share pages (`packages/api/src/routes/sharePreview.ts`,
    `campaignPreview.ts`) put an inviter's avatar or a coalition banner in
    `og:image`. A browser does not fetch that; link-preview services do, from
    their own servers.
-   A Discord-compatible webhook's `avatar_url` is copied into the message it
    posts as `m.blackout.origin_sender_avatar_url`. Nothing in this app reads
    that field.

How long: the avatar has been loaded this way since the profile components
were added (6a750e8b34, 2026-03-20). The device of anyone who opened a profile
whose owner had stored an outside address fetched it, and that server saw the
device's network address and the time. That cannot be undone.

What remains is how Matrix media works: a file on another Matrix server loads
through this homeserver, so that server sees the homeserver, not the reader.
It can still tell that someone here asked for the file, and when, the first
time anyone here does; after that the homeserver answers from its own copy.

A side effect worth knowing: in the timeline a member's `mxc://` avatar was
being used as an image source as it was, which no browser can load. Avatars
that never showed there will now show.

## T11. Three composer options that said they protected a message

**Claimed.** The composer's feature menu, under "Tier 3 • Advanced", offered:

-   "Signed message preset", shown while on as "Signature: enabled", and
    suggested whenever the text typed contained "sign".
-   "Encryption preset", shown while on as "Encryption: preset".
-   "Ephemeral drop", shown while on as "Ephemeral drop: on (view-once, 24h)".

**Found.**

-   The signing option signed nothing. It appended the words "— signed via
    Blackout" to the message and put `co.blackout.signature: { enabled: true }`
    in it, which nothing reads. Anyone can type those words, in any app, so a
    reader who took them as proof of who wrote a message was misled. Matrix
    already ties a message in an encrypted room to its sender's device; the
    option added nothing to that.
-   The encryption option changed nothing. It put
    `co.blackout.encryption: { preset: 'enhanced' }` in the message, which
    nothing reads. Whether a message is encrypted depends only on the room: in
    an unencrypted room the message went out readable by the server while the
    chip said "Encryption: preset".
-   The ephemeral option put an expiry policy on the attached files
    (`co.blackout.ephemeral`: 24 hours, one view). Only this app's timeline
    acts on it, by hiding the file on each device. Nothing deletes the file
    from the server, nothing redacts the message, and other apps show the file
    for good. A comment in `features/ephemeral/ephemeralPolicy.ts` said the
    sender's client redacts the message when it sees it expire; no code does.
    In this app, a file limited to one view was not shown at all, to the
    recipient or to the sender: the view is counted as the file mounts, and
    the update that follows hides it. Reproduced: the file renders once and is
    replaced, in the same update, by "Ephemeral file expired (view limit
    reached)". A file limited only by time is shown until its time.

**Done.**

-   The three options are gone from the menu, the suggestions and the chips,
    and the send path no longer adds the words, the two markers or the policy
    (`features/room/MessageComposer.tsx`).
-   Messages already sent with an expiry policy are still hidden as their
    senders asked: changing that now would show files their senders asked to
    be shown once. The notice in their place now says what hiding is: "Hidden
    by this app: the sender set this file to be shown once. Hiding it here does
    not delete it." (or "... set this file to expire."). The module's comment
    is corrected.
-   Tests: in `tests/unit/features/room/MessageComposer.test.tsx`, "options
    that said they protected a message" (the menu, the suggestions, a sent
    message, a sent file; the first two fail on the code before this change),
    and `tests/unit/features/room/ephemeralGate.test.tsx` (the gate and its
    notice; the two notice tests fail on the old text). Eleven mutations, each
    bringing back one of the claims or weakening the gate: all caught.

**Left as it is, and why.**

-   Messages already sent keep what was added to them: the words "signed via
    Blackout", the two markers, the policy. The words mean no more than any
    other words typed, and nothing reads the markers. Recorded in
    `KNOWN_LIMITATIONS.md` and `docs/legal/CHANGELOG.md`, with what someone
    who relied on them should know.
-   `sendMedia` in `plugins/matrix-adapters/hooks/useLegacyTimelineAdapter.ts`
    still accepts a policy. Nothing passes one.
-   The "Ephemeral Pro" entitlement (`ephemeral_pro`) unlocks nothing:
    `ephemeralProEntitledAtom` is read by no screen. The marketplace stub in
    this repository lists it as "Custom expiry windows (up to 30 days) and
    view caps for ephemeral file drops". A decision for the operator, below.

## T12. The privacy tools panel: "always on"

**Claimed.** "Image metadata (EXIF/GPS) stripping and link tracking-parameter
removal are now always on — they're privacy hygiene, not a toggle." Below it,
for the paid Advanced tier, "Perturb avatars against facial recognition
(Advanced, best-effort)" and "Warn when a file type can't be stripped
(Advanced)".

**Found.**

-   Metadata was removed only from JPEG, PNG and WebP pictures
    (`utils/stripImageMetadata.ts` re-encodes those three through a canvas and
    passes anything else through), and only on two paths: pictures attached
    in the message box, and avatars. A profile banner, a marketplace listing
    photo, a role icon and a welcome-screen image were uploaded as picked,
    and all four are public. A picture in any other format (HEIC, which is
    what an iPhone takes, AVIF, TIFF) went out as it was on every path, and
    so did every video. A photo or video from a phone can record where it was
    taken.
-   With the avatar pattern on, `hardenAvatarImage` sent the picture as it
    was picked, metadata included, to the Blackout API
    (`POST /v1/media/perturb`), and stripped nothing itself, on the reasoning
    that the pattern re-encodes it afterwards.
-   Tracking parameters were removed from links in the message box only.
    Forum posts and forum replies (sent through the same hook, which did not
    clean them) and wall posts (the profile wall and the home composer) kept
    `utm_*`, `fbclid` and the rest.
-   "Warn when a file type can't be stripped" was read by nothing: a paid
    option that did nothing.
-   The pattern's own code (`utils/perturbImage.ts`) and the sidecar's README
    say it "does NOT defeat state-of-the-art facial-recognition models" and
    that callers "must label it honestly". The label said "against facial
    recognition".

**Done.**

-   The banner, listing photos, role icons and welcome images are stripped
    before upload. With the avatar pattern on, the picture is stripped on the
    device first and only the cleaned copy is sent or patterned.
-   The message box names the attachments that will go out with their
    metadata (any picture the stripper did not re-encode, and any video)
    before they are sent, for everyone (`keepsMetadata` in
    `utils/stripImageMetadata.ts`).
-   The send hook cleans the links in every text message it sends, which
    covers the message box, forum posts and forum replies
    (`sanitizeMessageLinks` in `utils/sanitizeUrl.ts`), and `postWall` cleans
    wall posts.
-   The unread option is gone, with its stored setting.
-   The panel now says where each protection runs and where it does not, and
    the pattern's label says it "does not stop current face recognition".
-   Tests: `tests/unit/utils/stripImageMetadata.test.ts` (`keepsMetadata`),
    `tests/unit/features/privacy-tools/hardenAvatarImage.test.ts` (the
    service gets the cleaned copy), `uploadsRemoveMetadata.test.tsx` (the
    listing photo and the banner, and, on the parsed source, that the role
    icon and the welcome image upload what the stripper returned),
    `outgoingLinks.test.tsx` and `tests/unit/utils/sanitizeUrl.test.ts`
    (forum post, forum reply, reply, plain message, wall post),
    `PrivacyToolsSettings.test.tsx` (the wording), and, in
    `MessageComposer.test.tsx`, "attachments sent with their metadata". Each
    of the new tests that checks a fix fails on the code before it.

**Left as it is, and why.**

-   Formats the canvas cannot re-encode are still sent as they are. Making a
    HEIC or a video safe needs a decoder or a container rewriter in the
    browser; the message box says so instead.
-   Emoji and sticker images are uploaded as they are: re-encoding flattens an
    animated PNG or WebP to one frame. The panel says so.
-   The legacy `features/room/message/MessageEditor.tsx` sends edits without
    cleaning links; nothing mounts it.
-   The homeserver stores and serves an uploaded original as it arrived;
    Synapse reads EXIF only to orient thumbnails.
    `docs/oss_manifest_packaging.md` lists a server-side scrub as a backstop;
    there is none in this repository.
-   Files already uploaded keep what they carried. `KNOWN_LIMITATIONS.md` and
    `docs/legal/CHANGELOG.md` say what someone who relied on the old text
    should know.

## T13. The welcome steps: "messages are end-to-end encrypted"

**Claimed.** The steps every new person sees at the invite entry when a canopy
has none of its own (`DEFAULT_ONBOARDING_STEPS` in
`features/welcome/useWelcome.ts`): "Blackout is an end-to-end-encrypted,
community-run space" and "Type in the composer at the bottom; messages are
end-to-end encrypted."

**Found.** In the Blackout app a new canopy, a den with no canopy and a den in
a public canopy start public and not end-to-end encrypted
(`KNOWN_LIMITATIONS.md`, "New canopy and den defaults"). The den a new person
lands in can be one of those, and the steps told them otherwise.

**Done.** The first step no longer says it; the third says "The lock beside it
says whether this den is end-to-end encrypted. Not every den is." The lock is
the composer's own (`MessageComposer.tsx`), which reads the room. Test:
"the default steps" in `features/welcome/OnboardingWizard.test.tsx`, which
fails on the old text. Entry in `docs/legal/CHANGELOG.md`.

## T14. The vault: "Your passphrase encrypts everything"

**Claimed.** "Your passphrase encrypts everything in the browser. The server
only stores unreadable ciphertext — keep your passphrase safe, it cannot be
recovered." (`features/vault/VaultPanel.tsx`.)

**Found.**

-   Each secret is encrypted (AES-GCM, key from PBKDF2), but its label is sent
    to the API as typed (`createVaultItem({ label, ...ciphertext })`) and
    stored so. A label such as "Safehouse door code" is readable by the
    server.
-   The key is derived from the passphrase and a salt kept in this browser's
    storage (`getOrCreateVaultSalt`). Another browser, or this one after its
    site data is cleared, derives a different key: the passphrase alone does
    not open the vault, and the panel's error then said "Wrong passphrase".
-   No screen mounts the panel. `vault_item` purchases add slots and templates
    to it all the same.

**Done.** The panel says what is encrypted and what is not, that the vault
opens only in the browser it was made in, and that neither the passphrase nor
that value can be recovered; the label field says "Label (not encrypted)"; the
decrypt error names the other causes. Test:
`tests/unit/features/vault/VaultPanel.test.tsx`, which fails on the old text.
`KNOWN_LIMITATIONS.md` records the panel as not reachable. Encrypting labels
needs a change to what the vault API stores; it is not made here.

## T15. Dead drops in the glossary, and the purchase delivery notice

**Claimed.** The glossary (`lib/blackoutTerminology.ts`): a dead drop is "a way
to hide ephemeral messages inside images that disappear after delivery"; a
digital good is "delivered after purchase via an encrypted dead-drop". The
seller's form notes: "delivered via the encrypted dead-drop path". When the
marketplace's Matrix bridge is on (`FBM_MATRIX_BRIDGE_ENABLED`, off in the
example configuration), the bot posts "Your purchase is ready. Open it in
Blackout before it expires." in a temporary encrypted room, and the app shows
it as "Open it in Blackout before ...".

**Found.** Nothing in the app sends or opens a dead drop (T8); hiding a message
in an image is steganography, a separate feature; nothing disappears. A
purchased file is downloaded from Library, from the marketplace API
(`fetchFulfillmentAsset`), and the delivery room's notice offers no way to open
anything; its date is when the room is closed, not when the purchase ends. The
glossary entries are shown nowhere today (the only terms with a tooltip are
canopy and den), so they were claims waiting for a screen.

**Done.** The glossary says a dead drop is planned and nothing sends or opens
one, and that a digital good is downloaded from Library; the seller notes say
the same; the card and the bot's notice say "Download it from Library in the
black market" and "This delivery room closes" with the date. The stub
catalog's demo listing (used only with `FREEBLACKMARKET_STUB`) is corrected
too. Tests: `tests/unit/lib/glossaryTruth.test.ts`, the delivery card case in
`tests/unit/features/marketplace/marketplaceEventCard.test.tsx`, and the notice
in `packages/api/test/fbm-matrix-bridge.integration.test.ts`; each fails on
the old text.

## T16. `TRUST.md`: "The server bot has no timeline-read capability at all"

**Claimed.** "No bot or moderation tool can read your encrypted messages. The
server bot has no timeline-read capability at all — not restricted, absent."
In the table of things to check: "Search `packages/api/src` for `/messages`,
`/context/`, `/sync` — there are no hits".

**Found.**

-   The code holds up: every call the API makes to the homeserver's client
    API is in `packages/api/src/integrations/matrix-client.ts`, and they are
    room creation, invites, kicks, a directory lookup, `whoami`, reading room
    state and sending. None reads message events, and the bot has no
    encryption keys.
-   "Not restricted, absent" is not true of the capability. The bot's token is
    a homeserver admin token (the API calls `_synapse/admin` with it to make
    registration tokens, deactivate accounts and join users to rooms), and an
    admin token can read any room's messages through the admin API. What is
    absent is the code.
-   The search the page gives returns hits: the API's own `/messages` route,
    YouTube's chat endpoint, and four `/sync` routes that have nothing to do
    with Matrix. A reader running it could not tell the claim from its
    refutation.
-   The Docker deployment runs a second bot by default, the moderation bot
    (Draupnir), which reads the messages of the unencrypted rooms it
    protects. It cannot decrypt encrypted ones unless the operator turns on
    the Pantalaimon proxy for it (`DRAUPNIR_PANTALAIMON_USE`, `false` in the
    example configuration). The optional `integrations` profile adds six
    bridges, maubot and hookshot, which read what is sent in the rooms they
    are in, encrypted rooms included when set up for encryption.

**Done.** The paragraph says what the Blackout bot does and does not do, that
the limit is in the code and not the token, what the moderation bot reads and
when it could decrypt, and that a bridge or bot in a room can read it. The
table's row gives a search that returns what it says. `trust.html`
regenerated.

## T17. Calls: "per-call media E2EE ... negotiated by default"

**Claimed.** `THREAT_MODEL.md` R2: "Mitigated: per-call media E2EE (symmetric
for 1:1/group, broadcast sender keys for townhalls) is negotiated by default in
`CallProvider.tsx`." `TRUST.md`: "per-call media encryption is negotiated by
default ... on top of DTLS-SRTP". In the app, after joining a voice channel:
"Connected", "LIVE", and "Call provider is degraded (...). Retry shortly or
continue in widget fallback mode."

**Found.**

-   `CallProvider.tsx` starts a call with `client.matrixRTC.startRoomSession`.
    matrix-js-sdk 40.2.0, the version the app ships with, has no such method:
    its `MatrixRTCSessionManager` offers `getRoomSession(room)` and
    `getActiveRoomSession(room)`, and a session is joined with
    `joinRTCSession`. So every join takes the branch for a missing method: no
    session, no media keys. The tests that covered calls
    (`CallProvider.media.test.tsx`) gave the provider a fake client that had
    the method.
-   That branch still marked the call as joined. The voice channel showed
    "Connected" and "LIVE"; the banner said to retry, which cannot help.
-   Joining then loaded Element Call in a frame from `https://call.element.io`,
    with the room's ID in the address and the camera and microphone delegated
    to it, without saying it was another organisation's service. Element saw
    the person's network address and the room's ID.
-   The in-call indicator was honest: with no session it said "No media
    E2EE". §5 of the threat model said "TLS-only today", which contradicted
    R2.

**Done.**

-   The provider has a `sessionActive` flag, set only when a session starts.
    The voice channel says "Connected" and "LIVE" only then, and "Not
    connected" otherwise.
-   For the missing method the banner says: "Calls cannot start in this
    version of the app: the Matrix library it is built with does not have the
    call session it uses, so retrying will not help."
-   Element Call loads only when the person presses "Open Element Call", after
    "Element Call opens here as a page from call.element.io, a service run by
    Element, not by this server. Opening it sends that service your network
    address and this room's ID."
-   R2 is Open; §3 gains the boundary to call.element.io; the §5 row says no
    call has media E2EE; `TRUST.md` says the app cannot start a call itself
    today and what opening Element Call sends. `KNOWN_LIMITATIONS.md` records
    how to close it.
-   Tests: `tests/unit/features/call/callTruth.test.tsx`, which uses a real
    matrix-js-sdk client: the SDK has no `startRoomSession`; joining does not
    say "Connected" or "LIVE" and the indicator says "No media E2EE"; the
    banner; Element Call not loaded until asked, in both modes. The four that
    check a fix fail on the code before it.

## T18. Devices: "per-device verification" and "session revocation"

**Claimed.** `THREAT_MODEL.md` A7: "Partial — addressed by per-device
verification + session revocation". §3, boundary 6: "Verification (SAS/QR)
extends the boundary to a peer device."

**Found.** The emoji (SAS) dialog (`components/DeviceVerification.tsx`) is
reached only from `features/settings/devices/`, which only the old
`features/settings/Settings.tsx` renders, and nothing mounts that page: the app
mounts `SettingsPage`, which has no devices section. The component that answers
an incoming request (`ReceiveSelfDeviceVerification`) and the banner whose
button says "Verify this device" are imported by nothing, and the code says so
("This page is not mounted in the shipped app today"). QR is not enabled
(`verificationMethods: ['m.sas.v1']` in `client/initMatrix.ts`) and not built.
Signing out one chosen device is on the same unmounted page. What the app can
do is end every Blackout API session (Release keys, which says "It ends no
Matrix session") or, at a password reset, sign out every other device.

**Done.** A7 and boundary 6 say so. Mounting the devices page is a product
change; decision 7 below.

## T19. Tokens: "short-lived"

**Claimed.** `THREAT_MODEL.md` §3, boundary 4: "tokens are short-lived"; R4:
"mitigated by short token TTLs".

**Found.** The Blackout API's access token lasts 24 hours
(`services/auth.ts`) and its refresh token 30 days, renewed with each rotation
(`services/refreshToken.ts`), so it does not end while it is used; the session
length caps are off by default. On the homeserver a refreshable access token
lasts 5 minutes (the default), and neither `refresh_token_lifetime` nor
`session_lifetime` is set in any template here, so a Matrix refresh token does
not expire. The MAS template sets no lifetime; the IdP's are its own.

**Done.** Boundary 4 and R4 give the numbers.

## T20. Third parties the threat model did not name

**Claimed.** §3 of `THREAT_MODEL.md` lists the trust boundaries.

**Found.** Four origins the app loads from were not on it. The coalition map
loads tiles from `tile.openstreetmap.org` whenever it opens, unless the
operator sets `VITE_MAPLIBRE_STYLE_URL` (no deployment file here does), which
sends OpenStreetMap the viewer's network address and the area on screen. The
sign-up page loads Google's reCAPTCHA script if the homeserver asks for a
CAPTCHA (none of the templates does). A public creator page (`/@handle`)
fetches the store from `api.freeblackmarket.com` and shows its images from
wherever they are hosted. With a Giphy or Tenor key on the API (none by
default), the GIF picker shows thumbnails from the provider. The strict CSP in
`infra/nginx/snippets/security-headers.conf` would block these where it is
applied; the deployed client serves no CSP that does (`KNOWN_LIMITATIONS.md`).

**Done.** §3 gains boundaries 8 to 10. Whether to self-host tiles or ask
before loading them is decision 8.

**Follow-up (2026-11-17).** Self-hosted: the map draws its background from
the deployment's own tile server and asks no one else, and without a basemap
it says so rather than falling back (`map-tiles-and-plugin-key-2026-11-17.md`,
M). Boundary 8 now describes that.

## T21. "Signed releases" and "reproducible builds"

**Claimed.** `THREAT_MODEL.md` A8 ("signed releases"), A11 ("Yes —
addressed by signed releases + reproducible builds"), §3 boundary 5 ("Signed
(cosign) artifacts move the trust boundary"), R5 ("Sigstore-keyless cosign
signatures pinned to the release workflow identity");
`docs/security/release-signing.md` listed desktop builds among what is
signed.

**Found.** `release.yml` signs the image and the release files with cosign
when a `v*` tag is pushed. No tag exists on the remote, so it has never run,
and there is no release. Nothing makes builds reproducible. `release.yml` has
no desktop job; the desktop workflow signs only for Tauri's updater, whose
public key in `blackout-desktop/src-tauri/tauri.conf.json` is the literal
`${TAURI_UPDATER_PUBKEY}`, which Tauri does not expand. The check pinned to
the workflow identity is a script (`tools/release/verify-release.sh`) that
nothing runs.

**Done.** A8, A11, boundary 5, R5 and `release-signing.md` say so. Decision 10.

## T22. Plugin bundles: "the client refuses to install if the key id is not on its pinned keyset"

**Claimed.** `THREAT_MODEL.md` §6a: a malicious bundle is "Mitigated by
requiring an Ed25519/HMAC signature envelope ... The blackout client refuses
to install if the key id is not on its pinned keyset."

**Found.** The key id check is real, but the only key the client pins is
`fbm-dev-hmac`, an HMAC secret written in its source
(`features/monetization/install/pluginSignature.ts`: `hmac:6465762d68616d63`,
"dev-hamc"). The override reads `process.env`, which the browser build does
not define, so the literal ships. `setPluginPublishingKeys` is called only by
tests, and the API's stub marketplace signs with the same secret. The check
runs in the live app (`pluginInstaller.ts`, through the entitlement hydrator
`main.tsx` mounts). Anyone with the client can sign a bundle it will install;
what remains between such a bundle and the person is the sandbox (a
`srcdoc` iframe with a capability-gated bridge).

**Said, not fixed.** §6a now says the mitigation is not in effect. A real fix
needs the marketplace's Ed25519 publishing keyset pinned at build time and the
development key left out of production builds: decision 9.

## T23. Ballots and audit logs: "Hash chain + sigs", "tamper-evident", "WORM"

**Claimed.** `THREAT_MODEL.md` §5: governance ballots, "Tamper-evident ledger
| Hash chain + sigs"; audit logs, "WORM"; §4: "Audit logs (tamper-evident)".

**Found.** A ballot is a row in `vote_entries` (who, which vote, which choice,
weight), tallied by counting; there is no hash, previous-hash or signature
column and nothing checks one. The only audit table,
`subscription_audit_events`, is written with an upsert (`ON CONFLICT ... DO
UPDATE`), so a row with the same id is overwritten; no trigger, rule or
`REVOKE` protects it, and no deployment file configures write-once storage.
The one hash-chained, signed log in the repository is the CRDT event log in
`apps/blackout-server/blackout_runtime/runtime.py`, used only by its tests.

**Done.** §4 and §5 say what the rows are.

## T24. Key transparency: "atomically rewritten", witnesses on replicas, a cross-process test

**Found.** `JsonFileKtStorage` writes over the file itself (`writeFileSync`,
no temporary file and rename); an empty file loads as an empty log. Each API
process keeps its own log and its own witness, built from its environment;
no deployment file sets a witness seed or a log file, and nothing gossips tree
heads. The test called cross-process opens two storages one after the other in
one process, and the file holds 26 tests, not 27.

**Done.** `docs/security/key-transparency.md` and R5 say so.

## T25. Passkeys: "Status: shipped"

**Found.** The API's WebAuthn endpoints exist and verify, but answer only with
`WEBAUTHN_ENABLED=1`, which no deployment file sets; no app calls them; sign-in
starts no session; credentials are kept in memory.

**Done.** The status line of `docs/security/webauthn-passkeys.md` says so.

## T26. "The CI release gate"

**Found.** No workflow runs `tools/ci/check-blackout-client-release-gate.mjs`,
directly or through `ci:parity`, and the report it reads is listed in
`.gitignore`. The staging-signoff runbook said "the release-gate CI job will
rerun the gate".

**Done.** `KNOWN_LIMITATIONS.md` and the runbook say it is run by hand.

## What this record does not cover

The first reading of `TRUST.md`, `THREAT_MODEL.md` and the two security
documents reported the items above, and each is now a finding. The sentences it
did not report were read once, not checked one by one.

## Decisions for the operator to confirm or veto

1. **How a canary is issued.** Built: a date the operator sets
   (`BLACKOUT_CANARY_ISSUED_ON`), a statement that stands 35 days by default,
   wording fixed in the code. It is the least that makes the statement a
   person's act and lets it lapse. Alternatives: a statement file signed
   offline with a key that never touches the server, and a published public
   key, which is what would make the signature mean what a reader expects; a
   different default period; the operator's own wording (counsel has not
   reviewed this one). Until one is issued the endpoint answers `not_issued`.
2. **Whether paid tiers keep the Tor and decoy-traffic keys.** Kept. Removing
   them from `HARDENING_TIER_ENTITLEMENTS` would stop a tier from "granting"
   what does not exist, and would change what the tier map says a plan
   includes, which is a pricing statement. The Free Black Market's catalog and
   listings, where a tier is described to buyers, are outside this repository
   and should be read against T1.
3. **Publishing the canary's public key** somewhere other than the answer (the
   repository, the trust page), if a signing key is configured. Not done: no
   key is configured in any deployment file here.
4. **The label of the account-number sign-up** (T6): changed to "Create an
   account without an email". It is one constant if the operator prefers
   another wording; what it should not do is promise anonymity while the
   homeserver keeps the addresses. Shortening or switching off that retention
   (`user_ips_max_age` in the homeserver configuration) is the operator's
   setting and is not changed here.
5. **What "Ephemeral Pro" sells** (T11). The entitlement unlocks nothing, and
   since T11 the composer offers no expiring files at all. The listing in this
   repository's marketplace stub promises custom expiry windows and view caps;
   the Free Black Market's real listing is outside this repository and should
   be read against T11. As with the tier keys in decision 2, removing it is a
   pricing statement and is left to the operator.
6. **Whether to build any of T11's three for real.** A signature that means
   something needs a key per person and a published way to check it; an
   expiring file needs, at the least, the sender's app to redact the message
   when it expires, and wording that says other apps and saved copies are
   beyond its reach. Neither is started here.
7. **Mounting device verification and the devices list** (T18). The emoji
   verification dialog and a devices page with per-device sign-out exist but
   are not mounted; mounting them, and enabling QR, is a product change.
8. **Map tiles** (T20). Set `VITE_MAPLIBRE_STYLE_URL` to tiles the operator
   hosts, or add a step that asks before the map loads OpenStreetMap's.
   Taken 2026-11-17: the tiles are self-hosted
   (`map-tiles-and-plugin-key-2026-11-17.md`, M).
9. **A plugin publishing keyset** (T22). Pin the marketplace's Ed25519
   publishing keys at build time and leave the development HMAC key out of
   production builds. Until then a bundle's signature is not a protection.
10. **The first signed release** (T21). Set a real updater public key, then
    push a `v*` tag so `release.yml` signs something; until then nothing
    downloadable is signed.

## Not verified

-   **Production.** Whether any deployment sets `BLACKOUT_CANARY_SIGNING_KEY`,
    and what the hosted instance's canary endpoint has been answering. The
    statements about deployments are about the files in this repository.
-   **The Free Black Market's catalog**: what its listings and tier pages say
    about Tor transport and decoy traffic.
-   **A browser.** The copy changes were checked in unit tests (jsdom), not in
    a running app.
