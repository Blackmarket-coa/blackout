# Blackout Coalition game: open-source reuse and creator-built exploration

**Updated:** November 21, 2026

**Status:** Accepted planning direction; implementation, upstream code adoption, and native release verification remain future work. This update adds documentation, not a working game or imported dependencies.

**Companions:** [App plan](BLACKOUT_APP_PLAN.md) · [Creator economy and delivery requirements](BLACKOUT_CREATOR_ECONOMY.md) · [Coalition geocaching design](../coalitions/GEOCACHING_DESIGN.md) · [Mobile build guide](../../mobile-application-build-guide.md)

## 1. Direction

Add an original location-based collection and cooperative exploration game to Coalition. Players discover companions, complete quests, visit participating places, and work with communities toward shared objectives. Community members help create the world and can sell supported original digital additions through the existing creator marketplace.

Use Coalition's current map, place/area model, identity, membership, and coordination services as the foundation. Evaluate Pokemon Walk for reusable encounter, collection, battle, raid, and progression systems; evaluate PraxisMapper only for demonstrated gaps in game geospatial services; use LocAR.js as the candidate for an optional camera-based AR experience.

Start with one complete map encounter and collection journey. Add cooperative objectives and creator-made packs in verified slices. AR follows the working map game and remains optional. A project being open source does not establish that it can be embedded in the current client unchanged.

## 2. Open-source candidates and adoption boundaries

The following findings were reviewed on November 21, 2026. Pin exact upstream revisions, inspect included dependencies/assets, and recheck maintenance status before importing code.

