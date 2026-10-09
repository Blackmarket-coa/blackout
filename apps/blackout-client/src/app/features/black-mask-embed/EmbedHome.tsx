import React, { useMemo } from 'react';
import { Link } from 'react-router';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { buildEmbedCanopyPath, buildEmbedDenPath, buildEmbedDmPath } from './embedPaths';
import { buildEmbedHomeLists, type EmbedRoomFacts } from './embedScope';
import { EmbedUnread } from './EmbedUnread';
import { useEmbedRoomFacts } from './useEmbedRooms';
import { mutedTextStyle, rowLinkStyle, sectionHeadingStyle, sectionStyle } from './embedStyles';

export const EmbedRoomRow = ({
    room,
    to,
    testId,
}: {
    room: EmbedRoomFacts;
    to: string;
    testId: string;
}) => (
    <Link to={to} style={rowLinkStyle} data-testid={testId} data-room-id={room.roomId}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {room.name}
        </span>
        <EmbedUnread roomId={room.roomId} />
    </Link>
);

const Section = ({
    title,
    testId,
    empty,
    children,
}: {
    title: string;
    testId: string;
    empty: string | null;
    children: React.ReactNode;
}) => (
    <section style={sectionStyle} data-testid={testId} aria-label={title}>
        <h2 style={sectionHeadingStyle}>{title}</h2>
        {empty ? <p style={{ ...mutedTextStyle, margin: '0 8px' }}>{empty}</p> : children}
    </section>
);

/**
 * Panel home: the signed-in user's canopies, dens outside any canopy, and
 * direct messages. Nothing else from the app is listed or linked.
 */
export const EmbedHome = () => {
    const facts = useEmbedRoomFacts();
    const { canopies, looseDens, dms } = useMemo(() => buildEmbedHomeLists(facts), [facts]);

    return (
        <div data-testid="embed-home">
            <Section
                title={BLACKOUT_TERMS.canopy.titlePlural}
                testId="embed-section-canopies"
                empty={canopies.length === 0 ? 'You have not joined a canopy yet.' : null}
            >
                {canopies.map((room) => (
                    <EmbedRoomRow
                        key={room.roomId}
                        room={room}
                        to={buildEmbedCanopyPath(room.roomId)}
                        testId="embed-canopy-row"
                    />
                ))}
            </Section>
            {looseDens.length > 0 ? (
                <Section
                    title={BLACKOUT_TERMS.den.titlePlural}
                    testId="embed-section-dens"
                    empty={null}
                >
                    {looseDens.map((room) => (
                        <EmbedRoomRow
                            key={room.roomId}
                            room={room}
                            to={buildEmbedDenPath(null, room.roomId)}
                            testId="embed-den-row"
                        />
                    ))}
                </Section>
            ) : null}
            <Section
                title="Direct messages"
                testId="embed-section-dms"
                empty={dms.length === 0 ? 'No direct messages yet.' : null}
            >
                {dms.map((room) => (
                    <EmbedRoomRow
                        key={room.roomId}
                        room={room}
                        to={buildEmbedDmPath(room.roomId)}
                        testId="embed-dm-row"
                    />
                ))}
            </Section>
        </div>
    );
};

export default EmbedHome;
