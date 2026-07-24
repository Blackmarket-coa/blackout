import React, { useMemo, useState } from 'react';
import type { ColiseumTabId } from '@blackout/core';
import { COLISEUM_TAB_HINTS, COLISEUM_TAB_LABELS, COLISEUM_TAB_ORDER } from '../../state/coliseum';
import { splitColiseumTabs } from './tabConsolidation';
import { ColiseumMoreSheet } from './components/ColiseumMoreSheet';
import { cx } from './components/cx';
import * as css from './ColiseumTabStrip.css';

export interface ColiseumTabStripProps {
    activeTab: ColiseumTabId;
    enabledTabs?: ColiseumTabId[];
    onSelectTab: (tab: ColiseumTabId) => void;
    onSearch?: () => void;
    scopeLabel?: string;
}

function SearchIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

/**
 * TikTok-slim tab strip: at most four primary destinations plus a "More"
 * button that opens the specialist surfaces in a bottom sheet. `debate` never
 * appears here — it's a drill-in owned by ColiseumView.
 */
export function ColiseumTabStrip({
    activeTab,
    enabledTabs,
    onSelectTab,
    onSearch,
    scopeLabel,
}: ColiseumTabStripProps) {
    const tabs = enabledTabs && enabledTabs.length > 0 ? enabledTabs : COLISEUM_TAB_ORDER;
    const { primary, secondary } = useMemo(() => splitColiseumTabs(tabs), [tabs]);
    const [moreOpen, setMoreOpen] = useState(false);

    const secondaryActive = secondary.includes(activeTab);

    return (
        <nav className={css.strip} role="tablist" aria-label="Coliseum tabs">
            {scopeLabel ? <span className={css.scopeBadge}>{scopeLabel}</span> : null}
            {primary.map((tab) => (
                <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={tab === activeTab}
                    title={COLISEUM_TAB_HINTS[tab]}
                    className={cx(css.tab, tab === activeTab && css.tabActive)}
                    onClick={() => onSelectTab(tab)}
                    data-coliseum-tab={tab}
                >
                    {COLISEUM_TAB_LABELS[tab]}
                </button>
            ))}
            {secondary.length > 0 ? (
                <button
                    type="button"
                    className={cx(css.tab, secondaryActive && css.tabActive)}
                    title="More Coliseum surfaces — arena matches, shouts, leaderboards, and sources"
                    aria-haspopup="dialog"
                    aria-expanded={moreOpen}
                    data-testid="coliseum-more-tab"
                    onClick={() => setMoreOpen(true)}
                >
                    {secondaryActive ? `More · ${COLISEUM_TAB_LABELS[activeTab]}` : 'More'}
                </button>
            ) : null}
            <span className={css.spacer} />
            {onSearch ? (
                <button
                    type="button"
                    aria-label="Search Coliseum"
                    className={css.iconButton}
                    onClick={onSearch}
                >
                    <SearchIcon />
                </button>
            ) : null}
            <ColiseumMoreSheet
                open={moreOpen}
                onClose={() => setMoreOpen(false)}
                tabs={secondary}
                activeTab={activeTab}
                onSelectTab={onSelectTab}
            />
        </nav>
    );
}

export default ColiseumTabStrip;
