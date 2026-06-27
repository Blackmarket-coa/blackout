// Rich timeline card for in-room tips. Rendered in place of the plain `m.notice`
// body when a `co.bmc.tip` block is detected on the message (see
// normalizeTipEventContent). Pure presentational — inline CSS-in-JS with theme
// custom properties, matching MarketplaceEventCard / RoundCard.
import React, { type CSSProperties } from 'react';
import { TIP_EVENT_TYPE, isTipEventContent, type TipEventContent } from '@blackout/protocol';

/** Detect + validate a tip block embedded in a message content. */
export const normalizeTipEventContent = (
    content: Record<string, unknown> | undefined | null,
): TipEventContent | null => {
    if (!content || typeof content !== 'object') return null;
    const block = (content as Record<string, unknown>)[TIP_EVENT_TYPE];
    return isTipEventContent(block) ? block : null;
};

const money = (minorUnits: number, currency: string): string => {
    const symbol = ({ USD: '$', EUR: '€', GBP: '£' } as Record<string, string>)[
        currency?.toUpperCase()
    ];
    const amount = (minorUnits / 100).toFixed(2);
    return symbol ? `${symbol}${amount}` : `${amount} ${currency?.toUpperCase() ?? ''}`.trim();
};

const shortMxid = (mxid: string): string => mxid.replace(/^@/, '').split(':')[0] ?? mxid;

const cardStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    border: '1px solid var(--accent-primary)',
    borderRadius: 999,
    background: 'var(--bg-surface)',
    padding: '4px 12px',
    maxWidth: 480,
};
const giftStyle: CSSProperties = { fontSize: 16 };
const textStyle: CSSProperties = { fontSize: 14, color: 'var(--text-primary)' };
const amountStyle: CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--accent-primary)' };
const noteStyle: CSSProperties = { fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 };

export function TipEventCard({ tip }: { tip: TipEventContent }) {
    return (
        <div style={cardStyle} data-testid="tip-event-card">
            <span style={giftStyle} aria-hidden>
                🎁
            </span>
            <span style={textStyle}>
                <strong>{shortMxid(tip.fromMxid)}</strong> tipped{' '}
                <strong>{shortMxid(tip.toMxid)}</strong>
            </span>
            <span style={amountStyle}>+{money(tip.amountCents, tip.currency)}</span>
            {tip.note ? <span style={noteStyle}>“{tip.note}”</span> : null}
        </div>
    );
}

export default TipEventCard;
