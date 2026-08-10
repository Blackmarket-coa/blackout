# Trust

What Blackout promises, and how to check each promise yourself without taking
our word for it.

Every claim below links to the code that makes it true. If a link ever stops
supporting the claim next to it, the claim is wrong and we want to know — see
[SECURITY.md](SECURITY.md).

Last reviewed: **2026-08-10**. Changes to anything here are recorded in the
[policy changelog](docs/legal/CHANGELOG.md).

---

## 1. Encryption, never behind a paywall

**End-to-end encryption is free, on every tier, and there is no mechanism by
which it could be sold.**

That last part is the one worth checking. Paid features in Blackout are gated by
`features.*` entitlement keys, and the complete catalogue of them is the seven
tier tables unioned in
[`entitlements/bundles.ts`](packages/blackout-protocol/src/entitlements/bundles.ts).
**None of them contains an encryption key.** Not "encryption is set to free" —
there is no switch. Turning encryption into a paid feature would require adding
one, in a diff, in public.

**Every private room and direct message is end-to-end encrypted by default.**

-   The API cannot create a room without deciding: `createRoom` takes a
    **required** `encrypted` flag
    ([`matrix-client.ts`](packages/api/src/integrations/matrix-client.ts)), so the
    compiler rejects a new call site that stays silent.
-   The clients set encryption at room creation, not afterwards
    ([`matrix-crypto.ts`](apps/blackout-client/src/app/utils/matrix-crypto.ts)).
-   The homeserver backstops it with
    `encryption_enabled_by_default_for_room_type: invite`.
-   CI fails the build if any of that regresses:
    [`check-room-encryption.mjs`](tools/ci/check-room-encryption.mjs).

This was **not** true before 2026-08-10. Thirteen server paths and five client
paths created plaintext rooms, and the homeserver was not compensating. We found
it by auditing our own claim before publishing it, and the full write-up —
including what was broken and for how long — is public:
[2026-08-10 encryption audit](docs/audits/2026-08-10-encryption-audit.md).

**No bot or moderation tool can read your encrypted messages.** The server bot
has no timeline-read capability at all — not restricted, absent. It can create
rooms, invite, and moderate membership; it has no code path that fetches message
events.

**Nothing logs your messages.** No log line, error report, or analytics event
carries message content. There is no PostHog, no Segment, no session replay in
the product. The redactor treats content-shaped fields as secrets
([`patterns.ts`](packages/core/src/redaction/patterns.ts)) so this holds even if
someone later adds a well-meaning debug line.

### What is _not_ encrypted, named plainly

Encryption claims are only worth something with the exceptions attached.

-   **Publicly joinable rooms.** Encrypting a room anyone can join hides history
    from everyone who joins later and breaks search, without making public content
    private.
-   **Service rooms the Blackout bot posts into** — marketplace vendor, order,
    inventory and ledger rooms, `#bugs`, and the standing public rooms. The bot is
    a plain HTTP client with no Megolm implementation: it _cannot_ post into an
    encrypted room. Encrypting these would not make them private, it would break
    them. Giving the bot real crypto is on the roadmap; until it lands, this list
    stands and stays here.
-   **Spaces**, which hold hierarchy state and never messages.
-   **Calls and townhall media** use a _different_ mechanism from messages:
    per-call media encryption is negotiated by default
    ([`CallProvider.tsx`](apps/blackout-client/src/app/features/call/CallProvider.tsx)),
    on top of DTLS-SRTP, and the live status is shown in-call. It depends on the
    operator running a matrixRTC-capable SDK, so treat the in-call indicator as
    authoritative rather than assuming parity with message encryption. Background
    in [THREAT_MODEL.md](THREAT_MODEL.md) §7.

### The distinction we will not blur

**"E2EE is never paywalled" is true. "Privacy is never paywalled" is not, and we
do not say it.**

Privacy-enhancing features beyond encryption _are_ tiered: Tor transport, decoy
traffic, image perturbation, persona compartments and rotation, dead-drop
anonymity padding and decoys, mesh transport, active defense. Free dead-drops are
capped at 64 KB, 24 hours, one recipient, no decoys. The confidentiality of your
messages is free; some of the tools for hiding _that you are communicating at
all_ are not.

### Open, not hidden

Some users see "unable to decrypt" on older messages when signing in on a new
device without key backup set up. This is tracked as **BO-1** in
[KNOWN_ISSUES.md](KNOWN_ISSUES.md) and is **not fixed**. We list it here rather
than waiting until it is, because a trust page that only mentions solved problems
is advertising.

