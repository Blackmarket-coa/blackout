// Rich timeline cards for FBM marketplace bridge events. Rendered in place of the
// plain `m.notice` body when `normalizeMarketplaceEventContent` detects an
// embedded `co.bmc.marketplace.*` block. Pure presentational component — inline
// CSS-in-JS with theme custom properties, matching RoundCard's convention.

import React from 'react';
import type { NormalizedMarketplaceEvent } from './marketplaceEventSchemas';

const styles = {
    card: {
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        background: 'var(--bg-surface)',
        padding: 12,
        display: 'grid',
        gap: 6,
        maxWidth: 420,
    } as const,
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 } as const,
    badge: {
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        color: 'var(--text-muted)',
        border: '1px solid var(--border-default)',
        borderRadius: 999,
        padding: '1px 8px',
    } as const,
    title: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' } as const,
    line: { fontSize: 13, color: 'var(--text-primary)' } as const,
    muted: { fontSize: 12, color: 'var(--text-muted)' } as const,
    items: { margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-primary)' } as const,
    link: { fontSize: 12, color: 'var(--accent-primary)' } as const,
} as const;

const money = (minorUnits: number, currency: string): string => {
    const symbol = ({ USD: '$', EUR: '€', GBP: '£' } as Record<string, string>)[currency?.toUpperCase()];
    const amount = (minorUnits / 100).toFixed(2);
    return symbol ? `${symbol}${amount}` : `${amount} ${currency?.toUpperCase() ?? ''}`.trim();
};

const shortRef = (id: string): string => {
    const tail = (id ?? '').replace(/[^a-zA-Z0-9]/g, '');
    return (tail.slice(-4) || tail || id).toUpperCase();
};

function Shell({ badge, children }: { badge: string; children: React.ReactNode }) {
    return (
        <div style={styles.card} data-testid="fbm-marketplace-card" data-kind={badge}>
            <div style={styles.header}>
                <span style={styles.badge}>{badge}</span>
            </div>
            {children}
        </div>
    );
}

const LEDGER_LABEL: Record<string, string> = {
    payment_received: 'Payment received',
    escrow_released: 'Escrow released',
    refund: 'Refund issued',
    usdc_converted: 'USDC converted',
};

const LOGISTICS_LABEL: Record<string, string> = {
    driver_assigned: 'Driver assigned',
    pickup_confirmed: 'Pickup confirmed',
    delivered: 'Delivered',
    failed: 'Delivery failed',
};

