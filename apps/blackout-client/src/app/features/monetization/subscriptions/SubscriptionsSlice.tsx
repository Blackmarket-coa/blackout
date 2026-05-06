import { createElement, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
    creatorSubsApi,
    formatCents,
    type CreatorSubscription,
    type CreatorTier,
} from '../monetizationApi';
import { readBlackoutApiToken } from '../marketplace/useMarketplaceAuth';

const cardStyle: Record<string, string | number> = {
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
    padding: 12,
    display: 'grid',
    gap: 10,
};

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
        { style: cardStyle, onSubmit: submit },
        createElement('strong', { style: { fontSize: 13 } }, 'Create a subscription tier'),
        createElement(
            'div',
            { style: { fontSize: 11, color: 'var(--text-secondary)' } },
            'FreeBlackMarket handles billing and renewals. The flat 3% commission applies on every renewal.'
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
                { type: 'submit', style: buttonStyle, disabled: submitting },
                submitting ? 'Creating…' : 'Create tier'
            )
        )
    );
}

export function SubscriptionsSlice() {
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
                    setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
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
        'section',
        { style: { display: 'grid', gap: 12 } },
        error
            ? createElement('div', { style: { color: 'var(--text-danger)' } }, error)
            : null,
        createElement(CreateTierForm, {
            onCreated: (tier: CreatorTier) =>
                setTiers((prev) => (prev ? [...prev, tier] : [tier])),
        }),
        createElement(
            'div',
            { style: cardStyle },
            createElement('strong', undefined, 'Your tiers'),
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
                                              style: { ...buttonStyle, background: 'var(--bg-input)', color: 'var(--text-primary)' },
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
            { style: cardStyle },
            createElement('strong', undefined, 'Your subscriptions'),
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
                                              style: { ...buttonStyle, background: 'var(--bg-input)', color: 'var(--text-primary)' },
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
