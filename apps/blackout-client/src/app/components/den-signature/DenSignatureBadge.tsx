import React from 'react';
import {
    PLAYBOOK_ACCENT_PALETTE,
    type PlaybookAccentToken,
    type PlaybookStructure,
} from '@blackout/protocol';
import { PLAYBOOK_ACCENT_TOKENS } from '../../styles/playbookTokens';
import * as css from './DenSignature.css';

/**
 * Leaf-shape badge keyed on the den's structure. Four botanical silhouettes
 * stand in for the four `PlaybookStructure` values:
 *   • flat         → round leaf (round, equal)
 *   • hierarchical → lanceolate leaf (pointed, ranked)
 *   • federated    → compound leaf (multiple leaflets)
 *   • nested       → palmate leaf (lobes radiating, like maple)
 *
 * Shapes are intentionally minimal geometric SVGs rather than ornate
 * botanical illustrations — bespoke art is a follow-up content task per
 * the plan ("playbook-sprites.svg referenced via <use>"). The component
 * already accepts an `accent` token from the curated palette and renders
 * a `soft` fill behind the leaf shape so the structure cue reads at 16px.
 */
export type DenSignatureBadgeSize = 'sm' | 'md' | 'lg';

export interface DenSignatureBadgeProps {
    shape: PlaybookStructure;
    accent: PlaybookAccentToken;
    size?: DenSignatureBadgeSize;
    title?: string;
}

const isKnownAccent = (token: PlaybookAccentToken | undefined): token is PlaybookAccentToken =>
    typeof token === 'string' && (PLAYBOOK_ACCENT_PALETTE as readonly string[]).includes(token);

const sizeClassFor = (size: DenSignatureBadgeSize): string => {
    if (size === 'sm') return css.BadgeSm;
    if (size === 'lg') return css.BadgeLg;
    return css.BadgeMd;
};

function ShapePath({ shape, fill, stroke }: { shape: PlaybookStructure; fill: string; stroke: string }) {
    if (shape === 'flat') {
        // Round leaf — broad ellipse, no point. Read as "equal".
        return <ellipse cx="12" cy="12" rx="8" ry="8" fill={fill} stroke={stroke} strokeWidth="1.5" />;
    }
    if (shape === 'hierarchical') {
        // Lanceolate — pointed at top, narrow base. Read as "ranked".
        return (
            <path
                d="M12 3 C 15 8, 16 14, 12 21 C 8 14, 9 8, 12 3 Z"
                fill={fill}
                stroke={stroke}
                strokeWidth="1.5"
                strokeLinejoin="round"
            />
        );
    }
    if (shape === 'federated') {
        // Compound — several small leaflets along a midrib. Read as "composed".
        return (
            <g fill={fill} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round">
                <line x1="12" y1="3" x2="12" y2="21" />
                <ellipse cx="8" cy="7" rx="3" ry="2.2" />
                <ellipse cx="16" cy="7" rx="3" ry="2.2" />
                <ellipse cx="7" cy="13" rx="3" ry="2.4" />
                <ellipse cx="17" cy="13" rx="3" ry="2.4" />
                <ellipse cx="12" cy="19" rx="2.5" ry="2" />
            </g>
        );
    }
    // palmate — lobes radiating from a central point.
    return (
        <g fill={fill} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round">
            <ellipse cx="12" cy="6" rx="2.4" ry="3.4" />
            <ellipse cx="6" cy="11" rx="3.4" ry="2.4" />
            <ellipse cx="18" cy="11" rx="3.4" ry="2.4" />
            <ellipse cx="8" cy="17" rx="3" ry="2.2" transform="rotate(-25 8 17)" />
            <ellipse cx="16" cy="17" rx="3" ry="2.2" transform="rotate(25 16 17)" />
            <circle cx="12" cy="13" r="1.6" />
        </g>
    );
}

export function DenSignatureBadge({
    shape,
    accent,
    size = 'md',
    title,
}: DenSignatureBadgeProps) {
    const token = isKnownAccent(accent) ? PLAYBOOK_ACCENT_TOKENS[accent] : PLAYBOOK_ACCENT_TOKENS.moss;
    const className = `${css.Badge} ${sizeClassFor(size)}`;
    const accessibleTitle = title ?? `${shape} structure`;
    return (
        <span className={className} aria-label={accessibleTitle} role="img">
            <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
                <title>{accessibleTitle}</title>
                <ShapePath shape={shape} fill={token.soft} stroke={token.solid} />
            </svg>
        </span>
    );
}
