import { createElement, useEffect, useMemo, useState } from 'react';
import { feeForProvider } from '@blackout/core';
import {
    adRevenueApi,
    creatorSubsApi,
    formatCents,
    tipsApi,
    type AdRevenueShare,
    type CreatorSubscription,
    type Tip,
} from '../monetizationApi';
import { readBlackoutApiToken } from '../marketplace/useMarketplaceAuth';

/** Fee schedule of the live marketplace provider — single source of truth. */
const FBM_FEES = feeForProvider('freeblackmarket');

const cardStyle: Record<string, string | number> = {
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
    padding: 12,
    display: 'grid',
    gap: 10,
};

const statBlockStyle: Record<string, string | number> = {
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    padding: 10,
    display: 'grid',
    gap: 4,
    background: 'var(--bg-input)',
};

interface Totals {
    tipsCapturedCents: number;
    tipsCapturedFeeCents: number;
    tipsCapturedNetCents: number;
    tipsCapturedCount: number;
    tipsPendingCount: number;
    activeSubsCount: number;
    activeSubMrrCents: number;
    adRevenuePendingCents: number;
    adRevenuePaidCents: number;
}

function summarize(
    tips: Tip[],
    subs: CreatorSubscription[],
    shares: AdRevenueShare[],
    tiersById: Map<string, number>
): Totals {
    const totals: Totals = {
        tipsCapturedCents: 0,
        tipsCapturedFeeCents: 0,
        tipsCapturedNetCents: 0,
        tipsCapturedCount: 0,
        tipsPendingCount: 0,
        activeSubsCount: 0,
        activeSubMrrCents: 0,
        adRevenuePendingCents: 0,
        adRevenuePaidCents: 0,
    };
    for (const tip of tips) {
        if (tip.status === 'captured') {
            totals.tipsCapturedCents += tip.grossCents;
            totals.tipsCapturedFeeCents += tip.feeCents;
            totals.tipsCapturedNetCents += tip.netCents;
            totals.tipsCapturedCount += 1;
        } else if (tip.status === 'pending') {
            totals.tipsPendingCount += 1;
        }
    }
    for (const sub of subs) {
        if (sub.status === 'active') {
            totals.activeSubsCount += 1;
            totals.activeSubMrrCents += tiersById.get(sub.tierId) ?? 0;
        }
    }
    for (const share of shares) {
        if (share.status === 'pending_payout') totals.adRevenuePendingCents += share.netCents;
        else if (share.status === 'paid') totals.adRevenuePaidCents += share.netCents;
    }
    return totals;
}

function StatBlock(props: { label: string; value: string; sub?: string }) {
    return createElement(
        'div',
        { style: statBlockStyle },
        createElement(
            'div',
            {
                style: {
                    fontSize: 10,
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    letterSpacing: 0.5,
                },
            },
            props.label
        ),
        createElement('div', { style: { fontSize: 18, fontWeight: 700 } }, props.value),
        props.sub
            ? createElement(
                  'div',
                  { style: { fontSize: 10, color: 'var(--text-secondary)' } },
                  props.sub
              )
            : null
    );
}

