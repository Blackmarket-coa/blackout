import React from 'react';
import {
    CANOPY_HUB_TAB_HINTS,
    CANOPY_HUB_TAB_LABELS,
    CANOPY_HUB_TAB_ORDER,
    type CanopyHubTabId,
} from '../../state/canopy';
import { cx } from '../coliseum/components/cx';
import * as css from './CanopyTabStrip.css';

export interface CanopyTabStripProps {
    activeTab: CanopyHubTabId;
    onSelectTab: (tab: CanopyHubTabId) => void;
    /** Optional per-tab counts (e.g. pending friend requests). */
    counts?: Partial<Record<CanopyHubTabId, number>>;
}

/**
 * The canopies hub tab strip. Four destinations, no "More" sheet — the whole
 * point of the consolidation is that a strip should fit on a phone.
 */
export function CanopyTabStrip({ activeTab, onSelectTab, counts }: CanopyTabStripProps) {
    return (
        <nav className={css.strip} role="tablist" aria-label="Canopies tabs">
            {CANOPY_HUB_TAB_ORDER.map((tab) => {
                const count = counts?.[tab] ?? 0;
                return (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={tab === activeTab}
                        title={CANOPY_HUB_TAB_HINTS[tab]}
                        className={cx(css.tab, tab === activeTab && css.tabActive)}
                        onClick={() => onSelectTab(tab)}
                        data-canopy-tab={tab}
                        data-testid={`canopy-tab-${tab}`}
                    >
                        {CANOPY_HUB_TAB_LABELS[tab]}
                        {count > 0 ? (
                            <span className={css.countBadge}>{count > 99 ? '99+' : count}</span>
                        ) : null}
                    </button>
                );
            })}
            <span className={css.spacer} />
        </nav>
    );
}

export default CanopyTabStrip;
