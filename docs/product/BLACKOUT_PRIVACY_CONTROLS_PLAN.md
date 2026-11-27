# Blackout privacy controls and visual privacy plan

**Updated:** November 27, 2026  
**Status:** Approved planning addition; documentation only. Source presence is distinguished from runtime and production verification. No UI migration, dependency adoption, device monitoring, or deployment occurs through this document.

## 1. One home in the current Privacy tab

Use **You → Settings → Privacy** as the canonical privacy destination. Keep the existing Privacy tab; do not add another primary tab, dashboard, threat meter, or privacy score. Place a searchable list of expandable sections inside it:

| Section | Controls and linked workflows |
| --- | --- |
| Screen & notifications | Privacy View; hold-to-reveal; conceal names/avatars/locations; app-switcher cover; native capture controls; private notification previews; immediate Cover screen action |
| People & activity | Blocked users; DM/invitation permissions; separately named receipt display and receipt sending; typing display and typing sending; presence/discoverability; profile/audience controls; private topic watches and saved activity |
| Sharing & metadata | Supported image metadata removal; link cleanup; external previews and remote media; recipient/audience review; accurate experimental avatar/anti-OCR descriptions |
| Location & identity | Existing location consent/revocation; Coalition audience/precision/expiry review; aliases and burner identities; explicit cross-service account linking |
| Devices & connected tools | Device verification, sessions and revocation, recovery, bots/bridges/plugins, camera/microphone permissions; links to the canonical security and release-key editors |
| My data & cleanup | Storage transparency, export, retention/deletion, data-broker request generation, selected local cleanup; separate destructive actions from screen covering |

Use short summaries with actual supported status and scope. Show **On**, **Off**, **Unavailable**, **Needs setup**, or **Experimental** only from supported state, not from a saved preference alone. A brief explanation must distinguish this device, this account, this conversation, and server/operator controls. No global “surveillance blocked” badge.

Contextual shortcuts in the composer, conversation details, Coalition, notification settings, and profile open the same canonical section. Existing Privacy Tools, Your data, data-broker deletion, identities, release keys, and Panic routes retain working adapters/deep links and permission gates. Reuse current components and stores; do not create a second identity, settings, room, or permissions database. Security can retain its dedicated editor with a direct link from Privacy.

## 2. Current inventory and evidence limits

Reviewed default-branch source and documents on November 27, 2026. “Source present” means an inspected component or documented foundation exists; it does not establish that every backend, client or production deployment enforces it.

| Capability | Evidence and scope | Consolidated home / gap |
| --- | --- | --- |
| Blocking and DM choices | Source present: PrivacySettings.tsx exposes blocked users and everyone/Coalition members/no-one choices. Transport/server enforcement requires separate verification. | People & activity; verify authorization and multi-device behavior before showing enforcement as active |
| Read receipts and typing | Source present: separate showReadReceipts/showTypingIndicators and sendReadReceipts/sendTypingNotifications controls. Hiding others' indicators differs from not sending your own. | People & activity; verify no outbound event while sending is disabled |
| Location consent | Source present: LocationServicesSection.tsx states off by default and provides the current consent workflow. | Location & identity; preserve explicit consent and verify collection, caches, recipients and revocation |
| Image metadata removal | PrivacyToolsSettings.tsx documents JPEG/PNG/WebP removal for message pictures, avatars, banners, listing photos, role icons and welcome images. HEIC/other formats, videos, emoji and stickers are outside that claim. | Sharing & metadata; keep unsupported-format disclosure and an optional safe cancel/convert flow |
| Tracking-link cleanup | Current source documents removal of known tracking parameters in messages, forum posts/replies and wall posts. | Sharing & metadata; preview destination; preserve functional and signed URLs |
| Avatar perturbation | Current Advanced UI adds a faint pattern; its copy explicitly says it does not stop current face recognition. | Sharing & metadata → Experimental; never describe this as proven facial anonymity or text protection |
| Shield / visibility scan | Source present: ShieldVisibilitySettings.tsx inspects this page's loaded resources, form destinations and best-effort camera/mic permission states. Detection only. | Devices & connected tools; not a system-wide tracker blocker or outside-camera detector |
| Account data and export | DataTransparencySettings.tsx provides account/device/room/local storage summaries. DataRetentionSection.tsx provides export/deletion workflows and states export is incomplete. | My data & cleanup; show actual coverage, pending/failure state, server and recipient limits |
| Selected local cleanup | PanicSettings.tsx lists selected local traces/sign-ins and optional release-key deletion. It explicitly retains Matrix IndexedDB message history/decryption keys and is not a forensic wipe. | My data & cleanup; keep exact scope, confirmations and recovery consequences |
| Encrypted communication and verification | Existing Matrix foundation and threat model; encrypted-room content is distinct from public content, room metadata, voice/video, bots and bridges. | Devices & connected tools and conversation details; show actual per-flow protection |
| Burner identities, release keys, broker requests | Existing settings destinations; presence of a route is not proof of anonymity, release reliability or successful broker deletion. | Link the existing editors from their sections; retain feature gates |
| Log/telemetry minimization | Existing metadata-minimization document describes secret redaction and production pseudonymization; homeserver relationship/timing metadata remains visible. | My data & cleanup explanation; operator controls are not universal user-toggle guarantees |
| Private interests and audience | Existing product requirements keep topic watches private and make achievements, crowd cameras, research notes and public publishing consent-scoped. | People & activity; verify feeds, search, exports and creator analytics do not expose private interests |

