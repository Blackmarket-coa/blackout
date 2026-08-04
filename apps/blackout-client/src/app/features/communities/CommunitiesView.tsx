import React, { useEffect } from 'react';
import { Navigate } from 'react-router';
import { useSetAtom } from 'jotai';
import { selectedRoomIdAtom } from '../../state/navigation';
import { CANOPIES_PATH } from '../../pages/paths';

/**
 * The bare `/communities` index used to render its own joined-canopies list
 * plus a discovery surface — a near-duplicate of the canopies hub, which meant
 * the app had two doors onto the same idea under two different names. It now
 * redirects to `/canopies`, the single hub.
 *
 * The parameterised `/communities/:canopyId(/dens/:denId)` routes are the
 * canonical canopy server pages and are unaffected.
 */
export const CommunitiesView = () => {
    const setSelectedRoomId = useSetAtom(selectedRoomIdAtom);

    // The selection atoms persist across the route swap. Clear any stale den on
    // entry so opening a canopy from the hub can't carry a previously-open den
    // forward and ping-pong the address bar.
    useEffect(() => {
        setSelectedRoomId(null);
    }, [setSelectedRoomId]);

    return <Navigate to={CANOPIES_PATH} replace />;
};

export default CommunitiesView;
