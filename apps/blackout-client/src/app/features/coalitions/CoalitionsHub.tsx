import React, { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
    COALITION_JOIN_MODES,
    COALITION_ROLE_LABELS,
    COALITION_TIER_GATES,
    type CoalitionJoinMode,
    type CoalitionTierGate,
} from '@blackout/core';
import { FeatureGuide } from '../../components/feature-guide/FeatureGuide';
import {
    createCoalition,
    fetchCoalitions,
    joinCoalition,
    type CoalitionSummary,
} from './coalitionsClient';
import { MyCoalitionsPanel } from './MyCoalitionsPanel';
import { buttonStyle, cardStyle, inputStyle, mutedStyle, roleChipStyle } from './coalitionsStyles';

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

const TAB_STRIP_STYLE: CSSProperties = {
    display: 'flex',
    gap: 4,
    padding: '8px 20px 0',
    borderBottom: '1px solid var(--border-default)',
};

const tabStyle = (active: boolean): CSSProperties => ({
    border: 'none',
    borderBottom: active ? '2px solid var(--accent-primary, #1ABC9C)' : '2px solid transparent',
    background: 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    padding: '8px 12px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
});

const GRID_STYLE: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 12,
    padding: 20,
};

export const COALITIONS_HUB_TABS = ['mine', 'discover', 'found'] as const;
export type CoalitionsHubTab = typeof COALITIONS_HUB_TABS[number];

const TAB_LABELS: Record<CoalitionsHubTab, string> = {
    mine: 'Mine',
    discover: 'Discover',
    found: 'Found one',
};

const TAB_GUIDES: Record<CoalitionsHubTab, string> = {
    mine: 'The coalitions you belong to, your role in each, and invitations waiting on you.',
    discover:
        'Find a coalition to join. Open coalitions admit you at once; approval coalitions queue your request for their Stewards.',
    found: 'Start a coalition: pick a name and mission, choose how people join, and you become its Founder.',
};

const joinModeCopy: Record<CoalitionJoinMode, string> = {
    open: 'Open — anyone can join',
    approval: 'Approval — a Steward reviews requests',
};

