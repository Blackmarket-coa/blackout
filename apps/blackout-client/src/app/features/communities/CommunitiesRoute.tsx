import { lazy, Suspense, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import {
    activeThreadRootIdAtom,
    roomJumpTargetEventIdAtom,
    selectedRoomIdAtom,
    selectedSpaceIdAtom,
} from '../../state/navigation';
import { COMMUNITIES_NO_CANOPY_SENTINEL } from '../../pages/paths';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';

// ClientLayout is a heavy module (it transitively pulls in matrix-js-sdk
// crypto helpers that touch `window`). Loading it lazily keeps the
// feature-registry composition path — which is exercised in
// non-jsdom unit tests — free of the side-effect chain. The tradeoff
// is one frame of suspense the first time the canopy/den route renders.
const ClientLayoutLazy = lazy(() => import('../../pages/client/ClientLayout'));

// The modern Discord-style canopy server page. Mounted in place of the legacy
// shell when the `canopyServer` flag is on AND the route addresses a real
// canopy (not the `-` sentinel used by direct/orphan rooms, which keep using
// the proven ClientLayout path).
const CanopyServerPageLazy = lazy(() => import('../canopy/CanopyServerPage'));

const decodeId = (raw: string | undefined): string | null => {
    if (!raw) return null;
    if (raw === COMMUNITIES_NO_CANOPY_SENTINEL) return null;
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
};

/**
 * Adapter that mounts the existing `ClientLayout` chat shell from the
 * canonical `/communities/:canopyId/dens/:denId` route. Translates the
 * route params into the same Jotai atoms ClientLayout already reads, so
 * the chat surface is visually unchanged when reached through the new
 * URL form.
 *
 * `:canopyId === '-'` means "no parent canopy" — used by direct rooms
 * and home-roomed entities so the legacy `/room/:roomId` redirect can
 * resolve cleanly under this adapter.
 */
export const CommunitiesRoute = () => {
    const { canopyId, denId } = useParams<{ canopyId?: string; denId?: string }>();
    const [searchParams] = useSearchParams();
    const setSelectedRoomId = useSetAtom(selectedRoomIdAtom);
    const setSelectedSpaceId = useSetAtom(selectedSpaceIdAtom);
    const setRoomJumpTargetEventId = useSetAtom(roomJumpTargetEventIdAtom);
    const setActiveThreadRootId = useSetAtom(activeThreadRootIdAtom);

    const jumpEventId = searchParams.get('event');
    const jumpThreadRootId = searchParams.get('thread');

    useEffect(() => {
        setSelectedSpaceId(decodeId(canopyId));
        setSelectedRoomId(decodeId(denId));
        // `?event=<id>` (set by navigateRoom) focuses a specific message in the
        // den timeline; ClientLayout reads this atom and feeds RoomTimeline.
        setRoomJumpTargetEventId(jumpEventId);
        // `?thread=<rootId>` (set when routing from a threaded notification)
        // opens the thread panel on that root; clearing it when absent keeps
        // the panel from sticking open across plain room navigations.
        setActiveThreadRootId(jumpThreadRootId);
    }, [
        canopyId,
        denId,
        jumpEventId,
        jumpThreadRootId,
        setSelectedRoomId,
        setSelectedSpaceId,
        setRoomJumpTargetEventId,
        setActiveThreadRootId,
    ]);

    const useCanopyServer =
        runtimeFeatureFlags.canopyServer &&
        !!canopyId &&
        canopyId !== COMMUNITIES_NO_CANOPY_SENTINEL;

    return (
        <Suspense fallback={null}>
            {useCanopyServer ? <CanopyServerPageLazy /> : <ClientLayoutLazy />}
        </Suspense>
    );
};

export default CommunitiesRoute;
