import React, { useCallback, useEffect, useMemo } from 'react';
import { useAtom } from 'jotai';
import { isValidColiseumTab, type ColiseumTabId } from '@blackout/core';
import { coliseumTabAtom, COLISEUM_TAB_ORDER } from '../../state/coliseum';
import ColiseumTabStrip from './ColiseumTabStrip';
import { FeatureGuide } from '../../components/feature-guide/FeatureGuide';
import { COLISEUM_TAB_GUIDES } from './coliseumTabGuides';
import { splitColiseumTabs } from './tabConsolidation';
import TopicsTab from './tabs/TopicsTab';
import ReelTab from './tabs/ReelTab';
import ChallengesTab from './tabs/ChallengesTab';
import LeaderboardsTab from './tabs/LeaderboardsTab';
import KnowledgeTab from './tabs/KnowledgeTab';
import { coliseumArenaTheme } from './coliseumArenaTheme.css';
import * as css from './ColiseumView.css';

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
        [enabledTabs]
    );

    const { primary } = useMemo(() => splitColiseumTabs(tabs), [tabs]);

    const fallbackTab = useMemo<ColiseumTabId>(
        () => primary[0] ?? tabs[0] ?? 'topics',
        [primary, tabs]
    );

    const activeTab = useMemo<ColiseumTabId>(() => {
        if (!isValidColiseumTab(storedTab)) return fallbackTab;
        // Tabs that became topic sections (debate, match, arena, shouts,
        // sources, live) are no longer strip destinations. A value persisted
        // before the consolidation must not blank the surface — fall back to
        // the feed, which is where those things are now reached from.
        if (!primary.includes(storedTab)) return fallbackTab;
        return storedTab;
    }, [storedTab, primary, fallbackTab]);

    // Rewrite a stale persisted tab so the next visit lands directly.
    useEffect(() => {
        if (storedTab !== activeTab) setTab(activeTab);
    }, [storedTab, activeTab, setTab]);

    const handleSelect = useCallback(
        (tab: ColiseumTabId) => {
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
        <section className={`${coliseumArenaTheme} ${css.root}`} data-testid="coliseum-view">
            <ColiseumTabStrip
                activeTab={activeTab}
                enabledTabs={tabs}
                onSelectTab={handleSelect}
                onSearch={onSearch}
                scopeLabel={scopeLabel}
            />
            <FeatureGuide>{COLISEUM_TAB_GUIDES[activeTab]}</FeatureGuide>
            {/*
             * Only cross-topic surfaces render here. Debate, match, arena,
             * shouts, sources and live are sections of `TopicPage` — reached by
             * drilling into the topic that produced them, not by a sibling tab.
             */}
            <div className={css.body}>
                {activeTab === 'topics' ? <TopicsTab scope={scope} /> : null}
                {activeTab === 'reel' ? <ReelTab /> : null}
                {activeTab === 'knowledge' ? <KnowledgeTab /> : null}
                {activeTab === 'challenges' ? <ChallengesTab /> : null}
                {activeTab === 'leaderboards' ? <LeaderboardsTab /> : null}
            </div>
        </section>
    );
}

export default ColiseumView;
