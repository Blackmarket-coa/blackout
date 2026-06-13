# OSS Manifest → Free / Tiered / Plugin Packaging

This document classifies every entry in the Blackout OSS manifest into one of
three packaging buckets, mapped onto Blackout's **existing** mechanisms rather
than new ones:

- **free** — base client / `free` entitlement tier. Baseline privacy primitives
  that ship on for everyone. (Per `docs/tiered_packaging_operational_fit.md`,
  trust-critical primitives stay active by default at platform level.)
- **tiered** — gated behind a paid tier. Named with the real vocabulary:
  entitlement tiers `pro | team | enterprise`
  (`packages/blackout-protocol/src/entitlements/types.ts`) and/or product tiers
  `Starter | Governance | Sovereignty`.
- **plugin** — delivered as an opt-in feature-plugin via the registry
  (`apps/blackout-client/src/app/core/features/manifest.ts` +
  `features/<name>/manifest.ts`). A plugin can itself be free or paid — noted
  per row.

A plugin can also be tiered (e.g. a Sovereignty-tier capability delivered as a
plugin), so rows carry a primary bucket plus the tier/flag detail.

### Legend
- **Role** (from the manifest): `fork`, `lib` (library/dep), `ref` (design
  reference — **no stub**), `greenfield`.
- **Bucket**: `free`, `tiered:<tier>`, `plugin`.
- Rows marked **ref** are design-reference-only: studied for patterns, not
  shipped, and not given flags/registry rows.

---

## 1. Tier → bucket mapping

| Bucket | Where it lives | Default state |
|---|---|---|
| free | base client; `free` entitlement; `presetPolicy.baseline_matrix`/`community_plus` | on for everyone |
| plugin (free) | feature-plugin registry; flag default-off | opt-in, no charge |
| tiered `pro` | entitlement key true at `pro`+ | paid upgrade |
| tiered `team` / Governance | entitlement true at `team`+; product tier Governance | paid, org-scope |
| tiered `enterprise` / Sovereignty | entitlement true at `enterprise`; product tier Sovereignty | paid, infra/jurisdiction-scope |

---

## 2. Classification table (by manifest area)

### Foundation (already in Blackout)
| Item | Role | Bucket | Rationale |
|---|---|---|---|
| Cinny (frontend fork) | fork | free | Base client — the product itself. |
| Element Web (secondary fork) | fork | free | Base client lineage. |
| Synapse (homeserver fork) | fork | free / tiered:Sovereignty (self-host) | Managed = free; self-hosting it = Sovereignty. |
| folds (component library) | lib | free | Shared UI primitive. |
| matrix-js-sdk | lib | free | Core transport/state client. |

### Visibility / detection → **G1 Shield/Visibility** (plugin, free)
| Item | Role | Bucket | Rationale |
|---|---|---|---|
| uBlock Origin (lists/engine) | fork/lib (GPLv3) | plugin (free) | Detection is baseline ethos; GPLv3 → isolate, see §4. |
| EasyList / EasyPrivacy / Disconnect.me | lib | plugin (free) | Tracker lists feed the shield engine. |
| Privacy Badger (heuristics) | fork (LGPL) | plugin (free) | Heuristic tracker detection. |
| CanvasBlocker (fingerprint detection) | ref (MPL 2.0) | plugin (free) | Pattern reference for fingerprint surfacing. |
| Trace (fingerprint detection) | ref (MIT) | plugin (free) | Pattern reference. |
| Session-replay signature list | greenfield | plugin (free) | Detector list for Hotjar/FullStory/etc. |
| Form-exfil-before-submit warning | greenfield | plugin (free) | Princeton "No boundaries" as **ref**. |
| Pixel / web-bug surfacing | (covered by uBO+EasyPrivacy) | plugin (free) | Folded into shield lists. |

