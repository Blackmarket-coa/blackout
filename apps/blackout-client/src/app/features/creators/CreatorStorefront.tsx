import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import {
    creatorLevelFromReputation,
    creatorSkillsFromReputation,
    type CreatorContent,
} from '@blackout/core';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { LIVE_PATH } from '../../pages/paths';
import { listStreams, type StreamSummary } from '../streams/streamsClient';
import { mxcToUrl } from '../media/utils/matrixMedia';
import { fetchReputation } from '../profile/profileClient';
import { fetchCreatorColiseum, type CreatorColiseumSummary } from '../coliseum/coliseumClient';
import { fetchCreatorContentByUser } from './contentClient';
import {
    fetchCreatorTiers,
    fetchPublicProfile,
    type PublicCreatorTier,
    type PublicProfileResponse,
} from './creatorClient';
import {
    fetchFbmVendor,
    type FbmProduct,
    type FbmVendor,
    type FbmVendorResponse,
} from './fbmClient';
import { fetchMatrixProfile, type MatrixProfile } from './matrixProfileClient';

// --- Blackout deployment constants (public surface; no SDK/session needed) ---
const HOMESERVER_URL = 'https://matrix.theblackout.app';
const SERVER_NAME = 'theblackout.app';
const CHAT_URL = 'https://chat.theblackout.app';
const FBM_STORE = 'https://freeblackmarket.com';

// --- BMC solarpunk palette ---
const TEAL = '#1ABC9C';
const FOREST = '#16813D';
const PAGE_BG = '#0d0d14';
const CARD_BG = '#12121e';
const BORDER = '#1e1e2e';
const BANNER_GRADIENT = 'linear-gradient(135deg, #1a0a2e 0%, #261242 50%, #1a2e1a 100%)';
const FONT_STACK = "'IBM Plex Sans', system-ui, -apple-system, sans-serif";

const formatCents = (amount: number, currency = 'USD'): string => {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
        }).format(amount / 100);
    } catch {
        return `${(amount / 100).toFixed(2)} ${currency}`;
    }
};

const productPrice = (product: FbmProduct): string | null => {
    const price = product.variants?.[0]?.prices?.[0];
    if (!price || typeof price.amount !== 'number') return null;
    return formatCents(price.amount, price.currency_code?.toUpperCase() ?? 'USD');
};

const initials = (name: string): string =>
    name
        .replace(/^@/, '')
        .split(/[\s_-]+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || '?';

// --- styles ---------------------------------------------------------------
const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: PAGE_BG,
    color: '#f4f4f8',
    fontFamily: FONT_STACK,
};
const contentWrap: CSSProperties = { width: '100%', maxWidth: 760, margin: '0 auto', paddingBottom: 48 };
const bannerStyle = (img: string | null): CSSProperties => ({
    height: 200,
    width: '100%',
    background: img ? `center/cover no-repeat url(${img})` : BANNER_GRADIENT,
});
const avatarRing: CSSProperties = {
    width: 96,
    height: 96,
    borderRadius: '50%',
    border: `3px solid ${TEAL}`,
    marginTop: -48,
    marginLeft: 20,
    background: CARD_BG,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    fontSize: 32,
    fontWeight: 700,
    color: TEAL,
};
const sectionStyle: CSSProperties = { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 };
const sectionTitle: CSSProperties = {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8a8a9a',
    margin: 0,
    fontWeight: 600,
};
const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 14px',
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    background: CARD_BG,
};
const chipStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    border: `1px solid ${BORDER}`,
    borderRadius: 999,
    background: CARD_BG,
    fontSize: 12,
    color: '#cfcfe0',
    textDecoration: 'none',
};
const tealButton: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: TEAL,
    color: '#04201b',
    fontWeight: 700,
    fontSize: 14,
    padding: '10px 18px',
    borderRadius: 10,
    textDecoration: 'none',
    width: 'fit-content',
};
const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 12,
};
const mutedStyle: CSSProperties = { color: '#8a8a9a', fontSize: 13 };
const tabsStyle: CSSProperties = {
    display: 'flex',
    gap: 8,
    padding: '8px 20px 0',
    borderBottom: `1px solid ${BORDER}`,
};
const tabButton = (active: boolean): CSSProperties => ({
    padding: '8px 12px',
    border: 0,
    background: 'transparent',
    color: active ? '#f4f4f8' : '#8a8a9a',
    borderBottom: `2px solid ${active ? TEAL : 'transparent'}`,
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
});

