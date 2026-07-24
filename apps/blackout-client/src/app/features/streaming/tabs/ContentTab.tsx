import React, { lazy, Suspense, useCallback, useState } from 'react';
import { useAtom } from 'jotai';
import {
    CONTENT_VIEW_HINTS,
    CONTENT_VIEW_LABELS,
    CONTENT_VIEW_ORDER,
    streamingContentViewAtom,
    type ContentViewId,
} from '../../../state/streaming';
import HubSubTabs from '../components/HubSubTabs';
import { LiveDirectory, ReplaysDirectory } from '../../streams';

// Lazy for the same reason as in StreamingView: the clip viewer pulls in
// Matrix media helpers that must stay off the registry-load path.
const ClipsDirectory = lazy(() =>
    import('../sections/ClipsDirectory').then((mod) => ({ default: mod.ClipsDirectory }))
);

export interface ContentTabProps {
    /** Deep-link override (legacy tab ids remap here). Cleared on first click. */
    initialView?: ContentViewId;
}

/** Consolidated Content tab: the Live / Replays / Clips directories. */
export function ContentTab({ initialView }: ContentTabProps) {
    const [storedView, setView] = useAtom(streamingContentViewAtom);
    const [override, setOverride] = useState<ContentViewId | undefined>(initialView);
    const activeView = override ?? storedView;

    const handleSelect = useCallback(
        (view: ContentViewId) => {
            setOverride(undefined);
            setView(view);
        },
        [setView]
    );

    return (
        <div data-testid="streaming-tab-content">
            <HubSubTabs
                views={CONTENT_VIEW_ORDER}
                labels={CONTENT_VIEW_LABELS}
                hints={CONTENT_VIEW_HINTS}
                active={activeView}
                onSelect={handleSelect}
                ariaLabel="Content views"
            />
            {activeView === 'live' ? (
                <div data-testid="streaming-subview-live">
                    <LiveDirectory />
                </div>
            ) : null}
            {activeView === 'replays' ? (
                <div data-testid="streaming-subview-replays">
                    <ReplaysDirectory />
                </div>
            ) : null}
            {activeView === 'clips' ? (
                <div data-testid="streaming-subview-clips">
                    <Suspense fallback={null}>
                        <ClipsDirectory />
                    </Suspense>
                </div>
            ) : null}
        </div>
    );
}

export default ContentTab;
