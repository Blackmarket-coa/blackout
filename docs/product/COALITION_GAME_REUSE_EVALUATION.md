# Coalition game: open-source reuse evaluation (phase 0, 2026-11-21)

**Status:** phase 0 of the [Coalition game plan](BLACKOUT_COALITION_GAME_PLAN.md#8-phased-delivery-and-acceptance):
a written adoption decision per candidate. Nothing was imported, built or run.
Each candidate was cloned read-only at the revision below and read; the
findings cite files at that revision. The recommendations are for the operator
to accept or change.

## Summary

| Candidate    | Revision read                                                    | License                        | Recommendation                                                                                                                      |
| ------------ | ---------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Pokemon Walk | `24d486c1afe2b1182939011f647efda21ef4b688` (2026-02-10)          | MIT, © 2025 PraxisMapper       | **Design reference only.** Embed, fork or port no code or assets; rebuild the few useful ideas on Coalition's own records.          |
| PraxisMapper | `7cc7b6cfa7527f029722977cc35c1c188b71baa8` (2026-09-08)          | Apache-2.0                     | **Do not deploy.** Coalition already has what it would add, and it would bring a second runtime, database schema and account store. |
| LocAR.js     | `ba045391127f43a066c77db01e4d953e722a8df6` (v0.2.12, 2026-09-16) | MIT, © 2024 AR.js organisation | **Keep as the phase 5 candidate**, pinned when that phase starts, with the conditions in its section.                               |

Phase 1 (one encounter) should therefore be written in TypeScript in the
client and API, on Coalition's places, communities and visibility rules,
with original companions, server-decided grants and no movement history.

## Pokemon Walk

A Godot 4.6 project (`project.godot`: features `4.6`, `Mobile`; renderer
`gl_compatibility`). Export presets exist for Android and Web only; there is
no iOS preset. The README is two lines.

**Why no code or assets should come across:**

1. **The content is someone else's intellectual property.** `Assets/Front/`
   holds 6,202 files: sprites named after Pokémon species (`ORICORIO.png`,
   `MANTINE.png`, …) and their Godot import files. `Assets/Trainers/` and
   `Assets/pokemon professor female.png` are character art.
   `Assets/DataFiles/pokemonData.json` (4.5 MB) is the species dataset: names,
   types, base stats, catch rates, growth rates. The code names species
   throughout: `Scripts/SpawnLogic.gd` lists starter species and 21 weekly
   spawn sets by species name. An MIT code licence grants none of this
   (the game plan says so in §2).
2. **The combat is Pokémon GO's.** `PoGoCombat/PoGoCombat.gd` and
   `Scripts/PoGoLevelCurves.gd` reproduce its rules by name: same-type bonus
   1.2, effectiveness 1.4 and 0.71, the combat-power multiplier from 0.094 at
   level 1, individual values 0–15. Porting them recreates a specific existing
   game's system; the game plan already asks for our own rules (§4).
3. **Asset licences are mostly unrecorded.** `Assets/license.txt` names one
   item, the Quaver font (CC BY 3.0, attribution required). The two sounds
   (`raid_sound.ogg`, `jingles_NES03.ogg`) have no stated source or licence.
   The bundled `addons/dialogic` (Dialogic 2.0-Alpha-16) carries no licence
   file. `addons/PraxisMapperGPSPlugin` is two prebuilt Android libraries
   (`.aar`, debug and release) with no source in the repository.
4. **It sends the player's area to a third party.**
   `PraxisMapper/Controls/get_file.gd` downloads map data from
   `https://global.praxismapper.org/`, named by Plus Code cell:
   `Scenes/landing.gd` and `Scenes/options.gd` ask for the player's current
   cell, and `Scenes/map_view.gd` queues the current cell and its neighbours
   each time the player moves into a new one. That host learns a running
   trail of the area each player is in, the same leak `docs/security/map-tiles-and-plugin-key-2026-11-17.md`
   removed for map tiles, and it belongs to a project retired in
   September 2026.
5. **It keeps a movement history on the device.**
   `PraxisMapper/Controls/PlaceTracker.gd` saves every place visited with
   the time of the first visit (`user://Data/PlaceTrackeroffline.json`);
   `RecentActivityTracker.gd` saves each Plus Code cell visited with a time
   (`user://Data/RecentTracker.json`). Anyone holding the phone can read where
   its owner has been. The game plan rules out movement histories (§5), and
   `THREAT_MODEL.md` adversary A14 is someone hunting a person through the map.
6. **Progress rewards travel.** `Scripts/PoGoLevelCurves.gd` makes a creature
   stronger when caught at walking speed and weaker when caught faster, and a
   buddy's distance walked raises it further. That needs continuous tracking
   of speed and distance, and it disadvantages people who cannot travel, whom
   the game plan gives non-location paths (§3).
7. **The client is trusted.** `PraxisMapper/Scripts/UserCerts.gd` makes an
   RSA key pair on the device, saves it unencrypted (`user://generated.key`),
   and `Scripts/PokemonGenerator.gd` signs and verifies creatures with it.
   A signature made with a key the client holds proves nothing against a
   modified client; the game plan requires server-validated, idempotent
   grants (§7).
8. **Accounts send passwords in URLs.** `PraxisMapper/Scripts/PraxisServer.gd`
   logs in with `/Server/Login/<username>/<password>`, which writes the
   password into every proxy's access log (see PraxisMapper below).
9. **Embedding Godot means a second application.** The web export is
   single-threaded (`export_presets.cfg`: `variant/thread_support=false`), so
   it does not need cross-origin isolation for threads, though its
   progressive-web-app setting asks a service worker to add those headers.
   It would still bring its own WebAssembly runtime, interface, accessibility,
   save files (`user://`) and update cycle, and WebAssembly needs a CSP change
   (see "Cross-cutting: WebAssembly and the CSP").

**Ideas worth rebuilding, without its code:** weighted rarity tiers
(`SpawnLogic.gd`: common 5, uncommon 2.5, rare 1); themed spawn sets that
rotate; encounters that depend on the kind of place; a chosen companion; a
cooperative boss encounter, under our own rules. Rotation must follow the
banlist (`packages/blackout-protocol/src/gamification/banlist.ts`): a set
that rotates out comes back, and missing one costs nothing
(`no-manufactured-urgency`, `forgiveness-over-punishment`). The daily
challenge in `Components/DailyChallenge.gd` would have to meet the same rules.

**Adoption record:** copied files: none. Dependencies: none. Attribution:
none needed while nothing is copied. Maintainer, security process and
rollback: not applicable.

## PraxisMapper

An Apache-2.0 C# server for location games built from OpenStreetMap
extracts. The README marks it retired in September 2026 ("will not receive
updates"). It says .NET 8, but 12 of its 13 `.csproj` files target
`net10.0` (the other names no framework). It stores data in LocalDB, MariaDB, SQL Server or PostgreSQL
(`CoreComponents/PraxisContext.cs`, Npgsql), draws its own map tiles
(`PraxisCoreMapTilesImageSharp`, `PraxisMapTilesSkiaSharp`) and keeps its own
accounts.

**Why not deploy it:**

-   Coalition already has places and areas in the API's PostgreSQL store, the
    visibility rules for them (`packages/api/src/services/coalitionVisibility.ts`),
    and a self-hosted basemap (Martin serving a Protomaps extract,
    `infra/single-server-baseline/martin/`). PraxisMapper would duplicate each
    of them in a .NET service with its own schema and accounts, which the game
    plan rules out unless a gap justifies it (§2). No gap was found that it
    alone fills.
-   Its login route is `/Server/Login/{accountId}/{password}`
    (`PraxisMapper/Controllers/ServerController.cs`, line 129): the password
    sits in the URL path, so nginx and Cloudflare would log it.
-   It is retired, so security fixes would be ours to make in a .NET codebase
    nothing else here uses.

**Ideas worth keeping:** Plus Codes as area keys (the Open Location Code
reference libraries are a smaller way to get them); classifying places by
kind for encounter rules. If encounters should depend on the kind of place,
read it from the extract we already host before adding a second
OpenStreetMap pipeline (which layers our extract carries is to be checked
then).

**Adoption record:** copied files: none. Dependencies: none.

## LocAR.js

An MIT library (version 0.2.12) that places three.js objects at
geographic positions over the camera image. Its one runtime dependency is
`three` (^0.181.0).

**Findings:**

-   The library makes no network requests (the only URLs in `lib/` are in
    comments).
-   It uses the camera (`lib/three/webcam.ts`, `getUserMedia`), continuous
    GPS while running (`lib/three/locar.ts`, `watchPosition`) and device
    orientation (`lib/three/device-orientation-controls.ts`), including the
    iOS permission request, which needs a user gesture.
-   The `LocAR` constructor takes an optional `serverLogger`, `null` by
    default, which when given sends every GPS fix (`/gps/new`), the start of
    tracking, the world origin and each placed object to a server. Blackout
    must never pass one; the integration should have a test that fails if it
    does.
-   The client does not use three.js today. AR should load only when someone
    opens it, so three.js stays out of the main bundle (CI runs a bundle-size
    check).

**Conditions for phase 5:** pin the release, record three.js's licence at
the pinned version, recheck maintenance, and test on physical devices.
`blackout-mobile/ios/` holds only a README and fastlane files (no Xcode
project), the mobile app has no Capacitor geolocation plugin, and the Android
manifest declares the camera but no location permission. Each is a native
task before AR or a native location check can ship. Camera consent must not
imply consent to upload footage or publish a location (game plan §5).

**Adoption record (proposed for phase 5):** dependency `locar` at a pinned
version, plus `three`; no copied files; attribution through the package
licences; maintainer: whoever owns the Coalition client; updates through the
normal dependency audit; rollback by removing the AR entry point, which the
map interaction does not depend on.

## Cross-cutting: WebAssembly and the CSP

While checking whether a Godot build could run in the client, this
evaluation found that the CSP in the repository's nginx configurations
(`infra/single-server-baseline/nginx/snippets/security-headers.conf` and
`infra/nginx/snippets/security-headers.conf`, `script-src 'self'`) stops
Chromium compiling WebAssembly. The web client already depends on
WebAssembly: matrix-js-sdk's `initRustCrypto` calls
`@matrix-org/matrix-sdk-crypto-wasm`'s `initAsync()`, which runs
`WebAssembly.instantiateStreaming`. Served under that policy, the web client
cannot start encryption (it fails closed rather than sending unencrypted).
The live site sent no CSP header when checked on 2026-11-21, so the problem
shows only once these configurations are deployed. The fix and its checks are
recorded in `docs/security/csp-webassembly-2026-11-21.md`.

## What phase 1 builds on

-   Encounters and collections as a TypeScript module over Coalition's
    existing places, communities and visibility rules; no second map, place
    store or account system.
-   Original companions and art, with sources and rights recorded; the
    operator decides how they are commissioned (game plan §6).
-   Eligibility checked on the device where possible; any server check sends a
    position once, in a request body, with consent, and keeps none (game plan
    §5, `docs/coalitions/GEOCACHING_DESIGN.md` §6).
-   Grants decided and recorded by the server, once per eligible event.
-   No stored movement history, no speed or distance rewards, and a way to
    take part without location.
-   The six open questions in the geocaching design stay open; nothing here
    answers them.
