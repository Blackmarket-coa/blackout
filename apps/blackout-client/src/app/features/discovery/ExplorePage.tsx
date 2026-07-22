import React, { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/navigation';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { DiscoverySurface } from './DiscoverySurface';

/**
 * Logged-in `/explore` destination. The logged-out case is intercepted in
 * BootstrapStatus and renders the session-less PublicDirectory instead; once
 * a session exists this page hosts the full DiscoverySurface with the same
 * canopy/den navigation wiring CommunitiesView uses.
 */
export const ExplorePage = () => {
    const { navigateRoom, navigateSpace } = useRoomNavigate();
    const setSelectedRoomId = useSetAtom(selectedRoomIdAtom);
    const setSelectedSpaceId = useSetAtom(selectedSpaceIdAtom);

    // The selection atoms persist across the route swap into discovery. Clear
    // any stale den on entry so opening a canopy from here can't carry a
    // previously-open den forward and ping-pong the address bar.
    useEffect(() => {
        setSelectedRoomId(null);
    }, [setSelectedRoomId]);

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
            data-testid="explore-page"
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
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <DiscoverySurface onSelectRoom={openRoom} onSelectSpace={openSpace} />
            </div>
        </section>
    );
};

export default ExplorePage;
