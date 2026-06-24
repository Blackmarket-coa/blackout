import React, { useCallback, useMemo } from 'react';
import { useAtom } from 'jotai';
import { aiToolsEnabled, isValidCoalitionTab, type CoalitionTabId } from '@blackout/core';
import { coalitionTabAtom, COALITION_TAB_ORDER } from '../../state/coalition';
import { useDenType } from '../../hooks/useDenType';
import CoalitionTabStrip from './CoalitionTabStrip';
import { FeatureGuide } from '../../components/feature-guide/FeatureGuide';
import { COALITION_TAB_GUIDES } from './coalitionTabGuides';
import ChatTab from './tabs/ChatTab';
import MapTab from './tabs/MapTab';
import EventsTab from './tabs/EventsTab';
import RingsTab from './tabs/RingsTab';
import KitsTab from './tabs/KitsTab';
import ShopTab from './tabs/ShopTab';
import TasksTab from './tabs/TasksTab';
import NeedsTab from './tabs/NeedsTab';
import ProjectsTab from './tabs/ProjectsTab';
import ResourcesTab from './tabs/ResourcesTab';
import { DocumentsTab } from '../documents/DocumentsTab';
import AiDenPanel from '../aiden/AiDenPanel';

export interface CoalitionViewProps {
    /**
     * Matrix room id when scoped to a single den; null when standalone or canopy-scoped.
     * Chat tab needs a den to render a timeline.
     */
    denId?: string | null;
    /** Matrix space id when scoped to a canopy or a den's parent space. */
    canopyId?: string | null;
    /** Restrict which tabs render (e.g. when a den's co.bmc.coalition state limits them). */
    enabledTabs?: CoalitionTabId[];
    /** Visible chip explaining the scope (e.g. "Den · #aid:server"). */
    scopeLabel?: string;
    /** Optional handler for the search button on the strip. */
    onSearch?: () => void;
}

export function CoalitionView({
    denId,
    canopyId,
    enabledTabs,
    scopeLabel,
    onSearch,
}: CoalitionViewProps) {
    const [storedTab, setTab] = useAtom(coalitionTabAtom);
    const denType = useDenType(denId ?? null);
    const isAiDen = aiToolsEnabled(denType);

    const tabs = useMemo<CoalitionTabId[]>(() => {
        const base = (
            enabledTabs && enabledTabs.length > 0 ? enabledTabs : COALITION_TAB_ORDER
        ).filter((tab) => tab !== 'ai');
        // The AI tab surfaces only inside AI dens.
        return isAiDen ? [...base, 'ai'] : base;
    }, [enabledTabs, isAiDen]);

    const activeTab = useMemo<CoalitionTabId>(() => {
        if (isValidCoalitionTab(storedTab) && tabs.includes(storedTab)) return storedTab;
        return tabs[0] ?? 'chat';
    }, [storedTab, tabs]);

    const handleSelect = useCallback(
        (tab: CoalitionTabId) => {
            if (!tabs.includes(tab)) return;
            setTab(tab);
        },
        [setTab, tabs]
    );

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
                gridTemplateRows: 'auto auto 1fr',
                height: '100%',
                minHeight: 0,
            }}
            data-testid="coalition-view"
        >
            <CoalitionTabStrip
                activeTab={activeTab}
                enabledTabs={tabs}
                onSelectTab={handleSelect}
                onSearch={onSearch}
                scopeLabel={scopeLabel}
            />
            <FeatureGuide>{COALITION_TAB_GUIDES[activeTab]}</FeatureGuide>
            {/*
             * Coalition is map-first: the map is the persistent base layer and is
             * always mounted. Every other tab opens as a sheet floating over the
             * map, and closing it returns to the map.
             */}
            <div style={{ position: 'relative', minHeight: 0, overflow: 'hidden' }}>
                <MapTab scope={scope} />
                {activeTab !== 'map' ? (
                    <div
                        data-testid="coalition-tab-overlay"
                        style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 10,
                            overflow: 'auto',
                            background: 'var(--bg-base, #0d0d0d)',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <div
                            style={{
                                position: 'sticky',
                                top: 0,
                                zIndex: 1,
                                display: 'flex',
                                justifyContent: 'flex-end',
                                padding: 8,
                                background: 'var(--bg-base, #0d0d0d)',
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => handleSelect('map')}
                                aria-label="Back to map"
                                data-testid="coalition-overlay-close"
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 999,
                                    background: 'var(--bg-surface)',
                                    color: 'var(--text-primary)',
                                    padding: '4px 12px',
                                    fontSize: 13,
                                    cursor: 'pointer',
                                }}
                            >
                                ✕ Map
                            </button>
                        </div>
                        <div style={{ flex: 1, minHeight: 0 }}>
                            {activeTab === 'chat' ? <ChatTab denId={denId ?? null} /> : null}
                            {activeTab === 'events' ? <EventsTab scope={scope} /> : null}
                            {activeTab === 'rings' ? <RingsTab /> : null}
                            {activeTab === 'shop' ? <ShopTab scope={scope} /> : null}
                            {activeTab === 'tasks' ? <TasksTab scope={scope} /> : null}
                            {activeTab === 'needs' ? <NeedsTab scope={scope} /> : null}
                            {activeTab === 'projects' ? <ProjectsTab scope={scope} /> : null}
                            {activeTab === 'resources' ? <ResourcesTab scope={scope} /> : null}
                            {activeTab === 'kits' ? <KitsTab scope={scope} /> : null}
                            {activeTab === 'documents' && denId ? (
                                <DocumentsTab roomId={denId} />
                            ) : null}
                            {activeTab === 'ai' ? (
                                <AiDenPanel roomId={denId ?? null} denType={denType} />
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </div>
        </section>
    );
}

export default CoalitionView;
