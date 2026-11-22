# Public geocaches, server side (2026-11-22)

Geocaching phase 1, the API half (`docs/coalitions/GEOCACHING_DESIGN.md` §8),
built on the operator's decisions of 2026-11-22: a public cache appears 2 hours
after it is placed; any signed-in member may place one; caches are reviewed
after reports, not approved first; the location features are for people 18
and older, by their own statement. The client half (the disclosure, the
composer, the map layer) is not built yet, so the feature is off:
`BLACKOUT_COALITION_CACHES` unset makes every cache route answer 404.

Code: `services/coalitionCaches.ts`, `services/userConsents.ts`, the cache
rules in `services/coalitionVisibility.ts`, `routes/coalitionCaches.ts`
(`/v1/coalition/caches`), `routes/consents.ts` (`/v1/consents`), migration
`106_coalition_caches`.

## Who sees what

| Viewer                                    | What they get                                                                                                                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The placer                                | Their cache at once, with the exact spot, when it appears to others, its find count and its state: `placed`, `hidden_after_report` or `removed_by_moderator` (with the moderator's note). Never the code again.      |
| Another member who agreed                 | Active caches whose 2 hours have passed: title, hint, note, photo address, how finds are confirmed, find count, whether they found it, and the centre of the cache's 50 m cell. No placer, no times, no code fields. |
| A member who has not agreed               | Nothing (403 `consent_required`).                                                                                                                                                                                    |
| Signed out                                | Nothing (401).                                                                                                                                                                                                       |
| An administrator (`BLACKOUT_ADMIN_USERS`) | The moderation queue (hidden caches and caches with open reports) with the exact spot, the placer and the reports; the exclusion zones. Never the code or its hash.                                                  |

## Threats and what answers them

-   **Telling people where someone is right now.** A cache appears 2 hours
    after it is placed, others see a 50 m area rather than the spot, and they
    are sent no placer and no timestamps that would date the visit.
-   **Narrowing the spot with radius searches.** `POST /search` tests each
    viewer's circle against what that viewer is shown: the cell centre for
    others. The cell is deterministic, so asking again narrows nothing (the
    same reasoning as mutual-aid posts in
    `docs/security/coalition-read-privacy-2026-11-17.md`).
-   **Mapping the exclusion zones.** Zones may mark shelters, clinics or
    homes, so the server never says a place is excluded. A cache inside a
    zone is accepted, the placer's view of it is the same as for any other
    cache (`placed`, same fields, a code if it has one), and nobody else is
    ever shown it. The client will say, in general, that caches in some places
    never appear and that it will not say which. Placements are limited to 10
    a day per account. **Residual:** someone with two accounts can place a
    cache, wait 2 hours and look for it from the other account: one probe per
    placement, 2 hours each. Zones should be generous circles, not outlines
    of the place they protect.
-   **Guessing a code.** The server makes the code (10 characters from 31
    that cannot be confused, about 49.5 bits), shows it once, and keeps only
    `scrypt(code, salt)`. Find attempts are limited to 30 an hour per account.
-   **A cache at a bad spot.** Nothing is approved first (decision 9), so
    the answer is placement guidance in the client, the exclusion zones, and
    reports: the first report hides a cache from everyone but its placer until
    an administrator restores or removes it. **Residual:** a cache at a bad
    spot outside every zone is visible from its 2nd hour until the first
    report.
-   **Hiding other people's caches with reports.** One report hides a cache.
    Reports are limited to 20 a day per account, administrators see who
    reported, and a restore closes the reports. **Residual:** a person with
    several accounts can keep caches hidden until an administrator looks.
-   **A finder's position.** A GPS check-in sends the position in the request
    body, once; it is compared with the exact spot (50 m) and not stored or
    logged. A find records who and when. Neither route takes a position in the
    URL. GPS can be spoofed; the client must tell placers so when they choose
    it (design decision 3).
-   **Photo metadata.** The API stores a Matrix media address, not the image,
    and cannot see whether the client stripped it. The client composer (next
    pull request) must strip, and must refuse what
    `apps/blackout-client/src/app/utils/stripImageMetadata.ts` cannot clean:
    today it re-encodes only JPEG, PNG and WebP and returns HEIC, AVIF, TIFF
    and GIF unchanged, location data included.
-   **Age.** Blackout cannot check age. The agreement records the person's
    statement (`ageConfirmed`), and the routes need it. The disclosure must
    say plainly that it is their own statement.
-   **What the server keeps about a person.** Account deletion erases their
    caches (with the finds and reports on them), their own finds and reports,
    and their consent records (`eraseCoalitionCacheDataForUser`, called from
    `confirmAccountDeletion`); the data export includes all of them.
-   **Moderators.** The API has no community moderator role; the
    administrators in `BLACKOUT_ADMIN_USERS` are the moderators, as for
    community assets.

## Checked

-   `test/coalition-caches.integration.test.ts` (10), as placer, another
    member, an administrator and someone who has not agreed: the feature off;
    consent first (current version, 18+, history kept); the code shown once,
    in no stored field, scrypt-hashed; nothing for others for 2 hours, then the
    cell centre and none of the placer's fields; radius search by cell centre
    (a circle 90 m from the spot includes it for the placer and not for
    others); finding by code (case and spacing ignored, wrong code refused,
    once per person, no position stored); finding by GPS (80 m refused, 30 m
    accepted, the position stored nowhere); a report hides until a moderator
    restores or removes; the queue is administrators' only; a cache in a zone
    looks the same to its placer and is never shown, and a new zone hides
    caches already inside it; withdrawal stops the feature but not taking down
    one's own cache, and nobody else can take it down; the export and account
    deletion.
-   A mutation pass of 20 mutants (the delay, the cell, the search, the code
    check, normalisation, once per finder, the GPS check, report hiding,
    queue access, zones, the placer's view of a zone, the 18+ check, the
    consent check, deletion, the export, the code stored in the clear, the
    placement delay, the flag, the placer sent to others, ownership of
    take-down): every one failed at least one test.
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
