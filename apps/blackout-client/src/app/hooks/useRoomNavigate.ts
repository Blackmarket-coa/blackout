import { useCallback } from 'react';
import { NavigateOptions, useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { getCanonicalAliasOrRoomId } from '../utils/matrix';
import { getDirectRoomPath, getHomeRoomPath, getSpaceRoomPath } from '../pages/pathUtils';
import { buildCommunitiesPath } from '../pages/paths';
import { useMatrixClient } from './useMatrixClient';
import { getOrphanParents, guessPerfectParent } from '../utils/room';
import { roomToParentsAtom } from '../state/room/roomToParents';
import { mDirectAtom } from '../state/mDirectList';
import { useSelectedSpace } from './router/useSelectedSpace';
import { settingsAtom } from '../state/compat-settings';
import { useSetting } from '../state/hooks/settings';

export const useRoomNavigate = () => {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const spaceSelectedId = useSelectedSpace();
  const [developerTools] = useSetting(settingsAtom, 'developerTools');

  /**
   * Navigate to a canopy (Matrix space). The legacy `/:spaceIdOrAlias/`
   * route was retired with the AppShell migration; the canonical form is
   * `/communities/:canopyId`, consumed by CommunitiesRoute which sets
   * `selectedSpaceIdAtom` from the route param. CommunitiesRoute
   * decode-URI's the segment but does not resolve aliases, so we pass
   * the raw roomId rather than the canonical alias.
   */
  const navigateSpace = useCallback(
    (roomId: string) => {
      navigate(buildCommunitiesPath(roomId, null));
    },
    [navigate]
  );

  const navigateRoom = useCallback(
    (roomId: string, eventId?: string, opts?: NavigateOptions) => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, roomId);
      const openSpaceTimeline = developerTools && spaceSelectedId === roomId;

      const orphanParents = openSpaceTimeline ? [roomId] : getOrphanParents(roomToParents, roomId);
      if (orphanParents.length > 0) {
        let parentSpace: string;
        if (spaceSelectedId && orphanParents.includes(spaceSelectedId)) {
          parentSpace = spaceSelectedId;
        } else {
          parentSpace = guessPerfectParent(mx, roomId, orphanParents) ?? orphanParents[0];
        }

        const pSpaceIdOrAlias = getCanonicalAliasOrRoomId(mx, parentSpace);

        navigate(
          getSpaceRoomPath(pSpaceIdOrAlias, openSpaceTimeline ? roomId : roomIdOrAlias, eventId),
          opts
        );
        return;
      }

      if (mDirects.has(roomId)) {
        navigate(getDirectRoomPath(roomIdOrAlias, eventId), opts);
        return;
      }

      navigate(getHomeRoomPath(roomIdOrAlias, eventId), opts);
    },
    [mx, navigate, spaceSelectedId, roomToParents, mDirects, developerTools]
  );

  return {
    navigateSpace,
    navigateRoom,
  };
};