Source anchors: [Privacy](../../apps/blackout-client/src/app/features/settings/PrivacySettings.tsx), [Privacy Tools](../../apps/blackout-client/src/app/features/privacy-tools/PrivacyToolsSettings.tsx), [Shield](../../apps/blackout-client/src/app/features/privacy-tools/ShieldVisibilitySettings.tsx), [settings navigation](../../apps/blackout-client/src/app/features/settings/SettingsPage.tsx), [location](../../apps/blackout-client/src/app/features/location/LocationServicesSection.tsx), [retention](../../apps/blackout-client/src/app/features/settings/DataRetentionSection.tsx), [transparency](../../apps/blackout-client/src/app/features/data-transparency/DataTransparencySettings.tsx), [panic](../../apps/blackout-client/src/app/features/panic/PanicSettings.tsx), [metadata minimization](../security/metadata-minimization.md), and [threat model](../../THREAT_MODEL.md).

## 3. Privacy View and visual exposure

The goal is to reduce what appears and what ordinary capture mechanisms can obtain. Readable content can still be read or recorded by another person. Encryption in transit or storage does not encrypt visible screen pixels for an observer.

### Required first slice

- **Hold-to-reveal:** cover protected content by default; reveal only the selected message/field or small reading region during an intentional action. Re-cover on release, cancellation, lost focus, navigation, timeout, lock and backgrounding. Provide keyboard and assistive-technology alternatives with equivalent exposure boundaries; no compulsory difficult gesture.
- **Concealed context:** replace names, avatars, group titles, sensitive places, thumbnails, search results, composer drafts and notification previews with neutral placeholders as selected. Do not briefly render plaintext before the cover mounts.
- **Immediate Cover screen:** obscure sensitive UI without deleting data, switching identities or claiming to stop a broadcast. If a live microphone/camera/screen share is publishing, show a separate explicit Stop sharing action and verify cessation.
- **App-switcher cover:** hide sensitive previews before lifecycle snapshots where the OS supports it; verify on actual devices and both native and embedded surfaces.
- **Private notifications:** proposed default is generic notification text without sender/message content; enable previews deliberately. Push-provider timing and metadata remain a separate disclosure.
- **Native capture controls:** apply the supported Android protection and iOS capture-state response below. Unsupported browser capabilities remain explicitly unavailable.
- **Sensitive-media review:** allow masking/redacting selected visible identifiers before sharing; do not assume EXIF removal removes faces, text, GPS displayed in pixels, filenames or identifying audio.

Privacy View is device-local and optional. First-use demonstration uses sample content. Display active coverage plainly; account sync may carry preferences only after an explicit contract, never decrypted vault content or assumptions about another device's protection.

### Platform boundary

| Surface | Planned support | Limit |
| --- | --- | --- |
| Native Android shell | FLAG_SECURE for sensitive windows; coordinate overlays, dialogs, WebViews and lifecycle handling | Standard OS-supported screenshot/recording/nonsecure-display protection; cannot stop an external camera or guarantee protection on a compromised OS |
| Native iOS shell | Observe supported scene capture state and replace sensitive views during recording/mirroring; privacy cover for app snapshots | Screenshot notification is after capture; do not advertise general screenshot prevention |
| Browser/PWA/extension page | Cover/reveal, concealed context, focus/background cover, private app notifications where supported | No dependable universal screenshot prevention or detection; page visibility is not an outside-camera detector |
| External camera or shoulder surfing | Minimize visible area/time; user-controlled screen cover; optional physical privacy-filter guidance | A clear view remains readable; continuous recording can assemble successive revealed regions |
| Compromised endpoint / recipient | Minimize exposed data; device/session controls and safe sharing | Screen effects do not protect memory, authorized recipient copies, malicious accessibility tools or a compromised OS |

## 4. Experimental anti-OCR and anti-scraping

