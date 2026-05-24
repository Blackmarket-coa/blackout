import { type CSSProperties } from 'react';
import { useAtom } from 'jotai';
import { HOME_FEED_TABS, HOME_FEED_TAB_LABELS, homeFeedTabAtom } from '../../state/homeFeed';

const tabsStyle: CSSProperties = {
    display: 'flex',
    gap: 8,
    padding: '8px 16px 4px',
};

const tabBaseStyle: CSSProperties = {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 14,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 999,
    cursor: 'pointer',
};

const tabActiveStyle: CSSProperties = {
    ...tabBaseStyle,
    background: 'var(--bg-input, #1f2937)',
    color: 'var(--text-primary, #f8fafc)',
};

export const HomeFeedTabs = (): JSX.Element => {
    const [tab, setTab] = useAtom(homeFeedTabAtom);
    return (
        <div style={tabsStyle} role="tablist" data-testid="home-feed-tabs">
            {HOME_FEED_TABS.map((id) => {
                const active = tab === id;
                return (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-testid={`home-feed-tab-${id}`}
                        style={active ? tabActiveStyle : tabBaseStyle}
                        onClick={() => setTab(id)}
                    >
                        {HOME_FEED_TAB_LABELS[id]}
                    </button>
                );
            })}
        </div>
    );
};

export default HomeFeedTabs;
