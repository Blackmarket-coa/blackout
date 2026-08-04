import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import { DiscoverySurface } from '../../discovery/DiscoverySurface';

/**
 * Find new canopies and dens. A thin wrapper over the shared
 * {@link DiscoverySurface} so discovery behaves identically here and on the
 * explore page.
 */
export const DiscoverTab = () => {
    const { navigateRoom, navigateSpace } = useRoomNavigate();
    return (
        <div data-testid="canopy-discover-tab">
            <DiscoverySurface
                onSelectRoom={(roomId) => navigateRoom(roomId)}
                onSelectSpace={(spaceId) => navigateSpace(spaceId)}
            />
        </div>
    );
};

export default DiscoverTab;