### Hardening → **G2 Privacy Hardening** (plugin; basic free, advanced tiered:`pro`) + free baseline
| Item | Role | Bucket | Rationale |
|---|---|---|---|
| Consent-O-Matic (cookie reject) | fork (MIT) | plugin (free) | Baseline consent hygiene. |
| Cookie AutoDelete | fork (MIT) | plugin (free) | Per-domain cleanup. |
| ClearURLs (param stripping + msg filter) | lib (LGPL) | free | Outbound message-pipeline filter — baseline. |
| arkenfox user.js (hardened defaults) | ref (MIT) | free | Reference for hardened web-client defaults. |
| dnscrypt-proxy (encrypted DNS) | lib (ISC) | tiered:`pro` | Advanced anonymity transport. |
| exifr / piexifjs (client EXIF scrub) | lib (MIT) | free | Metadata scrub is a baseline (G10). |
| exiftool (server scrub backstop) | lib (GPL) | free | Server-side baseline; GPL kept server-side. |
| Webcam/mic permission audit | greenfield | plugin (free) | Surfaced in shield/hardening UI. |
| Tor / Snowflake transport | fork/lib (BSD) | tiered:`pro` | Advanced per-user anonymity. |
| Fingerprint randomization | greenfield | tiered:`pro` | Advanced hardening. |
| Image perturbation (Fawkes-class) | ref | tiered:`pro` | Ship our own `perturbationClient`; Fawkes is **ref** (§4). |

### Identity layer → **G3 Personas/Identity** (plugin; 1 burner free, roster tiered:`pro`)
| Item | Role | Bucket | Rationale |
|---|---|---|---|
| Bitwarden (vault/sync/autofill arch) | fork (GPLv3) | tiered:`pro` (basic vault free) | Vault exists (`vault/`); advanced = pro. GPLv3 → isolate. |
| Firefox Multi-Account Containers | ref (MPL 2.0) | plugin | Container-per-persona pattern. |
| Mullvad account-number signup | ref | free | Onboarding pattern, not code. |
| Magic Wormhole (PAKE onboarding) | lib (MIT) | free | Contact onboarding primitive. |
| matrix-js-sdk account/key mgmt | lib | free | Core identity primitive. |
| Per-conversation alias derivation | greenfield | plugin (free) | HKDF from member keys. |
| Burner identity flow | greenfield | free (single) / tiered:`pro` (roster) | One burner free; roster = `PERSONA_QUOTAS`. |
| Cwtch no-persistent-identity mode | ref (MIT) | plugin | Reference for ephemeral identity. |
| Coalition-shared persona pool | greenfield | tiered:`team`/Governance | Governed shared state (Matrix room). |

### Persona engine → **G3** (tiered:`pro`)
| Item | Role | Bucket | Rationale |
|---|---|---|---|
| Faker.js (synthetic data) | lib (MIT) | tiered:`pro` | Synthetic persona data. |
| Ollama (local LLM bios) | lib (MIT) | tiered:`pro` | Local/hosted bio generation. |
| SimpleLogin (email aliases) | lib | tiered:`pro` | Self-hosted alias provider; verify license. |
| addy.io (alias provider) | lib (MIT) | tiered:`pro` | Alt alias provider. |
| Privacy.com (virtual cards) | lib (closed API) | tiered:`team`/`enterprise` | API integration only. |

### Network / federation → **G7 Federation Policy** (tiered:`enterprise`/Sovereignty)
| Item | Role | Bucket | Rationale |
|---|---|---|---|
| Tor onion service for Synapse | lib (BSD) | tiered:Sovereignty | Federation transport / self-host. |
| Synapse Tor integration | fork | tiered:Sovereignty | Extend partial support. |
| WireGuard (coalition exit nodes) | lib (GPLv2/BSD/MIT) | tiered:Sovereignty | Tunnel mechanics. |
| Nym (mixnet cover traffic) | ref (Apache) | tiered:Sovereignty | Cover-traffic reference. |
| Loopix paper | ref | — | Protocol design reference. |
| I2P / Lokinet / Hyphanet | ref | — | Anonymous routing references. |
| Matrix Federation Tester | ref (Apache) | free | Server-check reference. |
| Federation trust web | greenfield | tiered:Sovereignty | Governance room as source of truth. |
| Federation tarpitting | greenfield | tiered:Sovereignty | Synapse module; defensive only (§4). |
| Federation honeypot canaries | greenfield | tiered:Sovereignty | Synapse module. |
| Pinecone / dendrite-p2p | ref (Apache) | — | P2P Matrix research. |

