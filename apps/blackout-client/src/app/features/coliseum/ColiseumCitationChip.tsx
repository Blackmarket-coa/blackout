import React, { type CSSProperties } from 'react';
import { Link } from 'react-router';
import type { ColiseumCitation } from '@blackout/core';
import { buildCommunitiesPath } from '../../pages/paths';

/** Open a cited room (unknown canopy) under the `-` no-canopy sentinel, with
 *  an optional `?event=` to focus the cited message. */
const citationRoomPath = (roomId: string, eventId?: string): string => {
    const base = buildCommunitiesPath(null, roomId);
    return eventId ? `${base}?event=${encodeURIComponent(eventId)}` : base;
};

export interface ColiseumCitationChipProps {
    citation: ColiseumCitation;
}

const chipStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 12,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
};

const KIND_GLYPH: Record<ColiseumCitation['kind'], string> = {
    live: '🟢',
    townhall: '🏛',
    subscription: '★',
    audio: '🎧',
    article: '📰',
    proposal: '🗳',
};

const KIND_LABEL: Record<ColiseumCitation['kind'], string> = {
    live: 'Live room',
    townhall: 'Town hall',
    subscription: 'Subscription',
    audio: 'Audio',
    article: 'Article',
    proposal: 'Proposal',
};

/**
 * Render a citation as a clickable chip that resolves to the existing surface
 * for its kind. Coliseum doesn't reimplement Lives, Town-halls, Audio,
 * Articles, or Proposals — it just links into them.
 */
export function ColiseumCitationChip({ citation }: ColiseumCitationChipProps) {
    const glyph = KIND_GLYPH[citation.kind];
    const label = KIND_LABEL[citation.kind];

    switch (citation.kind) {
        case 'live':
            return (
                <Link to={citationRoomPath(citation.roomId, citation.eventId)} style={chipStyle}>
                    <span aria-hidden>{glyph}</span>
                    <span>{label}</span>
                </Link>
            );
        case 'townhall':
            return (
                <Link
                    to={`/ops/townhall?meetingId=${encodeURIComponent(citation.meetingId)}`}
                    style={chipStyle}
                >
                    <span aria-hidden>{glyph}</span>
                    <span>
                        {label}: {citation.meetingId}
                    </span>
                </Link>
            );
        case 'subscription':
            return (
                <Link
                    to={`/monetization/subscriptions/plans?subscriptionId=${encodeURIComponent(
                        citation.subscriptionId
                    )}`}
                    style={chipStyle}
                >
                    <span aria-hidden>{glyph}</span>
                    <span>{label}</span>
                </Link>
            );
        case 'audio':
            return (
                <a
                    href={citation.mxc}
                    style={chipStyle}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${label} attachment`}
                >
                    <span aria-hidden>{glyph}</span>
                    <span>{label}</span>
                </a>
            );
        case 'article':
            return (
                <a
                    href={citation.sourceUrl}
                    style={chipStyle}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <span aria-hidden>{glyph}</span>
                    <span>{citation.title}</span>
                </a>
            );
        case 'proposal':
            return (
                <Link
                    to={`/governance?proposalId=${encodeURIComponent(citation.proposalEventId)}`}
                    style={chipStyle}
                >
                    <span aria-hidden>{glyph}</span>
                    <span>{label}</span>
                </Link>
            );
    }
}

export default ColiseumCitationChip;
