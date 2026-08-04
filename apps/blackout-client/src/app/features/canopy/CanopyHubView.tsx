import React, { type CSSProperties, useCallback, useMemo } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { canopyHubTabAtom, isValidCanopyHubTab, type CanopyHubTabId } from '../../state/canopy';
import { createSpaceModalAtom } from '../../state/createSpaceModal';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { GlossaryTerm } from '../../lib/GlossaryTerm';
import { FeatureGuide } from '../../components/feature-guide/FeatureGuide';
import { useFriendInbox } from '../friends/useFriendInbox';
import CanopyTabStrip from './CanopyTabStrip';
import { CANOPY_HUB_TAB_GUIDES } from './canopyTabGuides';
import YoursTab from './tabs/YoursTab';
import DiscoverTab from './tabs/DiscoverTab';
import FriendsTab from './tabs/FriendsTab';
import CreateTab from './tabs/CreateTab';

const PAGE_STYLE: CSSProperties = {
    height: '100%',
    width: '100%',
    display: 'grid',
    gridTemplateRows: 'auto auto auto 1fr',
    minHeight: 0,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
};

const HEADER_STYLE: CSSProperties = {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-default)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
};

const newButtonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    background: 'var(--accent-primary)',
    color: 'var(--bg-surface)',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
};

/**
 * The canopies hub at `/canopies` — a first-class destination with the same
 * tab-strip shape as Coliseum, rather than a single scrolling page. Four tabs,
 * no "More" sheet, so the strip fits a phone.
 */
export const CanopyHubView = () => {
    const [storedTab, setTab] = useAtom(canopyHubTabAtom);
    const setCreateSpaceModal = useSetAtom(createSpaceModalAtom);
    const { incoming } = useFriendInbox();

    // A persisted value from an older build (or a hand-edited localStorage
    // entry) must not blank the page.
    const activeTab = useMemo<CanopyHubTabId>(
        () => (isValidCanopyHubTab(storedTab) ? storedTab : 'yours'),
        [storedTab]
    );

    const handleSelect = useCallback((tab: CanopyHubTabId) => setTab(tab), [setTab]);

    const counts = useMemo(() => ({ friends: incoming.length }), [incoming.length]);

    return (
        <section data-testid="canopy-hub" data-shell-region="room" style={PAGE_STYLE}>
            <header style={HEADER_STYLE}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20 }}>{BLACKOUT_TERMS.canopy.titlePlural}</h1>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
                        Your{' '}
                        <GlossaryTerm term="canopy">{BLACKOUT_TERMS.canopy.plural}</GlossaryTerm> —
                        communities made of{' '}
                        <GlossaryTerm term="den">{BLACKOUT_TERMS.den.plural}</GlossaryTerm>.
                    </p>
                </div>
                <button
                    type="button"
                    style={newButtonStyle}
                    data-testid="canopy-hub-create"
                    onClick={() => setCreateSpaceModal({})}
                >
                    ＋ New {BLACKOUT_TERMS.canopy.singular}
                </button>
            </header>

            <CanopyTabStrip activeTab={activeTab} onSelectTab={handleSelect} counts={counts} />
            <FeatureGuide>{CANOPY_HUB_TAB_GUIDES[activeTab]}</FeatureGuide>

            <div style={{ minHeight: 0, overflow: 'auto' }}>
                {activeTab === 'yours' ? <YoursTab /> : null}
                {activeTab === 'discover' ? <DiscoverTab /> : null}
                {activeTab === 'friends' ? <FriendsTab /> : null}
                {activeTab === 'create' ? <CreateTab /> : null}
            </div>
        </section>
    );
};

export default CanopyHubView;
