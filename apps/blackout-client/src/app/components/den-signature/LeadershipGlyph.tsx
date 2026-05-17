import React from 'react';
import type { PlaybookLeadership } from '@blackout/protocol';
import * as css from './DenSignature.css';

/**
 * Single-stroke glyph that flags how a den makes decisions. One monochrome
 * mark per `PlaybookLeadership` value, drawn at ~14px so the cue reads next
 * to the leaf badge without competing with it.
 *
 *   consent     → pebble (a single weighty stone)
 *   consensus   → ring of pebbles (everyone in the circle)
 *   rotating    → arrow-circle (motion through positions)
 *   sortition   → die (chance)
 *   elected     → check-mark over arc (the ballot)
 *   appointed   → upward chevron (command of)
 *   majority    → divided circle (50%+)
 *   liquid      → forking arrow (transitive delegation)
 *
 * Mark order is stable so user memory builds up over time. The wider tabletop
 * vocabulary — pebble/ring/die/arrow — is borrowed from the brief's S3 lineage
 * and tabletop-RPG framing; the brief explicitly rejects appropriating
 * culturally specific glyphs (Adinkra, kowhaiwhai, etc.) as decoration.
 */
export type LeadershipGlyphSize = 'sm' | 'md';

export interface LeadershipGlyphProps {
    kind: PlaybookLeadership;
    size?: LeadershipGlyphSize;
    color?: string;
    title?: string;
}

const sizeClassFor = (size: LeadershipGlyphSize) => (size === 'sm' ? css.GlyphSm : css.GlyphMd);

function GlyphMark({ kind, stroke }: { kind: PlaybookLeadership; stroke: string }) {
    const common = {
        fill: 'none',
        stroke,
        strokeWidth: 1.6,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
    };
    if (kind === 'consent') {
        // Single pebble — a weighty stone for "good enough for now".
        return <ellipse cx="9" cy="10" rx="5" ry="3.6" {...common} fill={stroke} fillOpacity={0.18} />;
    }
    if (kind === 'consensus') {
        // Ring of pebbles — five small stones in a circle.
        return (
            <g {...common}>
                <circle cx="9" cy="3.4" r="1.4" />
                <circle cx="14.5" cy="6.6" r="1.4" />
                <circle cx="13" cy="13" r="1.4" />
                <circle cx="5" cy="13" r="1.4" />
                <circle cx="3.5" cy="6.6" r="1.4" />
            </g>
        );
    }
    if (kind === 'rotating') {
        // Arrow-circle — motion through positions.
        return (
            <g {...common}>
                <path d="M3 9 A 6 6 0 1 1 9 15" />
                <polyline points="9 12 9 15 12 15" />
            </g>
        );
    }
    if (kind === 'sortition') {
        // Die — a 6-sided cube with two pips.
        return (
            <g {...common}>
                <rect x="2.5" y="2.5" width="12" height="12" rx="1.6" />
                <circle cx="6" cy="6" r="0.9" fill={stroke} />
                <circle cx="11" cy="11" r="0.9" fill={stroke} />
            </g>
        );
    }
    if (kind === 'elected') {
        // Ballot — check mark inside an arc.
        return (
            <g {...common}>
                <path d="M2.4 9 A 6.6 6.6 0 0 1 15 9" />
                <polyline points="5.5 11 8.5 14 13 8" />
            </g>
        );
    }
    if (kind === 'appointed') {
        // Upward chevron — chain of command.
        return (
            <g {...common}>
                <polyline points="3 11 8.5 5 14 11" />
                <polyline points="5 14 8.5 8 12 14" strokeOpacity={0.6} />
            </g>
        );
    }
    if (kind === 'majority') {
        // Divided circle — 50%+ tally.
        return (
            <g {...common}>
                <circle cx="8.5" cy="8.5" r="6" />
                <path d="M8.5 2.5 L 8.5 14.5" />
                <path d="M8.5 2.5 A 6 6 0 0 1 8.5 14.5 Z" fill={stroke} fillOpacity={0.18} />
            </g>
        );
    }
    // liquid — forking transitive delegation.
    return (
        <g {...common}>
            <path d="M3 14 L 8 8" />
            <path d="M8 8 L 12 4" />
            <path d="M8 8 L 14 11" />
            <polyline points="10.5 4 12 4 12 5.5" />
            <polyline points="13 10 14 11 13.5 12.4" />
        </g>
    );
}

export function LeadershipGlyph({ kind, size = 'md', color, title }: LeadershipGlyphProps) {
    const className = `${css.Glyph} ${sizeClassFor(size)}`;
    const accessibleTitle = title ?? `${kind} leadership`;
    return (
        <span className={className} aria-label={accessibleTitle} role="img">
            <svg viewBox="0 0 17 17" width="100%" height="100%" aria-hidden="true">
                <title>{accessibleTitle}</title>
                <GlyphMark kind={kind} stroke={color ?? 'currentColor'} />
            </svg>
        </span>
    );
}
