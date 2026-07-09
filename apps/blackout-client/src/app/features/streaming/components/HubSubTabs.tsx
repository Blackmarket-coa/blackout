import React, { type CSSProperties } from 'react';

export interface HubSubTabsProps<V extends string> {
    /** Selectable sub-views, in order. */
    views: readonly V[];
    labels: Record<V, string>;
    active: V;
    onSelect: (view: V) => void;
    ariaLabel: string;
}

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px 0',
    overflowX: 'auto',
};

const pillBaseStyle: CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    color: 'var(--text-secondary)',
    fontSize: 14,
    fontWeight: 500,
    padding: '5px 14px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
};

const pillActiveStyle: CSSProperties = {
    ...pillBaseStyle,
    color: 'var(--text-primary)',
    fontWeight: 700,
    borderColor: 'var(--accent-primary, #1ABC9C)',
};

/**
 * Pill-row switcher for the sub-views inside a consolidated Creator Hub tab
 * (Content, Earnings, Integrations). Purely presentational — the owning tab
 * component holds the selected view.
 */
export function HubSubTabs<V extends string>({
    views,
    labels,
    active,
    onSelect,
    ariaLabel,
}: HubSubTabsProps<V>) {
    return (
        <nav style={rowStyle} role="tablist" aria-label={ariaLabel}>
            {views.map((view) => (
                <button
                    key={view}
                    type="button"
                    role="tab"
                    aria-selected={view === active}
                    style={view === active ? pillActiveStyle : pillBaseStyle}
                    onClick={() => onSelect(view)}
                    data-streaming-subtab={view}
                >
                    {labels[view]}
                </button>
            ))}
        </nav>
    );
}

export default HubSubTabs;
