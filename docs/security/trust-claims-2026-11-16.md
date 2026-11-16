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
| T10 | The room timeline, member panels, profile card                             | (nothing said)                                                                   | Images were fetched from addresses other people chose                            | Part fixed   |

T7 was found while checking those sentences and outranks the rest: it has its
own record,
[`attachment-encryption-2026-11-16.md`](attachment-encryption-2026-11-16.md).

T8 is the room "Dead Drop" mode, which told people a message would be queued
and sent it at once. T9 and T10 came out of the independent review of T7's
fix: what an encrypted room does not encrypt, and images loaded from addresses
other people chose.

Findings T11 onward are the trust page's and the threat model's own sentences,
checked one by one; they are in [the documents](#t11-onward-the-documents)
below.

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
    the profile card and page show them as they are. The marketplace producer
    profile takes an avatar address typed by hand.

Checked and sound: the forum, the members drawer and the reaction viewer
convert the address with the SDK's `mxcUrlToHttp`, which returns nothing for
an address that is not `mxc://`.

**Done.** The timeline and the two panels now load only media this homeserver
holds (`avatarThumbnailUrl` in `utils/media.ts`; `mxcToUrl` for the poster).
Tests: `tests/unit/utils/media.test.ts`, the avatar cases in
`PinToggle.test.tsx`, the thumbnail cases in
`encryptedMediaRenderers.test.tsx`. **Open:** the profile card and page and
the producer profile. The rule to apply there is the same: show an image only
when its address is media on this homeserver. Recorded in
`KNOWN_LIMITATIONS.md`.

A side effect worth knowing: in the timeline a member's `mxc://` avatar was
being used as an image source as it was, which no browser can load. Avatars
that never showed there will now show.

## T11 onward: the documents

Not in this commit. The sentences of `TRUST.md` (beyond the paragraphs T1, T2,
T7, T8 and T9 change), of `THREAT_MODEL.md`, of
`docs/security/key-transparency.md` and `docs/security/webauthn-passkeys.md`,
and the "CI release gate" sentence of `KNOWN_LIMITATIONS.md` are being checked
against the code one by one. Each finding is added here, with its fix or its
explanation, in a commit that follows on the same branch. Until then this
record covers T1 to T10 only.

A first reading of those documents against the code reported the following.
Each is a report, not yet a finding: none has been checked by a second look or
a test, and each will be confirmed or dropped here, with its evidence.

Threat model:

-   Device verification and remote sign-out (A7, §3.6): no verification screen
    is mounted; QR verification is not enabled.
-   Call media (A4, R2 "Mitigated", and `TRUST.md` on calls): the call session
    method the app calls is absent from the SDK version in use, so no call
    starts; a third-party call page is framed instead. §5 says "TLS-only
    today" and R2 says "Mitigated": the document contradicts itself.
-   Governance ballots ("hash chain + sigs") and audit logs ("tamper-evident",
    "WORM"): stored as ordinary rows.
-   Signed releases and reproducible builds (A11): no tags or releases exist,
    and the desktop updater's public key is a placeholder.
-   Plugin signatures (§6): the signing secret is in the client source.
-   "Short-lived" tokens: 24 hours, refresh 30 days.
-   Third parties missing from §3: a CAPTCHA provider on registration, map
    tiles on the coalition map, the framed call page.

Other documents:

-   `docs/security/key-transparency.md`: "atomically rewritten", witnesses on
    replicas, a cross-process test.
-   `docs/security/webauthn-passkeys.md`: "Status: shipped".
-   `KNOWN_LIMITATIONS.md`, "Release signoff": no workflow runs the release
    gate it describes.
-   `TRUST.md`: "no timeline-read capability" for the bot, and the search it
    tells a reader to run.

Strings in the app:

-   The composer's "Signature: enabled" (adds the words "signed via Blackout",
    signs nothing), "Encryption: preset" (a marker that changes nothing) and
    "Ephemeral drop: view-once, 24h" (kept only by this app, per device; the
    review of T7's fix also reports that the media under it is never shown,
    because the gate counts the view as it mounts and hides it at once).
-   The welcome steps' "messages are end-to-end encrypted", said of every den.
-   The vault's "encrypts everything", the privacy tools' "always on".
-   The glossary's definitions of a dead drop and of a digital good's
    delivery.

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

## Not verified

-   **Production.** Whether any deployment sets `BLACKOUT_CANARY_SIGNING_KEY`,
    and what the hosted instance's canary endpoint has been answering. The
    statements about deployments are about the files in this repository.
-   **The Free Black Market's catalog**: what its listings and tier pages say
    about Tor transport and decoy traffic.
-   **A browser.** The copy changes were checked in unit tests (jsdom), not in
    a running app.
