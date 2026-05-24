import { useCallback } from 'react';
import { NavigateOptions, useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { buildCommunitiesPath } from '../pages/paths';
import { useMatrixClient } from './useMatrixClient';
import { roomNavPath } from './roomNavPath';
import { roomToParentsAtom } from '../state/room/roomToParents';
import { useSelectedSpace } from './router/useSelectedSpace';
import { settingsAtom } from '../state/compat-settings';
import { useSetting } from '../state/hooks/settings';

export const useRoomNavigate = () => {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const spaceSelectedId = useSelectedSpace();
  const [developerTools] = useSetting(settingsAtom, 'developerTools');

  /**
   * Navigate to a canopy (Matrix space) via the canonical
   * `/communities/:canopyId` route, consumed by CommunitiesRoute which sets
   * `selectedSpaceIdAtom`. Pass the raw roomId — CommunitiesRoute decodes the
   * segment but does not resolve aliases.
   */
  const navigateSpace = useCallback(
    (roomId: string) => {
      navigate(buildCommunitiesPath(roomId, null));
    },
    [navigate]
  );

  /**
   * Navigate to a room (den) via the canonical
   * `/communities/:canopyId/dens/:denId` route (see `roomNavPath`). `eventId`,
   * when given, rides as `?event=` so the timeline can jump to it.
   */
  const navigateRoom = useCallback(
    (roomId: string, eventId?: string, opts?: NavigateOptions) => {
      navigate(
        roomNavPath({ mx, roomToParents, spaceSelectedId: spaceSelectedId ?? null, developerTools, roomId, eventId }),
        opts
      );
    },
    [mx, navigate, spaceSelectedId, roomToParents, developerTools]
  );

  return {
    navigateSpace,
    navigateRoom,
  };
};
