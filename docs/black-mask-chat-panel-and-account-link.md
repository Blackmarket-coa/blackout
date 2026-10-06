# Black Mask chat panel and account link — Blackout's part of the launch plan

Recorded 2026-10-04 from the operator's Black Mask spec of 2026-10-03. The
whole plan, with the FBM billing steps and the Black Mask fork's own phases, is
in the free-black-market repo at `docs/BLACK_MASK_LAUNCH_PLAN.md`. This file
holds the steps that land in **this** repository. Anything marked
**placeholder** is an assumption, not a decision.

## Decided

-   The Blackout chat panel is **free** for anyone with the Black Mask extension
    and a Blackout account.
-   It is a **minimal sandbox** showing only Canopies (communities and channels),
    dens and DMs. No Town Square, Coliseum, Market or feeds. A link to anything
    else opens in a normal Blackout tab.
-   The panel gets **unread indicators and push notifications** (operator,
    2026-10-06). Whether each is on by default or opt-in is still to confirm.
    A push travels through Apple's or Google's push service, which learns when a
    message arrived even when it cannot read it; the panel must not describe
    push as private, and the content of a push must not include message text.
-   A Blackout account can **accept a Black Mask registration**, or **link to a
    Black Mask account**, on request. The user picks how long the link lasts: a
    timeframe or indefinitely, nothing preselected.
-   Unlinking or expiry ends the chat session and signs that device out. **The
    Blackout account is never deleted.**

## Placeholder or proposed

-   Building the panel as a sandboxed embed of the live Blackout client (as
    opposed to a purpose-built mini client). Proposed; not decided.
-   Phase 3 extras: delivery of dead drops or vault items into a den; Matrix
    check-in reminders and M-of-N governance approval for a dead man's switch; an
    encrypted Matrix channel for breach and phishing alerts.

## Preconditions — fix the house first

| #   | Precondition                                                                                                                                                                                                                                                               | Where                                                                   | Status 2026-10-04                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| P1  | **BO-1** key-backup `DecryptionError` / unable-to-decrypt history. BO-1 gates anything that routes trust through Blackout, so no vault extra (recovery key in the vault, device verification, dead drops into dens) may depend on Blackout's encryption until it is fixed. | `KNOWN_ISSUES.md` BO-1, `docs/audits/2026-08-10-encryption-audit.md`    | Instrumenting, not fixed               |
| P2  | Rotate the Blackout bot token.                                                                                                                                                                                                                                             | Operator secret rotation                                                | Pending                                |
| P3  | Clear the unmerged upstream security-advisory PRs.                                                                                                                                                                                                                         | PRs #927–#941, one per day of advisories, all open with unstable checks | Ten open                               |
| P4  | LiveKit voice was failing at the last audit; the panel starts with **text chat only**.                                                                                                                                                                                     | `KNOWN_LIMITATIONS.md` (LiveKit runtime binding carved to Phase 5)      | Text-only is the plan                  |
| P5  | The Squarespace page served at theblackout.app with broken federation delegation at the last audit.                                                                                                                                                                        | Hosting / `.well-known/matrix` delegation                               | Confirm and fix before the panel ships |
| P6  | Anubis (AI-scraper firewall, MIT) and CrowdSec (MIT) in front of Blackout.                                                                                                                                                                                                 | Infra configs in this repo                                              | Not started                            |

## Steps in this repository

### 1. Embed route

-   Add a client route that renders only Canopies, dens and DMs. Everything else
    in the client is unreachable from that route: no Town Square, Coliseum,
    Market, feeds or settings beyond what sign-in needs.
-   Links to other Blackout content open in a normal Blackout tab (the embed
    never navigates itself). External links are handed to the host so Black
    Mask's phishing check runs first.
-   Unread indicators (decided 2026-10-06; default-on or opt-in to confirm).

### 2. Framing policy

`packages/api/src/middleware/security-headers.ts` sets `frame-ancestors
'none'` and `frame-src 'none'` for every response today. The embed route needs
a **per-route** `frame-ancestors` allow-list of Black Mask origins — the
extension origin(s), the desktop app's origin and the mobile webview origins —
while every other route keeps `'none'`. Keep COOP/CORP as they are unless the
embed proves they block it. **Verify with a real response-header check** on
the embed route and on a non-embed route, not by reading the file.

### 3. Sign-in inside the sandbox

Blackout login happens inside the panel. The user picks the session length (a
timeframe or indefinitely; nothing preselected). The chosen TTL is enforced
server-side on the session, not only remembered by the client.

### 4. Optional account link

-   A **signed handshake**, like the existing FBM↔Blackout bridge (FBM's side is
    `backend/src/api/v1/integrations/blackout/link/route.ts`: service token or
    JWT, Blackout user id plus a target id), creates a **link record** on
    Blackout's side.
-   The user picks the link duration (a timeframe or indefinitely). **Expiry is
    enforced on the server.** The link is **revocable any time** from a
    **link-status screen** that shows what is linked, since when, and until when.
-   Blackout also **accepts a Black Mask registration** (creating the Blackout
    account from the handshake) or **links an existing account**, on request.
-   On unlink or expiry: end the chat session, sign that device out, and notify
    the vault side so it deletes any Blackout recovery key it stored. Never
    delete the Blackout account.

### 5. Capacity

Free chat users load Synapse, not the vault server. Watch the DL360's headroom
as the panel rolls out.

### 6. Phase 3 hooks (after the paid launch)

-   Dead drops delivered into a den: the `apps/deaddrop-appservice` exists; the
    dead-drop spec was not among the confirmed-live features at the last audit, so
    treat it as unverified until exercised.
-   Dead man's switch: Matrix check-in reminders; optional M-of-N approval through
    the governance engine. Blackout's encryption is not a dependency until BO-1 is
    fixed.
-   Matrix alerts: an encrypted channel for breach and phishing alerts instead of
    email.

## Legal checkpoint

**L31 — age-verification laws and COPPA.** Check whether they reach Blackout as
it grows; the "no ID needed" hook is a positioning claim that depends on the
answer. Needs counsel; surfaced, not resolved. Mirrored in the FBM repo's
`docs/legal/checkpoints.md`.

## Open decisions touching this repo

-   [x] Unread indicators or push notifications in the chat panel. **Add
        both** (2026-10-06); default-on or opt-in to confirm.
-   [x] Confirm the 3% fee on Blackout creator transactions (a revenue-model
        assumption, not a Blackout decision). **Confirmed** (2026-10-05).
-   [x] Dead drops or the dead man's switch first, and the audience each is built
        for (whistleblower-style versus inheritance-style continuity). **Dead
        drops first** (2026-10-05); the audience is still to be written down.
