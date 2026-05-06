import { createElement, useEffect, useMemo, useState } from 'react';
import {
    creatorSubsApi,
    formatCents,
    type CreatorSubscription,
    type CreatorTier,
} from '../monetizationApi';
import { readBlackoutApiToken } from '../marketplace/useMarketplaceAuth';

interface CreatorSubscribeCtaProps {
    creatorUserId: string;
    creatorLabel?: string;
    onSubscribed?: (subscription: CreatorSubscription) => void;
}

const cardStyle: Record<string, string | number> = {
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
    padding: 12,
    display: 'grid',
    gap: 10,
};

const tierCardStyle = (active: boolean): Record<string, string | number> => ({
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`,
    borderRadius: 10,
    padding: 10,
    background: active ? 'var(--bg-accent)' : 'var(--bg-input)',
    color: active ? 'var(--text-on-accent)' : 'var(--text-primary)',
    display: 'grid',
    gap: 4,
});

const buttonStyle: Record<string, string | number> = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-accent)',
    color: 'var(--text-on-accent)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};

export function CreatorSubscribeCta({
    creatorUserId,
    creatorLabel,
    onSubscribed,
}: CreatorSubscribeCtaProps) {
    const [tiers, setTiers] = useState<CreatorTier[] | null>(null);
    const [activeSubs, setActiveSubs] = useState<CreatorSubscription[]>([]);
    const [submitting, setSubmitting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<string | null>(null);
    const token = useMemo(() => readBlackoutApiToken(), []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [tiersResp, subsResp] = await Promise.all([
                    creatorSubsApi.listCreatorTiers(creatorUserId, token),
                    creatorSubsApi.listMySubscriptions(token),
                ]);
                if (cancelled) return;
                setTiers(tiersResp.tiers);
                setActiveSubs(subsResp.subscriptions);
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load tiers.');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [creatorUserId, token]);

    const activeForCreator = activeSubs.find(
        (s) => s.creatorUserId === creatorUserId && s.status === 'active'
    );

    async function subscribe(tier: CreatorTier) {
        setError(null);
        setConfirmation(null);
        setSubmitting(tier.id);
        try {
            const { subscription } = await creatorSubsApi.subscribe(tier.id, token);
            setConfirmation(
                `Subscription started for ${tier.name}. Complete payment to activate — FreeBlackMarket handles billing and renewals.`
            );
            setActiveSubs((prev) => [...prev, subscription]);
            onSubscribed?.(subscription);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not subscribe.');
        } finally {
            setSubmitting(null);
        }
    }

    if (error && !tiers) {
        return createElement(
            'div',
            { style: { ...cardStyle, color: 'var(--text-danger)' } },
            error
        );
    }
    if (!tiers) {
        return createElement(
            'div',
            { style: { ...cardStyle, color: 'var(--text-secondary)' } },
            'Loading subscription tiers…'
        );
    }
    if (tiers.length === 0) {
        return createElement(
            'div',
            { style: { ...cardStyle, color: 'var(--text-secondary)', fontSize: 12 } },
            creatorLabel
                ? `${creatorLabel} hasn't published any subscription tiers yet.`
                : 'This creator hasn\'t published any subscription tiers yet.'
        );
    }

    return createElement(
        'div',
        { style: cardStyle },
        createElement(
            'div',
            { style: { fontSize: 13, fontWeight: 600 } },
            creatorLabel ? `Support ${creatorLabel}` : 'Support this creator'
        ),
        createElement(
            'div',
            { style: { fontSize: 11, color: 'var(--text-secondary)' } },
            activeForCreator
                ? 'You have an active subscription. Manage it from your subscriptions page.'
                : 'Pick a monthly tier — FreeBlackMarket takes a flat 3% and the rest goes to the creator.'
        ),
        createElement(
            'div',
            { style: { display: 'grid', gap: 8 } },
            ...tiers.map((tier) =>
                createElement(
                    'div',
                    { key: tier.id, style: tierCardStyle(false) },
                    createElement(
                        'div',
                        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
                        createElement('strong', undefined, tier.name),
                        createElement('span', undefined, `${formatCents(tier.priceCents, tier.currency)}/mo`)
                    ),
                    tier.description
                        ? createElement(
                              'div',
                              { style: { fontSize: 11, color: 'var(--text-secondary)' } },
                              tier.description
                          )
                        : null,
                    createElement(
                        'div',
                        { style: { fontSize: 11, opacity: 0.7 } },
                        `${formatCents(tier.netCents, tier.currency)} to creator · ${formatCents(tier.feeCents, tier.currency)} platform fee`
                    ),
                    createElement(
                        'div',
                        { style: { display: 'flex', justifyContent: 'flex-end' } },
                        createElement(
                            'button',
                            {
                                type: 'button',
                                style: buttonStyle,
                                onClick: () => subscribe(tier),
                                disabled: Boolean(activeForCreator) || submitting === tier.id,
                                'data-testid': `subscribe-${tier.id}`,
                            },
                            activeForCreator
                                ? 'Already subscribed'
                                : submitting === tier.id
                                  ? 'Starting…'
                                  : 'Subscribe'
                        )
                    )
                )
            )
        ),
        error
            ? createElement(
                  'div',
                  { style: { fontSize: 11, color: 'var(--text-danger)' } },
                  error
              )
            : null,
        confirmation
            ? createElement(
                  'div',
                  { style: { fontSize: 11, color: 'var(--text-success)' } },
                  confirmation
              )
            : null
    );
}
