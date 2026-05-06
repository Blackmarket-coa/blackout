import { createElement, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
    claimGift,
    donateForward,
    fetchAvailableGifts,
    fetchMyGifts,
    fetchMySubscription,
    passGift,
    type GiftSummary,
    type SubscriptionSummary,
} from './subscriptionsClient';
import {
    creatorSubsApi,
    formatCents,
    type CreatorSubscription,
    type CreatorTier,
} from '../monetizationApi';
import { readBlackoutApiToken } from '../marketplace/useMarketplaceAuth';

const sectionStyle = { display: 'grid', gap: 10 } as const;
const calloutStyle = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    padding: 12,
    background: 'var(--bg-surface)',
    display: 'grid',
    gap: 8,
} as const;
const buttonStyle = {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-accent)',
    color: 'var(--text-on-accent)',
    cursor: 'pointer',
    fontSize: 13,
    justifySelf: 'start',
} as const;
const ghostButtonStyle = {
    ...buttonStyle,
    background: 'var(--bg-surface)',
    color: 'var(--text-secondary)',
} as const;
const giftRowStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr auto auto',
    gap: 8,
    alignItems: 'center',
    paddingBlock: 6,
    borderTop: '1px solid var(--border-default)',
} as const;
const mutedStyle = { color: 'var(--text-secondary)', fontSize: 12 } as const;
const headingStyle = { margin: 0, fontSize: 14, fontWeight: 600 } as const;
const inputStyle: Record<string, string | number> = {
    padding: '6px 8px',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 12,
    width: '100%',
    boxSizing: 'border-box',
};
const inlineButtonStyle: Record<string, string | number> = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-accent)',
    color: 'var(--text-on-accent)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};

function formatChain(depth: number): string {
    return depth === 0 ? 'Seed gift' : `Forwarded ${depth}×`;
}

// =============================================================================
// Pay-it-forward gift chain (platform-tier subscriptions)
// =============================================================================

function PayItForwardPanel({
    subscription,
    onAction,
}: {
    subscription: SubscriptionSummary;
    onAction: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDonate = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            await donateForward();
            onAction();
        } catch (err) {
            setError('Could not pay it forward. Try again later.');
            console.warn('[subscriptions] donateForward failed', err);
        } finally {
            setBusy(false);
        }
    }, [onAction]);

    if (!subscription.entitlementActive || subscription.tier === 'free') {
        return null;
    }

    return createElement(
        'div',
        { style: calloutStyle },
        createElement('h4', { style: headingStyle }, 'Pay it forward'),
        createElement(
            'p',
            { style: { ...mutedStyle, margin: 0 } },
            `You have an active ${subscription.tier} subscription. Donate the equivalent of one period to a future user instead of letting it expire.`,
        ),
        createElement(
            'button',
            {
                type: 'button',
                style: buttonStyle,
                disabled: busy,
                onClick: () => void handleDonate(),
            },
            busy ? 'Sending…' : 'Pay it forward',
        ),
        error && createElement('span', { style: { ...mutedStyle, color: 'var(--text-danger)' } }, error),
    );
}