### Mobile / mesh transport → **G6 Mesh/Offline Transport** (plugin, tiered:`enterprise`/Sovereignty)
| Item | Role | Bucket | Rationale |
|---|---|---|---|
| Blokada (local-VPN fork target) | fork (MPL 2.0) | tiered:Sovereignty | Mobile local-VPN. |
| RethinkDNS (local-VPN + WG) | fork (Apache) | tiered:Sovereignty | Alt fork target. |
| NetGuard / AdGuard / AdGuard Home / Pi-hole | ref (GPLv3/EUPL) | — | Firewall/DNS-filter references. |
| Briar (offline mesh) | ref/lib (GPLv3) | tiered:Sovereignty | Mesh transport; GPLv3 → isolate (§4). |
| Bramble (Briar protocol) | ref (GPLv3) | — | Store-and-forward reference. |
| Meshtastic (LoRa bridge) | lib (GPLv3) | tiered:Sovereignty | Bridge to agricultural mesh work. |

### Active defense / poison the well → **G5 Active Defense** (panic free; rest tiered:`enterprise`/Sovereignty)
| Item | Role | Bucket | Rationale |
|---|---|---|---|
| Panic wipe / duress codes | greenfield | free | Personal-safety baseline (`panic/`). |
| Honeypot / canary tokens | greenfield | tiered:`enterprise` | Defensive deception, admin-gated. |
| Decoy data generation | greenfield | tiered:`enterprise` | Defensive only. |
| TrackMeNot (search decoys) | ref (GPLv2) | — | **ref** — see ethics §4. |
| AdNauseam (ad poisoning) | ref (GPLv3) | — | **ref only** — ToS/ethics (§4). |
| Fawkes (face perturbation) | ref (BSD non-comm) | — | **ref** — non-commercial license. |
| Glaze / Nightshade (art poisoning) | ref (research) | — | **ref** — verify rights. |
| Tracker tarpitting | greenfield | tiered:`enterprise` | Defensive/local only (§4). |
| Session-replay phantoming | greenfield | tiered:`enterprise` | Defensive. |
| Recommender scrambling | greenfield | plugin | Privacy decoy. |
| Consent-survey decoy fill | greenfield | plugin | Privacy decoy. |

### Right-to-deletion / honeypot intelligence → **G4** (self free; org-wide tiered:`enterprise`/Governance)
| Item | Role | Bucket | Rationale |
|---|---|---|---|
| Optery / Incogni / Mine / DeleteMe / Leave Me Alone / Cleanfox | ref (closed) | — | Commercial references. |
| RFC 8058 (list-unsubscribe) | ref | — | Protocol reference. |
| Broker list registry | greenfield | free | Public lists. |
| SAR/GDPR/CCPA/CPRA templates | greenfield | free | Legal baseline. |
| Automated request submission engine | greenfield | tiered:`pro` | Power-user automation. |
| Per-signup canary tracking | greenfield | tiered:`pro` | Consumes alias provider. |
| Personal leak dashboard | greenfield | free | Self-transparency baseline. |
| Coalition-shared canary intelligence | greenfield | tiered:`team`/Governance | Shared governed state. |
| Public broker leak index | greenfield | free | Public good. |

### Content / file features → **G10** (EXIF free; stego existing plugin)
| Item | Role | Bucket | Rationale |
|---|---|---|---|
| OnionShare (ephemeral file-drop) | ref (GPLv3) | plugin | Pattern for deaddrop file-drop. |
| Fawkes sidecar | ref | tiered:`pro` | See G2/§4. |
| File perturbation pipeline | greenfield | tiered:`pro` | Wraps our perturbation client. |
| Steganographic cover channels | greenfield | existing plugin (`stegoToolkit`) | Builds on shipped stego toolkit. |

