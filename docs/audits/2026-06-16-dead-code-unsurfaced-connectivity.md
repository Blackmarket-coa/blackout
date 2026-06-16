# Dead Code, Unsurfaced Features & Connectivity Audit — 2026-06-16

- Scope: full repository at `/home/user/blackout` — every workspace, with the web
  client (`apps/blackout-client`) as the primary surface.
- Method: three parallel static-search passes (dead code/stale config; unsurfaced/
  half-wired features; disconnected links/routes), each finding verified against
  live code before inclusion; cross-referenced with `knip` (ad-hoc run),
  `tools/audit-navigation/`, and the existing `docs/audits/*` registers.
- Companion to `docs/audits/unfinished_items_review_2026_05.md` (which this audit
  partially supersedes — see §Corrections).

---

## 1. Executive summary

The codebase is healthy, but its **audit/tooling layer has drifted from the
actual source tree**, which both hides real cruft and produces false "all clear"
signals. The Element-fork source moved from a root `src/` (and a `_port/` mirror)
into `apps/blackout-client/src/app/...`; the move left a trail of stale pointers:

- a **dangling `scripts -> _port/scripts` symlink** (`_port/` no longer exists);
- a **`knip.ts`** whose every entry/ignore glob points at the vanished root
  `src/`/`res/`, and which is **not wired into CI** at all;
- a **`docs/unfinished-code-checklist.md`** that auto-generates from the missing
  root `src/`, so its headline "**Open items: 0**" is structurally true but
  uninformative;
- **~46 markdown docs** still cite `_port/...` evidence paths that don't resolve;
- several **CI workflows** that reference `scripts/*` files that no longer exist.

