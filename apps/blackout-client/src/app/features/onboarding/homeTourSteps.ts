export type HomeTourTargetKind = 'testid' | 'shellRegion' | 'center';

/**
 * Which shell a step applies to. The AppShell renders materially different
 * chrome per viewport — `AppShell.tsx` mounts `CanopyRail` and
 * `WorkspaceTabBar` on desktop only, and `BottomTabBar` / `MobileTopBar` on
 * mobile — so a step written for one can describe UI the other never shows.
 *
 * Steps carrying `allowCenterFallback` still *render* when their target is
 * absent; they just narrate something that isn't on screen. Filtering is what
 * stops that.
 */
export type HomeTourSurface = 'mobile' | 'desktop';

export interface HomeTourStep {
    id: string;
    title: string;
    body: string;
    /**
     * Shells this step applies to. Omitted means both — most steps target
     * HomeFeed content, which renders identically either way.
     */
    surfaces?: HomeTourSurface[];
    /** Primary DOM target — usually a `data-testid`. */
    targetTestId?: string;
    /** Fallback target — `data-shell-region` attribute. */
    fallbackRegion?: string;
    /** If true and the target can't be resolved, show the tooltip centred. */
    allowCenterFallback?: boolean;
    /** Source files implementing this region, shown to bug hunters. */
    filePaths: string[];
    /** Repo-relative markdown docs that document this surface. */
    docLinks: { label: string; href: string }[];
    /** When true, the tooltip includes a "Download debug bundle" button. */
    showDebugBundle?: boolean;
}

/**
 * Tour stops walking a new beta user through every homepage section, plus
 * the cross-cutting Cmd+K quick switcher and Settings → Developer Tools.
 *
 * Source-file paths and doc links are surfaced verbatim in the tooltip so
 * bug hunters and software teams can jump directly into the implementation
 * when filing issues.
 */