### Governance / coalition layer → **G8** (tiered:Governance)
| Item | Role | Bucket | Rationale |
|---|---|---|---|
| `packages/governance/` | (existing) | tiered:Governance | Already in Blackout. |
| Coordinated key rotation on compromise | greenfield | tiered:Governance | Integrates with megolm. |
| Federated right-to-deletion / coalition forget | greenfield | tiered:Governance | Group-key burn. |
| Honeypot rooms | greenfield | tiered:`enterprise`/Sovereignty | Defensive (§4). |
| Trust web schema | greenfield | tiered:Sovereignty | See G7. |
| Coalition exit node registry | greenfield | tiered:Sovereignty | Matrix room. |
| Coalition Credits ledger | (existing plan) | tiered:Governance | Stellar/USDC plan. |

### Transparency layer → **G9** (free; org export Governance)
| Item | Role | Bucket | Rationale |
|---|---|---|---|
| "What's stored about me" view | greenfield | free | Synapse admin API wrapper. |
| Threat model documentation | greenfield | free | Writing, not code. |
| Public infrastructure transparency | greenfield | free | Trust primitive. |
| Reproducible build pipeline | greenfield + off-the-shelf (Nix/Bazel) | free | Build config. |
| Quarterly transparency report | greenfield | free / Governance (org export) | Trust mechanism. |

### Commercial-release infrastructure → **G11** (tiered:`enterprise`)
| Item | Role | Bucket | Rationale |
|---|---|---|---|
| Foxi theme (marketing site) | fork (MIT) | free | Marketing, not product. |
| Stripe SDK (ACH/card) | lib (proprietary) | tiered (billing) | Payment rail for paid tiers. |
| Stellar SDK + USDC | (existing plan) | tiered (billing) | Coalition Credits rail. |
| Keygen.sh (license enforcement) | lib (SaaS) | tiered:`enterprise` | Paid-tier enforcement. |
| Privacy policy / ToS | greenfield | free | Writing, not code. |

---

## 3. Plugin groups (summary)

| Group | Bucket | Anchor dir | Flag |
|---|---|---|---|
| Baseline | free | `metadata-privacy/`, `data-deletion/`, `data-transparency/` | (always on) |
| G1 Shield/Visibility | plugin (free) | `privacy-tools/` | `shieldVisibility` |
| G2 Privacy Hardening | plugin, tiered:`pro` | `privacy-tools/`, `vault/` | `privacyHardening` |
| G3 Personas/Identity | plugin, tiered:`pro` | `burner-identity/` | `personaEngine` |
| G4 Right-to-Deletion | free / tiered:`enterprise`+Governance | `data-deletion/`, `compost/` | (baseline + entitlement) |
| G5 Active Defense | free (panic) / tiered:`enterprise`+Sovereignty | `panic/` | `activeDefense` |
| G6 Mesh/Offline Transport | plugin, tiered:`enterprise`+Sovereignty | — (greenfield) | `meshTransport` |
| G7 Federation Policy | tiered:`enterprise`+Sovereignty | `federated-ops/`, `federation-selfhost/` | existing |
| G8 Governance/Coalition | tiered:Governance | `governance/`, `coalition/` | existing |
| G9 Transparency/Canary | plugin (free); org export Governance | `data-transparency/` | `transparencyReports` |
| G10 Content/File Hardening | free (EXIF) / existing plugin (stego) | `stego-toolkit/`, `metadata-privacy/` | existing `stegoToolkit` |
| G11 Commercial-Release Ops | tiered:`enterprise` | `platform-ops/`, `monetization*` | existing |

---

## 4. Licensing & ethics caveats

- **GPLv3 (uBlock Origin, AdNauseam, Briar):** cannot be statically linked into
  the MIT/Apache-licensed client. Integrate as a separate process / WASM sandbox
  / filter-list data only, or reimplement. Treat as isolated `lib`, not `fork`.
