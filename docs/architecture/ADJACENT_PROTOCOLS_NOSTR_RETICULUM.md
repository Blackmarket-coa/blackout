# Nostr and Reticulum beside Matrix: a proposal, checked

Status: Proposed. Nothing here is built, scheduled or enabled, and this
document makes no claim that any of it works.
Checked: 2026-11-16, against `develop` at `4e46da0cf7`, the live deployment, and
the protocols' own documents.

A proposal of 2026-11-16 names two gaps Matrix leaves and a protocol for each:
**Nostr** for public posts and an identity a creator owns, and **Reticulum**
for communication when there is no internet. Its advice is to do neither yet,
then Nostr first as a thin outbound layer, and Reticulum later as a hardware
project, with Matrix staying the backbone.

This document checks that proposal and records what the plan takes from it.
The short version: the advice holds, both ideas fit work this repository has
already planned, and each needs gates the proposal does not mention.

## 1. What the proposal says to fix first, checked

All three are real.

| Named                                        | Found                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BO-1, the key-backup `DecryptionError`       | Open ([`KNOWN_ISSUES.md`](../../KNOWN_ISSUES.md)). The cause is known since 2026-11-08: a new device has no way to restore or receive keys. The restore path is not built.                                                                                                                                                                                                                                                                  |
| "Broken federation delegation" on the domain | Confirmed on the live site. `https://theblackout.app/.well-known/matrix/server` and `/.well-known/matrix/client` answer `200` with an HTML "Coming Soon" page: the apex domain is a placeholder site that answers every path that way. The configuration in this repository would serve both documents (`infra/single-server-baseline/nginx/sites-available/theblackout.app.conf`), so the apex does not point at it. Details in section 5. |
| "Dead deploy triggers"                       | Confirmed. `deploy-web.yml` and `deploy-compose-prod.yml` run on a push to `main`. There is no `main` branch, and neither workflow has ever run. `docker.yml` runs on `main`, on a `v*` tag or by hand, and no tag exists. Production is deployed by `deploy.sh` on the host ([runbook](../../infra/single-server-baseline/RUNBOOK.md)).                                                                                                    |

