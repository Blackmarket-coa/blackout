import type { RuntimePluginId } from './manifest';
import { betaUnlockAllEnabledIn } from './betaUnlock';

export type FeatureFlags = {
    governance: boolean;
    forum: boolean;
    deaddrop: boolean;
    deadman: boolean;
    steganography: boolean;
    moderation: boolean;
    monetization: boolean;
    monetizationSubscriptions: boolean;
    monetizationBoosts: boolean;
    monetizationMarketplace: boolean;
    monetizationApps: boolean;
    monetizationThemes: boolean;
    monetizationQuests: boolean;
    monetizationPayouts: boolean;
    monetizationAnalytics: boolean;
    monetizationPayoutAnalytics: boolean;
    monetizationSuite: boolean;
    platformOps: boolean;
    notificationsPresence: boolean;
    mediaCall: boolean;
    stegoToolkit: boolean;
    settingsParity: boolean;
    federatedOps: boolean;
    authThreads: boolean;
    education: boolean;
    legacyShellLayout: boolean;
    legacyThemeOverrides: boolean;
    composerQuickActions: boolean;
    navigationSpaceHierarchy: boolean;
    notificationsAdapter: boolean;
    rightPanelPlugins: boolean;
    liveInteractionBundle: boolean;
    coalition: boolean;
    coliseum: boolean;
    /**
     * Discord Migration Hub. Owns the `/migration-hub` destination: connect
     * Discord, import a server (channels/roles → dens/governance), activate the
     * mautrix-discord bridge per den, and watch adoption metrics.
     */
    migrationHub: boolean;
    /**
     * Streaming hub flag. Owns the `/streaming` top-level destination — a
     * consolidated page (routed like coalition/coliseum) with tabs for the
     * livestream directory, broadcast tooling (simulcast / OBS-WS / IRC bot /
     * widget-alert tokens), platform connections (linked accounts), chat
     * bridges + webhooks, and the integrations-health dashboard. Default on so
     * the previously-orphaned connection UIs are reachable.
     */
    streaming: boolean;
    profile: boolean;
    home: boolean;
    communities: boolean;
    /**
     * Canopy server experience. When enabled, opening a canopy renders the
     * Discord-style server page (categorized channel sidebar with text +
     * voice dens, chat, docked member list, settings/admin) in place of the
     * legacy `ClientLayout`, and the `/canopies` hub is mounted as a
     * homepage-reachable directory of the user's canopies. Default on; flip
     * off to fall back to the legacy chat shell.
     */
    canopyServer: boolean;
    plugins: boolean;
    /**
     * AppShell mode-routing flag. When enabled (default-on as of PR-10),
     * every destination renders inside the AppShell wrapper (bottom-tab
     * bar + mode-aware top bar + dynamic right panel) and the canonical
     * canopy/den path `/communities/:canopyId/dens/:denId` is the room
     * target. The legacy `LegacyClientLayout` + `/room/:roomId` redirect
     * have been retired alongside this flag flip.
     */
    shellAppShell: boolean;
    /**
     * HomeFeed surface flag. When enabled together with `shellAppShell`,
     * the `/` route mounts a chronological merge of the user's joined
     * dens instead of the legacy `ClientLayout`. Topic chips and the
     * `/topics/:tag` deep links are gated by this flag too. Default off.
     *
     * Routing matrix (PR 2):
     *   shellAppShell=off, discoveryHomeFeed=*    → `/` mounts ClientLayout
     *   shellAppShell=on,  discoveryHomeFeed=off  → `/` mounts ClientLayout
     *   shellAppShell=on,  discoveryHomeFeed=on   → `/` mounts HomeFeed
     */
    discoveryHomeFeed: boolean;
    /**
     * Topics surface flag. Owns the `/topics` and `/topics/:tag` routes
     * and the topic-chip widget that renders inside HomeFeed. Default
     * off; ships behind `discoveryHomeFeed` in PR 2 but exposed as a
     * separate flag so future reorganization (Phase 4 Meilisearch swap)
     * can toggle independently.
     */
    topics: boolean;
    /**
     * Familiar feed IA flag. When on, HomeFeed renders a For You / Following
     * segmented toggle and a Hot / New / Top sort control (TikTok/X + Reddit
     * conventions) instead of the stacked Following-then-Discover sections.
     * Sort maps onto `mergeAndRank` in `unifiedFeedModel`. Default off.
     */
    homeFeedSegments: boolean;
    /**
     * Daily-streak retention chip. When on, HomeFeed tracks consecutive UTC
     * days the viewer opens Home (persisted to `co.bmc.retention.streak.v1`)
     * and renders a streak chip in the header. Default off.
     */
    homeStreak: boolean;
    /**
     * Bounty Board rail on the home feed. When on, HomeFeed fetches open
     * bounties and renders a "Bounty board" rail (creator / coalition /
     * developer / tester / content work) above the Live-now rail. The fetch is
     * isolated so a bounty-API outage cannot affect the rest of the feed.
     * Default off.
     */
    homeBountyBoard: boolean;
    /**
     * Episodic/series feed badge. When on, feed items carrying a `series:<name>`
     * tag render a "SERIES" badge (the binge/return loop). Pure client-side
     * derivation over existing tags; no schema change. Default off.
     */
    seriesTag: boolean;
    /**
     * Market destination tab flag. When on, the existing
     * `MarketplaceSlice` is mounted as a top-level destination at
     * `/market` (and the AppShell bottom-tab "Market" entry resolves
     * to a real route instead of a placeholder). Independent of the
     * legacy `monetizationMarketplace` flag, which still gates the
     * underlying buyer surface from PR 1.
     */
    marketTab: boolean;
    /**
     * Product-attachment surface flag. Owns the `co.bmc.product_attachments`
     * Matrix custom-event renderer + attach dialog used to bind FBM
     * listings onto messages, canopy state, and stream descriptions.
     */
    productsAttachments: boolean;
    /**
     * Composer affordance flag. When on, surfaces a `compose-attach-product`
     * quick action that opens the existing AttachProductDialog and emits
     * a `co.bmc.product_attachments` event into the active room. Builds
     * on `productsAttachments` (the renderer/dialog plumbing) — that flag
     * is a prerequisite, but this one stays separate so the composer
     * affordance can roll out independently of the surface flag.
     */
    productsAttachComposer: boolean;
    /**
     * Creator listing-management flag. Owns the
     * `/creator/listings` page that lets a creator publish, list, and
     * archive FBM listings via the existing `routes/creator.ts` API.
     */
    creatorsListings: boolean;
    /**
     * Livestream viewer flag. Owns the `/live` directory and
     * `/live/:streamId` viewer surface (Owncast HLS player + tip CTA +
     * product shelf). Subscriber-side LiveKit integration is deferred
     * to a follow-up PR.
     */
    streamsViewer: boolean;
    /**
     * Public creator storefront flag. Owns the `/creators/:userId`
     * page (subscription tiers + listings + replays). Reads existing
     * `/v1/creator-subs/creators/:userId/tiers` and
     * `/v1/profile/:userId` endpoints; no new server surface.
     */
    creatorsStorefront: boolean;
    /**
     * Growth-engine flags (PR 5 — backend ledger primitives).
     *
     *   - growthReferrals: `/v1/growth/referrals` ledger.
     *   - growthAmbassadors: `/v1/growth/ambassadors` tier ledger.
     *   - growthQuests: `/v1/growth/quests` definitions + completions.
     *
     * All three share the same `growth.read` / `growth.write`
     * capability gates and the `growth` feature module mount path.
     * Tip-attribution (referral_bonus / ambassador_commission /
     * quest_reward) wiring is intentionally deferred to a follow-up;
     * PR 5 ships only the read/write surfaces so client UI work can
     * land against a stable ledger.
     */
    growthReferrals: boolean;
    growthAmbassadors: boolean;
    growthQuests: boolean;
    /**
     * Quests-UI live-data swap. When on, `QuestsSlice` reads the
     * active-quests list and the per-quest claim mutation from the
     * existing growth client (PR 5 backend). When off, the slice
     * keeps its placeholder rows so the surface stays demo-able even
     * before the backend is reachable.
     */
    growthQuestsUi: boolean;
    /**
     * Events flag. Owns the `/events` directory and `/events/:canopyId/:eventId`
     * detail page. Events are encoded as `co.bmc.event` Matrix state
     * events emitted into a canopy / den; RSVPs are `m.reaction`s on
     * the event state. No new server storage.
     */
    eventsV1: boolean;
    /**
     * Creator-onboarding fork (PR 7). Owns the dedicated
     * `/onboarding/creator` route that walks new creators through
     * handle / bio / FBM seller onboarding / first listing.
     */
    onboardingCreatorPath: boolean;
    /**
     * Discord/Twitch migration-credit grant flag (PR 7). Owns the
     * `/v1/growth/migration-credits/*` endpoints and the redeem form
     * inside the creator-onboarding flow.
     */
    onboardingMigrationCredits: boolean;
    /**
     * Platform-linking step of the creator wizard. When on, the creator
     * onboarding flow includes a step that connects external platforms
     * (Twitch/YouTube/Discord/Patreon/…) via the linked-accounts OAuth flow.
     */
    onboardingCreatorPlatformLinking: boolean;
    /**
     * Reward-enrollment step of the creator wizard. When on, the creator
     * onboarding flow includes a step that enrolls the creator in the
     * ambassador/reward program via `applyAsAmbassador`.
     */
    onboardingCreatorRewards: boolean;
    /**
     * Creator-kit step of the creator wizard. When on, the creator onboarding
     * flow includes a step that installs a Creator Kit (one-click apply via
     * `applyCreatorKit`).
     */
    onboardingCreatorKits: boolean;
    /**
     * Beta-only "For developers & bug hunters" wizard step. When on,
     * the member onboarding flow shows an extra step that surfaces
     * Settings → Developer Tools, source-file references for testers,
     * and a debug-bundle download button.
     */
    onboardingDeveloperStep: boolean;
    /**
     * Familiar-migration onboarding step. When on, the member onboarding
     * flow gains an interest picker (topic multi-select) and a
     * find-communities step that seeds default canopy joins, so the Home
     * "Following" feed is populated on first load. Selected interests are
     * persisted to `co.bmc.discovery.interests.v1` and boost matching feed
     * items in `useUnifiedFeed`. Default off.
     */
    onboardingInterestPicker: boolean;
    /**
     * Post-wizard guided spotlight tour of the homepage. When on, the
     * onboarding route navigates to `/` after the wizard completes and
     * `HomeFeed` mounts `HomeTourOverlay` so new beta users are walked
     * through each homepage region in place.
     */
    onboardingHomeTour: boolean;
    /**
     * Creator dashboard mode (PR 9). Owns the `/creator` route — a
     * landing page combining the existing earnings dashboard with
     * ambassador / quest / referral status cards from the growth
     * ledger.
     */
    creatorsDashboard: boolean;
    /**
     * Federation / self-host wizard (PR 8). Owns the
     * `/federation/self-host` route — a docker-compose template
     * generator for canopy admins who want to host their own
     * Synapse + media-repo + Owncast stack.
     */
    federationSelfHost: boolean;
    /**
     * Global bug-report widget. When on, a floating "Report a problem" button
     * mounts in the AppShell on every surface; reports post to the `#bugs`
     * Matrix room via the API. Default on; `BLACKOUT_BUG_REPORT_WIDGET=false`
     * disables it.
     */
    bugReportWidget: boolean;
    /**
     * Creator content lifecycle. Owns the Creator Hub "Content" section
     * (draft/upload/schedule a video, article, or guide) and the published-
     * content rail on the Home feed. Backed by `/v1/creator/content/*` with
     * durable persistence; scheduled items auto-publish via the background
     * dispatcher. Default on so the creator publishing loop is reachable;
     * `BLACKOUT_CREATOR_CONTENT=false` disables it.
     */
    creatorContent: boolean;
    /**
     * Shield / Visibility plugin (OSS-manifest group G1). Opt-in surface for
     * tracker / fingerprint / leak detection (uBlock-, Privacy-Badger-class
     * lists + heuristics). Detection is a free baseline capability, but the
     * plugin is default-off because it adds UI and active probing not every
     * deployment wants. `BLACKOUT_SHIELD_VISIBILITY=true` enables it.
     */
    shieldVisibility: boolean;
    /**
     * Privacy Hardening plugin (OSS-manifest group G2). Advanced per-user
     * anonymity: anonymized transport, decoy traffic, fingerprint
     * randomization, and image perturbation. Gated to the `pro` entitlement
     * tier (basic vault stays free). `BLACKOUT_PRIVACY_HARDENING=true` enables.
     */
    privacyHardening: boolean;
    /**
     * Persona engine plugin (OSS-manifest group G3). Multi-persona
     * compartmentalization and alias rotation on top of the free single
     * burner identity. Roster size is a `pro`-tier quota. Default off;
     * `BLACKOUT_PERSONA_ENGINE=true` enables.
     */
    personaEngine: boolean;
    /**
     * Active defense plugin (OSS-manifest group G5). Defensive-only deception
     * primitives (canary tokens, decoy data) layered on the free panic/duress
     * controls. Gated to the highest (enterprise / Sovereignty) tier with
     * explicit admin consent. `BLACKOUT_ACTIVE_DEFENSE=true` enables.
     */
    activeDefense: boolean;
    /**
     * Mesh / offline transport plugin (OSS-manifest group G6). Store-and-forward
     * peer sync over local radios (Briar-class). Topology capability gated to
     * the highest (enterprise / Sovereignty) tier. Registry+flag stub only;
     * default off. `BLACKOUT_MESH_TRANSPORT=true` enables.
     */
    meshTransport: boolean;
    /**
     * Transparency reports plugin (OSS-manifest group G9). Self-service
     * transparency / warrant-canary view (free); org-scoped audit export is a
     * Governance-tier capability. Default off;
     * `BLACKOUT_TRANSPARENCY_REPORTS=true` enables.
     */
    transparencyReports: boolean;
};

