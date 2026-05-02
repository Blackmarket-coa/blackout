import React, { useCallback, useMemo } from 'react';
import { useAtom } from 'jotai';
import { isValidColiseumTab, type ColiseumTabId } from '@blackout/core';
import { coliseumTabAtom, COLISEUM_TAB_ORDER } from '../../state/bmc-coliseum';
import ColiseumTabStrip from './ColiseumTabStrip';
import TopicsTab from './tabs/TopicsTab';
import DebateTab from './tabs/DebateTab';
import LiveTab from './tabs/LiveTab';
import SourcesTab from './tabs/SourcesTab';

export interface ColiseumViewProps {
    /**
     * Matrix room id when scoped to a single den; null when standalone or canopy-scoped.
     * Coliseum's debate stream is always topic-keyed, so denId scopes the visible topics.
     */
    denId?: string | null;
    /** Matrix space id when scoped to a canopy or a den's parent space. */
    canopyId?: string | null;
    /** Restrict which tabs render (e.g. when a den's co.bmc.coliseum state limits them). */
    enabledTabs?: ColiseumTabId[];
    /** Visible chip explaining the scope (e.g. "Den · #debate:server"). */
    scopeLabel?: string;
    /** Optional handler for the search button on the strip. */
    onSearch?: () => void;
}

export function ColiseumView({
    denId,
    canopyId,
    enabledTabs,
    scopeLabel,
    onSearch,
}: ColiseumViewProps) {
    const [storedTab, setTab] = useAtom(coliseumTabAtom);

    const tabs = useMemo<ColiseumTabId[]>(
        () => (enabledTabs && enabledTabs.length > 0 ? enabledTabs : COLISEUM_TAB_ORDER),
        [enabledTabs],
    );

    const activeTab = useMemo<ColiseumTabId>(() => {
        if (isValidColiseumTab(storedTab) && tabs.includes(storedTab)) return storedTab;
        return tabs[0] ?? 'topics';
    }, [storedTab, tabs]);

    const handleSelect = useCallback(
        (tab: ColiseumTabId) => {
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
            data-testid="coliseum-view"
        >
            <ColiseumTabStrip
                activeTab={activeTab}
                enabledTabs={tabs}
                onSelectTab={handleSelect}
                onSearch={onSearch}
                scopeLabel={scopeLabel}
            />
            <div style={{ minHeight: 0, overflow: 'auto' }}>
                {activeTab === 'topics' ? <TopicsTab scope={scope} /> : null}
                {activeTab === 'debate' ? <DebateTab /> : null}
                {activeTab === 'live' ? <LiveTab /> : null}
                {activeTab === 'sources' ? <SourcesTab /> : null}
            </div>
        </section>
    );
}

export default ColiseumView;