---

## 2. Your data, portable, free

**Every user can download everything the server holds about them, on any tier,
in one click.**

In the app: **Settings → Privacy & data → Download your data**. Or over HTTP:

```bash
curl -H "Authorization: Bearer $TOKEN" https://api.theblackout.app/v1/data-export
```

No support ticket, no queue, no tier check. Code:
[`routes/dataExport.ts`](packages/api/src/routes/dataExport.ts) ·
[usage doc](docs/features/data-export.md).

This did not exist before 2026-08-10 either. The only export we had returned
**HTTP 402** below the Coalition tier, which means most users had no way to get
their own data. We are not going to describe having fixed that as though it were
always true.

**Your encrypted messages are not in that file — and that is the encryption
guarantee working.** The server holds ciphertext and no keys, so it cannot put
your messages in a file it generates. If a server-side export _did_ contain your
message history, section 1 of this page would be false. Export encrypted history
from a signed-in client, which has your keys.

**What we deliberately leave out:** credentials (password hash, integration OAuth
tokens, vault keys — a portability feature must not become a credential dump),
and other people's data. Connections _you_ made are exported in full; inbound
ones — your followers, who redeemed your invites — are counted, not listed.
Handing you a list of everyone who follows you would export their associations
under the banner of your portability.

**A gap we disclose in the file itself:** follows and profiles are held in server
process memory today and reset when the API restarts, so an empty result there
may mean the server forgot rather than that you have no connections. Every
section of the export carries a `durability` marker saying which it is.

---

## 3. Governance you can audit

**Every change to what we promise is recorded, dated, and visible as a diff.**

-   [Policy changelog](docs/legal/CHANGELOG.md) — every privacy and monetization
    commitment, with effective dates. `git log -p docs/legal/CHANGELOG.md` is the
    audit trail.
-   [How commitments change](docs/legal/policy-change-process.md) — the rule is
    that a policy change and its changelog entry land in the same pull request.

**Enforcement is social, and we would rather say so than imply otherwise.**
Nothing in CI can tell that a diff weakens a promise. What exists is real but
narrow: `docs/legal/**`, this file, and the encryption guard are owned in
[CODEOWNERS](.github/CODEOWNERS) so changes need maintainer review, and
`guard:room-encryption` mechanically protects the one commitment most likely to
erode. A determined maintainer could still change a promise without touching the
changelog. The protection is that the discrepancy would be _discoverable_, because
every claim on this page points at the code behind it.

**Not yet built, and not dated:** a cooperative charter — member governance,
formal decision rights over policy changes, legal structure. At current scale it
would be documentation of a process nobody follows. It is on the roadmap and
listed here so the roadmap is part of what you are judging, not a surprise later.

**Also honest about status:** the [Privacy Policy](docs/legal/privacy-policy.md)
and [Terms of Service](docs/legal/terms-of-service.md) in this repository are
**drafts pending counsel review**, with unfilled placeholders. They are not in
effect, and neither this page nor the policy changelog is a substitute for them.
The commitments above are engineering and product commitments backed by code you
can read.

---

## Verify it yourself

| Claim                             | Check                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| E2EE is not paywalled             | [`bundles.ts`](packages/blackout-protocol/src/entitlements/bundles.ts) — grep it for an encryption key        |
| Private rooms encrypt by default  | [`check-room-encryption.mjs`](tools/ci/check-room-encryption.mjs), run `pnpm guard:room-encryption`           |
| The bot cannot read messages      | Search `packages/api/src` for `/messages`, `/context/`, `/sync` — there are no hits                           |
| Nothing logs message content      | [`patterns.ts`](packages/core/src/redaction/patterns.ts)                                                      |
| Export is free                    | `curl` the endpoint on a free account, or read [`dataExport.ts`](packages/api/src/routes/dataExport.ts)       |
| Warrant canary is live and signed | `GET /v1/transparency/canary` — Ed25519, public key travels with the response                                 |
| Commitments are versioned         | [`docs/legal/CHANGELOG.md`](docs/legal/CHANGELOG.md)                                                          |
| We publish our own failures       | [2026-08-10 encryption audit](docs/audits/2026-08-10-encryption-audit.md), [KNOWN_ISSUES.md](KNOWN_ISSUES.md) |

Source: <https://github.com/Blackmarket-coa/blackout>. Everything linked here is
in the repository — no claim on this page depends on a document only we can see.

To report something that contradicts this page, see [SECURITY.md](SECURITY.md).