export type FeatureMode = 'default' | 'baseline' | 'full';

export const defaultFeatureFlags: FeatureFlags = {
    governance: true,
    forum: true,
    deaddrop: true,
    deadman: true,
    steganography: true,
    moderation: false,
    monetization: false,
    monetizationSubscriptions: false,
    monetizationBoosts: false,
    monetizationMarketplace: false,
    monetizationApps: false,
    monetizationThemes: false,
    monetizationQuests: false,
    monetizationPayouts: false,
    monetizationAnalytics: false,
    monetizationPayoutAnalytics: false,
    monetizationSuite: false,
    platformOps: false,
    notificationsPresence: false,
    mediaCall: false,
    stegoToolkit: false,
    settingsParity: false,
    federatedOps: false,
    authThreads: false,
    education: false,
    legacyShellLayout: false,
    legacyThemeOverrides: false,
    composerQuickActions: true,
    navigationSpaceHierarchy: true,
    notificationsAdapter: true,
    rightPanelPlugins: true,
    liveInteractionBundle: true,
    coalition: true,
    coliseum: true,
    migrationHub: true,
    streaming: true,
    profile: true,
    home: true,
    communities: true,
    canopyServer: true,
    plugins: true,
    shellAppShell: true,
    // HomeFeed is the default `/` surface so the home tour (gated by
    // onboardingHomeTour below) has a place to run — invited users land here
    // for the tour before being routed into their den.
    discoveryHomeFeed: true,
    topics: false,
    homeFeedSegments: false,
    homeStreak: false,
    // Creator Hub production readiness: the bounty board sections are built and
    // wired into the hub overview/rewards tabs. `BLACKOUT_HOME_BOUNTY_BOARD`
    // overrides per environment.
    homeBountyBoard: true,
    seriesTag: false,
    marketTab: true,
    productsAttachments: false,
    productsAttachComposer: false,
    // Creator Hub production readiness: the listings/storefront/dashboard
    // surfaces, growth ledgers, bounty board, and the creator-onboarding wizard
    // are built and wired into the hub, so they ship on by default. Each retains
    // its `BLACKOUT_*` env override for per-environment rollback.
    creatorsListings: true,
    streamsViewer: false,
    creatorsStorefront: true,
    growthReferrals: true,
    growthAmbassadors: true,
    growthQuests: true,
    growthQuestsUi: true,
    eventsV1: false,
    onboardingCreatorPath: true,
    onboardingMigrationCredits: true,
    onboardingCreatorPlatformLinking: true,
    onboardingCreatorRewards: true,
    onboardingCreatorKits: true,
    onboardingDeveloperStep: false,
    onboardingInterestPicker: false,
    // On by default: new (incl. invited) users get the Home tour. Env
    // `BLACKOUT_ONBOARDING_HOME_TOUR=false` can still disable it.
    onboardingHomeTour: true,
    creatorsDashboard: true,
    federationSelfHost: false,
    bugReportWidget: true,
    creatorContent: true,
    shieldVisibility: false,
    privacyHardening: false,
    personaEngine: false,
    activeDefense: false,
    meshTransport: false,
    transparencyReports: false,
};

