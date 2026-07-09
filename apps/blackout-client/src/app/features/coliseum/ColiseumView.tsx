import React, { useCallback, useEffect, useMemo } from 'react';
import { useAtom } from 'jotai';
import { isValidColiseumTab, type ColiseumTabId } from '@blackout/core';
import {
    coliseumReturnTabAtom,
    coliseumTabAtom,
    COLISEUM_TAB_ORDER,
    selectedColiseumTopicIdAtom,
} from '../../state/coliseum';
import ColiseumTabStrip from './ColiseumTabStrip';
import { FeatureGuide } from '../../components/feature-guide/FeatureGuide';
import { COLISEUM_TAB_GUIDES } from './coliseumTabGuides';
import { splitColiseumTabs } from './tabConsolidation';
import TopicsTab from './tabs/TopicsTab';
import DebateTab from './tabs/DebateTab';
import ReelTab from './tabs/ReelTab';
import LiveTab from './tabs/LiveTab';
import ChallengesTab from './tabs/ChallengesTab';
import LeaderboardsTab from './tabs/LeaderboardsTab';
import SourcesTab from './tabs/SourcesTab';
import ArenaTab from './tabs/ArenaTab';
import MatchTab from './tabs/MatchTab';
import ShoutsTab from './tabs/ShoutsTab';
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
    const [selectedTopicId] = useAtom(selectedColiseumTopicIdAtom);
    const [returnTab] = useAtom(coliseumReturnTabAtom);

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
        if (!isValidColiseumTab(storedTab) || !tabs.includes(storedTab)) return fallbackTab;
        // The debate drill-in is meaningless without a topic (e.g. a stale
        // persisted tab) — show the topics feed instead.
        if (storedTab === 'debate' && !selectedTopicId) {
            return tabs.includes('topics') ? 'topics' : fallbackTab;
        }
        return storedTab;
    }, [storedTab, tabs, fallbackTab, selectedTopicId]);

    // Keep the persisted atom in sync when the debate drill-in was redirected.
    useEffect(() => {
        if (storedTab === 'debate' && !selectedTopicId) setTab(activeTab);
    }, [storedTab, selectedTopicId, activeTab, setTab]);

    const handleSelect = useCallback(
        (tab: ColiseumTabId) => {
            if (!tabs.includes(tab)) return;
            setTab(tab);
        },
        [setTab, tabs]
    );

    const handleBack = useCallback(() => {
        const target = tabs.includes(returnTab) && returnTab !== 'debate' ? returnTab : fallbackTab;
        setTab(target);
    }, [tabs, returnTab, fallbackTab, setTab]);

    const scope = useMemo(
        () => ({
            canopyId: canopyId ?? undefined,
            denId: denId ?? undefined,
        }),
        [canopyId, denId]
    );

    const isDebateDrillIn = activeTab === 'debate';

    return (
        <section className={`${coliseumArenaTheme} ${css.root}`} data-testid="coliseum-view">
            <ColiseumTabStrip
                activeTab={activeTab}
                enabledTabs={tabs}
                onSelectTab={handleSelect}
                onSearch={onSearch}
                scopeLabel={scopeLabel}
            />
            {isDebateDrillIn ? (
                <div className={css.backBar} data-testid="coliseum-debate-back-bar">
                    <button
                        type="button"
                        className={css.backButton}
                        aria-label="Back"
                        data-testid="coliseum-debate-back"
                        onClick={handleBack}
                    >
                        ←
                    </button>
                    <span className={css.backTitle}>Debate</span>
                </div>
            ) : (
                <FeatureGuide>{COLISEUM_TAB_GUIDES[activeTab]}</FeatureGuide>
            )}
            <div className={css.body}>
                {activeTab === 'arena' ? <ArenaTab /> : null}
                {activeTab === 'match' ? <MatchTab /> : null}
                {activeTab === 'shouts' ? <ShoutsTab /> : null}
                {activeTab === 'topics' ? <TopicsTab scope={scope} /> : null}
                {activeTab === 'debate' ? <DebateTab /> : null}
                {activeTab === 'reel' ? <ReelTab /> : null}
                {activeTab === 'live' ? <LiveTab /> : null}
                {activeTab === 'challenges' ? <ChallengesTab /> : null}
                {activeTab === 'leaderboards' ? <LeaderboardsTab /> : null}
                {activeTab === 'sources' ? <SourcesTab /> : null}
            </div>
        </section>
    );
}

export default ColiseumView;
