import { createElement, useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useNavigate, useSearchParams } from 'react-router';
import { isValidColiseumTab } from '@blackout/core';
import { buildColiseumTopicPath, COLISEUM_TOPIC_PATH } from '../../pages/paths';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/navigation';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../state/coliseum';
import type { FeatureRoute } from '../../core/features/types';
import ColiseumView from './ColiseumView';
import TopicPage from './TopicPage';
import { useColiseumStateForRoom } from './useColiseumState';

/**
 * Tabs that used to be reachable from the strip but are now sections of a
 * topic. A stored tab or a shared link naming one of these should land on the
 * topic page rather than on a surface that no longer exists standalone.
 */
const TOPIC_SECTION_TABS = new Set(['debate', 'match', 'arena', 'shouts', 'sources', 'live']);

/**
 * Apply shareable deep links once on mount.
 *
 * `/coliseum?topic=<id>` now redirects to the topic's own route — a topic is an
 * addressable page rather than a selection carried in `localStorage`. Links
 * that predate that (including every `?tab=debate&topic=` share URL already in
 * the wild) keep working. `/coliseum?tab=<id>` still selects a strip tab.
 */
const useColiseumDeepLink = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const setTab = useSetAtom(coliseumTabAtom);
    const setSelectedTopicId = useSetAtom(selectedColiseumTopicIdAtom);

    useEffect(() => {
        const tabParam = searchParams.get('tab');
        const topicParam = searchParams.get('topic');
        if (!tabParam && !topicParam) return;

        if (topicParam) {
            setSelectedTopicId(topicParam);
            setSearchParams({}, { replace: true });
            navigate(buildColiseumTopicPath(topicParam), { replace: true });
            return;
        }
        if (tabParam && isValidColiseumTab(tabParam) && !TOPIC_SECTION_TABS.has(tabParam)) {
            setTab(tabParam);
        }
        setSearchParams({}, { replace: true });
        // Mount-only: the params are consumed and cleared in one pass.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
};

const ColiseumRoutePage = () => {
    const denId = useAtomValue(selectedRoomIdAtom);
    const canopyId = useAtomValue(selectedSpaceIdAtom);
    const denState = useColiseumStateForRoom(denId);
    useColiseumDeepLink();

    const scopeLabel = denId ? `Den · ${denId}` : canopyId ? `Canopy · ${canopyId}` : 'Standalone';

    return createElement(ColiseumView, {
        denId,
        canopyId,
        scopeLabel,
        enabledTabs:
            denState.enabled && denState.enabledTabs.length > 0 ? denState.enabledTabs : undefined,
    });
};

export const coliseumRoutes: FeatureRoute[] = [
    { path: '/coliseum', component: ColiseumRoutePage },
    { path: COLISEUM_TOPIC_PATH, component: TopicPage },
];