export function MarketplaceEventCard({ normalized }: { normalized: NormalizedMarketplaceEvent }) {
    switch (normalized.kind) {
        case 'order': {
            const o = normalized.data;
            return (
                <Shell badge={`order · ${o.kind}`}>
                    <div style={styles.title}>
                        Order #{shortRef(o.orderId)} — {o.buyerAlias}
                    </div>
                    {o.status ? <div style={styles.line}>Status: {o.status}</div> : null}
                    {o.items && o.items.length > 0 ? (
                        <ul style={styles.items}>
                            {o.items.map((it) => (
                                <li key={it.sku}>
                                    {it.qty}× {it.title}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {typeof o.totalCents === 'number' ? (
                        <div style={styles.muted}>Total {money(o.totalCents, o.currency ?? 'USD')}</div>
                    ) : null}
                    {o.reason ? <div style={styles.muted}>Reason: {o.reason}</div> : null}
                </Shell>
            );
        }
        case 'ledger': {
            const l = normalized.data;
            return (
                <Shell badge="ledger">
                    <div style={styles.title}>{LEDGER_LABEL[l.kind] ?? l.kind}</div>
                    <div style={styles.line}>{money(l.amountMinorUnits, l.currency)}</div>
                    {l.orderId ? <div style={styles.muted}>Order #{shortRef(l.orderId)}</div> : null}
                </Shell>
            );
        }
        case 'inventory': {
            const i = normalized.data;
            return (
                <Shell badge="inventory">
                    <div style={styles.title}>Low stock: {i.title}</div>
                    <div style={styles.line}>
                        {i.remaining} left{typeof i.threshold === 'number' ? ` (threshold ${i.threshold})` : ''}
                    </div>
                    <div style={styles.muted}>SKU {i.sku}</div>
                </Shell>
            );
        }
        case 'dispute': {
            const d = normalized.data;
            return (
                <Shell badge={`dispute · ${d.status}`}>
                    <div style={styles.title}>Dispute #{shortRef(d.disputeId)}</div>
                    {d.orderId ? <div style={styles.muted}>Order #{shortRef(d.orderId)}</div> : null}
                    {d.outcome ? <div style={styles.line}>Outcome: {d.outcome}</div> : null}
                </Shell>
            );
        }
        case 'cycle': {
            const c = normalized.data;
            const label = c.kind === 'open' ? 'Order cycle open' : c.kind === 'close' ? 'Order cycle closed' : 'Sold out';
            return (
                <Shell badge="order cycle">
                    <div style={styles.title}>
                        {label}: {c.name}
                    </div>
                    {c.kind === 'open' && c.closingAt ? (
                        <div style={styles.muted}>Closes {c.closingAt}</div>
                    ) : null}
                    {c.kind === 'close' && typeof c.ordersPlaced === 'number' ? (
                        <div style={styles.muted}>{c.ordersPlaced} order(s) placed</div>
                    ) : null}
                    {c.kind === 'sold_out' && c.soldOutSku ? (
                        <div style={styles.muted}>SKU {c.soldOutSku}</div>
                    ) : null}
                    {c.listingDeepLink ? (
                        <a style={styles.link} href={c.listingDeepLink} target="_blank" rel="noreferrer">
                            View listing
                        </a>
                    ) : null}
                </Shell>
            );
        }
        case 'customer_message': {
            const m = normalized.data;
            return (
                <Shell badge="customer message">
                    <div style={styles.line}>
                        <strong>{m.buyerAlias}</strong>: {m.body}
                    </div>
                </Shell>
            );
        }
        case 'logistics': {
            const g = normalized.data;
            return (
                <Shell badge="delivery">
                    <div style={styles.title}>{LOGISTICS_LABEL[g.kind] ?? g.kind}</div>
                    <div style={styles.muted}>Order #{shortRef(g.orderId)}</div>
                    {g.driverName ? (
                        <div style={styles.line}>
                            Driver {g.driverName}
                            {g.vehicleType ? ` (${g.vehicleType})` : ''}
                        </div>
                    ) : null}
                    {g.etaDelivery ? <div style={styles.muted}>ETA {g.etaDelivery}</div> : null}
                    {g.failureReason ? <div style={styles.muted}>Reason: {g.failureReason}</div> : null}
                    {g.trackingUrl ? (
                        <a style={styles.link} href={g.trackingUrl} target="_blank" rel="noreferrer">
                            Track delivery
                        </a>
                    ) : null}
                </Shell>
            );
        }
        case 'flash_sale': {
            const f = normalized.data;
            return (
                <Shell badge="flash sale">
                    <div style={styles.title}>
                        ⚡ {f.name} — {f.discount}
                    </div>
                    {f.endsAt ? <div style={styles.muted}>Ends {f.endsAt}</div> : null}
                    {f.listingDeepLink ? (
                        <a style={styles.link} href={f.listingDeepLink} target="_blank" rel="noreferrer">
                            Shop the sale
                        </a>
                    ) : null}
                </Shell>
            );
        }
        case 'barter': {
            const b = normalized.data;
            const items = (list: typeof b.offered): string =>
                list.length > 0 ? list.map((it) => `${it.qty}× ${it.title}`).join(', ') : '—';
            return (
                <Shell badge={`barter · ${b.kind.replace('offer_', '')}`}>
                    <div style={styles.title}>Barter #{shortRef(b.barterId)}</div>
                    <div style={styles.line}>Offering: {items(b.offered)}</div>
                    <div style={styles.line}>For: {items(b.requested)}</div>
                    {b.counterpartyAlias ? (
                        <div style={styles.muted}>With {b.counterpartyAlias}</div>
                    ) : null}
                    {b.expiresAt ? <div style={styles.muted}>Expires {b.expiresAt}</div> : null}
                </Shell>
            );
        }
        case 'credits': {
            const c = normalized.data;
            const unit = c.unit === 'xp' ? 'XP' : 'credits';
            const verb = c.kind === 'earned' ? 'Earned' : c.kind === 'spent' ? 'Spent' : 'Adjusted';
            return (
                <Shell badge={`${unit.toLowerCase()} · ${c.kind}`}>
                    <div style={styles.title}>
                        {verb} {c.amount} {unit}
                    </div>
                    <div style={styles.line}>{c.reason}</div>
                    {typeof c.balance === 'number' ? (
                        <div style={styles.muted}>
                            Balance: {c.balance} {unit}
                        </div>
                    ) : null}
                </Shell>
            );
        }
        case 'deaddrop': {
            const d = normalized.data;
            return (
                <Shell badge="delivery">
                    <div style={styles.title}>Your purchase is ready</div>
                    <div style={styles.muted}>
                        Open it in Blackout{d.expiresAt ? ` before ${d.expiresAt}` : ''}.
                    </div>
                </Shell>
            );
        }
        default:
            return null;
    }
}
