export type HomeTourTargetKind = 'testid' | 'shellRegion' | 'center';

export interface HomeTourStep {
    id: string;
    title: string;
    body: string;
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
        title: 'Home',
        body: 'Your homepage shows the latest activity across every den you have joined. This is the default landing surface for the new shell.',
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
        id: 'topic-chips',
        title: 'Topic chip bar',
        body: 'Browse by topic. Chips are pulled from the discovery service and link out to topic pages so users can find communities matching their interests.',
        targetTestId: 'topic-chip-bar',
        allowCenterFallback: true,
        filePaths: ['apps/blackout-client/src/app/features/topics/TopicChipBar.tsx'],
        docLinks: [
            { label: 'component-roadmap-v1.md', href: '/component-roadmap-v1.md' },
        ],
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
        docLinks: [
            { label: 'ROADMAP.md', href: '/ROADMAP.md' },
        ],
    },
    {
        id: 'activity-feed',
        title: 'Activity feed',
        body: 'A chronological merge of joined dens, grouped into Today / This week / Earlier. The feed is built by `buildHomeFeed` from a pure data model — no new server endpoint required.',
        targetTestId: 'home-feed-list',
        fallbackRegion: 'home-feed',
        allowCenterFallback: true,
        filePaths: [
            'apps/blackout-client/src/app/features/home/HomeFeed.tsx',
            'apps/blackout-client/src/app/features/home/feedModel.ts',
        ],
        docLinks: [
            { label: 'TESTERS.md', href: '/TESTERS.md' },
        ],
    },
    {
        id: 'activity-card',
        title: 'Activity cards',
        body: 'Each card links to its den and shows an unread badge when there is new activity. Card titles and subtitles are derived from Matrix room state.',
        targetTestId: 'home-feed-card',
        allowCenterFallback: true,
        filePaths: ['apps/blackout-client/src/app/features/home/HomeFeed.tsx'],
        docLinks: [
            { label: 'TESTERS.md', href: '/TESTERS.md' },
        ],
    },
    {
        id: 'empty-state',
        title: 'Empty state',
        body: 'If you have not joined any dens yet, the empty state nudges you toward Discover Canopies. New users will see this until they join their first community.',
        targetTestId: 'home-feed-empty',
        allowCenterFallback: true,
        filePaths: ['apps/blackout-client/src/app/features/home/HomeFeed.tsx'],
        docLinks: [
            { label: 'docs/discord_like_onboarding_execution_plan.md', href: '/docs/discord_like_onboarding_execution_plan.md' },
        ],
    },
    {
        id: 'quick-switcher',
        title: 'Quick switcher (Cmd+K / Ctrl+K)',
        body: 'Press Cmd+K (⌘K) on macOS or Ctrl+K on Windows/Linux anywhere in the app to jump to any room, command, or developer tool surface.',
        allowCenterFallback: true,
        filePaths: [
            'apps/blackout-client/src/app/features/settings/DeveloperSettings.tsx',
        ],
        docLinks: [
            { label: 'developer_guide.md', href: '/developer_guide.md' },
        ],
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
            { label: 'DISCORD_PARITY_BUILD_PLAN.md', href: '/DISCORD_PARITY_BUILD_PLAN.md' },
        ],
        showDebugBundle: true,
    },
];
