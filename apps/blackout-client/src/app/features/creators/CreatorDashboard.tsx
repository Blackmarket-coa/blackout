import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { CREATOR_LISTINGS_PATH, ONBOARDING_CREATOR_PATH } from '../../pages/paths';
import { ReferralBreakdown } from '../growth/ReferralBreakdown';
import { ProducerProfile } from '../monetization/marketplace/ProducerProfile';
import {
    fetchMyAmbassador,
    fetchMyMigrationCredits,
    fetchMyReferrals,
    type AmbassadorRecord,
    type MigrationCreditRecord,
    type ReferralRecord,
} from '../growth';

// CreatorEarningsDashboard pulls in the broader monetization client.
// Lazy-load to keep the registry-load path jsdom-independent (PR 1's
// recurring lesson). The existing component is a complete earnings
// surface already; this dashboard is a composer that surrounds it
// with growth-status cards.
const CreatorEarningsDashboardLazy = lazy(() =>
    import('../monetization/components/CreatorEarningsDashboard').then((mod) => ({
        default: mod.CreatorEarningsDashboard,
    }))
);

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
    gap: 6,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const subStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

const sectionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: '12px 16px 24px',
};

const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 10,
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

const cardLabelStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
};

const cardValueStyle: CSSProperties = { fontSize: 18, fontWeight: 700 };
const cardMetaStyle: CSSProperties = {
    fontSize: 12,
    color: 'var(--text-muted, #9ca3af)',
};

const ctaStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #3b82f6)',
    background: 'var(--accent-primary, #3b82f6)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
};

const ghostStyle: CSSProperties = {
    ...ctaStyle,
    background: 'transparent',
    border: '1px solid var(--border-default, #374151)',
    color: 'var(--text-primary, #f8fafc)',
};

const sectionTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
};

const formatCents = (priceCents: number, currency: string): string => {
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

const formatBps = (bps: number): string => `${(bps / 100).toFixed(1)}%`;

/**
 * `/creator` landing page (PR 9). Composes:
 *   - the existing earnings dashboard from `monetization/components`
 *     (lazy-loaded; reuse, do not rebuild)
 *   - status cards for ambassador tier / pending referrals /
 *     unredeemed migration credits, sourced from the PR 5/7 growth
 *     ledger.
 *
 * Each fetcher swallows its own error so a single unavailable section
 * still leaves the rest of the dashboard usable, mirroring the
 * CreatorStorefront pattern from PR 4.
 */
export const CreatorDashboard = (): JSX.Element => {
    const [ambassador, setAmbassador] = useState<AmbassadorRecord | null>(null);
    const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
    const [credits, setCredits] = useState<MigrationCreditRecord[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetchMyAmbassador()
            .then((response) => {
                if (cancelled) return;
                setAmbassador(response.ambassador);
            })
            .catch(() => undefined);
        fetchMyReferrals()
            .then((response) => {
                if (cancelled) return;
                setReferrals(response.items);
            })
            .catch(() => undefined);
        fetchMyMigrationCredits()
            .then((response) => {
                if (cancelled) return;
                setCredits(response.items);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const unredeemedCredits = credits.filter((credit) => credit.redeemedAt === null);
    const pendingReferrals = referrals.filter(
        (referral) => referral.status === 'pending' || referral.status === 'attributed'
    );

    return (
        <section style={layoutStyle} data-shell-region="creator-dashboard">
            <header style={headerStyle}>
                <h1 style={titleStyle}>Creator dashboard</h1>
                <p style={subStyle}>
                    Earnings, referrals, and growth status for your creator{' '}
                    {BLACKOUT_TERMS.canopy.singular}.
                </p>
            </header>
            <div style={sectionStyle}>
                <h2 style={sectionTitleStyle}>Growth status</h2>
                <div style={gridStyle} data-testid="creator-dashboard-growth">
                    <div style={cardStyle} data-testid="creator-dashboard-card-ambassador">
                        <span style={cardLabelStyle}>Ambassador tier</span>
                        <span style={cardValueStyle}>{ambassador?.tier ?? '—'}</span>
                        <span style={cardMetaStyle}>
                            {ambassador
                                ? `Commission ${formatBps(ambassador.commissionBps)} · ${
                                      ambassador.status
                                  }`
                                : 'Apply to join the ambassador program'}
                        </span>
                    </div>
                    <div style={cardStyle} data-testid="creator-dashboard-card-referrals">
                        <span style={cardLabelStyle}>Pending referrals</span>
                        <span style={cardValueStyle}>{pendingReferrals.length}</span>
                        <span style={cardMetaStyle}>
                            {referrals.length === 0
                                ? 'No referrals yet'
                                : `${referrals.length} total invitees`}
                        </span>
                    </div>
                    <div style={cardStyle} data-testid="creator-dashboard-card-credits">
                        <span style={cardLabelStyle}>Migration credits</span>
                        <span style={cardValueStyle}>{unredeemedCredits.length}</span>
                        <span style={cardMetaStyle}>
                            {unredeemedCredits.length === 0
                                ? 'Nothing to redeem'
                                : `${formatCents(
                                      unredeemedCredits.reduce(
                                          (sum, entry) => sum + entry.valueCents,
                                          0
                                      ),
                                      unredeemedCredits[0]?.currency ?? 'USD'
                                  )} unredeemed`}
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link to={CREATOR_LISTINGS_PATH} style={ctaStyle}>
                        Manage listings
                    </Link>
                    <Link to={ONBOARDING_CREATOR_PATH} style={ghostStyle}>
                        Open creator onboarding
                    </Link>
                </div>
            </div>
            <div style={sectionStyle}>
                <h2 style={sectionTitleStyle}>Earnings</h2>
                <Suspense fallback={null}>
                    <CreatorEarningsDashboardLazy />
                </Suspense>
            </div>
            <div style={sectionStyle}>
                <h2 style={sectionTitleStyle}>Producer profile</h2>
                <ProducerProfile editable />
            </div>
            <div style={sectionStyle}>
                <ReferralBreakdown />
            </div>
        </section>
    );
};

export default CreatorDashboard;
