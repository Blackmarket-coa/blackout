import React, { type CSSProperties } from 'react';
import type { GovernanceTreasurySnapshotPayload } from '@blackout/protocol';

/**
 * Plant-bed treasury view — same `GovernanceTreasurySnapshotPayload` data
 * as the List view but rendered as a row of garden beds whose fullness
 * tracks each line's balance.
 *
 * v1 is read-only — allocation-as-watering (Cobudget buckets) is deferred
 * to v2 per the plan. Fullness is computed against the largest line in
 * the snapshot rather than against an absolute scale; treasurers can
 * still flip to the List view via the toggle in the page header to see
 * raw numbers.
 *
 * The component lives next to `GovernanceTreasury.tsx` rather than under
 * a new feature folder so the data path stays a single hop — both views
 * read the same snapshot.
 */
export interface GardenViewProps {
    latest: GovernanceTreasurySnapshotPayload | null;
}

const containerStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 12,
};

const bedStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    background: 'var(--bg-surface)',
    padding: 10,
    display: 'grid',
    gap: 8,
};

/**
 * Parses a precision-safe balance string into a non-negative number for
 * relative-fullness math. NaN / negative inputs collapse to 0 so the bed
 * renders fallow rather than crashing.
 */
function parseBalance(raw: string | undefined): number {
    if (!raw) return 0;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
}

/**
 * Three fullness states map to three visuals:
 *   • fallow  — empty bed, brown soil only
 *   • sprouting — small sprout in the centre, soil visible
 *   • full — a row of leafy plants taking up the bed
 * Thresholds are relative to the largest line in the snapshot so a
 * lopsided treasury still produces a useful comparison.
 */
function bedKind(balance: number, max: number): 'fallow' | 'sprouting' | 'full' {
    if (balance <= 0 || max <= 0) return 'fallow';
    const ratio = balance / max;
    if (ratio >= 0.66) return 'full';
    if (ratio >= 0.1) return 'sprouting';
    return 'fallow';
}

function PlantBed({ kind }: { kind: 'fallow' | 'sprouting' | 'full' }) {
    // 80×40 SVG bed — soil base + 0–3 leafy shapes for the fullness ladder.
    return (
        <svg viewBox="0 0 80 40" width="100%" height="56" aria-hidden="true">
            <rect x="0" y="28" width="80" height="12" fill="#5C5048" rx="2" />
            {kind === 'sprouting' && (
                <g fill="#5BA055">
                    <ellipse cx="40" cy="24" rx="6" ry="4" />
                    <rect x="38.5" y="22" width="3" height="8" fill="#3F7A4E" />
                </g>
            )}
            {kind === 'full' && (
                <g fill="#3F9F5B">
                    <ellipse cx="18" cy="20" rx="8" ry="6" />
                    <ellipse cx="40" cy="16" rx="9" ry="7" />
                    <ellipse cx="62" cy="20" rx="8" ry="6" />
                </g>
            )}
        </svg>
    );
}

export function GardenView({ latest }: GardenViewProps) {
    if (!latest || latest.lines.length === 0) {
        return (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }} data-testid="garden-empty">
                No buckets to render — the garden is fallow.
            </p>
        );
    }

    const max = latest.lines.reduce(
        (acc, line) => Math.max(acc, parseBalance(line.balance)),
        0,
    );

    return (
        <div style={containerStyle} data-testid="garden-view">
            {latest.lines.map((line) => {
                const balance = parseBalance(line.balance);
                const kind = bedKind(balance, max);
                return (
                    <article
                        key={line.asset}
                        style={bedStyle}
                        data-testid={`garden-bed-${line.asset}`}
                        data-kind={kind}
                    >
                        <PlantBed kind={kind} />
                        <strong style={{ fontSize: 13 }}>{line.asset}</strong>
                        <small style={{ color: 'var(--text-secondary)' }}>
                            {line.balance}
                            {line.delta24h ? ` · Δ ${line.delta24h}` : ''}
                        </small>
                    </article>
                );
            })}
        </div>
    );
}

// Exported for tests.
export const __test = { parseBalance, bedKind };

export default GardenView;
