/**
 * A small, reusable purchase/entitlement affordance shared by the marketplace
 * listing cards and the Town Square premium-widget gallery. It renders exactly
 * one of three states, driven purely by resolved entitlements (never by an
 * "is beta" branch), so beta-unlock and paid paths stay identical in structure:
 *
 *   - `owned`     → the caller already purchased this exact item.
 *   - `included`  → the caller already holds the item's feature keys via a tier
 *                   (or beta-unlock). No charge — "Included in your access".
 *   - otherwise   → the buy/upgrade button.
 */

import { createElement, type ReactNode } from 'react';

export type PaywallState = 'owned' | 'included' | 'purchasable';

export interface PaywallCtaProps {
    state: PaywallState;
    /** Formatted price label, e.g. "3.99 USD". Shown on the purchasable button. */
    priceLabel?: string;
    /** Called when the caller taps the purchasable button. */
    onPurchase?: () => void;
    /** True while a checkout is being opened. */
    busy?: boolean;
    /** Verb on the actionable button; defaults to "Purchase". */
    actionLabel?: string;
    'data-testid'?: string;
}

const baseButton: Record<string, string | number> = {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    fontSize: 13,
};

export function resolvePaywallState(args: {
    owned: boolean;
    includedInAccess: boolean;
}): PaywallState {
    if (args.owned) return 'owned';
    if (args.includedInAccess) return 'included';
    return 'purchasable';
}

export function PaywallCta({
    state,
    priceLabel,
    onPurchase,
    busy,
    actionLabel = 'Purchase',
    'data-testid': testId,
}: PaywallCtaProps): ReactNode {
    if (state === 'owned') {
        return createElement(
            'span',
            {
                'data-testid': testId,
                style: {
                    ...baseButton,
                    display: 'inline-block',
                    background: 'var(--bg-input)',
                    color: 'var(--text-secondary)',
                },
            },
            '✓ Owned'
        );
    }
    if (state === 'included') {
        return createElement(
            'span',
            {
                'data-testid': testId,
                title: 'Unlocked by your current plan',
                style: {
                    ...baseButton,
                    display: 'inline-block',
                    background: 'var(--bg-input)',
                    color: 'var(--text-secondary)',
                },
            },
            '✓ Included in your access'
        );
    }
    return createElement(
        'button',
        {
            type: 'button',
            'data-testid': testId,
            onClick: onPurchase,
            disabled: Boolean(busy),
            style: {
                ...baseButton,
                background: 'var(--bg-accent)',
                color: 'var(--text-on-accent)',
                cursor: busy ? 'default' : 'pointer',
            },
        },
        busy ? 'Opening checkout…' : priceLabel ? `${actionLabel} · ${priceLabel}` : actionLabel
    );
}
