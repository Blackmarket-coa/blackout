import { useEffect, useState } from 'react';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

interface OpenVoiceRoom {
    roomId: string;
    canopyId: string;
    channelId: string;
    participantCount: number;
    startedAt: string;
}

const fetchOpenRooms = (): Promise<OpenVoiceRoom[]> =>
    (
        createAuthorizedApiClient(readBlackoutApiToken())({
            method: 'GET',
            path: '/v1/voice/rooms/open',
        }) as Promise<{ rooms: OpenVoiceRoom[] }>
    ).then((r) => r.rooms);

/**
 * Rooms you can walk into right now.
 *
 * A third place only works if you can see who is already there, so this lists
 * open rooms with live headcounts rather than requiring a room id known in
 * advance. Locked rooms are absent by design — not being dropped into is their
 * whole purpose.
 *
 * Ordered busiest-first because the empty room is the hardest to walk into.
 * That orders a directory, not a feed: nothing is hidden, and the count is the
 * whole of it.
 */
export const OpenVoiceRooms = (): JSX.Element | null => {
    const [rooms, setRooms] = useState<OpenVoiceRoom[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchOpenRooms()
            .then((result) => {
                if (!cancelled) {
                    setRooms(result);
                    setLoaded(true);
                }
            })
            .catch(() => {
                if (!cancelled) setLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Stay out of the way entirely when nobody is talking, rather than showing
    // an empty shelf that makes the place look abandoned.
    if (!loaded || rooms.length === 0) return null;

    return (
        <section
            data-testid="open-voice-rooms"
            style={{
                display: 'grid',
                gap: 6,
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid var(--border-default)',
            }}
        >
            <strong style={{ fontSize: 13 }}>Rooms open now</strong>
            {rooms.map((room) => (
                <div
                    key={room.roomId}
                    data-testid="open-voice-room"
                    style={{ display: 'flex', gap: 8, fontSize: 13 }}
                >
                    <span style={{ flex: 1 }}>{room.channelId}</span>
                    <span style={{ opacity: 0.8 }}>
                        {room.participantCount} {room.participantCount === 1 ? 'person' : 'people'}
                    </span>
                </div>
            ))}
        </section>
    );
};

export default OpenVoiceRooms;