function CoalitionCard({
    row,
    onJoined,
}: {
    row: CoalitionSummary;
    onJoined: (message: string) => void;
}) {
    const [busy, setBusy] = useState(false);
    const isMember = Boolean(row.viewerRole);
    const join = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const outcome = await joinCoalition(row.coalition.id);
            onJoined(
                outcome.joined
                    ? `You joined ${row.coalition.name}.`
                    : `Request sent to ${row.coalition.name}'s Stewards.`
            );
        } catch (error) {
            onJoined(error instanceof Error ? error.message : 'Could not join');
        } finally {
            setBusy(false);
        }
    };
    return (
        <div style={cardStyle} data-testid="coalition-card">
            <Link
                to={`/coalitions/${encodeURIComponent(row.coalition.slug)}`}
                style={{ color: 'inherit', textDecoration: 'none', fontSize: 16, fontWeight: 700 }}
            >
                {row.coalition.name}
            </Link>
            <span style={{ ...mutedStyle, whiteSpace: 'pre-wrap' }}>{row.coalition.mission}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={mutedStyle}>{row.memberCount} members</span>
                <span style={mutedStyle}>{row.activeCampaigns} active</span>
                <span style={mutedStyle}>{joinModeCopy[row.coalition.joinMode]}</span>
                {row.coalition.minTierToJoin ? (
                    <span style={mutedStyle}>{row.coalition.minTierToJoin}+ to join</span>
                ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {isMember && row.viewerRole ? (
                    <span style={roleChipStyle}>{COALITION_ROLE_LABELS[row.viewerRole]}</span>
                ) : (
                    <button
                        type="button"
                        style={buttonStyle('primary')}
                        disabled={busy}
                        onClick={() => void join()}
                        data-testid="coalition-card-join"
                    >
                        {row.coalition.joinMode === 'open' ? 'Join' : 'Request to join'}
                    </button>
                )}
            </div>
        </div>
    );
}

function DiscoverTab({ onNotice }: { onNotice: (message: string) => void }) {
    const [q, setQ] = useState('');
    const [rows, setRows] = useState<CoalitionSummary[]>([]);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async (query: string) => {
        try {
            setRows(await fetchCoalitions(query ? { q: query } : {}));
        } catch {
            setRows([]);
        } finally {
            setLoaded(true);
        }
    }, []);

    useEffect(() => {
        void load('');
    }, [load]);

    return (
        <div>
            <div style={{ padding: '16px 20px 0' }}>
                <input
                    style={inputStyle}
                    placeholder="Search coalitions by name or mission"
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') void load(q);
                    }}
                    data-testid="coalitions-search"
                />
            </div>
            {!loaded ? (
                <p style={{ ...mutedStyle, padding: 20 }}>Loading…</p>
            ) : rows.length === 0 ? (
                <p style={{ ...mutedStyle, padding: 20 }} data-testid="coalitions-discover-empty">
                    No coalitions yet — found the first one.
                </p>
            ) : (
                <div style={GRID_STYLE}>
                    {rows.map((row) => (
                        <CoalitionCard
                            key={row.coalition.id}
                            row={row}
                            onJoined={(message) => {
                                onNotice(message);
                                void load(q);
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function FoundTab() {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [mission, setMission] = useState('');
    const [joinMode, setJoinMode] = useState<CoalitionJoinMode>('open');
    const [minTier, setMinTier] = useState<CoalitionTierGate | ''>('');
    const [bannerUrl, setBannerUrl] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            const created = await createCoalition({
                name: name.trim(),
                mission: mission.trim(),
                joinMode,
                ...(minTier ? { minTierToJoin: minTier } : {}),
                ...(bannerUrl.trim() ? { bannerUrl: bannerUrl.trim() } : {}),
            });
            navigate(`/coalitions/${encodeURIComponent(created.coalition.slug)}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not found the coalition');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form
            onSubmit={submit}
            style={{ padding: 20, display: 'grid', gap: 12, maxWidth: 560 }}
            data-testid="coalition-found-form"
        >
            <label style={{ display: 'grid', gap: 4 }}>
                <span style={mutedStyle}>Name</span>
                <input
                    style={inputStyle}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={80}
                    data-testid="coalition-found-name"
                />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
                <span style={mutedStyle}>Mission</span>
                <textarea
                    style={{ ...inputStyle, minHeight: 90 }}
                    value={mission}
                    onChange={(e) => setMission(e.target.value)}
                    required
                    maxLength={2000}
                    data-testid="coalition-found-mission"
                />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
                <span style={mutedStyle}>How people join</span>
                <select
                    style={inputStyle}
                    value={joinMode}
                    onChange={(e) => setJoinMode(e.target.value as CoalitionJoinMode)}
                    data-testid="coalition-found-join-mode"
                >
                    {COALITION_JOIN_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                            {joinModeCopy[mode]}
                        </option>
                    ))}
                </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
                <span style={mutedStyle}>Minimum KARMA tier to join (optional)</span>
                <select
                    style={inputStyle}
                    value={minTier}
                    onChange={(e) => setMinTier(e.target.value as CoalitionTierGate | '')}
                >
                    <option value="">No gate</option>
                    {COALITION_TIER_GATES.map((tier) => (
                        <option key={tier} value={tier}>
                            {tier}
                        </option>
                    ))}
                </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
                <span style={mutedStyle}>Banner image URL (optional)</span>
                <input
                    style={inputStyle}
                    value={bannerUrl}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    type="url"
                />
            </label>
            {error ? (
                <span style={{ color: 'var(--danger, #f04747)', fontSize: 13 }}>{error}</span>
            ) : null}
            <div>
                <button
                    type="submit"
                    style={buttonStyle('primary')}
                    disabled={busy}
                    data-testid="coalition-found-submit"
                >
                    Found coalition
                </button>
            </div>
        </form>
    );
}

/**
 * `/coalitions` — the network hub: yours, discover, found. Mirrors the canopies
 * hub shape (header, tab strip, guide strip, body) so it reads as a sibling.
 */
export const CoalitionsHub = ({ initialTab = 'mine' }: { initialTab?: CoalitionsHubTab }) => {
    const [tab, setTab] = useState<CoalitionsHubTab>(initialTab);
    const [notice, setNotice] = useState<string | null>(null);

    return (
        <section data-testid="coalitions-hub" data-shell-region="room" style={PAGE_STYLE}>
            <header style={HEADER_STYLE}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20 }}>Coalitions</h1>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
                        Groups that organise drives, projects and mutual aid together — across
                        canopies.
                    </p>
                </div>
                <button
                    type="button"
                    style={buttonStyle('primary')}
                    onClick={() => setTab('found')}
                    data-testid="coalitions-hub-found"
                >
                    ＋ Found a coalition
                </button>
            </header>
            <nav style={TAB_STRIP_STYLE} role="tablist" aria-label="Coalitions tabs">
                {COALITIONS_HUB_TABS.map((id) => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={tab === id}
                        style={tabStyle(tab === id)}
                        onClick={() => setTab(id)}
                        data-testid={`coalitions-tab-${id}`}
                    >
                        {TAB_LABELS[id]}
                    </button>
                ))}
            </nav>
            <FeatureGuide>{TAB_GUIDES[tab]}</FeatureGuide>
            <div style={{ minHeight: 0, overflow: 'auto' }}>
                {notice ? (
                    <div
                        style={{ padding: '10px 20px 0', fontSize: 13 }}
                        role="status"
                        data-testid="coalitions-notice"
                    >
                        {notice}
                    </div>
                ) : null}
                {tab === 'mine' ? (
                    <div style={{ padding: '4px 20px 20px' }}>
                        <MyCoalitionsPanel />
                    </div>
                ) : null}
                {tab === 'discover' ? <DiscoverTab onNotice={setNotice} /> : null}
                {tab === 'found' ? <FoundTab /> : null}
            </div>
        </section>
    );
};

export default CoalitionsHub;