Because dead-code detection (`knip`) is miscalibrated, its raw output ("175
unused files", "22 unused deps") is **unreliable** and must not be actioned as-is.

Separately, three items the May-2026 registers list as deferred/TODO are **already
shipped** (§Corrections) — confirming the registers have gone stale.

The genuinely-unwired user-facing feature is the **Growth Engine** (backend +
client SDK shipped, no UI module/route). Most other "unsurfaced" features are
**intentionally flag-gated** staged rollouts that are enableable only by env var
today — the chosen remediation is to add an in-app (Labs) toggle surface.

---

## 2. Root-cause throughline

| Stale pointer | Evidence | Effect |
| --- | --- | --- |
| `scripts -> _port/scripts` | `_port/` absent at root | dangling symlink; `scripts/*` consumers broken |
| `knip.ts` globs | entries `src/serviceworker/index.ts`, `src/workers/*.worker.ts`, `res/decoder-ring/**`, … ; ignoreIssues `src/components/views/stego/**`, `src/steganography/*`, `src/services/crdt/*`, `src/p2p/peerManager.ts` — none exist | knip scans the wrong tree → false positives + missed dead code |
| `docs/unfinished-code-checklist.md` | "Auto-generated from … `src/` …"; root `src/` gone | "Open items: 0" is vacuous |
| ~46 docs cite `_port/...` | e.g. `docs/unfinished-code-priority-plan.md` "uc-006 evidence: `_port/src/components/structures/MessagePanel.tsx`" | broken evidence trail |

**Implication:** the repo's "0 open / all workstreams CLOSED" status cannot be
fully trusted against the current tree until the pointers are repaired.

---

## 3. Category A — Dead code / stale config

| # | Finding | Location | Disposition |
| --- | --- | --- | --- |
| A1 | Dangling `scripts` symlink (`-> _port/scripts`) | repo root | **Removed** this pass |
| A2 | `knip.ts` — every glob points at the vanished root `src/`/`res/`; not CI-wired (no root script/dep) | `knip.ts` | **Removed** this pass (see §6 for the re-enable alternative) |
| A3 | ~120 commented-out Jotai session lines | `apps/blackout-client/src/app/state/sessions.ts` (former L1-6, L41-44, L98-165) | **Removed** this pass (live exports kept) |
| A4 | Orphaned route constants `SPACE_SETTINGS_PATH` (`/space-settings/`), `ROOM_SETTINGS_PATH` (`/room-settings/`) — zero references | `apps/blackout-client/src/app/pages/paths.ts` | **Removed** this pass |
| A5 | Declared-but-unconsumed flags `logistics`, `legacyRoomSurfaceLayout` (no module, no reader, no env override) | `core/features/featureFlags.ts` (+ 3 test fixtures) | **Removed** this pass |
| A6 | CI workflows reference `scripts/*` paths that no longer resolve (resolved via the removed `_port` symlink); several are inherited Element-Web CI | `.github/workflows/build_develop.yml:37,40`, `docs.yml:46`, `security.yml:10`, `tracker-evidence-validation.yml:44` | **Triage follow-up** (not touched — CI risk) |
| A7 | `knip` raw output unreliable (stale config); e.g. it flags CI-used `load/k6/*.js` as unused | n/a | Do **not** action until knip is repointed or re-run on the real tree |
| A8 | Colocated `src/**/*.test.*` are **not in the `test:unit` CI gate** (`vitest run tests/unit` filters to that path), so e.g. `features/growth/ReferralBreakdown.test.tsx` never runs in CI | client `vitest.config.ts` + `web:test` | **Triage follow-up**; new growth/platform tests were placed under `tests/unit/**` to stay in the gate |

**Reclassified (NOT dead):** the root `package.json:17` `web:test:mobile` script
targets `legacy/blackout-web` (archived), but the legacy package ships a working
`test:mobile` (`vitest run tests/mobile`) and **`.github/workflows/
mobile_contract_tests.yml:42` runs it**. It is a live CI entry point — **left
in place**.

---

## 4. Category B — Unsurfaced / half-wired features

### B1. Genuinely unwired
- **Growth Engine** — backend (`packages/api/src/services/growth.ts`) + client
  wrappers (`apps/blackout-client/src/app/features/growth/growthClient.ts`,
  `ReferralBreakdown.tsx`) shipped; `growth/index.ts` states *"No
  features-registry feature is registered yet — UI ships in a follow-up."* **No
  module, no route, no nav.** → build a `growthFeature` (Phase 3.1).
- **`moderation`** — registered in `coreModules.ts` (flag `moderation`) but the
  flag defaults `false` with **no `BLACKOUT_MODERATION` env override** in
  `resolveFeatureFlags` → no non-beta enable path. → add the override (Phase 3.2).

### B2. Intentionally flag-gated (staged; env-var-only today)
Complete features gated by boot flags defaulting OFF, with **no in-app toggle**:
`stegoToolkit` (routes `/stego/channels`), `topics` (`/topics`), inline home-feed
flags `homeFeedSegments`/`homeStreak`/`homeBountyBoard`/`seriesTag`,
`transparencyReports`, and others in `defaultFeatureFlags`. Working as designed —
remediation is to **surface them via a Labs toggle** (Phase 2), not to change
defaults.

### B3. Intentional stubs (leave as-is, documented)
Marketplace placeholder providers Blamazon / MayhemMarketplaze / AntinAmazon
(`packages/api/src/integrations/marketplace/*`) — registered but return empty
catalogs / throw on checkout; default disabled. Documented in
`KNOWN_LIMITATIONS.md`.

---

## 5. Category C — Disconnected links / routes

- **No literal dead links** (`href="#"`, empty `onClick`/`onPress`) — the app
  uses React Router cleanly. (Verified by search.)
- **Orphaned route constants** `SPACE_SETTINGS_PATH`, `ROOM_SETTINGS_PATH` — see
  A4 (removed).
- **Feature-gated routes** (`/stego/channels`, `/topics`, home-feed) only mount
  when their flag is on — same set as B2; addressed by the Labs toggle.
- **Notification tap → room routing** — implemented (see Corrections); the gap is
  **test coverage**, not connectivity.
- Note: `HOME_CREATE_PATH`/`HOME_JOIN_PATH` and `getHome{Create,Join,Search}Path`
  were initially flagged as orphaned but are **consumed** by
  `hooks/router/useHomeSelected.ts` — **not** dead.

---

## 6. Corrections to prior registers (verified already-shipped)

The May-2026 registers (`KNOWN_LIMITATIONS.md`, `unfinished_items_review_2026_05
.md`) list these as deferred/TODO; live code shows them **done**:

| Item | Register says | Reality |
| --- | --- | --- |
| Composer native `pickPhoto` (T4-04 carry) | "call-site swap remains" | Wired — `features/room/attachments/useAttachPhoto.ts` branches native→`pickPhotoAttachment`, mounted in `MessageComposer.tsx`, **and already covered** by `tests/unit/features/room/attachments/useAttachPhoto.test.tsx`. No action. |
| Livestream den chat overlay (T2-02) | "deferred; deep-link interim; needs `StreamRecord.den_id`" | `denId` landed; `features/streams/LivestreamViewer.tsx:306` mounts `<EmbeddedDenChatLazy denId={stream.denId}/>`. The cited "TODO L134" is gone. |
| Notification tap → room routing | "no end-to-end routing tested" | Routing implemented in `NativeBridgeListener.tsx:22-25` (`notification_interacted` / `deep_link_opened`). Only test-harness coverage is missing. |

`KNOWN_LIMITATIONS.md` has been updated to reflect these (den chat + notification routing).

---

## 7. Actions taken (completed)

**Phase 1 — cleanups (behavior-neutral):** deleted the dangling `scripts`
symlink and orphaned `knip.ts`; stripped the dead commented Jotai block in
`state/sessions.ts`; removed `SPACE_SETTINGS_PATH`/`ROOM_SETTINGS_PATH` and the
unconsumed `logistics`/`legacyRoomSurfaceLayout` flags (+ 3 test fixtures).
Reclassified `web:test:mobile` as live CI (kept). A6/A8 + `_port/` doc sweep
logged as follow-ups.

**Phase 2 — in-app feature toggles.** New `effectiveFlags.ts`
(`USER_TOGGLEABLE_FLAGS` allowlist = the security boundary; `resolveEffectiveFlags`)
and `flagOverrides.ts` (the `(account, labs)` settings-bucket ↔
`capabilityContextAtom` bridge + `wrapLabsFetcherWithFlags`). The Labs tab now
lists the staged flags (`stegoToolkit`, `topics`, home-feed extras,
`transparencyReports`); toggles persist per-user and apply live (the router
already rebuilds on `flags`). Capability/dev hydration now preserves atom flags
so overrides aren't clobbered. `LabsPage.tsx` unchanged.

**Phase 3 — wire/close gaps.**
- 3.1 Growth Engine UI: `growthReferralsFeature`/`growthAmbassadorsFeature`/
  `growthQuestsFeature` (referrals/ambassador/quests routes under `/growth/*`),
  registered in `coreModules.ts` + `featureModuleManifest`; `growth/index.ts`
  comment corrected. Gated by the existing `growth*` flags (env `BLACKOUT_GROWTH_*`)
  + `growth.read`.
- 3.2 `moderation`: added the `BLACKOUT_MODERATION` enable path (env/admin only,
  not in the user allowlist).
- 3.4/3.5: added `NativeBridgeListener` routing test; corrected
  `KNOWN_LIMITATIONS.md`. 3.3 (pickPhoto) already covered — no change.
- 3.6 Playbook Q1 SVGs — **still blocked** on design asset delivery.

All phases: client `tsc --noEmit` clean; `guard:feature-registry`,
`guard:feature-budget`, `guard:duplicate-paths` green; new + existing unit suites
pass. Each phase is a separate commit.

---

## 8. Follow-ups (not done here)

- **A6** — triage the inherited Element-Web workflows referencing missing
  `scripts/*` paths.
- **A8** — relocate colocated `src/**` tests into the `test:unit` gate (or
  broaden the gate).
- **`_port/` doc sweep** — ~46 docs cite vanished `_port/...` paths (exclude
  historical changelogs).
- **knip** — either keep deleted, or re-enable properly:

Re-enable-knip alternative (instead of deletion): add a `apps/blackout-client`
workspace block pointing `entry` at `src/main.tsx`, repoint `ignoreIssues` to the
real `src/app/features/*` homes, add `knip` as a devDependency + root script +
CI gate. More work; deferred per the approved plan (chose deletion).

---

## 9. Verification

- `pnpm --filter @blackout/client typecheck` (`tsc --noEmit`) — confirms no
  production consumer of the removed flags/constants.
- `pnpm --filter @blackout/client test:unit` — confirms the three edited fixtures
  and the broader client suite pass.
- `node tools/ci/check-duplicate-paths.mjs` — confirms `paths.ts` invariants.
- `git status` — confirms only intended files changed.