/**
 * Minimal shell extension point: runtime plugin enablement is derived from typed
 * feature flags so migration stays additive and reversible.
 */
export const runtimePluginFeatureFlags: Record<RuntimePluginId, keyof FeatureFlags> = {
    'shell.legacy-layout': 'legacyShellLayout',
    'theme.legacy-overrides': 'legacyThemeOverrides',
    'composer.quick-actions': 'composerQuickActions',
    'navigation.space-hierarchy': 'navigationSpaceHierarchy',
    'notifications.adapter': 'notificationsAdapter',
    'right-panel.slots': 'rightPanelPlugins',
    'live-interaction.bundle': 'liveInteractionBundle',
};

const runtimePluginFlagKeys = Object.values(runtimePluginFeatureFlags);

const modeManagedRuntimePluginFlagKeys = runtimePluginFlagKeys.filter(
    (flagName) => flagName !== 'legacyShellLayout'
);

const parseFeatureMode = (rawMode: string | undefined): FeatureMode => {
    if (!rawMode) return 'default';
    if (rawMode === 'baseline' || rawMode === 'full' || rawMode === 'default') return rawMode;
    return 'default';
};

type MonetizationFlagKey =
    | 'monetization'
    | 'monetizationSubscriptions'
    | 'monetizationBoosts'
    | 'monetizationMarketplace'
    | 'monetizationApps'
    | 'monetizationThemes'
    | 'monetizationQuests'
    | 'monetizationPayouts'
    | 'monetizationAnalytics'
    | 'monetizationPayoutAnalytics'
    | 'monetizationSuite';

const monetizationFlagEnvMap: Record<MonetizationFlagKey, string> = {
    monetization: 'BLACKOUT_MONETIZATION',
    monetizationSubscriptions: 'BLACKOUT_MONETIZATION_SUBSCRIPTIONS',
    monetizationBoosts: 'BLACKOUT_MONETIZATION_BOOSTS',
    monetizationMarketplace: 'BLACKOUT_MONETIZATION_MARKETPLACE',
    monetizationApps: 'BLACKOUT_MONETIZATION_APPS',
    monetizationThemes: 'BLACKOUT_MONETIZATION_THEMES',
    monetizationQuests: 'BLACKOUT_MONETIZATION_QUESTS',
    monetizationPayouts: 'BLACKOUT_MONETIZATION_PAYOUTS',
    monetizationAnalytics: 'BLACKOUT_MONETIZATION_ANALYTICS',
    monetizationPayoutAnalytics: 'BLACKOUT_MONETIZATION_PAYOUT_ANALYTICS',
    monetizationSuite: 'BLACKOUT_MONETIZATION_SUITE',
};

