import { createElement, useEffect, useMemo, useState } from 'react';
import {
    formatCents,
    giftsApi,
    type Gift,
    type Tip,
} from '../monetizationApi';
import { readBlackoutApiToken } from '../marketplace/useMarketplaceAuth';

interface GiftPickerProps {
    recipientUserId: string;
    recipientLabel?: string;
    contextKind: 'profile' | 'stream' | 'post' | 'channel_message';
    contextRef?: string;
    onGiftSent?: (info: { tip: Tip; gift: Gift }) => void;
}

const cardStyle: Record<string, string | number> = {
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
    padding: 12,
    display: 'grid',
    gap: 10,
};

const giftButtonStyle = (active: boolean): Record<string, string | number> => ({
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`,
    borderRadius: 10,
    padding: 10,
    background: active ? 'var(--bg-accent)' : 'var(--bg-input)',
    color: active ? 'var(--text-on-accent)' : 'var(--text-primary)',
    display: 'grid',
    gap: 4,
    cursor: 'pointer',
    textAlign: 'center' as const,
});

const sendStyle = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-accent)',
    color: 'var(--text-on-accent)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};

export function GiftPicker({
    recipientUserId,
    recipientLabel,
    contextKind,
    contextRef,
    onGiftSent,
}: GiftPickerProps) {
    const [catalog, setCatalog] = useState<Gift[] | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<string | null>(null);
    const token = useMemo(() => readBlackoutApiToken(), []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { gifts } = await giftsApi.catalog(token);
                if (cancelled) return;
                setCatalog(gifts);
                setSelected(gifts[0]?.sku ?? null);
            } catch (err) {
                if (!cancelled) setError('Could not load gift catalog.');
                console.warn('[gifts] catalog load failed', err);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token]);

    async function send() {
        if (!selected) return;
        setSubmitting(true);
        setError(null);
        setConfirmation(null);
        try {
            const result = await giftsApi.send(
                {
                    recipientUserId,
                    sku: selected,
                    contextKind,
                    contextRef,
                },
                token
            );
            const display = `${result.gift.sprite} ${result.gift.label}`;
            setConfirmation(
                `Sent ${display} (${formatCents(result.gift.priceCents, result.gift.currency)})${recipientLabel ? ` to ${recipientLabel}` : ''}.`
            );
            onGiftSent?.(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not send gift.');
        } finally {
            setSubmitting(false);
        }
    }

    if (!catalog) {
        return createElement(
            'div',
            { style: { ...cardStyle, color: 'var(--text-secondary)' } },
            error ?? 'Loading gifts…'
        );
    }

    return createElement(
        'div',
        { style: cardStyle, 'data-testid': 'gift-picker' },
        createElement(
            'div',
            { style: { fontSize: 13, fontWeight: 600 } },
            'Send a gift'
        ),
        createElement(
            'div',
            { style: { fontSize: 11, color: 'var(--text-secondary)' } },
            'Single-shot purchase. FreeBlackMarket takes a flat 3% — the rest reaches the creator immediately.'
        ),
        createElement(
            'div',
            {
                style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
                    gap: 6,
                },
            },
            ...catalog.map((gift) =>
                createElement(
                    'button',
                    {
                        type: 'button',
                        key: gift.sku,
                        style: giftButtonStyle(selected === gift.sku),
                        onClick: () => setSelected(gift.sku),
                        'aria-pressed': selected === gift.sku,
                    },
                    createElement('span', { style: { fontSize: 22 } }, gift.sprite),
                    createElement('span', { style: { fontSize: 11, fontWeight: 600 } }, gift.label),
                    createElement(
                        'span',
                        { style: { fontSize: 10, opacity: 0.8 } },
                        formatCents(gift.priceCents, gift.currency)
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
            : null,
        createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end' } },
            createElement(
                'button',
                {
                    type: 'button',
                    style: sendStyle,
                    onClick: send,
                    disabled: !selected || submitting,
                },
                submitting ? 'Sending…' : 'Send gift'
            )
        )
    );
}
