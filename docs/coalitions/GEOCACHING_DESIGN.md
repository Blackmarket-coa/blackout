# Coalition geocaching, hidden drops and meeting places: design (2026-11-17)

**Companion update (2026-11-21):** The [Coalition game plan](../product/BLACKOUT_COALITION_GAME_PLAN.md) adds open-source reuse evaluation, original collectible companions, cooperative quests, creator-made content, and optional AR. It preserves this document's consent/audience rules, code-versus-GPS choice, placement protections, gamification banlist, and separate play ledger. Existing unresolved policy questions below remain open.

**Status:** proposed. Nothing in this document is built yet. It turns the
operator's request of 2026-11-17 into a plan, and records the decisions the
operator took that day. It builds on `docs/BLACKOUT_HABIT_AND_PARTICIPATION_STRATEGY.md`
§4.5 ("Location features must be opt-in, minimize collection and retention of
precise location data, and avoid exposing a user's live location to other
participants by default") and on what the code has today
(`docs/security/coalition-read-privacy-2026-11-17.md`,
`docs/security/map-tiles-and-plugin-key-2026-11-17.md`).

## 1. What people can do

-   **Place a cache:** a photo and a note left at a place on the coalition map,
    with a hint. Others find it there.
-   **Find caches**, alone or as a group, and follow chains of them (a hunt).
-   **Leave a hidden drop:** something only the finder can open, such as a
    message, a file or a coupon from a Free Black Market seller.
-   **Set up a meeting place** ("speakeasy"): a gathering whose exact place is
    told only to the people confirmed for it, close to the time.
-   **Meet coalition peers nearby** by joining areas (a neighbourhood or a city
    each person picks), and be told, if they ask to be, when someone in an
    area they joined needs something.
-   **Play** inside Blackout and FBM: collections, badges, group objectives,
    quest steps and FBM-sponsored rewards.

The variety comes from what people make: their own caches, hunts and drops,
on real places, at different times, from templates organizers can reuse
(riddle chains, photo challenges, seasonal events, sponsor drops).

## 2. Decisions the operator took (2026-11-17)

1. **The gamification banlist stays** (`packages/blackout-protocol/src/gamification/banlist.ts`):
   no streaks, no manufactured urgency, no guilt notifications, comparisons and
   leaderboards opt-in only, XP never buys governance. Play is cooperative:
   collections, finds, group hunts, badges.
2. **Peers are found through opt-in areas, never positions.** A person joins
   an area they choose; others in it see them as their profile allows. Nobody's
   position is shown or stored.
3. **How a find is confirmed is the placer's choice, per cache:** a code left
   at the spot (the default: nothing about the finder's position is sent, and
   it is hard to fake), or a GPS check-in, which sends the finder's position
   for that one check and can be spoofed. The placer is told both.
4. **Three audiences for every cache, drop and meeting place:**
    - **Public:** anyone can find it. Its place is public by design, so every
      safety rule in §4 applies.
    - **Private:** only a group the placer picks (a coalition, canopy or den).
    - **Direct:** only the people the placer names.
5. **Profiles are public, private or hybrid**, and set each person's defaults
   (§5). A default never skips the confirmation for making something public.
6. **Consent is the foundation.** People are told, in plain words, what they
   are about to share, every time it is location, a photo, metadata or
   anything public, and nothing is shared until they confirm (§3).

## 3. Consent

The operator's words: "Consent is key. The key to consent is understanding
what you are consenting to."

-   **Before first use**, a disclosure in the style of the location one
    (`apps/blackout-client/src/app/features/location/locationConsent.ts`): what
    the feature collects, who can see it, how long it is kept, how to stop.
    Nothing location-based works until the person agrees. It is versioned; a
    change of wording asks again.
-   **Before every share**, a summary built from what will actually be sent,
    so it cannot drift from the code. Examples:
    -   Public cache: "Anyone on Blackout can see this photo and the spot you
        put it, to within about 50 m. The photo's hidden location data has
        been removed. It will appear in 2 hours. Placing it shows people you
        were here."
    -   Private cache: "Only members of Riverside Crew will see this. It is
        end-to-end encrypted: this server cannot read the photo or the spot."
    -   Direct drop: "Only Maya and Jordan can find this. They need the code
        you leave there."
    -   GPS check-in: "To check this find, your exact position will be sent to
        this server once. It is used for this check and not kept."
    -   Joining an area: "People in Westside who also joined will see your
        name in its list (your profile is hybrid: name only, no photo). Your
        position is never shown."
-   **A record people can see:** each agreement is kept with the wording shown
    and the date, listed in Settings, and can be withdrawn there. Withdrawing
    stops the feature and offers to take down what the person placed.
-   **Every claim in a summary must be true.** If the app cannot check that a
    protection is on, it does not say it is (`CLAUDE.md`).

## 4. Safety rules

-   **No person's position is shown or stored.** Caches and meeting places are
    places, not people. GPS check-ins are checked and discarded.
-   **Photos:** hidden location data is stripped before upload
    (`utils/stripImageMetadata.ts`). Formats it cannot strip (HEIC, AVIF,
    TIFF) are converted or refused, never uploaded as they are. No video caches
    until video stripping exists.
-   **Public caches** appear after a delay (proposed: 2 hours), so placing one
    does not say where someone is right now. Places that must not hold one
    (homes, schools, shelters, clinics, places of worship) are covered by
    placement guidance, an operator-maintained exclusion list, reporting and
    moderation.
-   **Meeting places** show an area until close to the time; the exact place
    goes only to confirmed attendees; the organizer sees the list; capacity is
    enforced; anyone can report.
-   **Hidden drops are digital** in the first phases. Physical item drops raise
    legal and safety questions (what is left, where, by whom) and wait for the
    operator's legal review.
-   **Pings about needs** are opt-in per area, time-limited, and say "someone
    in Westside needs groceries", not a distance, unless the person turns on
    distance for a limited time
    (`docs/COALITION_FIELD_OPERATIONS_BUILD_PLAN.md`, line 107).
-   **Report and block** on every cache, drop, meeting place and person.
-   **Threat model:** adversary A14 in `THREAT_MODEL.md` (someone hunting a
    person through the map) applies to everything here, and the people who
    place and find caches are part of it.

## 5. Public, private and hybrid profiles

| Default                          | Public         | Private                   | Hybrid                    |
| -------------------------------- | -------------- | ------------------------- | ------------------------- |
| New cache, drop or meeting place | public         | a group, chosen each time | the person picks per kind |
| Finds show my name               | yes            | no                        | the person picks          |
| Others in my areas see me        | name and photo | not listed                | name only, or picked      |
| Pings about needs in my areas    | off            | off                       | off                       |

Pings start off for everyone. Whatever the profile, making something public
always shows the summary in §3 and waits for confirmation.

## 6. How the audiences work

-   **Public:** the API stores the cache (place, the photo's address in
    Matrix media, hint, how finds are confirmed, a salted hash of the code)
    and answers who may see it with the same rules as the coalition reads
    (`services/coalitionVisibility.ts`). The coalition data has no spatial
    index today; a geohash or PostGIS index comes with the first layer that
    needs it.
-   **Private and direct:** the cache is a Matrix event (for instance
    `co.blackout.cache`) in the group's or the named people's encrypted room,
    with the photo as an encrypted attachment (`roomAttachment.ts`). Members'
    apps decrypt it and put it on their own map. The server sees that an event
    was sent, its size and time, not the photo, the place or the note.
-   **Finder keys for drops:** the drop's content is encrypted with a key
    derived from the code left at the spot, so only someone who found the code
    can open it, whatever the audience. The dead-drop envelope
    (`packages/blackout-protocol/src/deaddrop/`) is the starting point; today
    its drops are addressed to one recipient's key.
-   **GPS check-in:** the finder's position goes in a request body, once; the
    server checks it is within 50 m and keeps only "found at this time by this
    person".

## 7. Gameplay, inside the banlist

-   **Collections and badges** for finds and for caches others enjoyed; for
    needs met through a ping.
-   **Group hunts** as objectives (`features/objectives`): shared progress,
    totals only.
-   **Quest steps**: "place your first cache", "find three in your area"
    (`packages/blackout-protocol/src/quests`).
-   **FBM sponsor drops:** a seller funds a drop whose content is a coupon or a
    digital good, redeemed through FBM. A reward is advertised only once it is
    delivered (`docs/BLACKOUT_WHOLE_PRODUCT_MVP.md`, line 120).
-   **A play ledger separate from reputation.** Reputation decides who can
    join a coalition (`coalitionJoinRequirements.ts`), so play points never
    feed it.

## 8. Phases

0. **Done (PR #1017):** the map draws only from this server; coalition reads
   no longer expose posters, private events, RSVPs, drivers or exact aid
   spots; positions are out of URLs and access logs.
1. **Consent and profiles; public caches.** The disclosure, per-share
   summaries and the consent record; public, private and hybrid profiles;
   public caches with a code at the spot; the photo composer with mandatory
   stripping; a caches layer on the map; reports and a moderation queue; the
   delay and exclusion list.
2. **Private and direct caches; finder-key drops.**
3. **Areas, pings and meeting places.**
4. **Play:** collections, badges, group hunts, quest steps, FBM sponsor drops.

Native location (the Android permission, an iOS project) comes when a phase
needs it; the web app covers phases 1 and 2.

## 9. Questions for the operator

1. The delay before a public cache appears (proposed: 2 hours).
2. Who may place public caches: any member, or members with some standing?
3. Moderation of public caches: approved before they appear, or reviewed after
   reports?
4. Physical drops: later, after legal review, or never?
5. A minimum age for the location features.
6. What FBM sponsor rewards may be (coupons, digital goods, credits).