const monetizationSliceFlags: MonetizationFlagKey[] = [
    'monetizationSubscriptions',
    'monetizationBoosts',
    'monetizationMarketplace',
    'monetizationApps',
    'monetizationThemes',
    'monetizationQuests',
    'monetizationPayoutAnalytics',
];

const parseBooleanFlag = (raw: string | undefined): boolean | undefined => {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return undefined;
};

const applyMonetizationEnvOverrides = (
    env: Record<string, string | undefined>,
    flags: FeatureFlags
): void => {
    (Object.keys(monetizationFlagEnvMap) as MonetizationFlagKey[]).forEach((flagName) => {
        const parsed = parseBooleanFlag(env[monetizationFlagEnvMap[flagName]]);
        if (parsed !== undefined) {
            flags[flagName] = parsed;
        }
    });
};

const validateMonetizationSkuDependencies = (flags: FeatureFlags): void => {
    if (flags.monetizationSuite) {
        flags.monetization = true;
        monetizationSliceFlags.forEach((flagName) => {
            flags[flagName] = true;
        });
    }

    if (flags.monetizationPayoutAnalytics) {
        flags.monetizationPayouts = true;
        flags.monetizationAnalytics = true;
    }

    const hasEnabledSlice = monetizationSliceFlags.some((flagName) => flags[flagName]);

    if (flags.monetization && hasEnabledSlice) {
        return;
    }

    if (!flags.monetization) {
        flags.monetizationSuite = false;
        monetizationSliceFlags.forEach((flagName) => {
            flags[flagName] = false;
        });
        flags.monetizationPayouts = false;
        flags.monetizationAnalytics = false;
    }
};

