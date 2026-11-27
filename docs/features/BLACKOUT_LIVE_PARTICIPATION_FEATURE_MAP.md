# Blackout live participation feature map

## Live room feature map update — November 27, 2026

This maps the IMG_2531 livestream comparison to Blackout's target experience. **Partial code** means inspected source foundations; it is not a production acceptance result. **Planned** means a requirement still needing implementation. The source review covered Blackout `ffdf2abdbbd1b863a4a8faaaf189664d6f820b68`; later deployment evidence must be assessed separately.

| ID | Feature | Current status | User-facing home | Required completion |
| --- | --- | --- | --- | --- |
| LIVE-01 | Host and multi-seat panel | Partial code | Blackout → Coliseum live stage | LiveTab.tsx has sessions, speaker requests, grant/revoke and device toggles. Responsive seat grid, capacity and media enforcement need validation. |
| LIVE-02 | Timed turns and extra time | Planned; queue foundation exists | Blackout → host controls | Add a visible authoritative timer, expiry warnings, host pause/extend/skip and reconnect-safe grants. |
| LIVE-03 | Speak-next requests | Partial code; perk action planned | Blackout → speaker queue / Perks | Keep free hand raising. Define whether an optional perk offers queue review or a disclosed priority position; it never silently enables a microphone. |
| LIVE-04 | Live chat, reactions and arrival notices | Partial code | Blackout → live conversation | EmbeddedDenChat supplies in-page chat in the separate livestream viewer. Verify overlay, mentions, emoji, join notices, moderation and low-bandwidth behavior in the unified room. |
| LIVE-05 | Tips and visual gifts | Partial code; capture and presentation unverified | Blackout → Support; FBM → checkout/settlement | GiftPicker, gift catalogue and gift/tip services exist. Complete checkout, capture, recipient receipt and live event presentation; sending a request is not settled payment. |
| LIVE-06 | Expandable host Perks board | Planned; generic points redemption exists | Blackout → live Perks sheet / host setup | Define cards, explanation, cost or eligible points, goal, limits, availability, effect and completion state. Reuse channel-points primitives without implying arbitrary live effects already execute. |
| LIVE-07 | Drop and revive a panelist | New planned mechanic | Blackout → opt-in entertainment format | A temporary game-seat removal/return follows published format rules and participant consent. It cannot bypass moderation removal, bans, eligibility or mic/camera consent; define restoration and no-target behavior. |
| LIVE-08 | Room gift goals and counters | New planned mechanic | Blackout → compact room goal | Support a defined item/count goal such as 0/2, contribution events, progress and one announced effect. Replayed callbacks must not count or execute twice; define expiry and refund/failed-payment handling. |
| LIVE-09 | Watch missions and progress | Partial foundations; verified viewing gap | Blackout → contextual missions | Quests and view heartbeats exist. On-page time is a proxy, not proof of playback. Define eligible live/replay playback, pause/background/disconnect behavior, duplicate sessions and accessible completion alternatives. |
| LIVE-10 | Join community or creator circle | Partial community foundation; fan experience planned | Blackout → creator/community Join | Separate joining a group, following a creator and any finite paid access. Show rights and leave controls; recurring creator memberships remain an explicit policy decision. |
| LIVE-11 | Badges, levels and supporter recognition | Planned composition; reputation/reward foundations | Blackout → panel/chat/profile | Keep contribution rank, supporter recognition, points balances and contest votes distinct. Buying a gift cannot buy expertise, contribution standing or extra votes. |
| LIVE-12 | Viewer count, likes, share and discovery | Integration unverified | Blackout → room header / action rail / Discover | Define deduplicated active viewers separately from likes, visits, shares and visible camera tiles. Preserve the room through share/signup; Popular labels require a defined real signal. |
| LIVE-13 | One coherent live and recorded experience | Planned integration | Blackout → Coliseum; recorded actions in context | Unify the stage, room chat, queues, gifts and perks around authorized session identity. Replays retain historical counters/results; current support, later questions and new rounds remain separately labeled. |

### Ownership and surfaces

