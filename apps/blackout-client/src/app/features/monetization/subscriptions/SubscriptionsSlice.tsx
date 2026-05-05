import { createElement, useCallback, useEffect, useState } from 'react';
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

function formatChain(depth: number): string {
    return depth === 0 ? 'Seed gift' : `Forwarded ${depth}×`;
}

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
    );
}
