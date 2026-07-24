import React, { lazy, Suspense, type CSSProperties, useCallback, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import {
    EARNINGS_VIEW_HINTS,
    EARNINGS_VIEW_LABELS,
    EARNINGS_VIEW_ORDER,
    streamingEarningsViewAtom,
    type EarningsViewId,
} from '../../../state/streaming';
import { runtimeFeatureFlags } from '../../../core/features/featureFlags';
import HubSubTabs from '../components/HubSubTabs';
import { ChannelPointsRewards } from '../../settings/channel-points';

// Lazy for the same reason as in StreamingView: these sections pull in the
// growth / monetization clients, which must stay off the registry-load path.
const RewardsSection = lazy(() =>
    import('../sections/RewardsSection').then((mod) => ({ default: mod.RewardsSection }))
);
const CreatorHubBountyRewards = lazy(() =>
    import('../sections/CreatorHubBountyRewards').then((mod) => ({
        default: mod.CreatorHubBountyRewards,
    }))
);
const CreatorHubCreatorDrivenSales = lazy(() =>
    import('../sections/CreatorHubCreatorDrivenSales').then((mod) => ({
        default: mod.CreatorHubCreatorDrivenSales,
    }))
);
const CreatorHubListings = lazy(() =>
    import('../sections/CreatorHubListings').then((mod) => ({ default: mod.CreatorHubListings }))
);
const SplitContracts = lazy(() =>
    import('../sections/SplitContracts').then((mod) => ({ default: mod.SplitContracts }))
);

const sectionStackStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 28,
    padding: 16,
};

export interface EarningsTabProps {
    /** Deep-link override (legacy tab ids remap here). Cleared on first click. */
    initialView?: EarningsViewId;
}

/** Consolidated Earnings tab: Rewards, Listings (flag-gated), and Splits. */
export function EarningsTab({ initialView }: EarningsTabProps) {
    // The Listings surface is gated by the `creatorsListings` flag; filter it
    // out of the sub-tab row (and treat it as invalid) when the flag is off.
    const visibleViews = useMemo<EarningsViewId[]>(
        () =>
            EARNINGS_VIEW_ORDER.filter(
                (view) => view !== 'listings' || runtimeFeatureFlags.creatorsListings
            ),
        []
    );

    const [storedView, setView] = useAtom(streamingEarningsViewAtom);
    const [override, setOverride] = useState<EarningsViewId | undefined>(initialView);
    const activeView = useMemo<EarningsViewId>(() => {
        if (override && visibleViews.includes(override)) return override;
        if (visibleViews.includes(storedView)) return storedView;
        return visibleViews[0];
    }, [override, storedView, visibleViews]);

    const handleSelect = useCallback(
        (view: EarningsViewId) => {
            setOverride(undefined);
            setView(view);
        },
        [setView]
    );

    return (
        <div data-testid="streaming-tab-earnings">
            <HubSubTabs
                views={visibleViews}
                labels={EARNINGS_VIEW_LABELS}
                hints={EARNINGS_VIEW_HINTS}
                active={activeView}
                onSelect={handleSelect}
                ariaLabel="Earnings views"
            />
            {activeView === 'rewards' ? (
                <div style={sectionStackStyle} data-testid="streaming-subview-rewards">
                    <Suspense fallback={null}>
                        <RewardsSection />
                    </Suspense>
                    {runtimeFeatureFlags.homeBountyBoard ? (
                        <Suspense fallback={null}>
                            <CreatorHubCreatorDrivenSales />
                            <CreatorHubBountyRewards />
                        </Suspense>
                    ) : null}
                    <ChannelPointsRewards />
                </div>
            ) : null}
            {activeView === 'listings' ? (
                <div data-testid="streaming-subview-listings">
                    <Suspense fallback={null}>
                        <CreatorHubListings />
                    </Suspense>
                </div>
            ) : null}
            {activeView === 'splits' ? (
                <div data-testid="streaming-subview-splits">
                    <Suspense fallback={null}>
                        <SplitContracts />
                    </Suspense>
                </div>
            ) : null}
        </div>
    );
}

export default EarningsTab;
