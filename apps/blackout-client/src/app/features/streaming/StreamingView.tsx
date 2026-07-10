import React, { lazy, Suspense, type CSSProperties, useCallback, useMemo } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import {
    DEFAULT_STREAMING_TAB,
    isContentView,
    isEarningsView,
    isIntegrationsView,
    isValidStreamingTab,
    resolveStreamingTab,
    streamingContentViewAtom,
    streamingEarningsViewAtom,
    streamingIntegrationsViewAtom,
    streamingTabAtom,
    type LegacyStreamingTabId,
    type StreamingHubViewId,
    type StreamingTabId,
} from '../../state/streaming';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';
import StreamingTabStrip from './StreamingTabStrip';
import ContentTab from './tabs/ContentTab';
import EarningsTab from './tabs/EarningsTab';
import IntegrationsTab from './tabs/IntegrationsTab';

// Hub sections are lazy-loaded so the registry-load path stays
// jsdom-independent (the overview/bounty sections pull in the
// growth/monetization clients).
const CreatorHubOverview = lazy(() =>
    import('./sections/CreatorHubOverview').then((mod) => ({ default: mod.CreatorHubOverview }))
);
const CreatorKits = lazy(() =>
    import('./sections/CreatorKits').then((mod) => ({ default: mod.CreatorKits }))
);
const CreatorHubBounties = lazy(() =>
    import('./sections/CreatorHubBounties').then((mod) => ({ default: mod.CreatorHubBounties }))
);
const CreatorHubPostBounty = lazy(() =>
    import('./sections/CreatorHubPostBounty').then((mod) => ({ default: mod.CreatorHubPostBounty }))
);
const CreatorHubContent = lazy(() =>
    import('./sections/CreatorHubContent').then((mod) => ({ default: mod.CreatorHubContent }))
);

const contentStyle: CSSProperties = { minHeight: 0, overflow: 'auto' };

export interface StreamingViewProps {
    /**
     * Force a specific tab (used in tests and deep-links). Accepts retired
     * pre-consolidation tab ids too — they resolve to the merged tab with the
     * matching sub-view selected. Falls back to the persisted tab.
     */
    initialTab?: StreamingTabId | LegacyStreamingTabId;
}

export function StreamingView({ initialTab }: StreamingViewProps) {
    const [storedTab, setTab] = useAtom(streamingTabAtom);
    const setContentView = useSetAtom(streamingContentViewAtom);
    const setEarningsView = useSetAtom(streamingEarningsViewAtom);
    const setIntegrationsView = useSetAtom(streamingIntegrationsViewAtom);

    const initial = useMemo(
        () => (initialTab ? resolveStreamingTab(initialTab) : undefined),
        [initialTab]
    );

    const activeTab = useMemo<StreamingTabId>(() => {
        if (initial) return initial.tab;
        if (isValidStreamingTab(storedTab)) return storedTab;
        return DEFAULT_STREAMING_TAB;
    }, [initial, storedTab]);

    const handleSelect = useCallback(
        (tab: StreamingTabId, view?: StreamingHubViewId) => {
            setTab(tab);
            if (isContentView(view)) setContentView(view);
            else if (isEarningsView(view)) setEarningsView(view);
            else if (isIntegrationsView(view)) setIntegrationsView(view);
        },
        [setTab, setContentView, setEarningsView, setIntegrationsView]
    );

    return (
        <section
            style={{ display: 'grid', gridTemplateRows: 'auto 1fr', height: '100%', minHeight: 0 }}
            data-testid="streaming-view"
        >
            <StreamingTabStrip activeTab={activeTab} onSelectTab={handleSelect} />
            <div style={contentStyle}>
                {activeTab === 'overview' ? (
                    <div data-testid="streaming-tab-overview">
                        <Suspense fallback={null}>
                            <CreatorHubOverview onSelectTab={handleSelect} />
                        </Suspense>
                        {runtimeFeatureFlags.creatorContent ? (
                            <Suspense fallback={null}>
                                <div style={{ padding: 16 }}>
                                    <CreatorHubContent />
                                </div>
                            </Suspense>
                        ) : null}
                        {runtimeFeatureFlags.homeBountyBoard ? (
                            <Suspense fallback={null}>
                                <CreatorHubPostBounty />
                                <CreatorHubBounties />
                            </Suspense>
                        ) : null}
                    </div>
                ) : null}
                {activeTab === 'content' ? (
                    <ContentTab
                        initialView={
                            initial && isContentView(initial.view) ? initial.view : undefined
                        }
                    />
                ) : null}
                {activeTab === 'kits' ? (
                    <div data-testid="streaming-tab-kits">
                        <Suspense fallback={null}>
                            <CreatorKits />
                        </Suspense>
                    </div>
                ) : null}
                {activeTab === 'earnings' ? (
                    <EarningsTab
                        initialView={
                            initial && isEarningsView(initial.view) ? initial.view : undefined
                        }
                    />
                ) : null}
                {activeTab === 'integrations' ? (
                    <IntegrationsTab
                        initialView={
                            initial && isIntegrationsView(initial.view) ? initial.view : undefined
                        }
                    />
                ) : null}
            </div>
        </section>
    );
}

export default StreamingView;