| Project      | Source and role                                                                                                                                                                                                                                                         | Reuse decision                                                                                                                                                            | Maintenance and integration boundary                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pokemon Walk | [Repository](https://github.com/PraxisMapper/PokemonWalk), [author's release page](https://cerol.itch.io/pokemon-walk), [license](https://github.com/PraxisMapper/PokemonWalk/blob/main/LICENSE). MIT-licensed Godot game source; published HTML5 and Android versions. | Evaluate encounter, collecting, battle, raid, companion, and place-based progression code. Port selected systems or maintain a limited fork after a prototype comparison. | Repository archived September 8, 2026. Adoption makes maintenance our responsibility. Godot embedding, exports, browser/native performance, save behavior, and iOS support require testing. |
| PraxisMapper | [Repository and retirement notice](https://github.com/PraxisMapper/PraxisMapper), [license](https://github.com/PraxisMapper/PraxisMapper/blob/master/LICENSE). Apache-2.0 C#/.NET location-game backend using OpenStreetMap.                                            | Evaluate spatial game interactions and reusable algorithms against current Coalition capabilities. Add a service only if the gap justifies it.                            | Retired/archived in September 2026. Do not introduce duplicate place records, map infrastructure, accounts, or inventory authorities merely to reuse the demo stack.                        |
| LocAR.js     | [Repository](https://github.com/AR-js-org/locar.js), [license](https://github.com/AR-js-org/locar.js/blob/master/LICENSE), [AR.js documentation](https://ar-js-org.github.io/AR.js-Docs/). MIT-licensed browser location-based AR library.                              | Candidate optional rendering layer for encounters and objects anchored to known geographic places.                                                                        | This is an AR library, not a complete game. Its documented iOS/Android browser support does not prove compatibility with our Capacitor shell, device sensors, or every browser.             |

Pokemon Walk's author explicitly describes the Pokemon material as fan art. Reuse reviewed licensed code with its required notices; create or obtain appropriate rights for all distributed creatures, names, art, sounds, text, models, animations, and fonts separately. A code license is not a blanket license for Pokemon or other third-party content. Keep applicable map-data attribution and licensing requirements separate from software and asset licenses.

Record an adoption decision per component: upstream revision, copied files, source/dependency licenses, attribution, asset replacements, modifications, maintainer, security/update process, and rollback. Do not report any of the candidates as installed or integrated until the corresponding change is delivered and verified.

## 3. Player experience within simple navigation

The game lives in **Coalition**, within the four-destination app plan. It does not add another global tab or a deep chain of game subtabs.

| Entry                | Experience                                                                                   | Contextual action                                       |
| -------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Coalition map/list   | Toggle a gameplay layer showing eligible encounters, hunts, quests, and participating places | Open an encounter or activity card                      |
| Encounter card       | Show the companion/object, eligibility, and what confirmation is required                    | Start an encounter or confirm a find                    |
| Encounter view       | Complete the supported interaction and see the actual result                                 | Collect, retry when appropriate, or return to the map   |
| Collection tool      | Search/filter owned companions, cosmetic variants, and collection progress                   | Inspect or equip a companion                            |
| Quest/project detail | Show steps, collaborators, contribution roles, and shared progress                           | Join, contribute, or claim an eligible confirmed reward |
| Place/event detail   | Show the activity available at that consenting venue and relevant time                       | Participate, RSVP, or open a quest                      |
| Your groups          | Show cooperative objectives in the selected community                                        | Continue a group hunt or project                        |
| You                  | Show chosen companion appearance, earned badges, and optional public achievements            | Customize or open the relevant record                   |

Keep one local selector at most. Place inventory, collection, quest-management, and creator tools in the existing searchable toolbag or relevant item detail. Preserve map filters, selection, scroll, and return context after an encounter. AR opens from the same encounter and returns to it; declining camera access leaves the map interaction usable.

Use original companions and worldbuilding associated with the BMC ecosystem. Local ecology, art, history, and community projects are possible themes, not claims that real species observations are scientifically verified. Support nonlocation and remote contribution paths for people who cannot travel or choose not to share location.

## 4. Gameplay and progression

-   **Collection:** original companions, discoveries, badges, and optional visual variants.
-   **Exploration:** approved public places, selected areas, events, geocaches, and reusable hunts.
-   **Cooperation:** shared challenges with roles for exploring, organizing, teaching, documenting, designing, and testing.
-   **Encounters and raids:** evaluate reusable upstream mechanics, then define our own rules and completion conditions. Do not assume the upstream game provides persistent multiplayer or a server-authoritative reward system.
-   **Learning:** small activities can lead into useful guides, learning trails, or relevant community projects.
-   **Character expression:** companion appearance and earned achievements are chosen by the user and can remain private.

Preserve the existing geocaching decisions and `packages/blackout-protocol/src/gamification/banlist.ts`: no streak mechanics, manufactured urgency, or guilt notifications; comparisons and leaderboards are opt-in. Gameplay XP, collection counts, and game purchases stay in a play ledger separate from the reputation that gates Coalition membership or governance. A genuine community contribution may qualify under its own verified contribution rules; a game find alone cannot bypass admission requirements or buy voting power.

## 5. Consent, visibility, and find confirmation

Reuse the [geocaching design](../coalitions/GEOCACHING_DESIGN.md) rather than replacing its consent and audience model. Public, group-private, and direct activities preserve their corresponding visibility and encryption requirements. Public places are game locations; people are not public moving markers.

-   Location use is opt-in with a clear explanation of what is collected, who can see it, retention, and how to stop.
-   For placed caches/hunts, code-at-the-spot remains the default confirmation option. GPS check-in is an explicit alternative with a one-use check and no retained precise position under the existing design.
-   For a location-based encounter, evaluate eligibility on-device where possible; if server verification is needed, request explicit consent for that bounded check. Do not introduce continuous server-side position tracking or background movement histories.
-   GPS proximity is an imperfect signal and can be spoofed; it is not strong proof of physical presence. Define tolerances, failures, retry behavior, and nonlocation alternatives before rewards depend on it.
-   Preserve placement exclusions, reporting, moderation, delayed public cache publication, private meeting-place controls, and media metadata rules from the geocaching plan. Unresolved policy values in that plan remain unresolved; this addition does not silently choose them.
-   Game telemetry, analytics, URLs, logs, sponsor reporting, and creator metrics must not expose a player's precise current location or private group activity.

AR adds a camera permission and device-orientation dependency. Explain those at the point of use; do not make AR consent imply permission to upload camera footage or publish a location. Test GPS drift, weak signal, orientation calibration, denied permissions, and leaving the app.

## 6. Creator-made world and digital products

Creators can contribute original art, sound, writing, game content, templates, and tools. Art direction, asset specifications, preview tools, versioning, moderation, and compatible runtime formats need definition before a marketplace label implies a working installation.

| Creator output                                              | Candidate catalogue path                                                                    | Prompt and workflow                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Original creature artwork, models, animations, or sounds    | Existing asset-bundle / sound-pack foundations; gameplay-specific manifest still needed     | Create an original companion pack → preview → confirm rights → test compatibility → submit |
| Cosmetic companion variants, character accessories, effects | Cosmetic / asset-bundle foundations; equip integration requires implementation              | Design a cosmetic pack → preview it on a supported character → submit                      |
| Questlines, hunts, learning trails, event packs             | Evaluate community-template, downloadable content, or a new validated game-content artifact | Turn a completed activity into a reusable pack → remove private data → test → submit       |
| Game UI and themed presentation                             | Theme / approved declarative-plugin foundations                                             | Customize a game surface → export a reusable template → preview → submit                   |
| Specialized creator/game tools                              | Sandboxed plugin foundations                                                                | Build a supported tool → validate manifest/capabilities → review → publish                 |
| Commissioned community content                              | Bounty / commissioned-work foundations                                                      | Respond to an explicit request → agree scope/rights/payment → deliver → record acceptance  |

Original companion designs are game assets; AI personas remain excluded from sale. Do not relabel an unsupported game pack as an existing product type merely to get it through checkout. Prefer declarative content packs for user-created gameplay; executable extensions retain sandbox, permission, and supported-distribution requirements.

Prompts belong in the existing Create, Studio, marketplace, and contextual completion surfaces:

-   Empty creator collection: **Design your first original companion pack.** Open a supported editor/template only once it exists.
-   Own completed hunt or learning activity: **Make a reusable quest pack.** Export selected original content with private data removed.
-   An explicit community request: **Help make this world.** Open its actual bounty, scope, and acceptance criteria.
-   A tested pack: **Share it free or sell a copy.** Show deliverables, supported versions, rights, price, fees, and audience before submission.
-   An accepted contribution or actual sale: **See your contribution.** Link to the real work, outcome, and earnings state.

These game-specific prompts are planned; the current generic download/asset/guide prompts do not establish that game editors, asset validation, or pack installation are ready.

## 7. Commerce and integration contracts

Use the existing service boundaries and canonical IDs. Create explicit game contracts before connecting paid content or valuable rewards.

| Responsibility                         | Owner / required contract                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Places, areas, communities, visibility | Coalition's existing records and authorization; game activities reference stable place/community IDs                                                   |
| Encounter and quest rules              | Blackout game module: versioned definitions, eligibility, permitted actions, completion, failure, and expiry rules                                     |
| Collections and progress               | Owner-scoped durable game records with server validation where needed; idempotent grants and no client-selected arbitrary XP or items                  |
| Cooperative objectives                 | Existing objective/task/event services where suitable, with explicit per-user contribution and shared-total contracts                                  |
| Public/group-private/direct activity   | Existing membership, consent, and encrypted-room boundaries; a public game API must not read private encrypted content                                 |
| Rendering                              | Coalition map/list and optional LocAR renderer share the same eligible activity IDs                                                                    |
| Creator packs                          | Versioned manifest, author/license metadata, previews, compatibility, content validation, moderation/review, and actual asset delivery                 |
| Purchases and ownership                | FBM-priced listing → verified payment/webhook → entitlement → compatible signed game-content bundle; keep game progress distinct from purchase records |
| Seller income                          | Canonical FBM order/fee/payout state and supported split agreements; distinguish pending earnings from settled payment                                 |
| Sponsored rewards                      | Disclosed sponsor terms, funded inventory/budget, eligible completion evidence, and actual FBM coupon/good delivery                                    |

Native enhancements and supported content packs are one-time purchases. Hosted storage follows its separately defined terms. Cosmetic purchases cannot buy contribution rank, extra Coliseum votes, or community authority. Game points are not cash or redeemable credit unless a separately specified and verified reward flow explicitly grants an actual entitlement or credit.

Preserve processing-fees-first and the flat 3% coalition commission on FBM sales; do not add a duplicate Blackout transaction cut. Sponsored events, learning activities, and cooperative challenges can fund creators or communities without injecting paid ranking into chronological Circle/Reach.

The [creator-economy wiring review](BLACKOUT_CREATOR_ECONOMY.md#5-wiring-review-and-release-blockers) still applies: production listing creation currently sends metadata only, durable wizard resume and general content-to-offer association remain gaps, and actual file delivery/settlement must be proven. A purchased game-pack listing is not a working game installation until its bytes, version, entitlement, and runtime application are all verified.

## 8. Phased delivery and acceptance

| Phase                      | Deliverable                                                                                                                              | Acceptance evidence                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Reuse evaluation        | Pin and inspect the three candidates, compare selective ports with Godot embedding, identify licensing/asset work and maintenance owners | Written adoption decision; dependency inventory; original asset plan; no duplicate infrastructure introduced by default                                                            |
| 1. One Coalition encounter | Eligible game layer → encounter → original companion → owned collection → return to map                                                  | Works with existing identity/permissions; no extra global tab; durable ownership; retries cannot duplicate grants; declined location has a clear alternative                       |
| 2. Cooperative activity    | One group hunt/quest or challenge linked to an event/place                                                                               | Correct membership and consent; shared progress; suitable individual credit; play XP does not affect admission or governance                                                       |
| 3. Creator contribution    | One original asset or declarative quest pack authored, previewed, tested, reviewed, and installed                                        | Authorship/rights, manifest compatibility, safe export, versioning, and permissions validated; no unsupported paid promises                                                        |
| 4. Real commerce           | A creator sells that supported pack; a different buyer receives and applies the correct version                                          | Real FBM checkout, webhook idempotency, signed delivery, library reopening, refund behavior, and seller settlement verified; earlier creator-economy blockers closed for this path |
| 5. Optional AR             | Render an eligible encounter using LocAR.js and return to its map/detail                                                                 | Physical iOS/Android and supported Capacitor/browser checks; camera/sensor denial, orientation/GPS drift, performance, and no footage/location leakage                             |
| 6. Expanded world          | Additional original companions, locations, quests, sponsored rewards, and community content                                              | Operational capacity, moderation, authoring quality, reward delivery, maintenance, and rollback validated before expanding                                                         |

Track successful encounters, useful completed quests, cooperation, accepted creator content, correct asset delivery, and creator/community benefit. Do not optimize streaks, location retention, compulsory travel, or time spent holding the camera open. Existing security, native-release, and operational gates remain in force.