export function CreatorEarningsDashboard() {
    const [tips, setTips] = useState<Tip[] | null>(null);
    const [subs, setSubs] = useState<CreatorSubscription[] | null>(null);
    const [tiers, setTiers] = useState<Map<string, number>>(new Map());
    const [shares, setShares] = useState<AdRevenueShare[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const token = useMemo(() => readBlackoutApiToken(), []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [tipsResp, subsResp, tiersResp, sharesResp] = await Promise.all([
                    tipsApi.listReceived(token, 200),
                    creatorSubsApi.listMySubscribers(token),
                    creatorSubsApi.listMyTiers(token),
                    adRevenueApi.listMine(token),
                ]);
                if (cancelled) return;
                setTips(tipsResp.tips);
                setSubs(subsResp.subscriptions);
                setShares(sharesResp.shares);
                setTiers(new Map(tiersResp.tiers.map((t) => [t.id, t.priceCents])));
            } catch (err) {
                if (!cancelled)
                    setError(err instanceof Error ? err.message : 'Failed to load earnings');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token]);

    if (error) {
        return createElement(
            'div',
            { style: { ...cardStyle, color: 'var(--text-danger)' } },
            error
        );
    }
    if (!tips || !subs || !shares) {
        return createElement(
            'div',
            { style: { ...cardStyle, color: 'var(--text-secondary)' } },
            'Loading earnings…'
        );
    }
    const totals = summarize(tips, subs, shares, tiers);
    const recentTips = tips.slice(0, 8);
    const giftTips = recentTips.filter((t) => t.giftSku);

    return createElement(
        'section',
        { style: { display: 'grid', gap: 12 } },
        createElement(
            'div',
            {
                style: {
                    display: 'grid',
                    gap: 10,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                },
            },
            createElement(StatBlock, {
                label: 'Tips received (net)',
                value: formatCents(totals.tipsCapturedNetCents),
                sub: `${totals.tipsCapturedCount} captured · ${totals.tipsPendingCount} pending`,
            }),
            createElement(StatBlock, {
                label: 'Active subscribers',
                value: String(totals.activeSubsCount),
                sub: `${formatCents(totals.activeSubMrrCents)} MRR (gross)`,
            }),
            createElement(StatBlock, {
                label: 'Ad revenue paid',
                value: formatCents(totals.adRevenuePaidCents),
                sub: `${formatCents(totals.adRevenuePendingCents)} pending payout`,
            }),
            createElement(StatBlock, {
                label: 'Platform fee paid',
                value: formatCents(totals.tipsCapturedFeeCents),
                sub: `${FBM_FEES.displayFeePercent}% flat · tips only — subs/ad-rev fees apply at FBM settlement`,
            })
        ),
        createElement(
            'div',
            { style: cardStyle, 'data-testid': 'payout-terms' },
            createElement('div', { style: { fontSize: 13, fontWeight: 600 } }, 'How payouts work'),
            createElement(
                'ul',
                {
                    style: {
                        display: 'grid',
                        gap: 4,
                        margin: 0,
                        padding: 0,
                        listStyle: 'none',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                    },
                },
                createElement(
                    'li',
                    { key: 'fee' },
                    `Platform fee: a flat ${FBM_FEES.displayFeePercent}% on every tip, subscription, gift, and boost. The rest is yours.`
                ),
                createElement(
                    'li',
                    { key: 'cadence' },
                    `Payout cadence: FreeBlackMarket settles ${FBM_FEES.payoutCadence}.`
                ),
                createElement(
                    'li',
                    { key: 'mor' },
                    'FreeBlackMarket is the merchant of record — it processes payments and sends payouts; Blackout never holds your funds.'
                ),
                createElement(
                    'li',
                    { key: 'states' },
                    'Pending = checkout started, awaiting confirmation. Captured = confirmed and counted in your net.'
                )
            )
        ),
        createElement(
            'div',
            { style: cardStyle },
            createElement('div', { style: { fontSize: 13, fontWeight: 600 } }, 'Recent tips'),
            recentTips.length === 0
                ? createElement(
                      'div',
                      { style: { fontSize: 12, color: 'var(--text-secondary)' } },
                      'No tips yet — drop a Tip button on your profile or stream.'
                  )
                : createElement(
                      'ul',
                      {
                          style: {
                              display: 'grid',
                              gap: 4,
                              margin: 0,
                              padding: 0,
                              listStyle: 'none',
                          },
                      },
                      ...recentTips.map((tip) =>
                          createElement(
                              'li',
                              {
                                  key: tip.id,
                                  style: {
                                      display: 'grid',
                                      gridTemplateColumns: '1fr auto auto',
                                      gap: 8,
                                      fontSize: 12,
                                      padding: 6,
                                      borderRadius: 6,
                                      background: 'var(--bg-input)',
                                  },
                              },
                              createElement(
                                  'span',
                                  undefined,
                                  tip.giftSku ? `🎁 ${tip.giftSku}` : `${tip.contextKind}`,
                                  tip.note ? ` — ${tip.note}` : ''
                              ),
                              createElement(
                                  'span',
                                  undefined,
                                  formatCents(tip.netCents, tip.currency)
                              ),
                              createElement(
                                  'span',
                                  { style: { color: 'var(--text-secondary)' } },
                                  tip.status
                              )
                          )
                      )
                  )
        ),
        giftTips.length > 0
            ? createElement(
                  'div',
                  { style: cardStyle },
                  createElement(
                      'div',
                      { style: { fontSize: 13, fontWeight: 600 } },
                      `Gifts received (${giftTips.length})`
                  ),
                  createElement(
                      'div',
                      { style: { fontSize: 12, color: 'var(--text-secondary)' } },
                      `Net: ${formatCents(giftTips.reduce((s, t) => s + t.netCents, 0))}`
                  )
              )
            : null
    );
}