const formatPrice = (priceCents: number, currency: string): string => formatCents(priceCents, currency);

const SOCIAL_LABELS: Record<string, string> = {
    github: 'GitHub',
    website: 'Website',
    x: 'X',
    linkedin: 'LinkedIn',
    matrix: 'Matrix',
    other: 'Link',
};

type StorefrontTab = 'tiers' | 'streams' | 'replays';
const TABS: { id: StorefrontTab; label: string }[] = [
    { id: 'tiers', label: 'Subscriptions' },
    { id: 'streams', label: 'Live now' },
    { id: 'replays', label: 'Replays' },
];

interface CreatorStorefrontViewProps {
    /** Fully-qualified Matrix user id, e.g. `@alice:theblackout.app`. */
    userId: string;
    /** Optional vanity handle (local part) for display. */
    handle?: string;
    /**
     * When true (public `/@handle` page), require the profile to be opted-in
     * public (the public endpoint 404s otherwise); show a not-found state.
     */
    gated?: boolean;
}

/**
 * Router-free public creator "character sheet". Renders identity + RPG-style
 * standing (level/skills/achievements derived from the reputation system) and
 * the creator's income surfaces (subscriptions, streams, FBM catalog) plus
 * curated sponsors. Every fetch is zero-auth and degrades gracefully so a
 * single unavailable slice never blanks the page.
 */
