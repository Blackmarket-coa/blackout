import React, { type CSSProperties } from 'react';
import {
    STREAMING_TAB_HINTS,
    STREAMING_TAB_LABELS,
    STREAMING_TAB_ORDER,
    type StreamingTabId,
} from '../../state/streaming';
import { useOverflowFade } from '../../hooks/useOverflowFade';

export interface StreamingTabStripProps {
    activeTab: StreamingTabId;
    onSelectTab: (tab: StreamingTabId) => void;
    /** Visible tabs, in order. Defaults to the full tab set. */
    tabs?: StreamingTabId[];
}

const stripStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 16px',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    overflowX: 'auto',
    scrollbarWidth: 'none',
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
    flexShrink: 0,
};

const tabActiveStyle: CSSProperties = {
    ...tabBaseStyle,
    color: 'var(--text-primary)',
    fontWeight: 700,
    borderBottom: '2px solid var(--accent-primary, #1ABC9C)',
};

export function StreamingTabStrip({
    activeTab,
    onSelectTab,
    tabs = STREAMING_TAB_ORDER,
}: StreamingTabStripProps) {
    const fadeRef = useOverflowFade<HTMLElement>(activeTab);
    return (
        <nav ref={fadeRef} style={stripStyle} role="tablist" aria-label="Streaming tabs">
            {tabs.map((tab) => (
                <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={tab === activeTab}
                    title={STREAMING_TAB_HINTS[tab]}
                    style={tab === activeTab ? tabActiveStyle : tabBaseStyle}
                    onClick={() => onSelectTab(tab)}
                    data-streaming-tab={tab}
                >
                    {STREAMING_TAB_LABELS[tab]}
                </button>
            ))}
        </nav>
    );
}

export default StreamingTabStrip;
