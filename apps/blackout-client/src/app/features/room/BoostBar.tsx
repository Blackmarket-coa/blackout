// In-room Governance Boost / Hype Train bar. Reads the `co.bmc.boost` state
// event from the room and renders a full-width progress bar with milestone
// ticks. The bar is live: FBM pushes contributions by re-writing the state
// event, and useStateEvent re-renders on each change. Hidden when there is no
// active boost. Pure presentational beyond the state read.
import React, { type CSSProperties, useMemo } from 'react';
import type { Room } from 'matrix-js-sdk';
import {
    BOOST_EVENT_TYPE,
    isBoostActive,
    isBoostEventContent,
    reachedMilestones,
    type BoostEventContent,
} from '@blackout/protocol';
import { useStateEvent } from '../../hooks/useStateEvent';
import type { StateEvent } from '../../../types/matrix/room';

const BOOST_LABELS: Record<BoostEventContent['type'], string> = {
    hype_train: 'Hype Train',
    fundraiser_rally: 'Fundraiser Rally',
    proposal_boost: 'Proposal Boost',
    bounty_boost: 'Bounty Boost',
};

const wrapStyle: CSSProperties = {
    display: 'grid',
    gap: 4,
    padding: '8px 12px',
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border-default)',
};
const headRowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    color: 'var(--text-primary)',
};
const trackStyle: CSSProperties = {
    position: 'relative',
    height: 10,
    borderRadius: 999,
    background: 'var(--bg-surface-low)',
    overflow: 'hidden',
};
const fillStyle = (pct: number): CSSProperties => ({
    position: 'absolute',
    inset: 0,
    width: `${pct}%`,
    background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary, var(--accent-primary)))',
    transition: 'width 600ms ease',
});
const tickStyle = (pct: number, reached: boolean): CSSProperties => ({
    position: 'absolute',
    top: -2,
    left: `${pct}%`,
    width: 2,
    height: 14,
    background: reached ? 'var(--accent-primary)' : 'var(--text-muted)',
    transform: 'translateX(-1px)',
});
const mutedStyle: CSSProperties = { fontSize: 11, color: 'var(--text-muted)' };

const money = (minorUnits: number, currency: string): string => {
    const symbol = ({ USD: '$', EUR: '€', GBP: '£' } as Record<string, string>)[
        currency?.toUpperCase()
    ];
    const amount = (minorUnits / 100).toFixed(2);
    return symbol ? `${symbol}${amount}` : `${amount} ${currency?.toUpperCase() ?? ''}`.trim();
};

export function BoostBar({ room }: { room: Room }) {
    const event = useStateEvent(room, BOOST_EVENT_TYPE as unknown as StateEvent, '');
    const boost = useMemo<BoostEventContent | null>(() => {
        const content = event?.getContent();
        return content && isBoostEventContent(content) ? content : null;
    }, [event]);

    if (!boost || !isBoostActive(boost, Date.now())) return null;

    const pct = Math.min(100, Math.round((boost.currentCents / boost.goalCents) * 100));
    const reached = reachedMilestones(boost);
    const nextMilestone = [...boost.milestones]
        .sort((a, b) => a.atCents - b.atCents)
        .find((m) => boost.currentCents < m.atCents);

    return (
        <div style={wrapStyle} role="status" aria-label="Active boost" data-testid="boost-bar">
            <div style={headRowStyle}>
                <span>
                    ⚡ <strong>{BOOST_LABELS[boost.type]}</strong>
                </span>
                <span>
                    {money(boost.currentCents, boost.currency)} / {money(boost.goalCents, boost.currency)}
                </span>
            </div>
            <div style={trackStyle}>
                <div style={fillStyle(pct)} />
                {boost.milestones.map((m) => {
                    const mPct = Math.min(100, (m.atCents / boost.goalCents) * 100);
                    return (
                        <div
                            key={m.atCents}
                            style={tickStyle(mPct, boost.currentCents >= m.atCents)}
                            title={`${money(m.atCents, boost.currency)} — ${m.reward}`}
                        />
                    );
                })}
            </div>
            <div style={mutedStyle}>
                {nextMilestone
                    ? `Next: ${money(nextMilestone.atCents, boost.currency)} — ${nextMilestone.reward}`
                    : reached.length > 0
                      ? `All ${reached.length} milestones unlocked 🎉`
                      : 'Boost the community to unlock milestones'}
            </div>
        </div>
    );
}

export default BoostBar;
