import React from 'react';
import type { CoalitionTabId } from '@blackout/core';
import { COALITION_TAB_LABELS, COALITION_TAB_ORDER } from '../../state/bmc-coalition';
import * as styles from './CoalitionTabStrip.css';

export interface CoalitionTabStripProps {
    activeTab: CoalitionTabId;
    enabledTabs?: CoalitionTabId[];
    onSelectTab: (tab: CoalitionTabId) => void;
    onSearch?: () => void;
    scopeLabel?: string;
}

export function CoalitionTabStrip({
    activeTab,
    enabledTabs,
    onSelectTab,
    onSearch,
    scopeLabel,
}: CoalitionTabStripProps) {
    const tabs = enabledTabs && enabledTabs.length > 0 ? enabledTabs : COALITION_TAB_ORDER;
    return (
        <nav className={styles.Strip} role="tablist" aria-label="Coalition tabs">
            {scopeLabel ? <span className={styles.ScopeBadge}>{scopeLabel}</span> : null}
            {tabs.map((tab) => (
                <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={tab === activeTab}
                    className={styles.Tab}
                    onClick={() => onSelectTab(tab)}
                    data-coalition-tab={tab}
                >
                    {COALITION_TAB_LABELS[tab]}
                </button>
            ))}
            <span className={styles.Spacer} />
            {onSearch ? (
                <button
                    type="button"
                    aria-label="Search Coalition"
                    className={styles.SearchButton}
                    onClick={onSearch}
                >
                    🔍
                </button>
            ) : null}
        </nav>
    );
}

export default CoalitionTabStrip;
