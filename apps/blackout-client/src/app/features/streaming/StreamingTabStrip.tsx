import React, { type CSSProperties } from 'react';
import {
    STREAMING_TAB_LABELS,
    STREAMING_TAB_ORDER,
    type StreamingTabId,
} from '../../state/streaming';

export interface StreamingTabStripProps {
    activeTab: StreamingTabId;
    onSelectTab: (tab: StreamingTabId) => void;
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

export function StreamingTabStrip({ activeTab, onSelectTab }: StreamingTabStripProps) {
    return (
        <nav style={stripStyle} role="tablist" aria-label="Streaming tabs">
            {STREAMING_TAB_ORDER.map((tab) => (
                <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={tab === activeTab}
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
