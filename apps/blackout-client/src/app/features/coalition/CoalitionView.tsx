import React, { useMemo, useState } from 'react';
import { aiToolsEnabled, type CoalitionTabId } from '@blackout/core';
import { useDenType } from '../../hooks/useDenType';
import { FeatureGuide } from '../../components/feature-guide/FeatureGuide';
import MapTab from './tabs/MapTab';
import ToolBag from './toolbag/ToolBag';

export interface CoalitionViewProps {
    /**
     * Matrix room id when scoped to a single den; null when standalone or canopy-scoped.
     * Chat and Documents need a den to read from.
     */
    denId?: string | null;
    /** Matrix space id when scoped to a canopy or a den's parent space. */
    canopyId?: string | null;
    /** Restrict which tools the bag offers (a den's `co.bmc.coalition` state). */
    enabledTabs?: CoalitionTabId[];
    /** Visible chip explaining the scope (e.g. "Den · #aid:server"). */
    scopeLabel?: string;
    /** Optional handler for a search affordance. */
    onSearch?: () => void;
}

/**
 * Coalition is a map.
 *
 * It used to be a twelve-tab strip over a persistent map base layer, where
 * every non-map tab covered the map with an opaque overlay and a "✕ Map"
 * button to get back. The strip's only overflow handling was
 * `overflowX: 'auto'`, so on a phone seven of the twelve ran off the right
 * edge with no affordance saying so.
 *
 * Now the map is the whole surface — the world. Its legend names every kind of
 * pin and toggles it. Tapping a pin offers what you can *do* there. Anything
 * that isn't a place lives in the tool bag: an inventory you open over the map
 * and close to get back to it.
 *
 * The point is that Coalition connects to the real world, so the real world is
 * the interface and the software is what you carry.
 */
export function CoalitionView({ denId, canopyId, enabledTabs, scopeLabel }: CoalitionViewProps) {
    const denType = useDenType(denId ?? null);
    const aiEnabled = aiToolsEnabled(denType);
    const [bagOpen, setBagOpen] = useState(false);

    const scope = useMemo(
        () => ({
            canopyId: canopyId ?? undefined,
            denId: denId ?? undefined,
        }),
        [canopyId, denId]
    );

    return (
        <section
            style={{
                display: 'grid',
                gridTemplateRows: 'auto 1fr',
                height: '100%',
                minHeight: 0,
            }}
            data-testid="coalition-view"
        >
            <FeatureGuide>
                Everything nearby on one living map — stories, mutual aid, events, vendors, and
                gardens. Open the <strong>legend</strong> to choose what you see, tap a pin to act
                on it, or reach for the <strong>tool bag</strong> for anything that isn’t a place.
                {scopeLabel ? ` · ${scopeLabel}` : ''}
            </FeatureGuide>

            <div style={{ position: 'relative', minHeight: 0, overflow: 'hidden' }}>
                <MapTab scope={scope} />
                <ToolBag
                    open={bagOpen}
                    onSetOpen={setBagOpen}
                    scope={scope}
                    denId={denId ?? null}
                    denType={denType}
                    aiEnabled={aiEnabled}
                    enabledTabs={enabledTabs}
                />
            </div>
        </section>
    );
}

export default CoalitionView;
