# Public geocaches, server side (2026-11-22)

Geocaching phase 1, the API half (`docs/coalitions/GEOCACHING_DESIGN.md` §8),
built on the operator's decisions of 2026-11-22: a public cache appears 2 hours
after it is placed (here, 2 hours plus a random part of an hour; see below);
any signed-in member may place one; caches are reviewed after reports, not
approved first; the location features are for people 18 and older, by their
own statement. The client half (the disclosure, the composer, the map layer) is
not built yet, so the feature is off: `BLACKOUT_COALITION_CACHES` unset makes
every cache route answer 404.

Code: `services/coalitionCaches.ts`, `services/userConsents.ts`, the cache
rules in `services/coalitionVisibility.ts`, `routes/coalitionCaches.ts`
(`/v1/coalition/caches`), `routes/consents.ts` (`/v1/consents`), migration
`106_coalition_caches`, and the disclosure text in
`packages/core/src/coalition/cacheDisclosure.ts`.

## Who sees what

| Viewer                                    | What they get                                                                                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The placer                                | Their cache at once, with the exact spot, when it appears to others, its find count and its state: `placed`, `hidden_after_report` or `removed_by_moderator` (with the moderator's note). Nothing about exclusion zones. Never the code again.          |
| Another member who agreed                 | Active caches whose delay has passed and that lie outside every exclusion zone: title, hint, note, photo address, how finds are confirmed, find count, whether they found it, and the centre of the cache's 50 m cell. No placer, times or code fields. |
| A member who has not agreed               | Nothing (403 `consent_required`).                                                                                                                                                                                                                       |
| Signed out, or an account that is gone    | Nothing (401).                                                                                                                                                                                                                                          |
| An administrator (`BLACKOUT_ADMIN_USERS`) | The moderation queue (caches hidden after a report, caches with open reports, caches inside an exclusion zone, flagged) with the exact spot, the placer and the reports; the exclusion zones. Never the code or its hash.                               |

## Threats and what answers them

-   **Telling people where someone is, or was, and when.** A cache appears 2
    hours after it is placed plus a random part of an hour (`PUBLIC_CACHE_JITTER_MS`),
    others see a 50 m area rather than the spot, they are sent no placer and no
    times, and lists are ordered by id, which is random, not by placing time.
    **Residual:** someone who polls the list sees when a cache appears, which
    puts the visit within an hour-long window 2 to 3 hours earlier.
-   **Narrowing the spot with radius searches.** `POST /search` tests each
    viewer's circle against what that viewer is shown: the cell centre for
    others. The cell is deterministic, so asking again narrows nothing (the
    same reasoning as mutual-aid posts in
    `docs/security/coalition-read-privacy-2026-11-17.md`).
-   **Narrowing the spot with GPS check-ins.** A GPS check-in is compared with
    the centre of the area everyone is shown (within 75 m), not with the exact
    spot, so its answer says nothing that the area does not. Once someone has
    found a cache, they get their find back without another comparison.
-   **Mapping the exclusion zones.** Zones may mark shelters, clinics or
    homes, so nothing a member can see depends on them. Zones are applied when
    caches are read, against the zones as they are now, and never written onto
    a cache. A cache inside one is accepted; the placer's answer, list entry
    and data export are the same as for any other cache; nobody else is shown
    it, whatever an administrator does (a restore cannot publish it, and a
    removal of a cache that was never reported reads as `placed`, without the
    note). The client will say, in general, that caches in some places never
    appear and that it will not say which. Placements are limited to 10 a day
    per account. **Residuals:** someone with two accounts can place a cache,
    wait for its delay and look for it from the other account: one probe per
    placement, 2 to 3 hours each. When an administrator adds a zone, the
    caches already inside it disappear for everyone at once, which shows that
    something there changed; adding zones before people start placing caches
    avoids that. Zones should be generous circles, not outlines of the place
    they protect.
-   **Guessing a code.** The server makes the code (10 characters from 31
    that cannot be confused, about 49.5 bits), shows it once, and keeps only
    `scrypt(code, salt)`. Find attempts are limited to 30 an hour per account.
-   **A cache at a bad spot.** Nothing is approved first (decision 9), so
    the answer is placement guidance in the client, the exclusion zones, and
    reports: the first report hides a cache from everyone but its placer until
    an administrator restores or removes it. **Residual:** a cache at a bad
    spot outside every zone is visible from the end of its delay until the
    first report.
-   **Hiding other people's caches with reports.** One report hides a cache.
    Reports are limited to 20 a day per account, administrators see who
    reported, a restore closes the reports, and someone whose report on a cache
    was reviewed is not heard again on that cache. **Residual:** several
    accounts can keep a cache hidden until an administrator looks.
-   **A finder's position.** A GPS check-in sends the position in the request
    body, once; it is compared with the shown area and not stored or logged. A
    find records who and when. Neither route takes a position in the URL. GPS
    can be spoofed; the disclosure says so, and the client must tell placers
    when they choose it (design decision 3).
-   **Photo metadata.** The API stores a Matrix media address, not the image,
    and cannot see whether the client stripped it. The client composer (next
    pull request) must strip, and must refuse what
    `apps/blackout-client/src/app/utils/stripImageMetadata.ts` cannot clean:
    today it re-encodes only JPEG, PNG and WebP and returns HEIC, AVIF, TIFF
    and GIF unchanged, location data included.
-   **What a person agreed to.** The disclosure text is in `@blackout/core`,
    shown by the client and hashed by both: the API records an agreement only
    for the current version, with the SHA-256 of the current text and the 18+
    statement. A new agreement or a withdrawal ends every active agreement of
    the kind. Blackout cannot check age; the text says the statement is the
    person's own.
-   **What the server keeps about a person.** Account deletion erases their
    caches (with the finds and reports on them), their own finds and reports,
    and their consent records (`eraseCoalitionCacheDataForUser`, called from
    `confirmAccountDeletion`); the data export includes all of them, with the
    status the placer is told. A token issued before the deletion gets 401
    from every cache and consent route, so nothing can be written under an
    account that is gone. **Residual:** a cache's photo stays in the
    homeserver's media store after the cache or the account is gone; the API
    never held the image and cannot delete it.
-   **Moderators.** The API has no community moderator role; the
    administrators in `BLACKOUT_ADMIN_USERS` are the moderators, as for
    community assets.

## Independent review

A reviewer given the code and the requirements, not this record, found nine
problems in the first version; each is fixed in `bd9856f0fe` unless noted:

1. The data export sent the stored status, which told a placer, at once and
   with one account, which of their caches sat in an exclusion zone.
2. A moderator's restore published a cache inside a zone (also when a report
   came before the zone).
