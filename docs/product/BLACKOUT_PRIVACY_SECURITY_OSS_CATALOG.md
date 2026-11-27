# Blackout and Blackmask: privacy and security OSS catalogue

**Reviewed:** November 27, 2026  
**Status:** Research and evaluation; no dependencies installed, features activated, infrastructure changed, or production checks replaced.  
**Coverage:** 136 candidate GitHub repositories in 13 categories, including 84 additions beyond the inspected Blackmask privacy/security and hidden-device inventories. Four non-GitHub project families are listed separately. This is a broad scoped catalogue, not an assertion that every privacy project on the internet has been found or that every entry is cleared OSS.

## 1. Fit with the current ecosystem

Blackout keeps its Matrix/Cinny communication foundation, Coalition map, Coliseum and social/creator services. Blackmask retains its Bitwarden-derived vault, separate vault lock, and the accepted chat/vault mobile-shell direction. Existing server operations remain self-hosted on the user's Fedora/Docker server with the current reverse proxy. New research does not authorize an infrastructure migration or a parallel identity, chat, map or vault system.

Treat all proposed placements and rankings below as product/engineering assessments inferred from the projects' stated purposes. Repository metadata screening is not a security audit, compatibility test or production acceptance.

Read alongside [Blackout privacy controls](BLACKOUT_PRIVACY_CONTROLS_PLAN.md), [Blackout app plan](BLACKOUT_APP_PLAN.md), [Blackmask privacy controls](https://github.com/Blackmarket-coa/blackmask/blob/main/docs/black-mask/privacy-controls-plan.md), [existing privacy/security research](https://github.com/Blackmarket-coa/blackmask/blob/main/docs/black-mask/privacy-security-oss-research.md), and [hidden-device research](https://github.com/Blackmarket-coa/blackmask/blob/main/docs/black-mask/hidden-device-detection-oss-research.md).

## 2. What was checked

For each of the 136 repository entries, resolve the canonical current GitHub repository, inspect its public description, archive state, last push and automated license signal, and compare it with the two prior inventories. Selected shortlist, license-boundary and archived-project READMEs/licenses were also read. The [screening snapshot](PRIVACY_SECURITY_OSS_SCREENING_2026-11-27.json) preserves these signals and their source URLs.

“Not archived” and a recent push do not establish maintenance quality or a supported secure release. “Quiet >1 year” is a triage signal, not proof of abandonment. GitHub's license detector may misclassify or omit multi-license repositories. Exact files, versions, models, codecs, browser/native dependencies, hosted APIs and distribution obligations must be inspected before code reuse.

Corrections found during this pass:

- **LLM Guard** is archived; its README says the project and associated models are no longer maintained. Retain as historical research, not a preferred new runtime dependency.
- **MinIO KES** is archived/deprecated. Its enterprise successor is separate; do not infer that a successor is a drop-in free OSS replacement.
- The old **Tink monorepo** is archived after the project split into language-specific repositories. Evaluate the relevant current language repository only if an actual gap remains.
- **Bitwarden Secrets Manager SDK (sdk-sm)** has a custom restrictive SDK agreement; it is a held source-visible lead, not a cleared general OSS building block. This finding does not establish that Blackmask uses this SDK.
- **ExifTool** says its terms follow Perl Artistic or GPL in its README; do not blindly substitute GitHub's single detected label.
- **C2PA Rust** has MIT/Apache licensing with separate dependency terms. **NetBird** has BSD client/core and AGPL server directories. **Bitwarden clients** defaults to GPL with a separately restricted subtree. A root API badge does not clear every component.
- Current paths were resolved for **Presidio**, **ProofMode Android**, **llamafile**, **Casbin**, **Podman**, **gVisor**, **MASTG**, and **Tink**. Prefer canonical links below.

## 3. Recommended evaluation order

These priorities refer to work worth evaluating, not an instruction to install every listed alternative.

| Priority | Capability / candidates | Why it fits | First useful acceptance |
| --- | --- | --- | --- |
| P0 | Existing Matrix/vault foundation; DOMPurify; current native capture/lifecycle controls | Protect existing conversations, renderers and vault boundaries before extending scope | Two-device encrypted flows, no unsafe rendering, separate vault lock, both WebViews covered without plaintext flashes |
| P0 | Gitleaks, OSV-Scanner or Trivy, Syft, Cosign | Protect release and update delivery with minimal user-interface burden; reuse what already runs | Actionable findings, actual artifact signature/provenance and reproducible verification, not merely workflow files |
| P0 | SimpleWebAuthn | Reuse existing server work and complete a truthful passkey flow | Client/server sign-in, enrollment ownership, recovery and loss/revocation behavior |
| P1 | Tesseract.js + user-reviewed masks; optionally Presidio | “Review before sharing” for selected screenshots/documents | Local processing, manual correction, solid redactions in exported pixels and no hidden original layers |
| P1 | mat2 / ExifTool; supported native image cleanup | Broaden format coverage beyond existing JPEG/PNG/WebP flows | Known metadata fixtures, actual format coverage, orientation/media integrity and clear unsupported cases |
| P1 | PDF.js; optional Dangerzone companion | Safer handling of unsolicited Armory/chat documents | Updated viewer and isolation; separate dangerous-document conversion path with preserved originals and permission choices |
| P1 | Existing rate limits or Rate Limiter Flexible; compare Anubis/ALTCHA and CrowdSec/Fail2ban | Protect public discovery and owned endpoints without collecting more private user data | Correct endpoint rules, mobile/accessibility cost, recovery from false positives, preserved Matrix sync/federation |
| P1 | restic or Borg; SOPS and optionally OpenBao | Strengthen self-hosted backups and operator credential handling | Restore from a separate backup, protected recovery keys and bounded service credentials |
| P2 | AirGuard Android/iOS; RethinkDNS or TrackerControl | Useful optional physical/network privacy companions | Supported devices/permissions tested, no automatic upload, no “room clear” or universal protection claim |
| P2 | C2PA inspection; Tella and ProofMode design references | User-directed provenance/evidence capture and careful sharing | Provenance separated from factual truth and identifying evidence metadata disclosed before sharing |
| P2 | MASVS/MASTG, MobSF, ZAP and Frida | Verify native shells, APIs, storage, permissions and capture controls | Tests tied to actual release artifacts and owned test deployments |
| Research | ProTegO, protective media transforms, OpenDP | Explore the original anti-OCR question and privacy-preserving aggregate statistics | Reproducible modern-model/camera/video tests or a reviewed statistical privacy design before a protection claim |

Native Android FLAG_SECURE and iOS capture-state/lifecycle APIs are platform capabilities, not a missing OSS dependency. Implement their supported behavior in the existing shell. Readable screen content remains recordable by an external camera; no entry here makes it cryptographically unreadable to someone who can see it.

Given the current single-server architecture, start with low-overhead existing components and one selected solution per problem. Large SIEM stacks, microVM infrastructure, another identity provider or a mesh VPN are optional engineering scope, not prerequisites for ordinary users.

## 4. Placement inside the existing privacy controls

| Existing Privacy section | Suitable capabilities | Ownership |
| --- | --- | --- |
| Screen & notifications | Cover/reveal, native capture controls, app-switcher covers, generic previews; ProTegO only as research | Existing native host and client lifecycle; Blackmask vault lock stays separate |
| People & activity | Matrix verification/receipt/typing/privacy behavior, permission enforcement, private watches | Existing Matrix and product services; new policy libraries only for a specific unresolved authorization gap |
| Sharing & metadata | DOMPurify, PDF.js, metadata inspection/cleaning, OCR-assisted redaction, C2PA inspection, optional safe conversion | Local/user-directed by default; no server plaintext scanning of encrypted content |
| Location & identity | Existing masks/personas, configured email aliases, Firefox container companion; optional tracker detection | Blackout owns Coalition; aliases/cookies are not independent anonymous identities |
| Devices & connected tools | Device/session review, permission controls; clearly labeled optional Android/iOS/browser/desktop companions | No claim that an embedded page controls all phone traffic or detects every hidden device |
| My data & cleanup | Existing vault exports/recovery, scoped retention, encrypted exports, truthful local cleanup | Distinguish vault keys, Matrix stores, server backups, recipient copies and irreversible actions |
| Engineering/operations only | WAFs, host monitoring, backup jobs, scanners, SBOM/signing, mobile tests, log pipelines | Engineering plan; no new mandatory user-facing tab or fear-based threat score |

## 5. Catalogue legend

**Placement:** Foundation = preserve/review existing selected architecture; App = embeddable candidate; Service = separately operated backend; Companion = optional separate app or design reference; Ops = owned-server operations; CI = development/test/release tooling; Reference = open engineering documentation; Research = experimental/later work.

The license column is a screening signal, except where a selected README/license resolves more detail. “Mixed/unresolved” is not a conclusion that the project is proprietary. **HOLD** entries must not be treated as cleared dependencies. All entries remain unadopted unless separately documented implementation evidence says otherwise.


## 6. Sharing and safer media

| Project / primary source | Placement and proposed fit | License signal | Repository state / last push | Main limit |
| --- | --- | --- | --- | --- |
| [DOMPurify](https://github.com/cure53/DOMPurify) | App — Sanitize untrusted HTML in messages, posts and Armory content | Apache-2.0 | Not archived; review releases; 2026-11-24 | Use current configuration; sanitize before rendering; no permission enforcement |
| [PDF.js](https://github.com/mozilla/pdf.js) | App — Sandboxed document preview for shared files | Apache-2.0 | Not archived; review releases; 2026-11-27 | Viewer is not document disarm or irreversible redaction |
| [Dangerzone](https://github.com/freedomofpress/dangerzone) | Companion — Convert suspicious documents into safer PDFs | AGPL-3.0 | Not archived; review releases; 2026-11-23 | Desktop/container workload; altered content and visible identifiers remain |
| [ExifTool](https://github.com/exiftool/exiftool) | Companion — Inspect and remove supported metadata across file formats | Perl Artistic OR GPL; see README | Not archived; review releases; 2026-11-16 | Format-specific behavior; inspect output and preserve originals |
| [mat2](https://github.com/jvoisin/mat2) | Companion — Metadata cleaning across documents, images and media | LGPL-3.0 | Not archived; review releases; 2026-11-15 | Validate canonical upstream and format coverage; transformations may change files |
| [ExifCleaner](https://github.com/szTheory/exifcleaner) | Companion — Simple desktop metadata-removal workflow | MIT | Not archived; review releases; 2026-11-23 | Check maintenance and packaged ExifTool updates |
| [exifr](https://github.com/MikeKovarik/exifr) | App — Local metadata inspection and disclosure before sending | MIT | Quiet >1 year; review; 2024-03-29 | Parser, not a metadata-removal guarantee |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | App — On-device OCR for user-reviewed redaction of screenshots | Apache-2.0 | Not archived; review releases; 2026-05-17 | OCR can miss secrets; downloads and model costs need review |
| [Presidio](https://github.com/data-privacy-stack/presidio) | Service — Find personal data in user-selected material before sharing | MIT | Not archived; review releases; 2026-11-27 | Detection can miss data; optional local service, not default E2EE scanning |
| [Sharp](https://github.com/lovell/sharp) | Service — Re-encode supported images and produce safe previews | Apache-2.0 | Not archived; review releases; 2026-11-27 | Prefer device-side processing for private material; metadata/orientation limits |
| [FFmpeg](https://github.com/FFmpeg/FFmpeg) | Companion — Audio/video transcoding and metadata handling | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-27 | License depends on build and codecs; no direct unbounded browser integration |
| [C2PA Rust](https://github.com/contentauth/c2pa-rs) | App — Inspect signed media provenance where available | MIT/Apache-2.0; dependent crates separate | Not archived; review releases; 2026-11-26 | Provenance does not prove factual truth; metadata can expose identity |
| [C2PA JavaScript](https://github.com/contentauth/c2pa-js) | App — Browser-side provenance inspection | MIT | Not archived; review releases; 2026-11-25 | Verify maintained package/API and actual validation; avoid automatic network lookups |
| [Tella Android](https://github.com/Horizontal-org/Tella-Android) | Companion — Encrypted capture and deliberate evidence upload workflows | MIT | Not archived; review releases; 2026-11-26 | Choose FOSS build; reuse UX without duplicating the vault or backend |
| [Tella iOS](https://github.com/Horizontal-org/Tella-iOS) | Companion — Native protected-capture and sharing design reference | MIT | Not archived; review releases; 2026-11-13 | Native integration and current dependencies need review |
| [ProofMode](https://github.com/guardianproject/proofmode-android) | Companion — Evidence-capture and provenance reference | GPL-3.0 | Not archived; review releases; 2026-11-25 | Evidence metadata may conflict with anonymous sharing; explicit choice |

## 7. Visual privacy and AI misuse

| Project / primary source | Placement and proposed fit | License signal | Repository state / last push | Main limit |
| --- | --- | --- | --- | --- |
| [ProTegO](https://github.com/Ruby-He/ProTegO) | Research — Experimental resistance to OCR extraction | MIT | Quiet >1 year; review; 2024-03-12 | Not screen encryption; camera/video/model robustness unproven for our app |
| [Fawkes](https://github.com/Shawn-Shan/fawkes) | Research — Research on face-cloaking against selected learning workflows | BSD-3-Clause | Quiet >1 year; review; 2023-08-02 | No universal facial-anonymity guarantee; check present model robustness |
| [PhotoGuard](https://github.com/MadryLab/photoguard) | Research — Protective perturbations against selected image-editing models | MIT | Quiet >1 year; review; 2023-02-27 | Specific-model research; transformations or new models may defeat it |
| [Mist v2](https://github.com/psyker-team/mist-v2) | Research — Research on resisting selected generative-image misuse | Apache-2.0 | Quiet >1 year; review; 2025-05-30 | Review weights, GPU cost, license and current attack coverage |
| [Anti-DreamBooth](https://github.com/VinAIResearch/Anti-DreamBooth) | Research — Research on unauthorized personalized image generation | AGPL-3.0 | Not archived; review releases; 2026-03-27 | Training-specific protection, not general surveillance defense |
| [Nightshade research release](https://github.com/Shawn-Shan/nightshade-release) | Research — Evaluate separate published research implementation | GPL-3.0 | Quiet >1 year; review; 2024-05-20 | Do not conflate research code with desktop-app license or deploy data poisoning |
| [garak](https://github.com/NVIDIA/garak) | CI — Probe owned AI integrations for unsafe responses and leakage | Apache-2.0 | Not archived; review releases; 2026-11-25 | Use synthetic/authorized test data; not a runtime authorization boundary |
| [PyRIT](https://github.com/microsoft/PyRIT) | CI — Structured tests for owned AI misuse and data exposure | MIT | Not archived; review releases; 2026-11-27 | No real vault/conversation corpus by default |
| [**Archived: LLM Guard**](https://github.com/protectai/llm-guard) | Service — Optional input/output checks around consented AI features | MIT | Archived — hold; 2026-07-08 | A classifier does not defeat prompt injection or authorize tools |
| [llamafile](https://github.com/mozilla-ai/llamafile) | Companion — Optional local-model execution for selected inspection | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-09 | Local model/runtime still needs sandboxing, model-license and resource review |

## 8. Phone privacy and nearby devices

| Project / primary source | Placement and proposed fit | License signal | Repository state / last push | Main limit |
| --- | --- | --- | --- | --- |
| [AirGuard Android](https://github.com/seemoo-lab/AirGuard) | Companion — Detect supported unwanted Bluetooth tracking patterns | Apache-2.0 | Not archived; review releases; 2026-11-25 | No scan proves a room or person untracked; permission/battery tradeoffs |
| [AirGuard iOS](https://github.com/seemoo-lab/AirGuard-iOS) | Companion — iPhone counterpart for supported tracker detection | GPL-3.0 | Not archived; review releases; 2026-11-04 | iOS scanning/background limits differ from Android |
| [Rayhunter](https://github.com/EFForg/rayhunter) | Companion — Specialist research into cellular-network anomalies | GPL-3.0 | Not archived; review releases; 2026-11-24 | Requires compatible external hotspot/hardware; not a phone-only detector |
| [RethinkDNS](https://github.com/celzero/rethink-app) | Companion — Android DNS, firewall and routing controls | Apache-2.0 | Not archived; review releases; 2026-11-23 | Android VPN-slot conflicts; standalone native scope |
| [NetGuard](https://github.com/M66B/NetGuard) | Companion — Android per-app network control | GPL-3.0 | Not archived; review releases; 2026-08-01 | Not iOS or a universal malware detector; confirm maintenance |
| [TrackerControl](https://github.com/TrackerControl/tracker-control-android) | Companion — Android tracker connection visibility/control | GPL-3.0 | Not archived; review releases; 2026-11-23 | Distribution variants and VPN conflicts; connection records are sensitive |
| [PCAPdroid](https://github.com/emanuele-f/PCAPdroid) | Companion — User-directed Android network diagnostics | GPL-3.0 | Not archived; review releases; 2026-11-23 | Captures are sensitive; no default TLS interception or auto-upload |
| [AdGuard iOS](https://github.com/AdguardTeam/AdguardForiOS) | Companion — Safari and DNS privacy reference | GPL-3.0 | Not archived; review releases; 2026-11-27 | Native APIs/entitlements and optional paid services differ |
| [Lockdown iOS](https://github.com/confirmedcode/Lockdown-iOS) | Companion — iOS connection-blocking reference | GPL-3.0 | Quiet >1 year; review; 2025-07-29 | Check maintenance and service dependencies before recommending adoption |
| [Auditor](https://github.com/GrapheneOS/Auditor) | Companion — Device integrity/attestation reference | MIT | Not archived; review releases; 2026-11-25 | Supported hardware only; attestation cannot certify all user activity safe |
| [Exodus](https://github.com/Exodus-Privacy/exodus) | Service — Study Android app tracker/permission analysis | AGPL-3.0 | Not archived; review releases; 2026-09-13 | Analysis server/SDK scope; tracker detection is not malware certainty |

## 9. Browser and desktop privacy

| Project / primary source | Placement and proposed fit | License signal | Repository state / last push | Main limit |
| --- | --- | --- | --- | --- |
| [uBlock Origin](https://github.com/gorhill/uBlock) | Companion — Browser filtering reference compatible with supported browsers | GPL-3.0 | Not archived; review releases; 2026-11-27 | Full engine is not universally available on Chromium MV3 |
| [uBlock Origin Lite](https://github.com/uBlockOrigin/uBOL-home) | Companion — MV3 filtering architecture/reference | GPL-3.0 | Not archived; review releases; 2026-11-27 | Different capabilities from full uBlock Origin |
| [Privacy Badger](https://github.com/EFForg/privacybadger) | Companion — Browser anti-tracking design/reference | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-25 | Not phone-wide control; review interaction with existing filtering |
| [CanvasBlocker](https://github.com/kkapsner/CanvasBlocker) | Companion — Firefox fingerprint countermeasure reference | MPL-2.0 | Not archived; review releases; 2026-09-07 | Changes can affect uniqueness; measurement and protection differ |
| [Firefox Containers](https://github.com/mozilla/multi-account-containers) | Companion — Cookie/context separation for identities | MPL-2.0 | Not archived; review releases; 2026-11-16 | Firefox only; not separate network identities or Matrix accounts |
| [LuLu](https://github.com/objective-see/LuLu) | Companion — macOS outbound connection control | GPL-3.0 | Not archived; review releases; 2026-11-27 | macOS-only; native extension deployment |
| [OverSight](https://github.com/objective-see/OverSight) | Companion — macOS microphone/camera activity monitoring | GPL-3.0 | Quiet >1 year; review; 2024-09-24 | Not hidden-camera detection and not a mobile component |
| [Portmaster](https://github.com/safing/portmaster) | Companion — Desktop per-app network visibility/control | GPL-3.0 | Not archived; review releases; 2026-11-27 | Local firewall differs from separately offered anonymous routing |
| [Cryptomator](https://github.com/cryptomator/cryptomator) | Companion — Optional encrypted file-storage workflow | GPL-3.0 | Not archived; review releases; 2026-11-24 | Do not replace or silently merge the existing Bitwarden vault |

## 10. Communication and source protection

| Project / primary source | Placement and proposed fit | License signal | Repository state / last push | Main limit |
| --- | --- | --- | --- | --- |
| [Matrix JavaScript SDK](https://github.com/matrix-org/matrix-js-sdk) | Foundation — Preserve current Blackout/Cinny communication foundation | Apache-2.0 | Not archived; review releases; 2026-11-27 | Check currently used version and encryption backend; avoid duplicate transport |
| [Matrix Rust SDK](https://github.com/matrix-org/matrix-rust-sdk) | Foundation — Native-compatible Matrix library evaluation | Apache-2.0 | Not archived; review releases; 2026-11-27 | Separate integration effort; not automatic mobile-client parity |
| [coturn](https://github.com/coturn/coturn) | Foundation — TURN relay for calls and IP-exposure reduction where supported | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-26 | Relay-only is a deliberate setting; server sees connection metadata |
| [LiveKit](https://github.com/livekit/livekit) | Foundation — Realtime media integration and independent media-E2EE evaluation | Apache-2.0 | Not archived; review releases; 2026-11-27 | Existing call architecture first; an SFU/TLS link alone is not E2EE |
| [SimpleX Chat](https://github.com/simplex-chat/simplex-chat) | Companion — Metadata-minimizing messenger architecture reference | AGPL-3.0 | Not archived; review releases; 2026-11-27 | Separate protocol; not a Matrix plugin |
| [OnionShare](https://github.com/onionshare/onionshare) | Companion — User-directed private file sharing over Tor | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-27 | Desktop/Tor workflow; not revocation of already downloaded copies |
| [OnionShare Android](https://github.com/onionshare/onionshare-android) | Companion — Phone-based private sharing candidate | GPL-3.0 | Not archived; review releases; 2025-12-12 | Verify current release/platform maturity |
| [SecureDrop](https://github.com/freedomofpress/securedrop) | Companion — Separate organization-run source-submission system | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-25 | Specialist operational workload; not ordinary chat integration |
| [Orbot Android](https://github.com/guardianproject/orbot-android) | Companion — Optional Tor routing companion | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-26 | Native integration, traffic support and VPN conflicts need review |

## 11. Identity, account security and authorization

| Project / primary source | Placement and proposed fit | License signal | Repository state / last push | Main limit |
| --- | --- | --- | --- | --- |
| [SimpleLogin](https://github.com/simple-login/app) | Service — Self-hosted email aliases for identity contexts | AGPL-3.0 | Not archived; review releases; 2026-11-27 | Existing configured-forwarder integration first; hosting/operability separate |
| [addy.io](https://github.com/anonaddy/anonaddy) | Service — Alternative self-hosted alias service | AGPL-3.0 | Not archived; review releases; 2026-11-17 | Do not install two alias stacks; provider metadata still exists |
| [WebAuthn library](https://github.com/passwordless-id/webauthn) | App — Lightweight passkey integration candidate | MIT | Not archived; review releases; 2026-11-27 | Compare with existing SimpleWebAuthn; do not add parallel credential records |
| [SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn) | Foundation — Reuse existing server-side passkey work and add verified client flow | MIT | Not archived; review releases; 2026-11-21 | A backend assertion verifier alone does not provide login or recovery |
| [Authelia](https://github.com/authelia/authelia) | Service — Access gateway for owned administrative tools | Apache-2.0 | Not archived; review releases; 2026-11-27 | Do not gate Matrix federation/sync behind incompatible browser redirects |
| [Keycloak](https://github.com/keycloak/keycloak) | Service — OIDC identity service candidate where needed | Apache-2.0 | Not archived; review releases; 2026-11-27 | Heavy alternative, not a required replacement for current auth |
| [OpenFGA](https://github.com/openfga/openfga) | Service — Model fine-grained authorization for new product services | Apache-2.0 | Not archived; review releases; 2026-11-25 | Existing Matrix power levels remain authoritative for Matrix rooms |
| [Cerbos](https://github.com/cerbos/cerbos) | Service — Alternative authorization-policy engine | Apache-2.0 | Not archived; review releases; 2026-11-25 | Choose one ownership model; UI visibility is not access control |
| [Casbin](https://github.com/apache/casbin) | App — Embedded policy checks for service endpoints | Apache-2.0 | Not archived; review releases; 2026-11-25 | Binding language/runtime must match; policies need actual enforcement tests |
| [Open Policy Agent](https://github.com/open-policy-agent/opa) | Service — Infrastructure/service policy evaluation | Apache-2.0 | Not archived; review releases; 2026-11-27 | Not a substitute for app authorization and not every product needs it |
| [Noble curves](https://github.com/paulmillr/noble-curves) | App — Review existing cryptographic primitives and dependency status | MIT | Not archived; review releases; 2026-09-08 | Use established Matrix/vault protocols; no custom crypto |
| [zxcvbn-ts](https://github.com/zxcvbn-ts/zxcvbn) | App — Local password-strength feedback | MIT | Not archived; review releases; 2026-11-14 | Not proof that a credential is unique or uncompromised |

## 12. Keys, storage and controlled sharing

| Project / primary source | Placement and proposed fit | License signal | Repository state / last push | Main limit |
| --- | --- | --- | --- | --- |
| [OpenBao](https://github.com/openbao/openbao) | Service — Operator secret storage, rotation and dynamic credentials | MPL-2.0 | Not archived; review releases; 2026-11-26 | Operator key management is distinct from end-user E2EE/vault keys |
| [age](https://github.com/FiloSottile/age) | Companion — Simple encrypted user-directed exports or operator backups | BSD-3-Clause | Not archived; review releases; 2026-08-29 | Recipient and key recovery design still required |
| [SOPS](https://github.com/getsops/sops) | CI — Encrypted deployment configuration | MPL-2.0 | Not archived; review releases; 2026-11-23 | Protect age/KMS keys separately; encrypted config is not runtime secret isolation |
| [libsodium](https://github.com/jedisct1/libsodium) | App — Established cryptographic building blocks where needed | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-26 | Prefer existing protocol libraries; key lifecycle still matters |
| [libsodium.js](https://github.com/jedisct1/libsodium.js) | App — Browser-compatible existing-crypto integration candidate | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-10-28 | WASM packaging/CSP/side effects need review |
| [SQLCipher](https://github.com/sqlcipher/sqlcipher) | App — Encrypted local database for a justified native store | BSD-3-Clause | Not archived; review releases; 2026-10-27 | Community/paid build terms differ; do not bolt onto IndexedDB/vault blindly |
| [Vaultwarden](https://github.com/dani-garcia/vaultwarden) | Foundation — Preserve existing self-hosted vault backend foundation | AGPL-3.0 | Not archived; review releases; 2026-11-25 | Backend configuration, updates and client compatibility require evidence |
| [Bitwarden clients](https://github.com/bitwarden/clients) | Foundation — Existing Blackmask vault-client foundation and upstream study | GPL-3.0 default; restricted subtree separate | Not archived; review releases; 2026-11-27 | Licenses differ by subtree; root label does not clear every component |
| [**HOLD: Bitwarden Secrets Manager SDK**](https://github.com/bitwarden/sdk-sm) | Research — Evaluate only if a concrete operator-secrets gap remains | Custom SDK agreement — HOLD | Not archived; review releases; 2026-11-25 | Custom SDK agreement restricts compatible use and third-party distribution; do not adopt as a general OSS dependency |
| [restic](https://github.com/restic/restic) | Ops — Encrypted server backups and restore workflows | BSD-2-Clause | Not archived; review releases; 2026-11-27 | Restore tests and offline key custody are essential |
| [BorgBackup](https://github.com/borgbackup/borg) | Ops — Alternative encrypted/deduplicated backup | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-24 | Choose backup approach; retention and restore permissions remain |

## 13. Public edge, scraping and abuse controls

| Project / primary source | Placement and proposed fit | License signal | Repository state / last push | Main limit |
| --- | --- | --- | --- | --- |
| [Anubis](https://github.com/TecharoHQ/anubis) | Ops — Raise public-page crawler costs with challenges | MIT | Not archived; review releases; 2026-11-23 | Can affect good bots, accessibility and low-power phones; not perfect AI detection |
| [ALTCHA](https://github.com/altcha-org/altcha) | App — Self-hosted privacy-oriented abuse challenges | MIT | Not archived; review releases; 2026-11-20 | Server-side verification/replay handling and device costs required |
| [mCaptcha](https://github.com/mCaptcha/mCaptcha) | Service — Alternative self-hosted proof-of-work challenge | AGPL-3.0 | Quiet >1 year; review; 2025-10-07 | Alternative to ALTCHA, not another mandatory layer |
| [CrowdSec](https://github.com/crowdsecurity/crowdsec) | Ops — Owned-edge abuse detection and bounded remediation | MIT | Not archived; review releases; 2026-11-27 | Review external intelligence/log sharing and false positives |
| [Fail2ban](https://github.com/fail2ban/fail2ban) | Ops — Simple log-based protection for repeated technical abuse | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-23 | Shared IP and Tor users need bounded blocks/recovery |
| [Coraza](https://github.com/corazawaf/coraza) | Ops — WAF engine candidate compatible with chosen proxy integration | Apache-2.0 | Not archived; review releases; 2026-11-27 | Caddy connector/build must be maintained and tested |
| [OWASP CRS](https://github.com/coreruleset/coreruleset) | Ops — Reviewed WAF rules for common web attacks | Apache-2.0 | Not archived; review releases; 2026-11-27 | Rules need app-specific tuning; false positives can break Matrix/API |
| [BunkerWeb](https://github.com/bunkerity/bunkerweb) | Ops — Alternative packaged reverse-proxy/WAF stack | AGPL-3.0 | Not archived; review releases; 2026-11-27 | Would change gateway operations; no blanket replacement of current Caddy |
| [Caddy](https://github.com/caddyserver/caddy) | Foundation — Harden existing TLS/reverse-proxy deployment | Apache-2.0 | Not archived; review releases; 2026-11-24 | Review actual headers/routes; avoid stacking unnecessary gateways |
| [Rate Limiter Flexible](https://github.com/animir/node-rate-limiter-flexible) | App — Per-route service quotas using supported shared stores | ISC | Not archived; review releases; 2026-11-25 | Not authorization or identity-based speech filtering |

## 14. Private remote access, DNS and resilience

| Project / primary source | Placement and proposed fit | License signal | Repository state / last push | Main limit |
| --- | --- | --- | --- | --- |
| [Tailscale client](https://github.com/tailscale/tailscale) | Companion — Encrypted administrative networking candidate | BSD-3-Clause | Not archived; review releases; 2026-11-27 | Open client and hosted control plane have distinct terms/data flows |
| [Headscale](https://github.com/juanfont/headscale) | Ops — Self-hosted control-plane alternative for an admin overlay | BSD-3-Clause | Not archived; review releases; 2026-11-27 | Compatibility and access policy testing; avoid user-app dependency |
| [NetBird](https://github.com/netbirdio/netbird) | Ops — Alternative self-hosted admin mesh VPN | BSD-3-Clause; AGPL-3.0 server directories | Not archived; review releases; 2026-11-27 | Core/enterprise/service components differ; not anonymous public browsing |
| [Nebula](https://github.com/slackhq/nebula) | Ops — Lightweight overlay network for owned nodes | MIT | Not archived; review releases; 2026-11-24 | Certificate lifecycle and firewall policies need operations ownership |
| [AdGuard Home](https://github.com/AdguardTeam/AdGuardHome) | Ops — Self-hosted DNS filtering for owned networks | GPL-3.0 | Not archived; review releases; 2026-11-27 | DNS filtering misses direct-IP/encrypted app traffic |
| [Pi-hole](https://github.com/pi-hole/pi-hole) | Ops — Alternative network DNS filtering | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-25 | Local-network infrastructure; not a web-app feature |
| [dnscrypt-proxy](https://github.com/DNSCrypt/dnscrypt-proxy) | Companion — Encrypted DNS and filtering reference | ISC | Not archived; review releases; 2026-11-27 | Resolver choice sees queries; encryption is not anonymity |
| [CoreDNS](https://github.com/coredns/coredns) | Ops — Controllable DNS component if a node needs it | Apache-2.0 | Not archived; review releases; 2026-11-27 | Use existing resolver first; avoid operating DNS needlessly |

## 15. Host, container and endpoint defense

| Project / primary source | Placement and proposed fit | License signal | Repository state / last push | Main limit |
| --- | --- | --- | --- | --- |
| [Wazuh](https://github.com/wazuh/wazuh) | Ops — Host security monitoring for owned Fedora/server machines | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-27 | Can be heavy; sensitive logs need minimization/retention |
| [Falco](https://github.com/falcosecurity/falco) | Ops — Container/kernel-event detection on supported hosts | Apache-2.0 | Not archived; review releases; 2026-11-23 | Kernel/eBPF compatibility and alert tuning required |
| [Tracee](https://github.com/aquasecurity/tracee) | Ops — Alternative Linux runtime observation/detection | Apache-2.0 | Not archived; review releases; 2026-11-01 | Privileged collection and sensitive event streams |
| [osquery](https://github.com/osquery/osquery) | Ops — Explicitly managed host inventory and incident queries | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-25 | Owned devices only; query/output minimization |
| [OSSEC](https://github.com/ossec/ossec-hids) | Ops — Alternative host intrusion monitoring | GPL-2.0 | Not archived; review releases; 2026-11-19 | Compare with Wazuh rather than installing both |
| [Lynis](https://github.com/CISOfy/lynis) | Ops — Linux hardening audit for owned servers | GPL-3.0 | Not archived; review releases; 2026-11-20 | Findings need review; scanner output does not secure a host |
| [Podman](https://github.com/podman-container-tools/podman) | Ops — Rootless-container option compatible with Fedora operations | Apache-2.0 | Not archived; review releases; 2026-11-27 | Evaluate separately; no production migration requested |
| [gVisor](https://github.com/gvisor/gvisor) | Ops — Extra sandbox boundary for risky conversion workloads | Apache-2.0 | Not archived; review releases; 2026-11-26 | Runtime compatibility/performance and host limits |
| [Firecracker](https://github.com/firecracker-microvm/firecracker) | Ops — MicroVM isolation for specialist untrusted workloads | Apache-2.0 | Not archived; review releases; 2026-11-27 | Higher operational cost; later scope for a small single-server deployment |
| [ClamAV](https://github.com/Cisco-Talos/clamav) | Service — Optional malware checks for explicitly submitted untrusted files | GPL-2.0 | Not archived; review releases; 2026-11-25 | No default server plaintext scan of encrypted chats/vaults |

## 16. Build, dependencies and release integrity

| Project / primary source | Placement and proposed fit | License signal | Repository state / last push | Main limit |
| --- | --- | --- | --- | --- |
| [OSV-Scanner](https://github.com/google/osv-scanner) | CI — Known-vulnerability checking of dependencies | Apache-2.0 | Not archived; review releases; 2026-11-26 | Coverage depends on ecosystem/advisory freshness |
| [Gitleaks](https://github.com/gitleaks/gitleaks) | CI — Prevent committed secrets | MIT | Not archived; review releases; 2026-11-25 | Remediate leaked secrets; removing text does not revoke credentials |
| [Trivy](https://github.com/aquasecurity/trivy) | CI — Image, dependency and configuration scanning | Apache-2.0 | Not archived; review releases; 2026-11-27 | Scan output may reveal infrastructure inventory |
| [Syft](https://github.com/anchore/syft) | CI — Produce software bills of materials | Apache-2.0 | Not archived; review releases; 2026-11-27 | SBOM is inventory, not proof of a safe release |
| [Grype](https://github.com/anchore/grype) | CI — Alternative vulnerability matching from SBOM/images | Apache-2.0 | Not archived; review releases; 2026-11-27 | Compare with Trivy/OSV; avoid duplicate unactionable reports |
| [Cosign](https://github.com/sigstore/cosign) | CI — Sign and verify actual release artifacts | Apache-2.0 | Not archived; review releases; 2026-11-25 | Trust identities/keys and verify release evidence, not just workflow presence |
| [in-toto](https://github.com/in-toto/in-toto) | CI — Attested build-step provenance | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-08-27 | Define trusted builders; metadata alone does not prevent compromise |
| [TUF](https://github.com/theupdateframework/python-tuf) | CI — Signed, rollback-resistant update metadata | Apache-2.0 | Not archived; review releases; 2026-11-24 | Client and key-rotation integration required; not automatic store support |
| [OpenSSF Scorecard](https://github.com/ossf/scorecard) | CI — Repository supply-chain practice signals | Apache-2.0 | Not archived; review releases; 2026-11-27 | Score is evidence for review, not security certification |
| [Harden-Runner](https://github.com/step-security/harden-runner) | CI — Evaluate runner isolation and egress controls | Apache-2.0 | Not archived; review releases; 2026-11-25 | Open action and hosted/premium telemetry terms differ |
| [Renovate](https://github.com/renovatebot/renovate) | CI — Automated dependency update proposals | AGPL-3.0 | Not archived; review releases; 2026-11-27 | Review lockfiles/tests; updates should not auto-deploy production |
| [Semgrep](https://github.com/semgrep/semgrep) | CI — Static analysis for app/service source | LGPL-2.1 | Not archived; review releases; 2026-11-27 | Engine, rules and hosted/premium analysis use different licenses |
| [Bandit](https://github.com/PyCQA/bandit) | CI — Python security linting for owned code | Apache-2.0 | Not archived; review releases; 2026-11-09 | Heuristics; review findings rather than silent baselines |
| [TruffleHog](https://github.com/trufflesecurity/trufflehog) | CI — Alternative secret discovery for owned repos/artifacts | AGPL-3.0 | Not archived; review releases; 2026-11-25 | Credential verification can contact services; use controlled scope |

## 17. Application and mobile verification

| Project / primary source | Placement and proposed fit | License signal | Repository state / last push | Main limit |
| --- | --- | --- | --- | --- |
| [OWASP ZAP](https://github.com/zaproxy/zaproxy) | CI — Authenticated web/API checks on owned test deployments | Apache-2.0 | Not archived; review releases; 2026-11-27 | Test against isolated authorized environments; protect session data |
| [MobSF](https://github.com/MobSF/Mobile-Security-Framework-MobSF) | CI — Android/iOS package analysis | GPL-3.0 | Not archived; review releases; 2026-11-25 | Reports need review; test-built artifacts and secrets remain sensitive |
| [Frida](https://github.com/frida/frida) | CI — Instrument our native apps to validate security boundaries | Mixed/unresolved — inspect exact component | Not archived; review releases; 2026-11-26 | Testing tool, not a protection shipped to end users |
| [scrcpy](https://github.com/Genymobile/scrcpy) | CI — Android device interaction for privacy/capture acceptance | Apache-2.0 | Not archived; review releases; 2026-11-26 | Not a surveillance defense; device-owner-authorized tests |
| [MASVS](https://github.com/OWASP/masvs) | Reference — Mobile privacy/storage/authentication requirements | CC-BY-SA-4.0 | Not archived; review releases; 2026-09-21 | Open documentation rather than a runtime library |
| [MASTG](https://github.com/OWASP/mastg) | Reference — Repeatable iOS/Android privacy and security test cases | CC-BY-SA-4.0 | Not archived; review releases; 2026-11-24 | Guidance/test code licenses can differ |
| [ASVS](https://github.com/OWASP/ASVS) | Reference — Web/API verification requirements | CC-BY-SA-4.0 | Not archived; review releases; 2026-11-27 | Map to concrete endpoints and evidence |
| [OWASP Cheat Sheets](https://github.com/OWASP/CheatSheetSeries) | Reference — Implementation guidance for auth, WebViews, files and sessions | CC-BY-SA-4.0 | Not archived; review releases; 2026-11-26 | Verify applicability to current platform and architecture |
| [**Archived: KES**](https://github.com/minio/kes) | Research — Evaluate server-side object-key management only if still maintained | AGPL-3.0 | Archived — hold; 2025-05-27 | Not vault/E2EE key management; inspect archive/license status |

## 18. Privacy-preserving logs and research

| Project / primary source | Placement and proposed fit | License signal | Repository state / last push | Main limit |
| --- | --- | --- | --- | --- |
| [Vector](https://github.com/vectordotdev/vector) | Ops — Filter/redact logs before they leave a host | MPL-2.0 | Not archived; review releases; 2026-11-27 | Configure actual transforms; never log private payloads then call it minimized |
| [OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector) | Ops — Explicit filtering/redaction for selected telemetry | Apache-2.0 | Not archived; review releases; 2026-11-26 | Disable sensitive attributes and uncontrolled exporters |
| [Pino](https://github.com/pinojs/pino) | App — Structured application logs with field redaction | MIT | Not archived; review releases; 2026-11-27 | Field rules must cover nested/secrets; no private message bodies |
| [OpenDP](https://github.com/opendp/opendp) | Research — Research privacy-preserving community aggregate statistics | MIT | Not archived; review releases; 2026-11-27 | Requires a validated statistical design and disclosure thresholds |
| [Google differential privacy](https://github.com/google/differential-privacy) | Research — Alternative vetted mechanisms for aggregate analysis | Apache-2.0 | Not archived; review releases; 2026-11-25 | No individual profiling; contribution/budget accounting needed |
| [PySyft](https://github.com/OpenMined/PySyft) | Research — Study permissioned analysis across community data | Apache-2.0 | Not archived; review releases; 2026-11-26 | Heavy later research; not a reason to collect private activity |
| [**Archived: Tink**](https://github.com/tink-crypto/tink) | App — Established application-level crypto APIs if a real gap remains | Apache-2.0 | Archived — hold; 2024-04-17 | Not an alternate Matrix or vault protocol |

## 19. Relevant project families hosted elsewhere

These four families supplement the 136 GitHub entries and are not part of that metadata-screening count. Review exact repository/component licenses and platform support before reuse.

| Project / official source | Fit | Boundary |
| --- | --- | --- |
| [Briar](https://code.briarproject.org/briar/briar) and [official manual](https://briarproject.org/manual/) | Android peer-to-peer messaging over Bluetooth/Wi-Fi/Tor; resilience and source-protection reference | Separate companion/protocol; not automatic Matrix offline interoperability |
| [Cwtch](https://git.openprivacy.ca/cwtch.im/cwtch) and [documentation](https://docs.cwtch.im/) | Metadata-resistant communication architecture reference | Separate Tor-based protocol and operational model |
| [Arti](https://arti.torproject.org/) and [canonical source](https://gitlab.torproject.org/tpo/core/arti) | Embeddable Rust Tor candidate for explicitly chosen routing | Official documentation says not all C Tor features are available; native platform and traffic support need validation |
| [WireGuard official repositories](https://www.wireguard.com/repositories/) | Direct WireGuard tools and supported Android/Apple components for an optional admin/companion design | Select the maintained platform component; a VPN changes network trust and is not anonymous communication by itself |

## 20. Physical privacy and restricted leads

The existing [phone/hidden-device inventory](https://github.com/Blackmarket-coa/blackmask/blob/main/docs/black-mask/hidden-device-detection-oss-research.md) contains a further detailed 31-entry phone/hardware/research matrix, with overlap such as AirGuard and Rayhunter. Its older entries were read for deduplication; this pass does not claim to have freshly verified every one of those 31 projects. Do not add their count to 136 as if the lists were disjoint.

Retain Bluetooth inventory, local-network observation, optical techniques and specialist RF/hardware as distinct capabilities. Neither a Wi-Fi scan nor a BLE scan detects a disconnected camera, all wired devices or every recording device. Rayhunter requires compatible hardware; it is not a phone-only universal cell-site-simulator detector. No negative scan establishes safety.

| Lead | Treatment |
| --- | --- |
| [Glaze](https://glaze.cs.uchicago.edu/whatis.html) | Authors state it is free to use but not open source; relevant product reference, not a reusable OSS component |
| [MVT](https://github.com/mvt-project/mvt) and [androidqf](https://github.com/mvt-project/androidqf) | Specialist consent-based forensic tools with custom consensual-use terms; do not present as unrestricted OSS, a one-tap phone antivirus, or proof of no compromise |
| [Nightshade desktop distribution](https://nightshade.cs.uchicago.edu/downloads.html) | Different distribution/terms from the separately listed research code; do not conflate |
| [AntiFake](https://github.com/WUSTL-CSPL/AntiFake) | Prior inventory did not establish a reusable license; retain hold until exact current terms and model dependencies are established |
| [Bitwarden sdk-sm license](https://github.com/bitwarden/sdk-sm/blob/main/LICENSE) | Reviewed custom SDK restrictions; hold as a source-visible lead rather than clear general-purpose OSS |
| Archived LLM Guard / KES / old Tink monorepo | Historical reference; no preferred new adoption of those archived repositories |
| Signal Scout, Wavelens and unresolved ultrasonic/research code | Keep the restrictions and hardware qualifications in the existing physical-privacy inventory; no automatic promotion |

## 21. Integration requirements that matter for this product

1. Reuse the current foundation before adding another library/service. Identify a concrete unsolved behavior, its owner, supported platforms and measurable acceptance.
2. Process selected private material locally where possible. Any remote service gets explicit scope and recipient disclosure; decrypted vault data does not go to chat/tools/AI. A “security scan” is not permission to scan every encrypted conversation.
3. Validate exact component/asset/model licenses, release support, vulnerabilities, dependencies and platform packaging. An OSS repository may include optional proprietary SDKs or hosted/premium offerings.
4. Confirm accessibility, performance, battery cost, false positives and recovery. Dynamic visual filters must not flash or remove legitimate screen-reader access.
5. Treat solid redaction, metadata cleaning, provenance verification, malware scanning and AI-image estimates as separate functions. Hidden layers/text, visible identifiers and identifying audio require their own review.
6. Preserve Matrix sync/federation and existing authority boundaries. No generic bot challenge, OIDC redirect or WAF rule silently blocks legitimate clients.
7. Keep cleanup truthful. Deleting a preference/cache, revoking a device, destroying a key and removing a server account are different operations and cannot retract recipient copies.
8. Minimize operator logs before collection/egress. Host diagnostics, packet captures and debug bundles remain user-directed, sensitive records with bounded retention.
9. Tie release claims to actual artifacts and device/backend tests. No tool list, score, successful scan or signed metadata alone proves safety.
10. Core privacy/security/accessibility stays independent of purchases and reward grinding. Optional enhancements retain one-time-purchase rules; Blackmask hosted storage is the existing recurring exception.

This research changes documentation only. The existing production evidence, current feature gates and release readiness remain authoritative.

## 22. Primary-source index and auditability

Every catalogue row links its project repository. The [JSON screening snapshot](PRIVACY_SECURITY_OSS_SCREENING_2026-11-27.json) records canonical and original paths, project descriptions, license signals, archive state, last push, prior-inventory overlap and proposed fit.

Selected deeper sources reviewed include [ProTegO](https://github.com/Ruby-He/ProTegO), [Tella FOSS/code structure](https://github.com/Horizontal-org/Tella-Android/blob/main/README.md), [Dangerzone limits](https://docs.dangerzone.rocks/dev/explanation/when-to-use-dangerzone/), [Tesseract.js](https://github.com/naptha/tesseract.js), [Presidio transition](https://github.com/data-privacy-stack/presidio/blob/main/docs/project_transition.md), [C2PA Rust licensing](https://github.com/contentauth/c2pa-rs/blob/main/README.md), [NetBird licensing](https://github.com/netbirdio/netbird/blob/main/README.md), [Bitwarden client licensing](https://github.com/bitwarden/clients/blob/main/LICENSE.txt), [LLM Guard archive notice](https://github.com/protectai/llm-guard), [KES deprecation](https://github.com/minio/kes), and [old Tink repository](https://github.com/tink-crypto/tink).

Official guidance includes [OWASP Mobile Application Security](https://mas.owasp.org/), [Arti capabilities](https://arti.torproject.org/), and [WireGuard's supported repositories](https://www.wireguard.com/repositories/). Exact implementation/version review remains future work.
