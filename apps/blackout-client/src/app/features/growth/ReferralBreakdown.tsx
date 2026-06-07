import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { fetchMyReferrals, type ReferralRecord, type ReferralSourceKind } from './growthClient';

const SOURCE_LABEL: Record<ReferralSourceKind, string> = {
    invite_link: 'Users (invite link)',
    creator_invite: 'Creators',
    ambassador: 'Ambassador',
    migration_campaign: 'Coalitions (migration)',
};

const SOURCE_ORDER: ReferralSourceKind[] = [
    'invite_link',
    'creator_invite',
    'migration_campaign',
    'ambassador',
];

const sectionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
};

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
    background: 'var(--bg-input, rgba(0,0,0,0.15))',
};

interface Bucket {
    kind: ReferralSourceKind;
    count: number;
    earnedCents: number;
}

/** Group referrals by source kind, summing settled/attributed reward cents. */
function summarize(items: ReferralRecord[]): { buckets: Bucket[]; totalCount: number; totalCents: number } {
    const byKind = new Map<ReferralSourceKind, Bucket>();
    let totalCents = 0;
    for (const item of items) {
        const bucket = byKind.get(item.sourceKind) ?? { kind: item.sourceKind, count: 0, earnedCents: 0 };
        bucket.count += 1;
        if ((item.status === 'attributed' || item.status === 'settled') && item.rewardCents) {
            bucket.earnedCents += item.rewardCents;
            totalCents += item.rewardCents;
        }
        byKind.set(item.sourceKind, bucket);
    }
    const buckets = SOURCE_ORDER.filter((kind) => byKind.has(kind)).map((kind) => byKind.get(kind)!);
    return { buckets, totalCount: items.length, totalCents };
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Consolidated referral breakdown — counts and generated earnings split by
 * source (users via invite link, creators, coalitions via migration, ambassador).
 * Reads the existing `/v1/growth/referrals/me` ledger; no new server surface.
 */
export function ReferralBreakdown(): JSX.Element {
    const [items, setItems] = useState<ReferralRecord[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchMyReferrals()
            .then((res) => {
                if (!cancelled) setItems(res.items);
            })
            .catch(() => {
                if (!cancelled) setError('Could not load referrals');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const { buckets, totalCount, totalCents } = useMemo(() => summarize(items), [items]);

    return (
        <section style={sectionStyle} data-testid="referral-breakdown">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16 }}>Referrals</h2>
                <span style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)' }}>
                    {totalCount} total · {money(totalCents)} generated
                </span>
            </div>

            {error ? <span style={{ color: 'var(--danger, #e74c3c)', fontSize: 13 }}>{error}</span> : null}
            {!error && buckets.length === 0 ? (
                <span style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)' }}>
                    No referrals yet. Share your invite link to start earning.
                </span>
            ) : null}

            {buckets.map((bucket) => (
                <div key={bucket.kind} style={rowStyle} data-testid="referral-breakdown-row" data-kind={bucket.kind}>
                    <span style={{ flex: 1, fontWeight: 600 }}>{SOURCE_LABEL[bucket.kind]}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)' }}>{bucket.count}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{money(bucket.earnedCents)}</span>
                </div>
            ))}
        </section>
    );
}

export default ReferralBreakdown;