Evaluate [ProTegO](https://github.com/Ruby-He/ProTegO) as a research candidate for text-image rendering that disrupts OCR. Review its MIT license, maintenance, dependencies, inference cost and accessibility before adoption. The current avatar perturbation feature is not this technique.

This work is optional, experimental, off by default, and separate from core safety. Never replace all text with images or silently remove screen-reader access. Do not inject misleading text, decoy facts, or prompt instructions into accessibility content. Avoid flashing/flickering patterns.

Measure extraction against multiple current OCR and vision systems, screenshots, photographs at multiple angles/distances, resizing, compression, preprocessing and continuous video. Include readable-text recovery, latency, battery and user reading/accessibility results. A failure on one model is not proof of surveillance resistance. [Visual defense research](https://openrepository.aut.ac.nz/items/88371f0d-0b46-492f-86e9-c297836e1135) found many font/color/line methods ineffective against evaluated modern OCR systems.

Glaze-style art mimicry defenses address a different objective; do not promise that protecting artistic style makes readable text secret. Anti-scraping for public pages belongs at authenticated/authorized endpoints, per-route limits and bounded exports. Do not challenge Matrix synchronization, federation or legitimate assistive tools indiscriminately. Public content can still be copied.

## 5. Additional privacy requirements

- **Remote content and links:** no automatic remote previews or media fetching from unknown senders; reveal full destination and request consent before contacting external resources. Distinguish local, server-proxied and direct fetches, including IP/timing exposure.
- **Presence and discoverability:** proposed controls for online/last-seen state, search/contact discovery and invitation requests. Confirm actual outbound protocol behavior; local hiding alone is insufficient.
- **Audience and interest privacy:** watched topics, saved research, drafts and private participation stay excluded from public profiles and creator analytics unless explicitly shared. Paid features and ranks do not broaden an audience.
- **Tool access:** visible bots/bridges/plugins with narrow capabilities, reviewable recipients and revocation. No private-content analysis, training, indexing or remote AI upload without explicit scoped consent; vault secrets remain inaccessible.
- **Data choices:** define per-store retention and clear export/deletion scope, key-backup recovery, attachment caching and thumbnail handling. Expiration and redaction cannot retract recipient copies.
- **Identity separation:** warn before a public post, map event, payment, alias, account link or exported achievement connects contexts. A different avatar/name is not a separate cryptographic identity.
- **Permissions:** request camera, mic, location and notifications in context; support denial and revocation. No background camera scanning or contact upload to enable Privacy View.
- **Calls:** evaluate relay-only routing as an opt-in candidate where supported; show IP/metadata and performance tradeoffs and validate call/media encryption separately.

Core encryption, basic capture controls, notification privacy, covering, recovery and accessibility must not depend on purchase, points or engagement. Existing optional enhancements remain governed by the one-time-purchase policy.

## 6. Blackmask reuse and ownership

Reuse UX semantics and tested host-level privacy behavior across Blackout and Blackmask where licensing and architecture permit. Do not copy unlocked stores, tokens, private content or settings ownership across boundaries. Blackout owns Matrix transport/rooms and Coalition; Blackmask retains its Bitwarden-derived vault and independent vault lock.

Blackmask should use Privacy View for chats, private Spaces, vault fields, document previews, masks and share sheets. Its accepted dual-WebView mobile shell must cover **both** chat and vault surfaces before native snapshots/capture exposure, including transitions and loading/error states. An embedded cross-origin page cannot be assumed protected by CSS in its parent.

The matching [Blackmask privacy controls plan](https://github.com/Blackmarket-coa/blackmask/blob/main/docs/black-mask/privacy-controls-plan.md) maps shared controls, browser-only capabilities and vault-specific requirements. Sharing preferences is a future explicit versioned integration, not a shared-key or shared-login assumption.

## 7. Delivery and acceptance

| Order | Deliverable | Required evidence |
| --- | --- | --- |
| 1 | Inventory and consolidate navigation | Each old destination resolves to the canonical section; gates, saved preferences, back navigation and keyboard/screen-reader access survive; one editor/store per setting |
| 2 | Screen cover and concealed context | Verify hold release/cancel, timeout, loading, navigation, search, drafts, permissions, reconnect and background/foreground transitions without a plaintext flash |
| 3 | Native capture and notification privacy | Physical iOS/Android release builds; screenshots, recording, casting, app switcher, lock-screen notifications, both WebViews and unsupported-state behavior |
| 4 | Sharing, activity and permissions | Check outgoing receipts/typing, blocked/DM policy enforcement, unknown-sender remote fetches, metadata-format coverage, location revocation and private-interest authorization |
| 5 | Devices, data and cleanup | Correct session/key scope, recovery, export contents, deletion outcomes, per-store retention and truthful cleanup consequences |
| 6 | Optional anti-OCR evaluation | Published reproducible model/camera/video/accessibility results with failures; remain unavailable as a protection claim until evidence supports the precise wording |

Never label tests proposed here as already passed. This is a documentation change and does not alter release readiness or the existing production acceptance evidence.

## 8. Platform references

- [Android sensitive activities and FLAG_SECURE](https://developer.android.com/security/fraud-prevention/activities)
- [Apple: protecting sensitive content when screen sharing](https://developer.apple.com/documentation/swiftui/protecting-sensitive-content-when-screen-sharing)
- [Apple: screenshot notification arrives after capture](https://developer.apple.com/documentation/uikit/uiapplication/userdidtakescreenshotnotification)
- [ProTegO implementation and MIT license](https://github.com/Ruby-He/ProTegO)
- [Legibility vs. Extractability research](https://openrepository.aut.ac.nz/items/88371f0d-0b46-492f-86e9-c297836e1135)
