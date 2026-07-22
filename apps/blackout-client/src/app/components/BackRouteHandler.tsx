import { ReactNode, useCallback } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import {
    buildCommunitiesPath,
    COMMUNITIES_CANOPY_PATH,
    COMMUNITIES_DEN_PATH,
    ROOT_PATH,
} from '../pages/paths';

type BackRouteHandlerProps = {
    children: (onBack: () => void) => ReactNode;
};

/**
 * Computes the "up" destination for the canonical route set: a den view goes
 * back to its canopy, a canopy view goes back to the communities directory,
 * anything else goes home. (The legacy Cinny paths — /home, /messages,
 * /explore-as-directory, /:spaceIdOrAlias — are no longer mounted, so they
 * are deliberately not matched here.)
 */
export function BackRouteHandler({ children }: BackRouteHandlerProps) {
    const navigate = useNavigate();
    const location = useLocation();

    const goBack = useCallback(() => {
        const denMatch = matchPath(
            {
                path: COMMUNITIES_DEN_PATH,
                caseSensitive: true,
                end: false,
            },
            location.pathname
        );
        const encodedCanopyId = denMatch?.params.canopyId;
        if (encodedCanopyId) {
            // `buildCommunitiesPath` re-encodes; hand it the decoded id so the
            // canopy segment round-trips instead of double-encoding. The "-"
            // no-canopy sentinel falls back to the directory, which is the only
            // sensible "up" for a den without a parent canopy.
            const decodedCanopyId = decodeURIComponent(encodedCanopyId);
            navigate(buildCommunitiesPath(decodedCanopyId === '-' ? null : decodedCanopyId, null));
            return;
        }
        if (
            matchPath(
                {
                    path: COMMUNITIES_CANOPY_PATH,
                    caseSensitive: true,
                    end: false,
                },
                location.pathname
            )
        ) {
            navigate(buildCommunitiesPath(null, null));
            return;
        }
        navigate(ROOT_PATH);
    }, [navigate, location]);

    return children(goBack);
}
