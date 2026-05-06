import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { LIVE_PATH } from '../../pages/paths';
import { listStreams, type StreamSummary } from '../streams/streamsClient';
import {
    fetchCreatorTiers,
    fetchPublicProfile,
    type PublicCreatorTier,
    type PublicProfileResponse,
} from './creatorClient';

const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const headerStyle: CSSProperties = {
    padding: '20px 20px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const handleStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};
const bioStyle: CSSProperties = { margin: '6px 0 0', fontSize: 13, lineHeight: 1.4 };

const tabsStyle: CSSProperties = {
    display: 'flex',
    gap: 8,
    padding: '8px 16px 0',
    borderBottom: '1px solid var(--border-default, #374151)',
};

const tabButton = (active: boolean): CSSProperties => ({
    padding: '6px 12px',
    border: 0,
    background: 'transparent',
    color: active ? 'var(--text-primary, #f8fafc)' : 'var(--text-muted, #9ca3af)',
    borderBottom: `2px solid ${active ? 'var(--accent-primary, #3b82f6)' : 'transparent'}`,
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
});

const sectionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 16px 24px',
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 14px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #0f172a)',
};

const tierTitle: CSSProperties = { fontSize: 14, fontWeight: 600 };
const tierMeta: CSSProperties = { fontSize: 12, color: 'var(--text-muted, #9ca3af)' };

const emptyStyle: CSSProperties = {
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

const formatPrice = (priceCents: number, currency: string): string => {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
        }).format(priceCents / 100);
    } catch {
        return `${(priceCents / 100).toFixed(2)} ${currency}`;
    }
};

type StorefrontTab = 'tiers' | 'streams' | 'replays';

const TABS: { id: StorefrontTab; label: string }[] = [
    { id: 'tiers', label: 'Subscriptions' },
    { id: 'streams', label: 'Live now' },
    { id: 'replays', label: 'Replays' },
];

/**
 * Public creator storefront mounted at `/creators/:userId`.
 * Aggregates three pre-existing read endpoints — `/v1/profile/:userId`,
 * `/v1/creator-subs/creators/:userId/tiers`, `/v1/streaming/streams?creatorId=...`
 * — and surfaces them as tabbed sections. Subscribe / Tip flows reuse
 * the existing `creatorSubsApi` + `TipButton`; the storefront page
 * itself contains no new commerce primitives.
 *
 * Each fetcher swallows its own error so a single unavailable section
 * doesn't dark-hole the whole page; missing data renders an empty
 * state instead.
 */
export const CreatorStorefront = (): JSX.Element => {
    const { userId } = useParams<{ userId: string }>();
    const decodedUserId = userId ? decodeURIComponent(userId) : '';
    const [profile, setProfile] = useState<PublicProfileResponse | null>(null);
    const [tiers, setTiers] = useState<PublicCreatorTier[]>([]);
    const [streams, setStreams] = useState<StreamSummary[]>([]);
    const [activeTab, setActiveTab] = useState<StorefrontTab>('tiers');

    useEffect(() => {
        if (!decodedUserId) return;
        let cancelled = false;
        fetchPublicProfile(decodedUserId)
            .then((value) => {
                if (!cancelled) setProfile(value);
            })
            .catch(() => undefined);
        fetchCreatorTiers(decodedUserId)
            .then((value) => {
                if (!cancelled) setTiers(value.tiers);
            })
            .catch(() => undefined);
        listStreams({ creatorId: decodedUserId, limit: 30 })
            .then((value) => {
                if (!cancelled) setStreams(value.items);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [decodedUserId]);

    const liveStreams = useMemo(
        () => streams.filter((stream) => stream.state === 'live'),
        [streams]
    );
    const replays = useMemo(
        () => streams.filter((stream) => stream.state !== 'live' && Boolean(stream.replayPointer)),
        [streams]
    );

    const displayName = profile?.displayName ?? profile?.handle ?? decodedUserId;

    return (
        <section
            style={layoutStyle}
            data-shell-region="creator-storefront"
            data-creator-id={decodedUserId}
        >
            <header style={headerStyle}>
                <h1 style={titleStyle}>{displayName}</h1>
                <p style={handleStyle}>{profile?.handle ? `@${profile.handle}` : decodedUserId}</p>
                {profile?.bio ? <p style={bioStyle}>{profile.bio}</p> : null}
            </header>
            <nav style={tabsStyle} aria-label="Creator sections">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        style={tabButton(activeTab === tab.id)}
                        onClick={() => setActiveTab(tab.id)}
                        data-testid="storefront-tab"
                        data-tab-id={tab.id}
                        aria-pressed={activeTab === tab.id}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>
            {activeTab === 'tiers' ? (
                <div style={sectionStyle} data-testid="storefront-section-tiers">
                    {tiers.length === 0 ? (
                        <p style={emptyStyle}>
                            No subscription tiers yet. The creator hasn't published any.
                        </p>
                    ) : (
                        tiers.map((tier) => (
                            <article
                                key={tier.id}
                                style={cardStyle}
                                data-testid="storefront-tier-card"
                                data-tier-id={tier.id}
                            >
                                <span style={tierTitle}>{tier.name}</span>
                                <span style={tierMeta}>
                                    {formatPrice(tier.priceCents, tier.currency)} / month
                                </span>
                                {tier.description ? (
                                    <span style={{ fontSize: 13 }}>{tier.description}</span>
                                ) : null}
                            </article>
                        ))
                    )}
                </div>
            ) : null}
            {activeTab === 'streams' ? (
                <div style={sectionStyle} data-testid="storefront-section-streams">
                    {liveStreams.length === 0 ? (
                        <p style={emptyStyle}>Not live right now.</p>
                    ) : (
                        liveStreams.map((stream) => (
                            <Link
                                key={stream.id}
                                to={`${LIVE_PATH}/${encodeURIComponent(stream.id)}`}
                                style={{ ...cardStyle, color: 'inherit', textDecoration: 'none' }}
                                data-testid="storefront-live-card"
                            >
                                <strong style={tierTitle}>{stream.title}</strong>
                                <span style={tierMeta}>● LIVE</span>
                            </Link>
                        ))
                    )}
                </div>
            ) : null}
            {activeTab === 'replays' ? (
                <div style={sectionStyle} data-testid="storefront-section-replays">
                    {replays.length === 0 ? (
                        <p style={emptyStyle}>
                            No replays yet. Past {BLACKOUT_TERMS.den.singular} streams will appear
                            here.
                        </p>
                    ) : (
                        replays.map((stream) => (
                            <Link
                                key={stream.id}
                                to={`${LIVE_PATH}/${encodeURIComponent(stream.id)}`}
                                style={{ ...cardStyle, color: 'inherit', textDecoration: 'none' }}
                                data-testid="storefront-replay-card"
                            >
                                <strong style={tierTitle}>{stream.title}</strong>
                                <span style={tierMeta}>Replay · {stream.updatedAt}</span>
                            </Link>
                        ))
                    )}
                </div>
            ) : null}
        </section>
    );
};

export default CreatorStorefront;
