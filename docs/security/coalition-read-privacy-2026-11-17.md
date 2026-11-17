# Coalition reads: who sees where people are (2026-11-17)

Found while surveying the code for a location-based Coalition feature
(geocaches, drops, meeting places), and checked against the code before
anything was changed. Nothing here had been recorded in `KNOWN_LIMITATIONS.md`
or this directory.

## Found

The API lets a request without a token through with no user
(`middleware/auth.ts`), and none of the coalition read routes
(`routes/coalition.ts`) asked for one. Anyone who could reach the API, signed
in or not, could read:

-   **Mutual-aid posts with their poster and spot.** `GET /mutual-aid` returned
    every post as stored: the poster's id (`customerId`), the helper's id
    (`fulfillerId`), the exact coordinates and the street address. The post
    records a `displayRadiusMeters` (default 400 m) that nothing applied. The
    code's own note on mirrored posts says why Free Black Market never
    publishes coordinates: "precise ones describe where a person in need
    actually lives".
-   **The spot, even from a coarse answer.** A radius query (`?lat&lng&radiusKm`,
    no minimum radius) on `/mutual-aid` and `/nearby` compared against the
    exact coordinates, so asking again with smaller circles finds the spot.
-   **Private events.** `GET /spatial-feed` listed every event that was not
    cancelled, private and community ones included, with its place (public
    rings were filtered; events were not), as did `GET /events`,
    `GET /events/shows`, `/nearby` and `GET /events/:id`.
-   **Who is going.** `GET /events/:id` returned the full RSVP list with user
    ids.
-   **Rides.** `GET /events/:id/rides` returned each offer's driver id, where
    they leave from (`originLabel`) and when.
-   **The people behind each need, project, resource and contribution**
    (`authorId`, `leadId`, `stewardId`, `supporterUserId` with the amount).
-   **Sellers who had hidden.** `GET /seller-locations?onlyVisible=false`
    returned the sellers who had turned their map visibility off, with
    address.
-   **A consent text that was not true.** The location disclosure said "The
    server does not store your coarse position". The client sent it in the
    query string, and the baseline nginx (and `infra/nginx`, and nginx's
    default format in `deploy/docker/blackout-backend`) writes the request line,
    query included, to its access log with the caller's address. The address
    someone typed into place search went the same way.

## Done

The rules are in one module, `services/coalitionVisibility.ts`, used by the
routes and the store:

-   **Mutual aid.** The poster sees their post whole. Anyone else gets it
    without `customerId`, `fulfillerId` or the address, placed at the centre of
    a grid cell at least 500 m wide (or the post's display radius, if wider),
    and radius queries and `/nearby` test that centre. The cell is
    deterministic, so asking again narrows nothing.
-   **Events.** A non-public event is shown only to its organizer and to people
    who have RSVP'd, in every list, the map, `/nearby` and the detail route
    (404 otherwise, so its existence is not revealed). An event does not
    record which community a `community` event belongs to, so no one else can
    be shown to belong. RSVPing, volunteering and rides on an event follow the
    same rule. The RSVP list is the organizer's; anyone else gets their own.
-   **Rides and volunteer slots** need sign-in to be listed.
-   **Nobody signed out is sent a person's id:** organizer, author, lead,
    steward or supporter.
-   **Sellers:** only those who show themselves, whatever the query says.
-   **Positions and address searches travel in request bodies.**
    `POST /nearby`, `POST /mutual-aid/search`, `POST /seller-locations/search`
    and `POST /geocode` take them as JSON; the client uses only these. The GET
    forms still answer, for clients loaded before the change. Neither the
    coalition routes nor the API's own request logging write a query string or
    a body (its error and alias logs record the path).
-   **The consent text** now says what happens: the position is in the body,
    so it is not written to access logs; the server does not keep it; anything
    that reads the traffic on the way, including Cloudflare in front of the
    live service, sees it as it passes. It also says a mutual-aid post is shown
    to others as an area and a pinned need, project or resource at the place
    chosen. The disclosure version went from 1 to 2, so everyone who agreed to
    the old text is asked again.

## Checked

-   `test/coalition-read-privacy.integration.test.ts` (8), asking as a
    stranger, another member and the owner: someone else's aid post has no
    poster, address or spot and sits at its cell's centre; 50 m circles on the
    spot miss it, on `/mutual-aid` and `/nearby`; private and community events
    are absent from the map, the lists, `/nearby` and the detail route for a
    stranger, who also cannot RSVP into one; RSVP lists; rides and volunteer
    slots; no person ids signed out, and ids as before signed in; the body forms
    agree with the GET forms; a hidden seller stays hidden. All 8 fail against
    the previous routes and store. `test/coalition-visibility.test.ts` (5):
    every point in a cell maps to one centre within half a diagonal,
    neighbouring cells differ, poles and the date line stay on the globe.
-   A mutation pass over the rules (13 mutants: the owner check, the ids kept,
    no minimum cell, the address kept, private events public, RSVPs not
    checked, RSVP lists for all, ids for signed-out readers, radius on the
    exact spot in either route, RSVP unguarded, hidden sellers, private events
    in the map) failed the tests every time.
-   The existing coalition suites (91 tests) pass unchanged: what members do
    signed in did not change, except for non-public events.
-   Client: `coalitionClientPositions.test.ts` checks the four requests carry
    the position or address in the body and none in the path; the location,
    home, coalition and settings suites pass.

## Still true

-   **Signed-in members see what signed-out readers do not:** the people behind
    needs, projects, resources and contributions, ride drivers, and each
    need, project or resource at the place its author pinned. Registration is
    invite-only during the test period (`KNOWN_LIMITATIONS.md`), but any
    account can read them, in any canopy: nothing checks canopy membership.
    The audiences the field-operations plan describes (public, coalition,
    ops, stewards) are not built.
-   **Community events are organizer-only** until events record their
    community.
-   **Visible sellers** are shown with their address, by their choice.
-   **Older clients** keep sending positions in query strings until reloaded,
    and the access logs keep every other query string as before.
-   **Copies already taken** before this change are beyond reach.