export const HOME_TOUR_STEPS: HomeTourStep[] = [
    {
        id: 'header',
        title: 'Town Square',
        body: 'The Town Square shows the latest activity across every den you have joined. This is the default landing surface for the new shell.',
        targetTestId: 'home-feed-header',
        fallbackRegion: 'home-feed',
        allowCenterFallback: true,
        filePaths: ['apps/blackout-client/src/app/features/home/HomeFeed.tsx'],
        docLinks: [
            { label: 'README.md', href: '/README.md' },
            { label: 'developer_guide.md', href: '/developer_guide.md' },
        ],
    },
    {
        id: 'feed-segments',
        title: 'For You / Following',
        body: 'Switch between a personalized "For You" feed and posts from communities you follow, and sort by Hot, New, or Top — the same controls you already know from other apps.',
        targetTestId: 'home-feed-segment-foryou',
        fallbackRegion: 'home-feed-segment',
        allowCenterFallback: true,
        filePaths: ['apps/blackout-client/src/app/features/home/HomeFeed.tsx'],
        docLinks: [{ label: 'TESTERS.md', href: '/TESTERS.md' }],
    },
    {
        id: 'canopy-rail',
        title: 'Canopy rail',
        body: 'The left rail lists every canopy (community) you have joined, plus Home at the top. Drag to reorder, drop one canopy on another to make a folder — the order and folders persist to your account.',
        // Desktop only: AppShell renders `{mobile ? null : <CanopyRail />}`.
        surfaces: ['desktop'],
        fallbackRegion: 'canopy-sidebar',
        allowCenterFallback: true,
        filePaths: ['apps/blackout-client/src/app/pages/shell/CanopyRail.tsx'],
        docLinks: [{ label: 'TESTERS.md', href: '/TESTERS.md' }],
    },
    {
        id: 'bottom-tabs',
        title: 'Getting around',
        body: 'The bar along the bottom is how you move between the big destinations — Town Square, Coalition, Coliseum, Streams, and your profile. Whichever one you are in stays highlighted.',
        surfaces: ['mobile'],
        targetTestId: 'app-shell-bottom-tab-bar',
        fallbackRegion: 'bottom-tab-bar',
        allowCenterFallback: true,
        filePaths: ['apps/blackout-client/src/app/pages/shell/BottomTabBar.tsx'],
        docLinks: [{ label: 'TESTERS.md', href: '/TESTERS.md' }],
    },
    {
        id: 'mobile-canopies',
        title: 'Your canopies',
        body: 'Tap the canopies button in the top bar to see the communities you have joined and drop into their dens. On a phone this replaces the drag-to-reorder rail you get on a wide screen.',
        surfaces: ['mobile'],
        targetTestId: 'mobile-top-bar-canopies',
        fallbackRegion: 'mobile-top-bar',
        allowCenterFallback: true,
        filePaths: ['apps/blackout-client/src/app/pages/shell/MobileTopBar.tsx'],
        docLinks: [{ label: 'TESTERS.md', href: '/TESTERS.md' }],
    },
    {
        id: 'canopies-hub',
        title: 'Canopies and dens',
        body: 'Open a canopy from the rail — or the Canopies hub — to see its dens: the channels you post in, grouped by category. Auto-created dens land under a Topics category. A canopy is the community; a den is a room inside it.',
        allowCenterFallback: true,
        filePaths: [
            'apps/blackout-client/src/app/features/canopy/CanopyHubView.tsx',
            'apps/blackout-client/src/app/features/canopy/CanopyChannelSidebar.tsx',
        ],
        docLinks: [{ label: 'TESTERS.md', href: '/TESTERS.md' }],
    },
    {
        id: 'topic-chips',
        title: 'Topic chip bar',
        body: 'Browse by topic. Chips come from the discovery service and open topic pages listing the canopies that talk about them, so you can find communities by interest rather than by name.',
        targetTestId: 'topic-chip-bar',
        allowCenterFallback: true,
        filePaths: [
            'apps/blackout-client/src/app/features/topics/TopicChipBar.tsx',
            'apps/blackout-client/src/app/features/topics/TopicView.tsx',
        ],
        docLinks: [{ label: 'TESTERS.md', href: '/TESTERS.md' }],
    },
    {
        id: 'quick-actions',
        title: 'Quick actions',
        body: 'Shortcut cards jump to Canopies, Events, Live, and Market. Each card is feature-flag gated, so you only ever see links that go somewhere — Creator Hub, Coalition, and Coliseum live in the global top nav instead.',
        targetTestId: 'home-quick-actions',
        fallbackRegion: 'home-quick-actions',
        allowCenterFallback: true,
        filePaths: ['apps/blackout-client/src/app/features/home/HomeFeed.tsx'],
        docLinks: [{ label: 'TESTERS.md', href: '/TESTERS.md' }],
    },
    {
        id: 'create-hub',
        title: 'Create something',
        body: 'The Create hub at /create is the one place to start a canopy, add a den, import an existing Discord server, or list something for sale. Importing a Discord export rebuilds its categories and channels as dens.',
        allowCenterFallback: true,
        filePaths: [
            'apps/blackout-client/src/app/features/create/CreateHub.tsx',
            'apps/blackout-client/src/app/features/create/DiscordImportWizard.tsx',
        ],
        docLinks: [{ label: 'TESTERS.md', href: '/TESTERS.md' }],
    },
    {
        id: 'coalition-map',
        title: 'Coalition map',
        body: 'Coalition puts needs, projects, and resources on a shared map. Toggle layers from the legend, use the tool bag to drop a place or post a need, and switch to the nearby and heat views to see what is around you.',
        allowCenterFallback: true,
        filePaths: [
            'apps/blackout-client/src/app/features/coalition/tabs/MapTab.tsx',
            'apps/blackout-client/src/app/features/coalition/map/MapLegend.tsx',
        ],
        docLinks: [{ label: 'TESTERS.md', href: '/TESTERS.md' }],
    },
    {
        id: 'plugin-cards',
        title: 'Plugin cards',
        body: 'Installed plugins that declare a homepage card render here. Order is driven by each plugin manifest’s `homepageCard.order` value.',
        targetTestId: 'home-plugin-cards',
        fallbackRegion: 'home-plugin-cards',
        allowCenterFallback: true,
        filePaths: [
            'apps/blackout-client/src/app/features/home/PluginCardRail.tsx',
            'apps/blackout-client/src/app/features/monetization/install/installedPluginsAtom.ts',
        ],
        docLinks: [{ label: 'ROADMAP.md', href: '/ROADMAP.md' }],
    },
    {
        id: 'activity-feed',
        title: 'Following feed',
        body: 'A unified, ranked feed of activity from the communities and creators you follow — joined dens, livestreams, coalition posts, and coliseum debates merged into one list. Aggregated client-side, so no new server endpoint is required.',
        targetTestId: 'home-feed-list',
        fallbackRegion: 'home-following',
        allowCenterFallback: true,
        filePaths: [
            'apps/blackout-client/src/app/features/home/HomeFeed.tsx',
            'apps/blackout-client/src/app/features/home/unifiedFeedModel.ts',
            'apps/blackout-client/src/app/features/home/hooks/useUnifiedFeed.ts',
        ],
        docLinks: [{ label: 'TESTERS.md', href: '/TESTERS.md' }],
    },
    {
        id: 'discover-feed',
        title: 'Discover feed',
        body: 'Below Following, the Discover section surfaces ranked content you are not following yet — coalitions, coliseum debates, and live streams from across Blackout. It is de-duplicated against Following so nothing shows up twice.',
        targetTestId: 'home-discover-list',
        fallbackRegion: 'home-discover',
        allowCenterFallback: true,
        filePaths: [
            'apps/blackout-client/src/app/features/home/HomeFeed.tsx',
            'apps/blackout-client/src/app/features/home/unifiedFeedModel.ts',
        ],
        docLinks: [{ label: 'TESTERS.md', href: '/TESTERS.md' }],
    },
    {
        id: 'activity-card',
        title: 'Activity cards',
        body: 'Each card links to its den and shows an unread badge when there is new activity. Card titles and subtitles are derived from Matrix room state.',
        targetTestId: 'home-feed-card',
        allowCenterFallback: true,
        filePaths: ['apps/blackout-client/src/app/features/home/HomeFeed.tsx'],
        docLinks: [{ label: 'TESTERS.md', href: '/TESTERS.md' }],
    },
    {
        id: 'empty-state',
        title: 'Empty state',
        body: 'If you have not joined any dens yet, the empty state nudges you toward Discover Canopies. New users will see this until they join their first community.',
        targetTestId: 'home-feed-empty',
        allowCenterFallback: true,
        filePaths: ['apps/blackout-client/src/app/features/home/HomeFeed.tsx'],
        docLinks: [
            {
                label: 'docs/coliseum/challenges/01-onboarding.md',
                href: '/docs/coliseum/challenges/01-onboarding.md',
            },
        ],
    },
    {
        id: 'quick-switcher',
        title: 'Quick switcher (Cmd+K / Ctrl+K)',
        body: 'Press Cmd+K (⌘K) on macOS or Ctrl+K on Windows/Linux anywhere in the app to jump to any room, command, or developer tool surface.',
        // Keyboard-only affordance — nothing to press on a phone.
        surfaces: ['desktop'],
        allowCenterFallback: true,
        filePaths: ['apps/blackout-client/src/app/features/settings/DeveloperSettings.tsx'],
        docLinks: [{ label: 'developer_guide.md', href: '/developer_guide.md' }],
    },
    {
        id: 'bug-reporting',
        title: 'Report a problem',
        body: 'A floating “Report a problem” button is available on every screen. It captures context about what you are looking at and posts the report to the `#bugs` room, so testers can file issues without leaving the app.',
        targetTestId: 'bug-report-fab',
        allowCenterFallback: true,
        filePaths: [
            'apps/blackout-client/src/app/features/bug-widget/BugReportFab.tsx',
            'apps/blackout-client/src/app/features/bug-widget/BugReportWidgetModal.tsx',
        ],
        docLinks: [{ label: 'TESTERS.md', href: '/TESTERS.md' }],
    },
    {
        id: 'developer-tools',
        title: 'Settings → Developer Tools',
        body: 'Bug hunters: enable Developer Tools in Settings to inspect Matrix events, edit room state, view account data, copy your access token, and export a debug bundle for issue reports.',
        allowCenterFallback: true,
        filePaths: [
            'apps/blackout-client/src/app/features/settings/developer-tools/DevelopTools.tsx',
            'apps/blackout-client/src/app/features/common-settings/developer-tools/DevelopTools.tsx',
            'apps/blackout-client/src/app/features/settings/DeveloperSettings.tsx',
        ],
        docLinks: [
            { label: 'README.md', href: '/README.md' },
            { label: 'TESTERS.md', href: '/TESTERS.md' },
            { label: 'developer_guide.md', href: '/developer_guide.md' },
        ],
        showDebugBundle: true,
    },
];

/**
 * The steps that apply to a given shell, in order.
 *
 * Derived rather than mutated, mirroring how `OnboardingFlow` builds its
 * `visibleSteps` from `ONBOARDING_STEP_SEQUENCE`: the canonical array stays
 * stable so a persisted index keeps pointing at a real step, and callers
 * clamp against the derived length.
 */
export const visibleHomeTourSteps = (surface: HomeTourSurface): HomeTourStep[] =>
    HOME_TOUR_STEPS.filter((step) => !step.surfaces || step.surfaces.includes(surface));