Blackout owns live sessions, panel seats, timed mic grants, viewer participation, chat, community joining, missions and the live Perks sheet. These are contextual controls inside Coliseum, not additional primary tabs. Use one compact support/perks entry and one host-management sheet; preserve access to the Armory and current room.

Forge owns advanced stream-source/simulcast configuration, overlay and widget authoring, reusable perk-board appearance/templates, compatibility testing and technical publishing. Keep Blackout's ordinary Go live, End, queue, moderation and configured-perk actions usable while Forge is closed. Expose Configure streaming or Customize in Forge from the relevant screen plus the permanent Forge entry beside Settings and Privacy. Handoffs carry authorized project/session context and a return destination; reusable visual packages cannot mint grants or payment privileges.

FBM remains authoritative for supported checkout, fees, payment capture, refunds and settlement. Blackout owns the session's effect execution and status, keyed to a verified payment/redemption event. Blackmask supplies applicable privacy controls and private coordination, not a duplicate live room. No new transport responsibility is introduced for Blackstar.

### Connected perk execution

A host defines a permitted effect and published terms → a viewer sees eligibility, cost/points and goal → a valid captured contribution or points redemption progresses it → Blackout authorizes and executes the effect once → the room and contributor see the result. Cosmetic feedback and nonfinancial engagement remain separate event types.

Each effect needs a definition/version, room and format scope, target, trigger, threshold, cap/cooldown, expiry, host override, participant acceptance where relevant, and an event/result history. Show available, pending payment, progressing, ready, applied, expired, cancelled and failed states as applicable. A moderator ban or removal overrides a game revival. Define expired turns, absent targets, ended rooms, disputes and refunds before charging; provide the disclosed resolution rather than silently keeping payment for an unavailable effect.

Do not turn arbitrary webhook payloads or overlay scripts into moderation commands. Recheck role and session permission on the server; duplicate or out-of-order callbacks, reconnection and simultaneous contributors must not duplicate counters, charges, rewards, mic grants or effects.

### Boundaries and acceptance

- Keep entertainment effects opt-in and published before the round. Paid reactions/perks do not change evidence ranking, factual conclusions, voting eligibility, vote weight or contribution rank. Timed paid interactions cannot alter an active scored debate outside its published rules.
- Rewards reuse existing authoritative points/entitlements where verified. Do not merge channel points, growth rewards, FBM credit or transferable money into one balance. Keep milestones understandable and award real products, not unattended scrolling.
- Gifts, purchases, campaign donations and third-party beneficiary contributions retain separate accounting. Show full cost, recipient, deductions, pending/paid state and resolution; no blanket promise of immediate cashout.
- Recorded video may retain supported gifts, product offers, questions and sources. Disable expired stage effects and historical watch/goal triggers; never replay an old payment event into a new action.
- Acceptance must exercise the complete mobile and desktop journey: join, request/accept a seat, timed turn, chat, one supported support transaction, one points redemption and one configured effect. Include permission denial, low bandwidth, reconnect, duplicate/out-of-order events, target departure, expiry, failed payment and refund handling.
- Verify audience counts and watch eligibility against actual presence/playback; do not treat page-mounted heartbeats as confirmed watch minutes. Keep personal viewing/muting histories private.
- Preserve published game rules, contributor receipts, host action history and appropriate replay context. Test touch, keyboard, captions and audio-only participation.

### Source anchors and delivery

Inspected foundations: `features/coliseum/tabs/LiveTab.tsx`, `features/streams/LivestreamViewer.tsx`, `features/streams/ChannelPointsWidget.tsx`, `features/monetization/components/GiftPicker.tsx`, `features/monetization/quests/QuestsSlice.tsx` under `apps/blackout-client/src/app/`; plus `packages/api/src/services/gifts.ts` and `packages/core/src/monetization/gifts.ts`. GiftPicker was not found mounted in the inspected live viewer; the viewer mounts TipButton. This is a scoped integration finding, not proof of absence across every branch.

Deliver the composed room and role/media enforcement first; then authoritative timers and participation, gift/points fulfillment, the host-configured perk executor, goals/missions/recognition, and live-to-recorded acceptance. Keep unready actions hidden and avoid readiness claims from registry entries or source presence alone.

