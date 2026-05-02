import React, { type CSSProperties } from 'react';
import type { CoalitionTabId } from '@blackout/core';
import { COALITION_TAB_LABELS, COALITION_TAB_ORDER } from '../../state/bmc-coalition';

export interface CoalitionTabStripProps {
    activeTab: CoalitionTabId;
    enabledTabs?: CoalitionTabId[];
    onSelectTab: (tab: CoalitionTabId) => void;
    onSearch?: () => void;
    scopeLabel?: string;
}

const stripStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 16px',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    overflowX: 'auto',
};

const tabBaseStyle: CSSProperties = {
    position: 'relative',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 16,
    fontWeight: 500,
    padding: '6px 4px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
};

const tabActiveStyle: CSSProperties = {
    ...tabBaseStyle,
    color: 'var(--text-primary)',
    fontWeight: 700,
    borderBottom: '2px solid var(--accent-primary, #1ABC9C)',
};

const scopeBadgeStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    padding: '2px 8px',
};

const searchButtonStyle: CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: 4,
    fontSize: 18,
};

export function CoalitionTabStrip({
    activeTab,
    enabledTabs,
    onSelectTab,
    onSearch,
    scopeLabel,
}: CoalitionTabStripProps) {
    const tabs = enabledTabs && enabledTabs.length > 0 ? enabledTabs : COALITION_TAB_ORDER;
    return (
        <nav style={stripStyle} role="tablist" aria-label="Coalition tabs">
            {scopeLabel ? <span style={scopeBadgeStyle}>{scopeLabel}</span> : null}
            {tabs.map((tab) => (
                <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={tab === activeTab}
                    style={tab === activeTab ? tabActiveStyle : tabBaseStyle}
                    onClick={() => onSelectTab(tab)}
                    data-coalition-tab={tab}
                >
                    {COALITION_TAB_LABELS[tab]}
                </button>
            ))}
            <span style={{ flex: 1 }} />
            {onSearch ? (
                <button
                    type="button"
                    aria-label="Search Coalition"
                    style={searchButtonStyle}
                    onClick={onSearch}
                >
                    🔍
                </button>
            ) : null}
        </nav>
    );
}

export default CoalitionTabStrip;
