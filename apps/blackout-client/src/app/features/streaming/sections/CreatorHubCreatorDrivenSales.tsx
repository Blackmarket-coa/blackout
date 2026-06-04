import React, { type CSSProperties, useEffect, useState } from 'react';
import {
    fetchCreatorDrivenSales,
    type CreatorDrivenAttributionKind,
    type CreatorDrivenSalesSummary,
} from '../../growth/growthClient';
import { HubSection, hubEmptyStyle } from '../components/HubSection';

const statRowStyle: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 };
const statCardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 16,
    minWidth: 140,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 14,
    background: 'var(--bg-input, #0f172a)',
};
const statValueStyle: CSSProperties = { fontSize: 22, fontWeight: 800 };
const statLabelStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
};
const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    padding: '12px 14px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #0f172a)',
};
const rowMetaStyle: CSSProperties = {
    fontSize: 12,
    color: 'var(--text-muted, #9ca3af)',
};

const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const KIND_LABELS: Record<CreatorDrivenAttributionKind, string> = {
    referral_bonus: 'Referrals',
    ambassador_commission: 'Ambassador',
    quest_reward: 'Quests',
    bounty_reward: 'Bounties',
};

const KIND_ORDER: CreatorDrivenAttributionKind[] = [
    'referral_bonus',
    'ambassador_commission',
    'quest_reward',
    'bounty_reward',
];

/**
 * Creator Hub panel for the single KPI: creator-driven sales — sales that
 * happened because the creator referred, ambassador-drove, completed a quest,
 * or won a bounty (`/v1/growth/creator-driven-sales`). Shows total count, GMV,
 * and the creator's net, plus a per-attribution-kind breakdown. Self-degrading
 * like the other hub sections (a growth-API hiccup renders the empty state, not
 * an error).
 */
export const CreatorHubCreatorDrivenSales = (): JSX.Element => {
    const [summary, setSummary] = useState<CreatorDrivenSalesSummary | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchCreatorDrivenSales()
            .then((res) => {
                if (!cancelled) setSummary(res);
            })
            .catch(() => {
                if (!cancelled) setSummary(null);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const total = summary?.total ?? { count: 0, gmvCents: 0, feeCents: 0, netCents: 0 };
    const loaded = summary !== null;

    return (
        <HubSection
            title="Creator-driven sales"
            subtitle="Sales that happened because you referred, drove, quested, or won a bounty."
            testId="creator-hub-creator-driven-sales"
            shellRegion="creator-hub-creator-driven-sales"
        >
            <div style={statRowStyle}>
                <div style={statCardStyle}>
                    <span style={statValueStyle} data-testid="cds-count">
                        {total.count}
                    </span>
                    <span style={statLabelStyle}>Attributed sales</span>
                </div>
                <div style={statCardStyle}>
                    <span style={statValueStyle} data-testid="cds-gmv">
                        {usd(total.gmvCents)}
                    </span>
                    <span style={statLabelStyle}>GMV</span>
                </div>
                <div style={statCardStyle}>
                    <span style={statValueStyle} data-testid="cds-net">
                        {usd(total.netCents)}
                    </span>
                    <span style={statLabelStyle}>Your net</span>
                </div>
            </div>
            {!loaded ? (
                <p style={hubEmptyStyle}>Loading creator-driven sales…</p>
            ) : total.count === 0 ? (
                <p style={hubEmptyStyle} data-testid="cds-empty">
                    No creator-driven sales yet. Referrals, ambassador drives, quests, and bounties
                    you complete will show up here once they settle.
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {KIND_ORDER.filter((kind) => summary!.byKind[kind].count > 0).map((kind) => {
                        const bucket = summary!.byKind[kind];
                        return (
                            <div key={kind} style={rowStyle} data-testid="cds-kind-row">
                                <span style={{ fontSize: 13, fontWeight: 600 }}>
                                    {KIND_LABELS[kind]}
                                </span>
                                <span style={rowMetaStyle}>
                                    {bucket.count} · {usd(bucket.gmvCents)} GMV · {usd(bucket.netCents)} net
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </HubSection>
    );
};

export default CreatorHubCreatorDrivenSales;
