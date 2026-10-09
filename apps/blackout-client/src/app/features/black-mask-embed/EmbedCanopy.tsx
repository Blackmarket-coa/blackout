import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { EMBED_PATH } from '../../pages/paths';
import {
    buildEmbedCanopyPath,
    buildEmbedDenPath,
    canonicalCanopyPath,
    canonicalDenPath,
} from './embedPaths';
import { buildEmbedCanopyLists, classifyEmbedRoom } from './embedScope';
import { EmbedRoomRow } from './EmbedHome';
import { EmbedNotShown } from './EmbedNotShown';
import { EmbedUnread } from './EmbedUnread';
import { useEmbedRoomFacts } from './useEmbedRooms';
import {
    linkStyle,
    mutedTextStyle,
    rowLinkStyle,
    sectionHeadingStyle,
    sectionStyle,
} from './embedStyles';

/** Route params arrive decoded; decode defensively for ids that were double-encoded. */
export const decodeRouteId = (raw: string | undefined): string | null => {
    if (!raw) return null;
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
};

/**
 * One canopy: its text dens (opened in the panel), its sub-canopies, and any
 * joined channels the panel does not show (voice, stage, forum), which open
 * in a normal Blackout tab.
 */
export const EmbedCanopy = () => {
    const { canopyId: rawCanopyId } = useParams<{ canopyId?: string }>();
    const canopyId = decodeRouteId(rawCanopyId);
    const facts = useEmbedRoomFacts();
    const canopy = useMemo(
        () => facts.find((room) => room.roomId === canopyId) ?? null,
        [facts, canopyId]
    );
    const lists = useMemo(
        () => (canopyId ? buildEmbedCanopyLists(facts, canopyId) : null),
        [facts, canopyId]
    );

    if (!canopyId || !canopy || classifyEmbedRoom(canopy) !== 'canopy' || !lists) {
        return (
            <EmbedNotShown
                reason={`This ${BLACKOUT_TERMS.canopy.singular} isn't available in the panel.`}
                openPath={canopyId ? canonicalCanopyPath(canopyId) : '/'}
            />
        );
    }

    const nothing =
        lists.dens.length === 0 && lists.subCanopies.length === 0 && lists.elsewhere.length === 0;

    return (
        <div data-testid="embed-canopy" data-canopy-id={canopyId}>
            <div style={{ padding: '8px 12px', display: 'grid', gap: 4 }}>
                <Link to={EMBED_PATH} style={{ ...linkStyle, fontSize: 13 }}>
                    ← All chats
                </Link>
                <strong style={{ fontSize: 16 }}>{canopy.name}</strong>
            </div>
            {nothing ? (
                <p style={{ ...mutedTextStyle, margin: '0 12px' }}>
                    You have not joined any {BLACKOUT_TERMS.den.plural} in this{' '}
                    {BLACKOUT_TERMS.canopy.singular}.
                </p>
            ) : null}
            {lists.dens.length > 0 ? (
                <section style={sectionStyle} aria-label={BLACKOUT_TERMS.den.titlePlural}>
                    <h2 style={sectionHeadingStyle}>{BLACKOUT_TERMS.den.titlePlural}</h2>
                    {lists.dens.map((room) => (
                        <EmbedRoomRow
                            key={room.roomId}
                            room={room}
                            to={buildEmbedDenPath(canopyId, room.roomId)}
                            testId="embed-den-row"
                        />
                    ))}
                </section>
            ) : null}
            {lists.subCanopies.length > 0 ? (
                <section style={sectionStyle} aria-label={BLACKOUT_TERMS.canopy.titlePlural}>
                    <h2 style={sectionHeadingStyle}>{BLACKOUT_TERMS.canopy.titlePlural}</h2>
                    {lists.subCanopies.map((room) => (
                        <EmbedRoomRow
                            key={room.roomId}
                            room={room}
                            to={buildEmbedCanopyPath(room.roomId)}
                            testId="embed-canopy-row"
                        />
                    ))}
                </section>
            ) : null}
            {lists.elsewhere.length > 0 ? (
                <section style={sectionStyle} aria-label="Open in Blackout">
                    <h2 style={sectionHeadingStyle}>Open in Blackout</h2>
                    <p style={{ ...mutedTextStyle, margin: '0 8px' }}>
                        Voice, stage and forum channels aren&apos;t shown in the panel.
                    </p>
                    {lists.elsewhere.map((room) => (
                        <a
                            key={room.roomId}
                            href={canonicalDenPath(canopyId, room.roomId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={rowLinkStyle}
                            data-testid="embed-elsewhere-row"
                            data-room-id={room.roomId}
                            data-embed-open="tab"
                        >
                            <span
                                style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {room.name} ↗
                            </span>
                            <EmbedUnread roomId={room.roomId} />
                        </a>
                    ))}
                </section>
            ) : null}
        </div>
    );
};

export default EmbedCanopy;