function AvailableGiftsPanel({
    gifts,
    onAction,
}: {
    gifts: GiftSummary[];
    onAction: () => void;
}) {
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleClaim = useCallback(
        async (giftId: string) => {
            setBusyId(giftId);
            setError(null);
            try {
                await claimGift(giftId);
                onAction();
            } catch (err) {
                setError('Could not claim that gift.');
                console.warn('[subscriptions] claimGift failed', err);
            } finally {
                setBusyId(null);
            }
        },
        [onAction],
    );

    const handlePass = useCallback(
        async (giftId: string) => {
            setBusyId(giftId);
            setError(null);
            try {
                await passGift(giftId);
                onAction();
            } catch (err) {
                setError('Could not forward that gift.');
                console.warn('[subscriptions] passGift failed', err);
            } finally {
                setBusyId(null);
            }
        },
        [onAction],
    );

    if (gifts.length === 0) {
        return createElement(
            'div',
            { style: calloutStyle },
            createElement('h4', { style: headingStyle }, 'No gifts waiting'),
            createElement(
                'p',
                { style: { ...mutedStyle, margin: 0 } },
                'Check back later — paying members can donate a free month forward at any time.',
            ),
        );
    }

    return createElement(
        'div',
        { style: calloutStyle },
        createElement(
            'h4',
            { style: headingStyle },
            `${gifts.length} gift${gifts.length === 1 ? '' : 's'} waiting`,
        ),
        createElement(
            'div',
            { style: { display: 'grid' } },
            ...gifts.map((gift) =>
                createElement(
                    'div',
                    { key: gift.id, style: giftRowStyle },
                    createElement(
                        'div',
                        { style: { display: 'grid', gap: 2 } },
                        createElement('span', undefined, `${gift.donorTier} · ${formatChain(gift.chainDepth)}`),
                        createElement('span', { style: mutedStyle }, `Expires ${gift.expiresAt.slice(0, 10)}`),
                    ),
                    createElement(
                        'button',
                        {
                            type: 'button',
                            style: buttonStyle,
                            disabled: busyId === gift.id,
                            onClick: () => void handleClaim(gift.id),
                        },
                        'Claim',
                    ),
                    createElement(
                        'button',
                        {
                            type: 'button',
                            style: ghostButtonStyle,
                            disabled: busyId === gift.id,
                            onClick: () => void handlePass(gift.id),
                        },
                        'Pass on',
                    ),
                ),
            ),
        ),
        error && createElement('span', { style: { ...mutedStyle, color: 'var(--text-danger)' } }, error),
    );
}

function MyChainPanel({
    donated,
    received,
}: {
    donated: GiftSummary[];
    received: GiftSummary[];
}) {
    if (donated.length === 0 && received.length === 0) return null;

    const longestChain = [...donated, ...received].reduce((max, gift) => Math.max(max, gift.chainDepth), 0);

    return createElement(
        'div',
        { style: calloutStyle },
        createElement('h4', { style: headingStyle }, 'Your chain'),
        createElement(
            'p',
            { style: { ...mutedStyle, margin: 0 } },
            `Donated ${donated.length} · Received ${received.length} · Longest hop ${longestChain}`,
        ),
    );
}

// =============================================================================
// Per-creator subscription tiers (Patreon-style; orthogonal to platform tiers)
// =============================================================================

function CreateTierForm(props: { onCreated: (tier: CreatorTier) => void }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const token = useMemo(() => readBlackoutApiToken(), []);

    async function submit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        const cents = Math.floor(Number(price) * 100);
        if (!Number.isFinite(cents) || cents < 199) {
            setError('Tier price must be at least $1.99.');
            return;
        }
        if (!name.trim()) {
            setError('Tier name required.');
            return;
        }
        setSubmitting(true);
        try {
            const { tier } = await creatorSubsApi.createTier(
                {
                    name: name.trim(),
                    description: description || undefined,
                    priceCents: cents,
                    currency: 'USD',
                },
                token
            );
            props.onCreated(tier);
            setName('');
            setDescription('');
            setPrice('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create tier.');
        } finally {
            setSubmitting(false);
        }
    }

    return createElement(
        'form',
        { style: calloutStyle, onSubmit: submit },
        createElement('h4', { style: headingStyle }, 'Create a subscription tier'),
        createElement(
            'p',
            { style: { ...mutedStyle, margin: 0 } },
            'Patreon-style monthly tier. FreeBlackMarket handles billing and renewals — flat 3% commission applies on every renewal.'
        ),
        createElement('input', {
            type: 'text',
            value: name,
            placeholder: 'Tier name (e.g., Supporter)',
            style: inputStyle,
            onChange: (e: { currentTarget: { value: string } }) => setName(e.currentTarget.value),
        }),
        createElement('input', {
            type: 'text',
            value: description,
            placeholder: 'Description (perks, access)',
            style: inputStyle,
            onChange: (e: { currentTarget: { value: string } }) =>
                setDescription(e.currentTarget.value),
        }),
        createElement('input', {
            type: 'number',
            step: '0.01',
            min: '1.99',
            value: price,
            placeholder: 'Price ($/month)',
            style: inputStyle,
            onChange: (e: { currentTarget: { value: string } }) => setPrice(e.currentTarget.value),
        }),
        error
            ? createElement(
                  'div',
                  { style: { fontSize: 11, color: 'var(--text-danger)' } },
                  error
              )
            : null,
        createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end' } },
            createElement(
                'button',
                { type: 'submit', style: inlineButtonStyle, disabled: submitting },
                submitting ? 'Creating…' : 'Create tier'
            )
        )
    );
}

