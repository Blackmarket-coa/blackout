import React, { useEffect, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { joinedRoomsAtom } from '../../state/rooms';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/navigation';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { GlossaryTerm } from '../../lib/GlossaryTerm';
import { DiscoverySurface } from '../discovery/DiscoverySurface';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';

export const CommunitiesView = () => {
    const rooms = useAtomValue(joinedRoomsAtom);
    const { navigateRoom, navigateSpace } = useRoomNavigate();
    const setSelectedRoomId = useSetAtom(selectedRoomIdAtom);
    const setSelectedSpaceId = useSetAtom(selectedSpaceIdAtom);

    // The selection atoms persist across the route swap into discovery. Clear
    // any stale den on entry so opening a canopy from here can't carry a
    // previously-open den forward and ping-pong the address bar.
    useEffect(() => {
        setSelectedRoomId(null);
    }, [setSelectedRoomId]);

    const joinedSpaces = useMemo(
        () => rooms.filter((room) => room.getType() === 'm.space'),
        [rooms]
    );

    // Select the canopy and clear the den atomically before navigating, so no
    // competing re-render observes a stale den while we land on the canopy.
    const openSpace = (spaceId: string) => {
        setSelectedSpaceId(spaceId);
        setSelectedRoomId(null);
        navigateSpace(spaceId);
    };
    const openRoom = (roomId: string) => navigateRoom(roomId);

    return (
        <section
            data-testid="communities-view"
            data-shell-region="room"
            style={{
                height: '100%',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                overflow: 'hidden',
            }}
        >
            <header
                style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-default)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 16,
                    }}
                >
                    <div>
                        <h1 style={{ margin: 0, fontSize: 20 }}>Communities</h1>
                        <p
                            style={{
                                margin: '4px 0 0 0',
                                color: 'var(--text-muted)',
                                fontSize: 13,
                            }}
                        >
                            Browse joined{' '}
                            <GlossaryTerm term="canopy">{BLACKOUT_TERMS.canopy.plural}</GlossaryTerm>{' '}
                            or discover new ones.
                        </p>
                    </div>
                </div>

                {joinedSpaces.length > 0 ? (
                    <div
                        aria-label={`Joined ${BLACKOUT_TERMS.canopy.plural}`}
                        style={{
                            display: 'flex',
                            gap: 8,
                            flexWrap: 'wrap',
                        }}
                    >
                        {joinedSpaces.map((space) => (
                            <button
                                key={space.roomId}
                                type="button"
                                onClick={() => openSpace(space.roomId)}
                                title={space.name}
                                aria-label={`Open ${space.name}`}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 999,
                                    padding: '6px 12px',
                                    background: 'var(--bg-input)',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                <span aria-hidden>🗂️</span>
                                <span
                                    style={{
                                        maxWidth: 180,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {space.name}
                                </span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <small style={{ color: 'var(--text-muted)' }}>
                        No joined{' '}
                        <GlossaryTerm term="canopy">{BLACKOUT_TERMS.canopy.plural}</GlossaryTerm>{' '}
                        yet — discover one below.
                    </small>
                )}
            </header>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <DiscoverySurface onSelectRoom={openRoom} onSelectSpace={openSpace} />
            </div>
        </section>
    );
};

export default CommunitiesView;