export const resolveFeatureFlags = (
    env: Record<string, string | undefined> = {},
    baseFlags: FeatureFlags = defaultFeatureFlags
): FeatureFlags => {
    // Beta override: unlock every feature flag (incl. the monetization suite).
    if (betaUnlockAllEnabledIn(env)) {
        return Object.fromEntries(
            (Object.keys(baseFlags) as (keyof FeatureFlags)[]).map((key) => [key, true])
        ) as FeatureFlags;
    }

    const mode = parseFeatureMode(env.BLACKOUT_FEATURE_MODE);

    if (mode === 'default') {
        const nextFlags = { ...baseFlags };
        applyMonetizationEnvOverrides(env, nextFlags);
        validateMonetizationSkuDependencies(nextFlags);
        if (env.BLACKOUT_LEGACY_SHELL_FALLBACK === 'true') {
            nextFlags.legacyShellLayout = true;
        }
        if (env.BLACKOUT_LIVE_INTERACTION_BUNDLE === 'true') {
            nextFlags.liveInteractionBundle = true;
        }
        if (env.BLACKOUT_LIVE_INTERACTION_BUNDLE === 'false') {
            nextFlags.liveInteractionBundle = false;
        }
        if (env.BLACKOUT_PLATFORM_OPS === 'true') {
            nextFlags.platformOps = true;
        }
        if (env.BLACKOUT_PLATFORM_OPS === 'false') {
            nextFlags.platformOps = false;
        }
        if (env.BLACKOUT_MODERATION === 'true') {
            nextFlags.moderation = true;
        }
        if (env.BLACKOUT_MODERATION === 'false') {
            nextFlags.moderation = false;
        }
        if (env.BLACKOUT_NOTIFICATIONS_PRESENCE === 'true') {
            nextFlags.notificationsPresence = true;
        }
        if (env.BLACKOUT_NOTIFICATIONS_PRESENCE === 'false') {
            nextFlags.notificationsPresence = false;
        }
        if (env.BLACKOUT_MEDIA_CALL === 'true') {
            nextFlags.mediaCall = true;
        }
        if (env.BLACKOUT_MEDIA_CALL === 'false') {
            nextFlags.mediaCall = false;
        }
        if (env.BLACKOUT_STEGO_TOOLKIT === 'true') {
            nextFlags.stegoToolkit = true;
        }
        if (env.BLACKOUT_STEGO_TOOLKIT === 'false') {
            nextFlags.stegoToolkit = false;
        }
        if (env.BLACKOUT_SHIELD_VISIBILITY === 'true') {
            nextFlags.shieldVisibility = true;
        }
        if (env.BLACKOUT_SHIELD_VISIBILITY === 'false') {
            nextFlags.shieldVisibility = false;
        }
        if (env.BLACKOUT_PRIVACY_HARDENING === 'true') {
            nextFlags.privacyHardening = true;
        }
        if (env.BLACKOUT_PRIVACY_HARDENING === 'false') {
            nextFlags.privacyHardening = false;
        }
        if (env.BLACKOUT_PERSONA_ENGINE === 'true') {
            nextFlags.personaEngine = true;
        }
        if (env.BLACKOUT_PERSONA_ENGINE === 'false') {
            nextFlags.personaEngine = false;
        }
        if (env.BLACKOUT_ACTIVE_DEFENSE === 'true') {
            nextFlags.activeDefense = true;
        }
        if (env.BLACKOUT_ACTIVE_DEFENSE === 'false') {
            nextFlags.activeDefense = false;
        }
        if (env.BLACKOUT_MESH_TRANSPORT === 'true') {
            nextFlags.meshTransport = true;
        }
        if (env.BLACKOUT_MESH_TRANSPORT === 'false') {
            nextFlags.meshTransport = false;
        }
        if (env.BLACKOUT_TRANSPARENCY_REPORTS === 'true') {
            nextFlags.transparencyReports = true;
        }
        if (env.BLACKOUT_TRANSPARENCY_REPORTS === 'false') {
            nextFlags.transparencyReports = false;
        }
        if (env.BLACKOUT_SETTINGS_PARITY === 'true') {
            nextFlags.settingsParity = true;
        }
        if (env.BLACKOUT_SETTINGS_PARITY === 'false') {
            nextFlags.settingsParity = false;
        }
        if (env.BLACKOUT_FEDERATED_OPS === 'true') {
            nextFlags.federatedOps = true;
        }
        if (env.BLACKOUT_FEDERATED_OPS === 'false') {
            nextFlags.federatedOps = false;
        }
        if (env.BLACKOUT_AUTH_THREADS === 'true') {
            nextFlags.authThreads = true;
        }
        if (env.BLACKOUT_AUTH_THREADS === 'false') {
            nextFlags.authThreads = false;
        }
        if (env.BLACKOUT_EDUCATION === 'true') {
            nextFlags.education = true;
        }
        if (env.BLACKOUT_EDUCATION === 'false') {
            nextFlags.education = false;
        }
        if (env.BLACKOUT_COALITION === 'true') {
            nextFlags.coalition = true;
        }
        if (env.BLACKOUT_COALITION === 'false') {
            nextFlags.coalition = false;
        }
        if (env.BLACKOUT_COLISEUM === 'true') {
            nextFlags.coliseum = true;
        }
        if (env.BLACKOUT_COLISEUM === 'false') {
            nextFlags.coliseum = false;
        }
        if (env.BLACKOUT_STREAMING === 'true') {
            nextFlags.streaming = true;
        }
        if (env.BLACKOUT_STREAMING === 'false') {
            nextFlags.streaming = false;
        }
        if (env.BLACKOUT_PROFILE === 'true') {
            nextFlags.profile = true;
        }
        if (env.BLACKOUT_PROFILE === 'false') {
            nextFlags.profile = false;
        }
        if (env.BLACKOUT_DEADMAN === 'true') {
            nextFlags.deadman = true;
        }
        if (env.BLACKOUT_DEADMAN === 'false') {
            nextFlags.deadman = false;
        }
        if (env.BLACKOUT_HOME === 'true') {
            nextFlags.home = true;
        }
        if (env.BLACKOUT_HOME === 'false') {
            nextFlags.home = false;
        }
        if (env.BLACKOUT_COMMUNITIES === 'true') {
            nextFlags.communities = true;
        }
        if (env.BLACKOUT_COMMUNITIES === 'false') {
            nextFlags.communities = false;
        }
        if (env.BLACKOUT_PLUGINS === 'true') {
            nextFlags.plugins = true;
        }
        if (env.BLACKOUT_PLUGINS === 'false') {
            nextFlags.plugins = false;
        }
        if (env.BLACKOUT_SHELL_APP_SHELL === 'true') {
            nextFlags.shellAppShell = true;
        }
        if (env.BLACKOUT_SHELL_APP_SHELL === 'false') {
            nextFlags.shellAppShell = false;
        }
        if (env.BLACKOUT_DISCOVERY_HOME_FEED === 'true') {
            nextFlags.discoveryHomeFeed = true;
        }
        if (env.BLACKOUT_DISCOVERY_HOME_FEED === 'false') {
            nextFlags.discoveryHomeFeed = false;
        }
        if (env.BLACKOUT_CANOPY_SERVER === 'true') {
            nextFlags.canopyServer = true;
        }
        if (env.BLACKOUT_CANOPY_SERVER === 'false') {
            nextFlags.canopyServer = false;
        }
        if (env.BLACKOUT_TOPICS === 'true') {
            nextFlags.topics = true;
        }
        if (env.BLACKOUT_TOPICS === 'false') {
            nextFlags.topics = false;
        }
        if (env.BLACKOUT_ONBOARDING_INTEREST_PICKER === 'true') {
            nextFlags.onboardingInterestPicker = true;
        }
        if (env.BLACKOUT_ONBOARDING_INTEREST_PICKER === 'false') {
            nextFlags.onboardingInterestPicker = false;
        }
        if (env.BLACKOUT_HOME_FEED_SEGMENTS === 'true') {
            nextFlags.homeFeedSegments = true;
        }
        if (env.BLACKOUT_HOME_FEED_SEGMENTS === 'false') {
            nextFlags.homeFeedSegments = false;
        }
        if (env.BLACKOUT_HOME_STREAK === 'true') {
            nextFlags.homeStreak = true;
        }
        if (env.BLACKOUT_HOME_STREAK === 'false') {
            nextFlags.homeStreak = false;
        }
        if (env.BLACKOUT_HOME_BOUNTY_BOARD === 'true') {
            nextFlags.homeBountyBoard = true;
        }
        if (env.BLACKOUT_HOME_BOUNTY_BOARD === 'false') {
            nextFlags.homeBountyBoard = false;
        }
        if (env.BLACKOUT_SERIES_TAG === 'true') {
            nextFlags.seriesTag = true;
        }
        if (env.BLACKOUT_SERIES_TAG === 'false') {
            nextFlags.seriesTag = false;
        }
        if (env.BLACKOUT_MARKET_TAB === 'true') {
            nextFlags.marketTab = true;
        }
        if (env.BLACKOUT_MARKET_TAB === 'false') {
            nextFlags.marketTab = false;
        }
        if (env.BLACKOUT_PRODUCTS_ATTACHMENTS === 'true') {
            nextFlags.productsAttachments = true;
        }
        if (env.BLACKOUT_PRODUCTS_ATTACHMENTS === 'false') {
            nextFlags.productsAttachments = false;
        }
        if (env.BLACKOUT_CREATORS_LISTINGS === 'true') {
            nextFlags.creatorsListings = true;
        }
        if (env.BLACKOUT_CREATORS_LISTINGS === 'false') {
            nextFlags.creatorsListings = false;
        }
        if (env.BLACKOUT_STREAMS_VIEWER === 'true') {
            nextFlags.streamsViewer = true;
        }
        if (env.BLACKOUT_STREAMS_VIEWER === 'false') {
            nextFlags.streamsViewer = false;
        }
        if (env.BLACKOUT_CREATORS_STOREFRONT === 'true') {
            nextFlags.creatorsStorefront = true;
        }
        if (env.BLACKOUT_CREATORS_STOREFRONT === 'false') {
            nextFlags.creatorsStorefront = false;
        }
        if (env.BLACKOUT_GROWTH_REFERRALS === 'true') {
            nextFlags.growthReferrals = true;
        }
        if (env.BLACKOUT_GROWTH_REFERRALS === 'false') {
            nextFlags.growthReferrals = false;
        }
        if (env.BLACKOUT_GROWTH_AMBASSADORS === 'true') {
            nextFlags.growthAmbassadors = true;
        }
        if (env.BLACKOUT_GROWTH_AMBASSADORS === 'false') {
            nextFlags.growthAmbassadors = false;
        }
        if (env.BLACKOUT_GROWTH_QUESTS === 'true') {
            nextFlags.growthQuests = true;
        }
        if (env.BLACKOUT_GROWTH_QUESTS === 'false') {
            nextFlags.growthQuests = false;
        }
        if (env.BLACKOUT_EVENTS_V1 === 'true') {
            nextFlags.eventsV1 = true;
        }
        if (env.BLACKOUT_EVENTS_V1 === 'false') {
            nextFlags.eventsV1 = false;
        }
        if (env.BLACKOUT_ONBOARDING_CREATOR_PATH === 'true') {
            nextFlags.onboardingCreatorPath = true;
        }
        if (env.BLACKOUT_ONBOARDING_CREATOR_PATH === 'false') {
            nextFlags.onboardingCreatorPath = false;
        }
        if (env.BLACKOUT_ONBOARDING_MIGRATION_CREDITS === 'true') {
            nextFlags.onboardingMigrationCredits = true;
        }
        if (env.BLACKOUT_ONBOARDING_MIGRATION_CREDITS === 'false') {
            nextFlags.onboardingMigrationCredits = false;
        }
        if (env.BLACKOUT_ONBOARDING_CREATOR_PLATFORM_LINKING === 'true') {
            nextFlags.onboardingCreatorPlatformLinking = true;
        }
        if (env.BLACKOUT_ONBOARDING_CREATOR_PLATFORM_LINKING === 'false') {
            nextFlags.onboardingCreatorPlatformLinking = false;
        }
        if (env.BLACKOUT_ONBOARDING_CREATOR_REWARDS === 'true') {
            nextFlags.onboardingCreatorRewards = true;
        }
        if (env.BLACKOUT_ONBOARDING_CREATOR_REWARDS === 'false') {
            nextFlags.onboardingCreatorRewards = false;
        }
        if (env.BLACKOUT_ONBOARDING_CREATOR_KITS === 'true') {
            nextFlags.onboardingCreatorKits = true;
        }
        if (env.BLACKOUT_ONBOARDING_CREATOR_KITS === 'false') {
            nextFlags.onboardingCreatorKits = false;
        }
        if (env.BLACKOUT_ONBOARDING_DEVELOPER_STEP === 'true') {
            nextFlags.onboardingDeveloperStep = true;
        }
        if (env.BLACKOUT_ONBOARDING_DEVELOPER_STEP === 'false') {
            nextFlags.onboardingDeveloperStep = false;
        }
        if (env.BLACKOUT_ONBOARDING_HOME_TOUR === 'true') {
            nextFlags.onboardingHomeTour = true;
        }
        if (env.BLACKOUT_ONBOARDING_HOME_TOUR === 'false') {
            nextFlags.onboardingHomeTour = false;
        }
        if (env.BLACKOUT_CREATORS_DASHBOARD === 'true') {
            nextFlags.creatorsDashboard = true;
        }
        if (env.BLACKOUT_CREATORS_DASHBOARD === 'false') {
            nextFlags.creatorsDashboard = false;
        }
        if (env.BLACKOUT_FEDERATION_SELF_HOST === 'true') {
            nextFlags.federationSelfHost = true;
        }
        if (env.BLACKOUT_FEDERATION_SELF_HOST === 'false') {
            nextFlags.federationSelfHost = false;
        }
        if (env.BLACKOUT_PRODUCTS_ATTACH_COMPOSER === 'true') {
            nextFlags.productsAttachComposer = true;
        }
        if (env.BLACKOUT_PRODUCTS_ATTACH_COMPOSER === 'false') {
            nextFlags.productsAttachComposer = false;
        }
        if (env.BLACKOUT_GROWTH_QUESTS_UI === 'true') {
            nextFlags.growthQuestsUi = true;
        }
        if (env.BLACKOUT_GROWTH_QUESTS_UI === 'false') {
            nextFlags.growthQuestsUi = false;
        }
        if (env.BLACKOUT_BUG_REPORT_WIDGET === 'true') {
            nextFlags.bugReportWidget = true;
        }
        if (env.BLACKOUT_BUG_REPORT_WIDGET === 'false') {
            nextFlags.bugReportWidget = false;
        }
        if (env.BLACKOUT_CREATOR_CONTENT === 'true') {
            nextFlags.creatorContent = true;
        }
        if (env.BLACKOUT_CREATOR_CONTENT === 'false') {
            nextFlags.creatorContent = false;
        }
        return nextFlags;
    }

    const nextFlags = { ...baseFlags };

    modeManagedRuntimePluginFlagKeys.forEach((flagName) => {
        nextFlags[flagName] = mode === 'full';
    });

    if (env.BLACKOUT_LEGACY_SHELL_FALLBACK === 'true') {
        nextFlags.legacyShellLayout = true;
    }
    if (env.BLACKOUT_LIVE_INTERACTION_BUNDLE === 'true') {
        nextFlags.liveInteractionBundle = true;
    }
    if (env.BLACKOUT_LIVE_INTERACTION_BUNDLE === 'false') {
        nextFlags.liveInteractionBundle = false;
    }
    if (env.BLACKOUT_PLATFORM_OPS === 'true') {
        nextFlags.platformOps = true;
    }
    if (env.BLACKOUT_PLATFORM_OPS === 'false') {
        nextFlags.platformOps = false;
    }
    if (env.BLACKOUT_MODERATION === 'true') {
        nextFlags.moderation = true;
    }
    if (env.BLACKOUT_MODERATION === 'false') {
        nextFlags.moderation = false;
    }
    if (env.BLACKOUT_NOTIFICATIONS_PRESENCE === 'true') {
        nextFlags.notificationsPresence = true;
    }
    if (env.BLACKOUT_NOTIFICATIONS_PRESENCE === 'false') {
        nextFlags.notificationsPresence = false;
    }
    if (env.BLACKOUT_MEDIA_CALL === 'true') {
        nextFlags.mediaCall = true;
    }
    if (env.BLACKOUT_MEDIA_CALL === 'false') {
        nextFlags.mediaCall = false;
    }
    if (env.BLACKOUT_STEGO_TOOLKIT === 'true') {
        nextFlags.stegoToolkit = true;
    }
    if (env.BLACKOUT_STEGO_TOOLKIT === 'false') {
        nextFlags.stegoToolkit = false;
    }
    if (env.BLACKOUT_SHIELD_VISIBILITY === 'true') {
        nextFlags.shieldVisibility = true;
    }
    if (env.BLACKOUT_SHIELD_VISIBILITY === 'false') {
        nextFlags.shieldVisibility = false;
    }
    if (env.BLACKOUT_PRIVACY_HARDENING === 'true') {
        nextFlags.privacyHardening = true;
    }
    if (env.BLACKOUT_PRIVACY_HARDENING === 'false') {
        nextFlags.privacyHardening = false;
    }
    if (env.BLACKOUT_PERSONA_ENGINE === 'true') {
        nextFlags.personaEngine = true;
    }
    if (env.BLACKOUT_PERSONA_ENGINE === 'false') {
        nextFlags.personaEngine = false;
    }
    if (env.BLACKOUT_ACTIVE_DEFENSE === 'true') {
        nextFlags.activeDefense = true;
    }
    if (env.BLACKOUT_ACTIVE_DEFENSE === 'false') {
        nextFlags.activeDefense = false;
    }
    if (env.BLACKOUT_MESH_TRANSPORT === 'true') {
        nextFlags.meshTransport = true;
    }
    if (env.BLACKOUT_MESH_TRANSPORT === 'false') {
        nextFlags.meshTransport = false;
    }
    if (env.BLACKOUT_TRANSPARENCY_REPORTS === 'true') {
        nextFlags.transparencyReports = true;
    }
    if (env.BLACKOUT_TRANSPARENCY_REPORTS === 'false') {
        nextFlags.transparencyReports = false;
    }
    if (env.BLACKOUT_SETTINGS_PARITY === 'true') {
        nextFlags.settingsParity = true;
    }
    if (env.BLACKOUT_SETTINGS_PARITY === 'false') {
        nextFlags.settingsParity = false;
    }
    if (env.BLACKOUT_FEDERATED_OPS === 'true') {
        nextFlags.federatedOps = true;
    }
    if (env.BLACKOUT_FEDERATED_OPS === 'false') {
        nextFlags.federatedOps = false;
    }
    if (env.BLACKOUT_AUTH_THREADS === 'true') {
        nextFlags.authThreads = true;
    }
    if (env.BLACKOUT_AUTH_THREADS === 'false') {
        nextFlags.authThreads = false;
    }
    if (env.BLACKOUT_EDUCATION === 'true') {
        nextFlags.education = true;
    }
    if (env.BLACKOUT_EDUCATION === 'false') {
        nextFlags.education = false;
    }
    if (env.BLACKOUT_COALITION === 'true') {
        nextFlags.coalition = true;
    }
    if (env.BLACKOUT_COALITION === 'false') {
        nextFlags.coalition = false;
    }
    if (env.BLACKOUT_COLISEUM === 'true') {
        nextFlags.coliseum = true;
    }
    if (env.BLACKOUT_COLISEUM === 'false') {
        nextFlags.coliseum = false;
    }
    if (env.BLACKOUT_PROFILE === 'true') {
        nextFlags.profile = true;
    }
    if (env.BLACKOUT_PROFILE === 'false') {
        nextFlags.profile = false;
    }
    if (env.BLACKOUT_DEADMAN === 'true') {
        nextFlags.deadman = true;
    }
    if (env.BLACKOUT_DEADMAN === 'false') {
        nextFlags.deadman = false;
    }
    if (env.BLACKOUT_HOME === 'true') {
        nextFlags.home = true;
    }
    if (env.BLACKOUT_HOME === 'false') {
        nextFlags.home = false;
    }
    if (env.BLACKOUT_COMMUNITIES === 'true') {
        nextFlags.communities = true;
    }
    if (env.BLACKOUT_COMMUNITIES === 'false') {
        nextFlags.communities = false;
    }
    if (env.BLACKOUT_PLUGINS === 'true') {
        nextFlags.plugins = true;
    }
    if (env.BLACKOUT_PLUGINS === 'false') {
        nextFlags.plugins = false;
    }
    if (env.BLACKOUT_SHELL_APP_SHELL === 'true') {
        nextFlags.shellAppShell = true;
    }
    if (env.BLACKOUT_SHELL_APP_SHELL === 'false') {
        nextFlags.shellAppShell = false;
    }
    if (env.BLACKOUT_DISCOVERY_HOME_FEED === 'true') {
        nextFlags.discoveryHomeFeed = true;
    }
    if (env.BLACKOUT_DISCOVERY_HOME_FEED === 'false') {
        nextFlags.discoveryHomeFeed = false;
    }
    if (env.BLACKOUT_CANOPY_SERVER === 'true') {
        nextFlags.canopyServer = true;
    }
    if (env.BLACKOUT_CANOPY_SERVER === 'false') {
        nextFlags.canopyServer = false;
    }
    if (env.BLACKOUT_TOPICS === 'true') {
        nextFlags.topics = true;
    }
    if (env.BLACKOUT_TOPICS === 'false') {
        nextFlags.topics = false;
    }
    if (env.BLACKOUT_ONBOARDING_INTEREST_PICKER === 'true') {
        nextFlags.onboardingInterestPicker = true;
    }
    if (env.BLACKOUT_ONBOARDING_INTEREST_PICKER === 'false') {
        nextFlags.onboardingInterestPicker = false;
    }
    if (env.BLACKOUT_HOME_FEED_SEGMENTS === 'true') {
        nextFlags.homeFeedSegments = true;
    }
    if (env.BLACKOUT_HOME_FEED_SEGMENTS === 'false') {
        nextFlags.homeFeedSegments = false;
    }
    if (env.BLACKOUT_HOME_STREAK === 'true') {
        nextFlags.homeStreak = true;
    }
    if (env.BLACKOUT_HOME_STREAK === 'false') {
        nextFlags.homeStreak = false;
    }
    if (env.BLACKOUT_HOME_BOUNTY_BOARD === 'true') {
        nextFlags.homeBountyBoard = true;
    }
    if (env.BLACKOUT_HOME_BOUNTY_BOARD === 'false') {
        nextFlags.homeBountyBoard = false;
    }
    if (env.BLACKOUT_SERIES_TAG === 'true') {
        nextFlags.seriesTag = true;
    }
    if (env.BLACKOUT_SERIES_TAG === 'false') {
        nextFlags.seriesTag = false;
    }
    if (env.BLACKOUT_MARKET_TAB === 'true') {
        nextFlags.marketTab = true;
    }
    if (env.BLACKOUT_MARKET_TAB === 'false') {
        nextFlags.marketTab = false;
    }
    if (env.BLACKOUT_PRODUCTS_ATTACHMENTS === 'true') {
        nextFlags.productsAttachments = true;
    }
    if (env.BLACKOUT_PRODUCTS_ATTACHMENTS === 'false') {
        nextFlags.productsAttachments = false;
    }
    if (env.BLACKOUT_CREATORS_LISTINGS === 'true') {
        nextFlags.creatorsListings = true;
    }
    if (env.BLACKOUT_CREATORS_LISTINGS === 'false') {
        nextFlags.creatorsListings = false;
    }
    if (env.BLACKOUT_STREAMS_VIEWER === 'true') {
        nextFlags.streamsViewer = true;
    }
    if (env.BLACKOUT_STREAMS_VIEWER === 'false') {
        nextFlags.streamsViewer = false;
    }
    if (env.BLACKOUT_CREATORS_STOREFRONT === 'true') {
        nextFlags.creatorsStorefront = true;
    }
    if (env.BLACKOUT_CREATORS_STOREFRONT === 'false') {
        nextFlags.creatorsStorefront = false;
    }
    if (env.BLACKOUT_GROWTH_REFERRALS === 'true') {
        nextFlags.growthReferrals = true;
    }
    if (env.BLACKOUT_GROWTH_REFERRALS === 'false') {
        nextFlags.growthReferrals = false;
    }
    if (env.BLACKOUT_GROWTH_AMBASSADORS === 'true') {
        nextFlags.growthAmbassadors = true;
    }
    if (env.BLACKOUT_GROWTH_AMBASSADORS === 'false') {
        nextFlags.growthAmbassadors = false;
    }
    if (env.BLACKOUT_GROWTH_QUESTS === 'true') {
        nextFlags.growthQuests = true;
    }
    if (env.BLACKOUT_GROWTH_QUESTS === 'false') {
        nextFlags.growthQuests = false;
    }
    if (env.BLACKOUT_EVENTS_V1 === 'true') {
        nextFlags.eventsV1 = true;
    }
    if (env.BLACKOUT_EVENTS_V1 === 'false') {
        nextFlags.eventsV1 = false;
    }
    if (env.BLACKOUT_ONBOARDING_CREATOR_PATH === 'true') {
        nextFlags.onboardingCreatorPath = true;
    }
    if (env.BLACKOUT_ONBOARDING_CREATOR_PATH === 'false') {
        nextFlags.onboardingCreatorPath = false;
    }
    if (env.BLACKOUT_ONBOARDING_MIGRATION_CREDITS === 'true') {
        nextFlags.onboardingMigrationCredits = true;
    }
    if (env.BLACKOUT_ONBOARDING_MIGRATION_CREDITS === 'false') {
        nextFlags.onboardingMigrationCredits = false;
    }
    if (env.BLACKOUT_ONBOARDING_CREATOR_PLATFORM_LINKING === 'true') {
        nextFlags.onboardingCreatorPlatformLinking = true;
    }
    if (env.BLACKOUT_ONBOARDING_CREATOR_PLATFORM_LINKING === 'false') {
        nextFlags.onboardingCreatorPlatformLinking = false;
    }
    if (env.BLACKOUT_ONBOARDING_CREATOR_REWARDS === 'true') {
        nextFlags.onboardingCreatorRewards = true;
    }
    if (env.BLACKOUT_ONBOARDING_CREATOR_REWARDS === 'false') {
        nextFlags.onboardingCreatorRewards = false;
    }
    if (env.BLACKOUT_ONBOARDING_CREATOR_KITS === 'true') {
        nextFlags.onboardingCreatorKits = true;
    }
    if (env.BLACKOUT_ONBOARDING_CREATOR_KITS === 'false') {
        nextFlags.onboardingCreatorKits = false;
    }
    if (env.BLACKOUT_ONBOARDING_DEVELOPER_STEP === 'true') {
        nextFlags.onboardingDeveloperStep = true;
    }
    if (env.BLACKOUT_ONBOARDING_DEVELOPER_STEP === 'false') {
        nextFlags.onboardingDeveloperStep = false;
    }
    if (env.BLACKOUT_ONBOARDING_HOME_TOUR === 'true') {
        nextFlags.onboardingHomeTour = true;
    }
    if (env.BLACKOUT_ONBOARDING_HOME_TOUR === 'false') {
        nextFlags.onboardingHomeTour = false;
    }
    if (env.BLACKOUT_CREATORS_DASHBOARD === 'true') {
        nextFlags.creatorsDashboard = true;
    }
    if (env.BLACKOUT_CREATORS_DASHBOARD === 'false') {
        nextFlags.creatorsDashboard = false;
    }
    if (env.BLACKOUT_FEDERATION_SELF_HOST === 'true') {
        nextFlags.federationSelfHost = true;
    }
    if (env.BLACKOUT_FEDERATION_SELF_HOST === 'false') {
        nextFlags.federationSelfHost = false;
    }
    if (env.BLACKOUT_PRODUCTS_ATTACH_COMPOSER === 'true') {
        nextFlags.productsAttachComposer = true;
    }
    if (env.BLACKOUT_PRODUCTS_ATTACH_COMPOSER === 'false') {
        nextFlags.productsAttachComposer = false;
    }
    if (env.BLACKOUT_GROWTH_QUESTS_UI === 'true') {
        nextFlags.growthQuestsUi = true;
    }
    if (env.BLACKOUT_GROWTH_QUESTS_UI === 'false') {
        nextFlags.growthQuestsUi = false;
    }
    if (env.BLACKOUT_BUG_REPORT_WIDGET === 'true') {
        nextFlags.bugReportWidget = true;
    }
    if (env.BLACKOUT_BUG_REPORT_WIDGET === 'false') {
        nextFlags.bugReportWidget = false;
    }
    if (env.BLACKOUT_CREATOR_CONTENT === 'true') {
        nextFlags.creatorContent = true;
    }
    if (env.BLACKOUT_CREATOR_CONTENT === 'false') {
        nextFlags.creatorContent = false;
    }

    applyMonetizationEnvOverrides(env, nextFlags);
    validateMonetizationSkuDependencies(nextFlags);

    return nextFlags;
};

const collectRuntimeEnv = (): Record<string, string | undefined> => {
    const env: Record<string, string | undefined> = {};
    if (typeof process !== 'undefined' && process.env) {
        Object.assign(env, process.env as Record<string, string | undefined>);
    }
    try {
        const meta =
            (Function('return import.meta')() as { env?: Record<string, string | undefined> }) ??
            {};
        if (meta.env) Object.assign(env, meta.env);
    } catch {
        // ignore — `import.meta` is unavailable in some test contexts.
    }
    return env;
};

export const runtimeFeatureFlags = resolveFeatureFlags(collectRuntimeEnv());