function CreatorTierPanels() {
    const [tiers, setTiers] = useState<CreatorTier[] | null>(null);
    const [subscriptions, setSubscriptions] = useState<CreatorSubscription[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [actioning, setActioning] = useState<string | null>(null);
    const token = useMemo(() => readBlackoutApiToken(), []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [tiersResp, subsResp] = await Promise.all([
                    creatorSubsApi.listMyTiers(token),
                    creatorSubsApi.listMySubscriptions(token),
                ]);
                if (cancelled) return;
                setTiers(tiersResp.tiers);
                setSubscriptions(subsResp.subscriptions);
            } catch (err) {
                if (!cancelled)
                    setError(err instanceof Error ? err.message : 'Failed to load creator subscriptions');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token]);

    async function archive(tierId: string) {
        setActioning(tierId);
        try {
            await creatorSubsApi.archiveTier(tierId, token);
            setTiers((prev) => prev?.map((t) => (t.id === tierId ? { ...t, status: 'archived' } : t)) ?? null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to archive tier');
        } finally {
            setActioning(null);
        }
    }

    async function cancel(subId: string) {
        setActioning(subId);
        try {
            await creatorSubsApi.cancel(subId, token);
            setSubscriptions(
                (prev) =>
                    prev?.map((s) => (s.id === subId ? { ...s, status: 'canceled' as const } : s)) ?? null
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
        } finally {
            setActioning(null);
        }
    }

    return createElement(
        'div',
        { style: { display: 'grid', gap: 10 } },
        error
            ? createElement('div', { style: { color: 'var(--text-danger)' } }, error)
            : null,
        createElement(CreateTierForm, {
            onCreated: (tier: CreatorTier) =>
                setTiers((prev) => (prev ? [...prev, tier] : [tier])),
        }),
        createElement(
            'div',
            { style: calloutStyle },
            createElement('h4', { style: headingStyle }, 'Your tiers'),
            tiers === null
                ? createElement(
                      'div',
                      { style: { fontSize: 12, color: 'var(--text-secondary)' } },
                      'Loading…'
                  )
                : tiers.length === 0
                  ? createElement(
                        'div',
                        { style: { fontSize: 12, color: 'var(--text-secondary)' } },
                        'No tiers yet. Create one above to start accepting subscribers.'
                    )
                  : createElement(
                        'div',
                        { style: { display: 'grid', gap: 6 } },
                        ...tiers.map((tier) =>
                            createElement(
                                'div',
                                {
                                    key: tier.id,
                                    style: {
                                        display: 'grid',
                                        gridTemplateColumns: '1fr auto auto auto',
                                        gap: 8,
                                        alignItems: 'center',
                                        fontSize: 12,
                                        padding: 6,
                                        borderRadius: 6,
                                        background: 'var(--bg-input)',
                                        opacity: tier.status === 'archived' ? 0.5 : 1,
                                    },
                                },
                                createElement('span', undefined, tier.name),
                                createElement(
                                    'span',
                                    undefined,
                                    `${formatCents(tier.priceCents, tier.currency)}/mo`
                                ),
                                createElement(
                                    'span',
                                    { style: { color: 'var(--text-secondary)' } },
                                    tier.status
                                ),
                                tier.status !== 'archived'
                                    ? createElement(
                                          'button',
                                          {
                                              type: 'button',
                                              style: { ...inlineButtonStyle, background: 'var(--bg-input)', color: 'var(--text-primary)' },
                                              onClick: () => archive(tier.id),
                                              disabled: actioning === tier.id,
                                          },
                                          actioning === tier.id ? '…' : 'Archive'
                                      )
                                    : createElement('span', undefined, '')
                            )
                        )
                    )
        ),
        createElement(
            'div',
            { style: calloutStyle },
            createElement('h4', { style: headingStyle }, 'Creators you support'),
            subscriptions === null
                ? createElement(
                      'div',
                      { style: { fontSize: 12, color: 'var(--text-secondary)' } },
                      'Loading…'
                  )
                : subscriptions.length === 0
                  ? createElement(
                        'div',
                        { style: { fontSize: 12, color: 'var(--text-secondary)' } },
                        'You\'re not subscribed to any creators yet.'
                    )
                  : createElement(
                        'div',
                        { style: { display: 'grid', gap: 6 } },
                        ...subscriptions.map((sub) =>
                            createElement(
                                'div',
                                {
                                    key: sub.id,
                                    style: {
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr auto',
                                        gap: 8,
                                        alignItems: 'center',
                                        fontSize: 12,
                                        padding: 6,
                                        borderRadius: 6,
                                        background: 'var(--bg-input)',
                                    },
                                },
                                createElement('span', undefined, `Creator ${sub.creatorUserId}`),
                                createElement(
                                    'span',
                                    { style: { color: 'var(--text-secondary)' } },
                                    sub.status === 'active' && sub.currentPeriodEndsAt
                                        ? `Renews ${new Date(sub.currentPeriodEndsAt).toLocaleDateString()}`
                                        : sub.status
                                ),
                                sub.status === 'active'
                                    ? createElement(
                                          'button',
                                          {
                                              type: 'button',
                                              style: { ...inlineButtonStyle, background: 'var(--bg-input)', color: 'var(--text-primary)' },
                                              onClick: () => cancel(sub.id),
                                              disabled: actioning === sub.id,
                                          },
                                          actioning === sub.id ? '…' : 'Cancel'
                                      )
                                    : createElement('span', undefined, '')
                            )
                        )
                    )
        )
    );
}

// =============================================================================
// Combined slice — platform sub + pay-it-forward + per-creator tiers
// =============================================================================

export function SubscriptionsSlice() {
    const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
    const [available, setAvailable] = useState<GiftSummary[]>([]);
    const [mine, setMine] = useState<{ donated: GiftSummary[]; received: GiftSummary[] }>({
        donated: [],
        received: [],
    });
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const [sub, avail, my] = await Promise.all([
                fetchMySubscription(),
                fetchAvailableGifts(),
                fetchMyGifts(),
            ]);
            setSubscription(sub);
            setAvailable(avail);
            setMine(my);
        } catch (err) {
            setLoadError('Unable to load subscription state.');
            console.warn('[subscriptions] refresh failed', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    if (loading) {
        return createElement(
            'section',
            { style: sectionStyle },
            createElement('p', { style: { ...mutedStyle, margin: 0 } }, 'Loading subscription state…'),
        );
    }

    if (loadError) {
        return createElement(
            'section',
            { style: sectionStyle },
            createElement('p', { style: { ...mutedStyle, margin: 0, color: 'var(--text-danger)' } }, loadError),
            createElement(CreatorTierPanels),
        );
    }

    return createElement(
        'section',
        { style: sectionStyle },
        createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'Manage your plan and pay it forward — donate an unused period so the next person joins for free.',
        ),
        subscription &&
            createElement(PayItForwardPanel, { subscription, onAction: () => void refresh() }),
        createElement(AvailableGiftsPanel, {
            gifts: available.filter((gift) => gift.donorUserId !== subscription?.userId),
            onAction: () => void refresh(),
        }),
        createElement(MyChainPanel, { donated: mine.donated, received: mine.received }),
        createElement('hr', { style: { border: 0, borderTop: '1px solid var(--border-default)', margin: '12px 0 4px' } }),
        createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'Per-creator subscriptions — Patreon-style monthly tiers you publish, plus the creators you support.',
        ),
        createElement(CreatorTierPanels),
    );
}