One refinement. BO-1 gates anything that routes trust through Blackout, by
this repository's own rule
([`TRANSMUTATION_NOTES.md`](../../TRANSMUTATION_NOTES.md) §5). It does not gate
moving public text between public platforms, which is why coalition
cross-posting is sequenced outside it
([`ECOSYSTEM_WIRING.md`](../coalitions/ECOSYSTEM_WIRING.md), "External sync
sequencing"). So BO-1 stands in front of the Reticulum idea wherever it carries
anything private, and not in front of a public-post adapter for Nostr. The
other two items stand in front of both.

## 2. What the repository already has

The proposal treats both as new. Neither starts from nothing.

-   **Cross-posting exists.** Coalitions post out to Discord, Bluesky and
    Mastodon through adapters
    (`packages/api/src/services/coalitionPlatformAdapters.ts`), and replies and
    counts come back from Bluesky and Mastodon into a moderation queue
    (`coalitionInboundSync.ts`). Around them: a per-platform policy record
    (`COALITION_PLATFORM_POLICY`: terms, automation basis, rate limit), three
    flags that are off by default, opt-in per campaign, platform and member,
    retention windows, a threat-model entry for hostile external repliers
    (A12), a residual risk recorded for credentials the server can decrypt (R8), and a
    policy-changelog entry (2026-09-20). A Nostr adapter is one more platform
    in that frame, not a new subsystem.
-   **An offline relay is already proposed.**
    [`MESH_LORA_RELAY_ARCHITECTURE.md`](MESH_LORA_RELAY_ARCHITECTURE.md)
    (2026-04-09) plans a store-and-forward mesh with LoRa hops in four phases,
    and its first roadmap step is to design a message envelope, routing and key
    lifecycle from scratch. The mesh module ships store-and-forward primitives
    and a server relay node (`/v1/mesh/enqueue`, `/sync`, `/inbox`) with no
    radio behind them. The OSS manifest lists a Meshtastic bridge as a
    GPLv3 library ([`oss_manifest_packaging.md`](../oss_manifest_packaging.md),
    G6). The field-operations plan's Phase 7 asks for "compact LoRa status
    packets" and says the architecture "remains proposed until demonstrated"
    ([build plan](../COALITION_FIELD_OPERATIONS_BUILD_PLAN.md)).
-   **Tips are not paid yet.** A tip is recorded as pending and no checkout is
    opened anywhere
    ([`trust-claims-2026-11-16.md`](../security/trust-claims-2026-11-16.md),
    T3). Money in this ecosystem moves through the Free Black Market at a
    commission of 3% at most, on Stripe and Stellar
    ([`ECOSYSTEM_WIRING.md`](../coalitions/ECOSYSTEM_WIRING.md), "The money
    invariant").

## 3. Nostr: what the plan takes

**Taken: an outbound adapter for public posts, in the existing cross-post
frame.** Town Square posts, creator posts, coalition campaign posts and links
to Coliseum clips, each published only when the person chooses it for that
post. It goes behind the existing cross-post flags and the same opt-ins, with
its own entry in the platform policy record.

**Taken, later: handles of the form `name@theblackout.app`** (NIP-05). They
are served from `/.well-known/nostr.json` on the apex domain, with
`Access-Control-Allow-Origin: *` and no redirects. That is the same path family
the apex fails to serve for Matrix today (section 1), so the handle waits on
that fix and costs little after it.

**Not taken now: zaps.** Three reasons.

1. A zap is a Lightning payment from the sender's wallet to the recipient's, or to the wallet service the recipient uses.
   It does not pass through the Free Black Market, so it carries no commission
   and reaches no ledger there. That is a second payment rail beside Stripe and
   Stellar, and whether to have one is a decision for the operator and the
   Free Black Market, with counsel: if Blackout ran the service that issues
   the invoices it would be holding or routing other people's money.
2. Tips have no money leg at all yet. Adding a rail before the first one works
   multiplies what is unfinished.
3. The rule that the split a person is shown is the split that is charged has
   no meaning for a payment Blackout never sees.

What could come without a new rail: showing zap counts on a cross-posted item
as public engagement, the way reply counts are shown now, or a link to a
Lightning address the creator supplies, with Blackout holding nothing.

**Kept on Matrix:** private chat, governance, and anything that makes a
confidentiality claim. Nostr's direct messages and groups are not used.

### Rules the proposal does not state

1. **Blackout never holds a person's Nostr private key.** Nostr has no ratified way to rotate or revoke a key (section 8), so a leaked key is the permanent loss of that identity. The cross-post adapters keep each
   platform's credential where the server can decrypt it (R8), which is
   tolerable for an app password that its owner can revoke and is not for
   this. Signing happens on the person's device or in a signer they run
   (NIP-07, NIP-46). For a coalition's shared account the choice is a remote
   signer or an explicit acceptance of R8 for a key made for that purpose
   alone.
2. **A post published to Nostr cannot be recalled, and the app has to say so
   before the person publishes.** Deletion is a request relays may ignore, and
   copies stay on relays nobody here controls. Deleting a Blackout account
   does not remove them. This is the opposite of what the app promises for its
   own data, so the difference has to be stated where the choice is made.
3. **A handle is a public link between two identities.** `nostr.json` tells
   anyone that this Blackout name and this Nostr key are the same person. It
   is opt-in per account and never set for a persona unless its owner asks:
   personas exist to keep identities apart.
4. **Replies coming back are untrusted.** If replies or counts are read back
   from relays, they go through the existing quarantine and moderation, as
   Bluesky's and Mastodon's do (A12). Outbound comes first.
5. **A new platform is a policy change.** Text leaving for a network it cannot
   be recalled from is a new way for data to leave, so the adapter lands with
   an entry in [`docs/legal/CHANGELOG.md`](../legal/CHANGELOG.md), a
   threat-model row and its policy record in the same change
   ([process](../legal/policy-change-process.md)).

**Challenge Links.** A Challenge Link is already a URL meant to be shared
(`/coliseum/c/<token>`), and only the signed-in person challenged can act on
it. Posting one to Nostr is the same as pasting it anywhere. One item should be
settled first: `GET /v1/coliseum/matches/:id/link` returns the token to callers
who are not signed in, and whether that is intended for every match is part of
the open per-object authorization review
([`api-findings-triage-2026-10-25.md`](../security/api-findings-triage-2026-10-25.md)).

## 4. Reticulum: what the plan takes

**Taken: a candidate for the transport of the mesh plan's Phases 2 and 3**, in
place of designing routing and link encryption from scratch, and so a way to
deliver the field-operations plan's "compact LoRa status packets". Reticulum
already provides addressing by key, encrypted links, routing over LoRa and
other slow links, and store-and-forward messaging (LXMF). What stays ours on
top of it: group membership, revoking a captured device, and the coalition's
own records.

**Scope: check-ins, status, short text and coarse places. No media.** The
bandwidth allows nothing else, and the mesh plan already rules media out.

**Where the data lands: in coalition records through the API** (the status
board, check-ins, map pins), which the server already holds in readable form.
Not in encrypted rooms: a bridge that writes into an encrypted Matrix room is a
device holding that room's keys, which would change what the trust page says
the Blackout bot can read ([`TRUST.md`](../../TRUST.md) §1).

### Gates the proposal does not state

1. **The licence.** The reference implementation is not under an open-source
   licence. Its `LICENSE` (read 2026-11-16 from the project's repository) is
   MIT's text with two added conditions: the software "shall not be used in any
   kind of system which includes amongst its functions the ability to
   purposefully do harm to human beings", and shall not be used to create a
   training dataset for a machine-learning model. As we read them, conditions on use are further restrictions of the kind the GPL and AGPL do not allow on a combined work, so that code cannot be linked into or shipped as part of this repository's code. It could at most run as
   a separate program an operator installs, and counsel should read the first
   condition against a field-operations tool before anything depends on it.
   The alternatives: an independent implementation of the protocol under a
   compatible licence (a community talk in 2026 names a Rust one under MIT and
   an AGPL fork; neither claim was checked here); Meshtastic, which the
   manifest already lists (GPLv3, to be isolated as that manifest's §4
   requires); or the repository's own store-and-forward primitives over a
   plain LoRa link. The choice is by licence, link encryption, the hardware
   people can buy, how much there is to operate, and how alive the project is.
2. **Radio law.** LoRa on the licence-free bands is limited in power and
   airtime, differently per region (the mesh plan's §8.3). "Packet radio" on
   amateur bands is a different matter: many jurisdictions restrict encrypted
   transmission there, and Reticulum's own documents say so. The plan is
   licence-free LoRa only, unless licensed operators run an unencrypted mode
   for traffic that is public anyway.
3. **A transmitter can be found.** Anyone with a receiver can locate a radio
   that transmits. For people who may be at physical risk that belongs in the
   threat model and in what the app tells them before they key up, and it
   argues for fixed nodes at known public places over radios people carry.
4. **Not a tracker.** The proposal calls this a "blue force tracker". The
   field-operations plan's defaults are the opposite: no stored history of
   members' positions, no live tracking in groups anyone can join, and
   "prefer useful coordination without tracking people". What the radio
   carries is a check-in a person sends, not a position the system collects.
   Live location stays behind that plan's own gates.
5. **Hardware has an owner.** Nodes at drop points are equipment someone
   buys, places, powers and maintains. Nothing in this repository describes
   the vending units the proposal mentions; that side belongs to the Free
   Black Market and Blackstar. A pilot is a hardware project with a named
   owner and a place, not a feature flag.

**Sequencing.** After the field-operations plan's Phase 0 (its audit of
scoping and access control comes first for any new field data) and its MVP,
and after BO-1 for anything private.

## 5. The live checks, as observed

Made once, on 2026-11-16, from one network.

-   `https://theblackout.app/` and every path under it tried
    (`/.well-known/matrix/server`, `/.well-known/matrix/client`,
    `/.well-known/nostr.json`, `/trust`) answer `200`, `text/html`, a "Coming
    Soon" page from a website builder.
-   `https://matrix.theblackout.app/.well-known/matrix/server` answers
    `{"m.server":"matrix.theblackout.app:443"}`, and
    `https://chat.theblackout.app/.well-known/matrix/client` answers with the
    homeserver's address. Neither helps: both documents are looked up on the
    server name, which is `theblackout.app`.
-   The homeserver is up: `matrix.theblackout.app` answers the federation
    version and key endpoints, with `server_name` `theblackout.app`.
-   The app answers at `chat.theblackout.app`, the trust page at
    `chat.theblackout.app/trust` (the generator names
    `https://theblackout.app/trust` as its address), and the API at
    `api.theblackout.app`.

What follows from the first point: another homeserver that looks up
`theblackout.app` gets HTML where it expects JSON, so it cannot find the
homeserver unless a DNS SRV record or port 8448 on the apex says where it is
(neither was checked); a Matrix client given `theblackout.app` cannot discover
the homeserver either; and no `name@theblackout.app` handle can be served.
`KNOWN_LIMITATIONS.md` ("The apex domain answers with a placeholder") records
it.

## 6. Order

Ahead of both, and already on the list: the BO-1 restore path; the apex
serving its `.well-known` documents; a deploy path that runs.

1. **Nostr outbound for public posts.** Small, and inside a frame that exists.
   Needs: signing on the person's side (rule 1), the publish warning (rule 2),
   the policy record, changelog entry and threat-model row (rule 5).
2. **`name@theblackout.app` handles.** Needs the apex fix, and rule 3.
3. **Reticulum or another radio transport.** A decision first (gate 1), then a
   pilot with an owner (gate 5), after the field-operations MVP.

Not adopted: zaps as a payment rail; Nostr direct messages or groups; a bridge
from radio into encrypted rooms; live tracking.

## 7. Decisions for the operator

1. **The apex domain.** Point `theblackout.app` at the proxy that serves the
   `.well-known` documents (and move the placeholder page behind it or to
   another name), or decide that this deployment does not federate and say so.
2. **Deploys.** Retarget the deploy workflows to `develop`, or remove them and
   let the runbook's `deploy.sh` be the only path.
3. **Lightning as a rail**, with the Free Black Market and counsel. Until then
   zaps are out.
4. **Who signs for a coalition's shared Nostr account** (a remote signer, or a
   server-held key under R8).
5. **The radio transport**: Reticulum under its licence as a separate program,
   an independent implementation, Meshtastic, or our own primitives.
6. **Whether a persona may ever have a public handle.**

## 8. Not verified

-   What the 2026 community talk says about Reticulum's maintenance and its
    other implementations; only the licence text was read at the source.
-   Whether a merged Nostr proposal for key rotation exists that clients
    honour. Searches on 2026-11-16 found proposals and no ratified mechanism.
-   The legal questions (radio rules per jurisdiction, what running a Lightning
    service makes Blackout, the licence's first condition). They are counsel's.
-   DNS records for the apex, and port 8448.

## Sources

-   Reticulum licence:
    <https://raw.githubusercontent.com/markqvist/Reticulum/master/LICENSE>
-   NIP-05 (handles): <https://github.com/nostr-protocol/nips/blob/master/05.md>
-   NIP-57 (zaps): <https://github.com/nostr-protocol/nips/blob/master/57.md>
-   Reticulum on encryption and amateur radio:
    <https://github.com/markqvist/Reticulum>