export const CreatorStorefrontView = ({
    userId,
    handle: handleProp,
    gated = false,
}: CreatorStorefrontViewProps): JSX.Element => {
    const handle = handleProp ?? (userId.startsWith('@') ? userId.slice(1).split(':')[0] : userId);

    const [matrixProfile, setMatrixProfile] = useState<MatrixProfile | null>(null);
    const [profile, setProfile] = useState<PublicProfileResponse | null>(null);
    const [tiers, setTiers] = useState<PublicCreatorTier[]>([]);
    const [streams, setStreams] = useState<StreamSummary[]>([]);
    const [reputation, setReputation] = useState<Parameters<typeof creatorLevelFromReputation>[0]>(null);
    const [coliseum, setColiseum] = useState<CreatorColiseumSummary | null>(null);
    const [content, setContent] = useState<CreatorContent[]>([]);
    const [fbm, setFbm] = useState<FbmVendorResponse | null>(null);
    const [sponsorVendors, setSponsorVendors] = useState<FbmVendor[]>([]);
    const [gateState, setGateState] = useState<'loading' | 'ok' | 'notfound'>('loading');
    const [activeTab, setActiveTab] = useState<StorefrontTab>('tiers');

    useEffect(() => {
        if (!userId) return undefined;
        let cancelled = false;
        const set = <T,>(setter: (v: T) => void, value: T) => {
            if (!cancelled) setter(value);
        };

        // Matrix profile (always public).
        fetchMatrixProfile(HOMESERVER_URL, userId)
            .then((value) => {
                if (value) set(setMatrixProfile, value);
            })
            .catch(() => undefined);

        // Single source of truth: the zero-auth public projection of the server
        // profile store (GET /v1/profile/:userId/public). Also the opt-in gate —
        // it 404s unless the owner has published, so a rejection means not-found.
        fetchPublicProfile(userId)
            .then((value) => {
                set(setProfile, value);
                set(setGateState, 'ok');
            })
            .catch(() => set(setGateState, 'notfound'));
        fetchCreatorTiers(userId)
            .then((value) => set(setTiers, value.tiers))
            .catch(() => undefined);
        listStreams({ creatorId: userId, limit: 30 })
            .then((value) => set(setStreams, value.items))
            .catch(() => undefined);
        fetchReputation(userId)
            .then((value) => set(setReputation, value.reputation))
            .catch(() => undefined);
        fetchCreatorColiseum(userId)
            .then((value) => set(setColiseum, value))
            .catch(() => undefined);
        fetchCreatorContentByUser(userId, 12)
            .then((value) => set(setContent, value.content))
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [userId]);

    const memberProfile = profile?.profile;

    // Resolve the FBM vendor handle from connections, then load the catalog.
    const fbmHandle = useMemo(
        () => memberProfile?.connections?.find((conn) => conn.type === 'fbm')?.username?.trim() || '',
        [memberProfile]
    );
    useEffect(() => {
        if (!fbmHandle) return undefined;
        let cancelled = false;
        fetchFbmVendor(fbmHandle)
            .then((value) => {
                if (value && !cancelled) setFbm(value);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [fbmHandle]);

    // Curated sponsor vendors.
    const sponsorHandles = useMemo(() => memberProfile?.sponsors ?? [], [memberProfile]);
    useEffect(() => {
        if (sponsorHandles.length === 0) return undefined;
        let cancelled = false;
        (async () => {
            const vendors: FbmVendor[] = [];
            for (const sponsor of sponsorHandles) {
                const body = await fetchFbmVendor(sponsor);
                if (body?.vendor) vendors.push(body.vendor);
            }
            if (!cancelled) setSponsorVendors(vendors);
        })();
        return () => {
            cancelled = true;
        };
    }, [sponsorHandles]);

    // --- derived view data ---
    // Single source: rich fields come from the server profile store's safe
    // projection (`profile.profile`); Matrix profile supplies name/avatar.
    const displayName =
        matrixProfile?.displayname || profile?.displayName || profile?.handle || handle;
    const displayHandle = profile?.handle || handle;
    const bio = memberProfile?.bio || profile?.bio || '';
    const pronouns = memberProfile?.pronouns || '';
    const bannerMxc = memberProfile?.banner;
    const bannerUrl = bannerMxc ? mxcToUrl(bannerMxc, HOMESERVER_URL) : null;
    const avatarUrl = matrixProfile?.avatar_url
        ? mxcToUrl(matrixProfile.avatar_url, HOMESERVER_URL)
        : null;
    const socialLinks = (memberProfile?.connections ?? []).filter(
        (conn) => conn.type !== 'fbm' && conn.type !== 'email' && conn.type !== 'phone' && conn.url
    );
    const level = useMemo(() => creatorLevelFromReputation(reputation), [reputation]);
    const skills = useMemo(() => creatorSkillsFromReputation(reputation), [reputation]);

    const liveStreams = useMemo(() => streams.filter((s) => s.state === 'live'), [streams]);
    const replays = useMemo(
        () => streams.filter((s) => s.state !== 'live' && Boolean(s.replayPointer)),
        [streams]
    );

    const fbmEvents = fbm?.catalog?.events ?? [];
    const fbmProducts = useMemo(() => {
        const cat = fbm?.catalog;
        if (!cat) return [] as FbmProduct[];
        if (cat.all && cat.all.length > 0) {
            const eventIds = new Set(fbmEvents.map((e) => e.id));
            return cat.all.filter((p) => !eventIds.has(p.id));
        }
        return [...(cat.services ?? []), ...(cat.physical ?? []), ...(cat.digital ?? [])];
    }, [fbm, fbmEvents]);

    const hasReputation = !!reputation && level.xp > 0;
    const achievements = [
        ...(memberProfile?.badgeIds ?? []).map((id) => ({ key: `badge-${id}`, label: id })),
        ...(coliseum && coliseum.wins > 0
            ? [{ key: 'wins', label: `${coliseum.wins} challenge win${coliseum.wins === 1 ? '' : 's'}` }]
            : []),
        ...(coliseum?.leaderboard
            ? [{ key: 'rank', label: `#${coliseum.leaderboard.rank} creator` }]
            : []),
    ];

    // --- gated not-found ---
    if (gated && gateState === 'notfound') {
        return (
            <section style={layoutStyle} data-shell-region="creator-profile-notfound">
                <div style={{ ...contentWrap, padding: '80px 20px', textAlign: 'center' }}>
                    <h1 style={{ fontSize: 22, marginBottom: 8 }}>Profile not found</h1>
                    <p style={mutedStyle}>
                        This creator hasn&apos;t published a public profile, or the handle
                        doesn&apos;t exist.
                    </p>
                    <p style={{ ...mutedStyle, marginTop: 24 }}>
                        <a href="https://theblackout.app" style={{ color: TEAL }}>
                            theblackout.app
                        </a>
                    </p>
                </div>
            </section>
        );
    }

    // --- skeleton ---
    if (gated && gateState === 'loading') {
        return (
            <section style={layoutStyle} data-shell-region="creator-profile-skeleton">
                <div style={contentWrap}>
                    <div style={bannerStyle(null)} />
                    <div style={{ ...avatarRing, background: BORDER }} />
                    <div style={sectionStyle}>
                        <div style={{ height: 22, width: 180, background: BORDER, borderRadius: 6 }} />
                        <div style={{ height: 14, width: 120, background: BORDER, borderRadius: 6 }} />
                        <div style={{ height: 64, width: '100%', background: CARD_BG, borderRadius: 12 }} />
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section style={layoutStyle} data-shell-region="creator-storefront" data-creator-id={userId}>
            <div style={contentWrap}>
                <div style={bannerStyle(bannerUrl)} />
                <div style={avatarRing}>
                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt={displayName}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        initials(displayName)
                    )}
                </div>

                <header style={{ padding: '8px 20px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{displayName}</h1>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        {pronouns ? <span style={mutedStyle}>{pronouns}</span> : null}
                        <span style={{ ...mutedStyle, fontFamily: 'monospace' }}>
                            @{displayHandle}:{SERVER_NAME}
                        </span>
                    </div>
                </header>

                {hasReputation && (
                    <div style={sectionStyle} data-testid="profile-section-level">
                        <p style={sectionTitle}>Standing</p>
                        <div style={cardStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontSize: 16, fontWeight: 700, color: TEAL }}>
                                    Level {level.level} · {level.title}
                                </span>
                                <span style={mutedStyle}>{level.xp} XP</span>
                            </div>
                            <div style={{ height: 8, background: BORDER, borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
                                <div
                                    style={{
                                        height: '100%',
                                        width: `${Math.min(100, Math.round((level.xpIntoLevel / level.xpForNextLevel) * 100))}%`,
                                        background: `linear-gradient(90deg, ${FOREST}, ${TEAL})`,
                                    }}
                                />
                            </div>
                            <span style={{ ...mutedStyle, marginTop: 6 }}>
                                Earned through participation across the Blackout ecosystem.
                            </span>
                        </div>
                    </div>
                )}

                {skills.length > 0 && (
                    <div style={sectionStyle} data-testid="profile-section-skills">
                        <p style={sectionTitle}>Skills</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {skills.map((skill) => (
                                <span key={skill.subject} style={chipStyle}>
                                    {skill.subject} · {skill.score}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {achievements.length > 0 && (
                    <div style={sectionStyle} data-testid="profile-section-achievements">
                        <p style={sectionTitle}>Achievements</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {achievements.map((a) => (
                                <span key={a.key} style={{ ...chipStyle, borderColor: TEAL, color: TEAL }}>
                                    {a.label}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div style={sectionStyle}>
                    {socialLinks.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {socialLinks.map((conn, i) => (
                                    <a
                                        key={`${conn.type}-${i}`}
                                        href={conn.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={chipStyle}
                                    >
                                        {conn.label || SOCIAL_LABELS[conn.type] || conn.type}
                                    </a>
                                ))}
                            </div>
                        )}
                    <a href={`${CHAT_URL}/#/user/${encodeURIComponent(userId)}`} style={tealButton}>
                        Message on Blackout
                    </a>
                </div>

                {bio ? (
                    <div style={sectionStyle}>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{bio}</p>
                    </div>
                ) : null}

                {/* Income surfaces — subscriptions / streams */}
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
                            <p style={mutedStyle}>
                                No subscription tiers yet. The creator hasn&apos;t published any.
                            </p>
                        ) : (
                            tiers.map((tier) => (
                                <article
                                    key={tier.id}
                                    style={cardStyle}
                                    data-testid="storefront-tier-card"
                                    data-tier-id={tier.id}
                                >
                                    <span style={{ fontSize: 14, fontWeight: 600 }}>{tier.name}</span>
                                    <span style={mutedStyle}>
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
                            <p style={mutedStyle}>Not live right now.</p>
                        ) : (
                            liveStreams.map((stream) => (
                                <a
                                    key={stream.id}
                                    href={`${LIVE_PATH}/${encodeURIComponent(stream.id)}`}
                                    style={{ ...cardStyle, color: 'inherit', textDecoration: 'none' }}
                                    data-testid="storefront-live-card"
                                >
                                    <strong style={{ fontSize: 14, fontWeight: 600 }}>{stream.title}</strong>
                                    <span style={{ ...mutedStyle, color: TEAL }}>● LIVE</span>
                                </a>
                            ))
                        )}
                    </div>
                ) : null}
                {activeTab === 'replays' ? (
                    <div style={sectionStyle} data-testid="storefront-section-replays">
                        {replays.length === 0 ? (
                            <p style={mutedStyle}>
                                No replays yet. Past {BLACKOUT_TERMS.den.singular} streams will appear here.
                            </p>
                        ) : (
                            replays.map((stream) => (
                                <a
                                    key={stream.id}
                                    href={`${LIVE_PATH}/${encodeURIComponent(stream.id)}`}
                                    style={{ ...cardStyle, color: 'inherit', textDecoration: 'none' }}
                                    data-testid="storefront-replay-card"
                                >
                                    <strong style={{ fontSize: 14, fontWeight: 600 }}>{stream.title}</strong>
                                    <span style={mutedStyle}>Replay · {stream.updatedAt}</span>
                                </a>
                            ))
                        )}
                    </div>
                ) : null}

                {/* Quests — Coliseum challenges the creator runs */}
                {coliseum && coliseum.challengesRun.length > 0 && (
                    <div style={sectionStyle} data-testid="profile-section-quests">
                        <p style={sectionTitle}>Quests</p>
                        {coliseum.challengesRun.map((ch) => (
                            <article key={ch.id} style={cardStyle}>
                                <span style={{ fontSize: 14, fontWeight: 600 }}>{ch.title}</span>
                                <span style={mutedStyle}>
                                    {ch.category} · {ch.status}
                                </span>
                                {ch.description ? <span style={{ fontSize: 13 }}>{ch.description}</span> : null}
                            </article>
                        ))}
                    </div>
                )}

                {/* Published content */}
                {content.length > 0 && (
                    <div style={sectionStyle} data-testid="profile-section-content">
                        <p style={sectionTitle}>Content</p>
                        <div style={gridStyle}>
                            {content.map((item) => (
                                <article key={item.id} style={cardStyle}>
                                    <span style={{ ...mutedStyle, color: TEAL, fontSize: 11 }}>{item.kind}</span>
                                    <span style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</span>
                                </article>
                            ))}
                        </div>
                    </div>
                )}

                {/* FreeBlackMarket catalog — income sources */}
                {fbmEvents.length > 0 && (
                    <div style={sectionStyle} data-testid="profile-section-fbm-events">
                        <p style={sectionTitle}>Events</p>
                        {fbmEvents.map((event) => (
                            <a
                                key={event.id}
                                href={`${FBM_STORE}/products/${event.handle ?? event.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ ...cardStyle, flexDirection: 'row', gap: 12, alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
                            >
                                {event.metadata?.event_date && (
                                    <div
                                        style={{
                                            minWidth: 56,
                                            textAlign: 'center',
                                            border: `1px solid ${TEAL}`,
                                            borderRadius: 8,
                                            padding: '6px 4px',
                                            color: TEAL,
                                        }}
                                    >
                                        <div style={{ fontSize: 11 }}>{event.metadata.event_date}</div>
                                        {event.metadata.event_time && (
                                            <div style={{ fontSize: 10, color: '#8a8a9a' }}>{event.metadata.event_time}</div>
                                        )}
                                    </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                                    <span style={{ fontSize: 14, fontWeight: 600 }}>{event.title}</span>
                                    {(event.metadata?.venue_name || event.metadata?.venue_location) && (
                                        <span style={mutedStyle}>
                                            {[event.metadata?.venue_name, event.metadata?.venue_location]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </span>
                                    )}
                                </div>
                                {productPrice(event) && <span style={{ color: TEAL, fontWeight: 600 }}>{productPrice(event)}</span>}
                            </a>
                        ))}
                    </div>
                )}

                {fbmProducts.length > 0 && (
                    <div style={sectionStyle} data-testid="profile-section-fbm-products">
                        <p style={sectionTitle}>Shop</p>
                        <div style={gridStyle}>
                            {fbmProducts.map((product) => (
                                <a
                                    key={product.id}
                                    href={`${FBM_STORE}/products/${product.handle ?? product.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ ...cardStyle, gap: 6, textDecoration: 'none', color: 'inherit' }}
                                >
                                    {product.thumbnail && (
                                        <img
                                            src={product.thumbnail}
                                            alt={product.title}
                                            style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8 }}
                                        />
                                    )}
                                    {product.type?.value && (
                                        <span style={{ ...mutedStyle, color: TEAL, fontSize: 11 }}>{product.type.value}</span>
                                    )}
                                    <span style={{ fontSize: 13, fontWeight: 600 }}>{product.title}</span>
                                    {productPrice(product) && <span style={mutedStyle}>{productPrice(product)}</span>}
                                </a>
                            ))}
                        </div>
                        <a
                            href={fbm?.vendor?.handle ? `${FBM_STORE}/${fbm.vendor.handle}` : FBM_STORE}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ ...mutedStyle, color: TEAL, fontSize: 12 }}
                        >
                            Powered by FreeBlackMarket
                        </a>
                    </div>
                )}

                {/* Sponsors / backers */}
                {sponsorVendors.length > 0 && (
                    <div style={sectionStyle} data-testid="profile-section-sponsors">
                        <p style={sectionTitle}>Sponsors</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {sponsorVendors.map((vendor) => (
                                <a
                                    key={vendor.handle ?? vendor.id}
                                    href={vendor.handle ? `${FBM_STORE}/${vendor.handle}` : FBM_STORE}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ ...chipStyle, padding: '8px 12px' }}
                                >
                                    {vendor.photo && (
                                        <img
                                            src={vendor.photo}
                                            alt={vendor.name}
                                            style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }}
                                        />
                                    )}
                                    {vendor.name ?? vendor.handle}
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                <footer style={{ ...sectionStyle, borderTop: `1px solid ${BORDER}`, marginTop: 12 }}>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <a href="https://theblackout.app" style={{ ...mutedStyle, color: TEAL }}>
                            Blackout
                        </a>
                        <a href={FBM_STORE} target="_blank" rel="noopener noreferrer" style={{ ...mutedStyle, color: TEAL }}>
                            FreeBlackMarket
                        </a>
                    </div>
                </footer>
            </div>
        </section>
    );
};

/**
 * Router-mounted entry. Resolves identity from either `:handle` (the public
 * `/@handle` route) or `:userId` (the in-app `/creators/:userId` storefront).
 */
export const CreatorStorefront = (): JSX.Element => {
    const params = useParams<{ handle?: string; userId?: string }>();
    const handle = params.handle;
    const rawUserId = params.userId ? decodeURIComponent(params.userId) : undefined;
    const userId = rawUserId ?? (handle ? `@${handle}:${SERVER_NAME}` : '');
    // The `/@handle` route is the opt-in public profile and must honor the
    // public gate; the legacy `/creators/:userId` storefront stays ungated.
    return <CreatorStorefrontView userId={userId} handle={handle} gated={Boolean(handle)} />;
};

/**
 * Standalone entry for the logged-out `/@handle` intercept in main.tsx, where
 * no Router is mounted. Parses the handle from the URL directly.
 */
export const PublicProfileStandalone = (): JSX.Element => {
    const match =
        typeof window !== 'undefined' ? window.location.pathname.match(/^\/@([^/]+)/) : null;
    const handle = match ? decodeURIComponent(match[1]) : '';
    const userId = handle ? `@${handle}:${SERVER_NAME}` : '';
    return <CreatorStorefrontView userId={userId} handle={handle} gated />;
};

export default CreatorStorefront;
