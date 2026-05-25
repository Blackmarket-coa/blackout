import React, { useCallback, useMemo } from 'react';
import { useAtom } from 'jotai';
import { aiToolsEnabled, isValidCoalitionTab, type CoalitionTabId } from '@blackout/core';
import { coalitionTabAtom, COALITION_TAB_ORDER } from '../../state/coalition';
import { useDenType } from '../../hooks/useDenType';
import CoalitionTabStrip from './CoalitionTabStrip';
import ChatTab from './tabs/ChatTab';
import VideoTab from './tabs/VideoTab';
import MapTab from './tabs/MapTab';
import ShopTab from './tabs/ShopTab';
import TasksTab from './tabs/TasksTab';
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
        const base = (enabledTabs && enabledTabs.length > 0 ? enabledTabs : COALITION_TAB_ORDER)
            .filter((tab) => tab !== 'ai');
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
        [setTab, tabs],
    );

    const scope = useMemo(
        () => ({
            canopyId: canopyId ?? undefined,
            denId: denId ?? undefined,
        }),
        [canopyId, denId],
    );

    return (
        <section
            style={{ display: 'grid', gridTemplateRows: 'auto 1fr', height: '100%', minHeight: 0 }}
            data-testid="coalition-view"
        >
            <CoalitionTabStrip
                activeTab={activeTab}
                enabledTabs={tabs}
                onSelectTab={handleSelect}
                onSearch={onSearch}
                scopeLabel={scopeLabel}
            />
            <div style={{ minHeight: 0, overflow: 'auto' }}>
                {activeTab === 'chat' ? <ChatTab denId={denId ?? null} /> : null}
                {activeTab === 'video' ? <VideoTab scope={scope} /> : null}
                {activeTab === 'map' ? <MapTab scope={scope} /> : null}
                {activeTab === 'shop' ? <ShopTab scope={scope} /> : null}
                {activeTab === 'tasks' ? <TasksTab scope={scope} /> : null}
                {activeTab === 'documents' && denId ? (
                    <DocumentsTab roomId={denId} />
                ) : null}
                {activeTab === 'ai' ? (
                    <AiDenPanel roomId={denId ?? null} denType={denType} />
                ) : null}
            </div>
        </section>
    );
}

export default CoalitionView;