- **AGPL server tooling:** network-use copyleft — keep server-side and document
  the source-offer. Fine for self-host (Sovereignty); flag for any managed
  offering.
- **Fawkes / Glaze / Nightshade:** research / non-commercial licenses →
  **design-reference-only**. Ship our own `perturbationClient.ts` (already in
  `privacy-tools/`).
- **Active defense:** ship only **defensive, local** primitives — panic wipe,
  canary tokens, decoy generation. Anything offensive, retaliatory, or that
  tarpits third parties (AdNauseam click-spoofing, TrackMeNot-style external
  query injection) is dual-use and likely unlawful in many jurisdictions. These
  stay **reference-only**, are never default-on, and are gated to the highest
  tier with explicit admin consent.

---

## 5. Stub inventory (this change)

These stubs wire the plugin-class groups into the existing systems. They are
**flag + registry row** (+ skeleton manifest where a component dir already
exists); no upstream tool is implemented here.

### Feature flags — `apps/blackout-client/src/app/core/features/featureFlags.ts`
| Flag | Env var | Default |
|---|---|---|
| `shieldVisibility` | `BLACKOUT_SHIELD_VISIBILITY` | false |
| `privacyHardening` | `BLACKOUT_PRIVACY_HARDENING` | false |
| `personaEngine` | `BLACKOUT_PERSONA_ENGINE` | false |
| `activeDefense` | `BLACKOUT_ACTIVE_DEFENSE` | false |
| `meshTransport` | `BLACKOUT_MESH_TRANSPORT` | false |
| `transparencyReports` | `BLACKOUT_TRANSPARENCY_REPORTS` | false |

### Feature registry — `docs/features/feature_registry.json`
New section `privacy_suite` + rows: `shield_visibility`, `privacy_hardening`,
`persona_engine`, `active_defense`, `mesh_transport`, `transparency_reports`
(all `category: novel`, `status: planned`). `globalTotal` 16 → 22.

### Feature-module allowlist — `core/features/manifest.ts`
Added ids: `privacy-tools`, `burner-identity`, `panic`.

### Plugin manifests (promote existing dirs) — wired into `coreModules.ts`
- `features/privacy-tools/{manifest,settings,index}.ts` — G1 + G2 customizations.
  Module gated by `shieldVisibility`; the `privacy-hardening` customization is
  further gated by `privacyHardening` within the module.
- `features/burner-identity/{manifest,settings,index}.ts` — G3 customization.
  Module gated by `personaEngine`.
- `features/panic/{manifest,settings,index}.ts` — G5. Module gated by
  `activeDefense`; `panic-wipe` is the free tier inside it (capability
  `panic.wipe.trigger`), `active-defense` carries the canary/decoy gate.

Each module loads via a `coreFeatureModules` entry behind its flag; per-feature
customizations gate further by `capabilityGate`. All flags default-off, so the
canonical shell is unchanged until an operator opts in.

### Entitlement maps — `packages/blackout-protocol/src/`, consumed by the API
- `persona/entitlements.ts` — keys `features.persona.{enabled,rotation,compartments}`;
  `PERSONA_QUOTAS.maxPersonas` = free 1 / pro 8 / team 32 / enterprise -1.
- `hardening/entitlements.ts` — keys `features.hardening.{enabled,torTransport,decoyTraffic,imagePerturbation}`;
  free keeps `enabled`, `pro`+ unlock the rest.
- Aggregated into the canonical entitlement payload in
  `packages/api/src/routes/entitlements.ts` (default + per-subscription + the
  `/:family` filter) and `entitlements/fullyUnlocked.ts`, alongside `deaddrop`.
  `EntitlementFamily` now includes `persona` and `hardening`.

---

## 6. Verification

```
pnpm guard:feature-registry         # registry conformance
pnpm -w typecheck                    # FeatureFlags totality + new entitlement types
pnpm --filter blackout-client test featureFlags   # env overrides, both modes
pnpm -w lint
```
