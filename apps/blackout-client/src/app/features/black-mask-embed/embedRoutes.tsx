import React from 'react';
import { Navigate, useLocation, useSearchParams, type RouteObject } from 'react-router';
import {
    EMBED_CANOPY_DEN_PATH,
    EMBED_CANOPY_PATH,
    EMBED_DEN_PATH,
    EMBED_DM_PATH,
    EMBED_ELSEWHERE_PATH,
    EMBED_PATH,
} from '../../pages/paths';
import {
    buildEmbedElsewherePath,
    isEmbedPath,
    mapToEmbedPath,
    resolveElsewhereTarget,
} from './embedPaths';
import { EmbedLayout } from './EmbedLayout';
import { EmbedHome } from './EmbedHome';
import { EmbedCanopy } from './EmbedCanopy';
import { EmbedRoomRoute } from './EmbedRoom';
import { EmbedNotShown } from './EmbedNotShown';

/** The "not part of the panel" card for `/embed/elsewhere?to=<path>`. */
export const EmbedElsewhere = () => {
    const [params] = useSearchParams();
    const target = resolveElsewhereTarget(params.get('to'), window.location.origin);
    return (
        <EmbedNotShown
            reason="That part of Blackout isn't shown in the chat panel."
            openUrl={target ?? undefined}
            openPath="/"
        />
    );
};

/**
 * Catch-all for any navigation that lands outside the panel's routes — e.g. a
 * reused component calling `navigate('/coliseum')`. Something the panel shows
 * is mapped to its panel address; anything else is parked on the
 * "elsewhere" card. Either way the frame's URL is put back under `/embed`
 * (with `replace`), so a reload of the frame reloads the panel rather than
 * the full app.
 */
export const EmbedCatchAll = () => {
    const location = useLocation();
    const rest = `${location.search}${location.hash}`;
    // An unknown address under /embed: there is nothing to map it to.
    if (isEmbedPath(location.pathname)) return <Navigate to={EMBED_PATH} replace />;
    const mapped = mapToEmbedPath(location.pathname);
    if (mapped) return <Navigate to={`${mapped}${rest}`} replace />;
    return <Navigate to={buildEmbedElsewherePath(`${location.pathname}${rest}`)} replace />;
};

export const EmbedRouteError = () => (
    <EmbedNotShown reason="Something went wrong in the chat panel." openPath="/" />
);

/**
 * The panel's entire route table. There are no routes for Town Square,
 * Coliseum, Market, feeds or settings: the panel cannot render them.
 */
export const embedRoutes: RouteObject[] = [
    {
        element: <EmbedLayout />,
        errorElement: <EmbedRouteError />,
        children: [
            { path: EMBED_PATH, element: <EmbedHome /> },
            { path: EMBED_CANOPY_PATH, element: <EmbedCanopy /> },
            { path: EMBED_CANOPY_DEN_PATH, element: <EmbedRoomRoute kind="den" /> },
            { path: EMBED_DEN_PATH, element: <EmbedRoomRoute kind="den" /> },
            { path: EMBED_DM_PATH, element: <EmbedRoomRoute kind="dm" /> },
            { path: EMBED_ELSEWHERE_PATH, element: <EmbedElsewhere /> },
            { path: '*', element: <EmbedCatchAll /> },
        ],
    },
];