3. A moderator's removal of a zone-held cache told its placer.
4. GPS check-ins against the exact spot let 25 answers locate it to half a
   metre from home.
5. A cache appeared exactly 2 hours after placing, dating the visit to the
   minute, and lists were ordered by placing time; this record then claimed
   no timestamps dated the visit.
6. Adding a zone hides the caches inside it at once: kept as a residual
   (above).
7. Consent accepted any 64-hex text hash, and a withdrawal ended only the
   newest active agreement.
8. A reviewed reporter could hide a cache again after every restore, and a
   placer's take-down left its reports open in the queue for good.
9. A token outliving its account could still agree and place caches nothing
   would erase; the photo outlives the cache (kept as a residual, above).

## Checked

-   `test/coalition-caches.integration.test.ts` (13), as placer, another
    member, an administrator, someone who has not agreed and an account that
    is gone: the feature off; consent first (the current text's hash, the
    current version, 18+, history kept); no account, no access; the code shown
    once, in no stored field, scrypt-hashed; nothing for others for 2 to 3
    hours, then the cell centre and none of the placer's fields; six caches
    placed together appear over more than a minute; radius search by cell
    centre; finding by code (case and spacing ignored, wrong code refused,
    once per person, no comparison after a find, one find per person in the
    store); GPS answers that depend only on the shown centre (74 m from it
    accepted on both sides, though one point is 54 m from the spot and the
    other 94 m; 80 m refused), with no position stored; a report hides until a
    moderator restores or removes, and a reviewed reporter cannot hide it
    again; a placer's take-down closes reports and leaves the queue; inside a
    zone, the placer's answer, list and export match a cache outside, a
    restore does not publish it, a removal reads as placed without a note, a
    new zone hides caches already inside, and a reported-then-zoned cache
    stays hidden after a restore; withdrawal; the export and account deletion,
    and a pre-deletion token afterwards.
-   The 13 tests against the first version: the 9 for new behaviour fail.
-   Mutation passes: 20 mutants of the first version's rules and 18 of the
    fixes (zones applied on read, the export status, the silent zone removal,
    GPS against the centre, the jitter, the text hash, reviewed reporters,
    take-down closing reports, existing accounts, repeat finds, the delay,
    the GPS check). Every mutant that changes behaviour fails a test; one
    (keeping placer take-downs out of the queue by a separate filter) cannot,
    because closing their reports already does.
-   Storage: `postgres-store` (the migration on PGlite, 161 tables),
    `store-spec-coverage` (each new mutator has a Postgres write; the erase
    and zone delete are exercised), `pg-writer-targeted` (the erase statements
    PREPARE on the schema).

## Not checked or not built

-   The client: disclosure, per-share summaries, composer, map layer, finding
    and reporting (pull request B); public, private and hybrid profiles
    (pull request C).
-   The file-backed store's persistence of these tables (the overrides are
    written, not exercised); a live Postgres deployment.

## Found on the way, not changed here

-   The file-backed store (`BLACKOUT_DB_MODE=file`, the default and
    `deploy/docker`'s example) has no persisting override for
    `upsertCommunityAsset` or `upsertCommunityAssetReport`, so those writes
    reach the file only when another write follows. Postgres mode, which the
    single-server baseline uses, mirrors them.
-   Account deletion does not erase the account's other coalition records
    (mutual-aid posts, events, RSVPs, needs and the rest):
    `confirmAccountDeletion` erases a fixed list that does not include them.
-   A token issued to a deleted account stays valid elsewhere in the API until
    it expires; only the cache and consent routes check that the account
    still exists. Checked: after `confirmAccountDeletion`, an access token
    signed for the account before it still creates a mutual-aid post
    (`POST /v1/coalition/mutual-aid`, 201).
