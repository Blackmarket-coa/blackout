import { Navigate, useParams } from 'react-router-dom';
import { buildCommunitiesPath } from '../paths';

/**
 * Forwards visits to the legacy `/room/:roomId` path onto the canonical
 * AppShell shape `/communities/-/dens/:roomId`. The "-" sentinel denotes
 * "no parent canopy", which CommunitiesRoute decodes back to a null
 * `selectedSpaceId`.
 *
 * Replace-on-redirect (`replace`) so the back button does not bounce
 * the user between the two forms.
 */
export const LegacyRoomRedirect = () => {
    const { roomId } = useParams<{ roomId: string }>();
    if (!roomId) return <Navigate to="/communities" replace />;
    return <Navigate to={buildCommunitiesPath(null, roomId)} replace />;
};

export default LegacyRoomRedirect;
