import { createElement, useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useSearchParams } from 'react-router-dom';
import { isValidColiseumTab } from '@blackout/core';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/navigation';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../state/coliseum';
import type { FeatureRoute } from '../../core/features/types';
import ColiseumView from './ColiseumView';
import { useColiseumStateForRoom } from './useColiseumState';

/**
 * Apply shareable deep links once on mount: `/coliseum?tab=<id>` selects a
 * tab, `/coliseum?topic=<id>` opens that topic (defaulting to its debate
 * thread). The params are then cleared so in-app navigation takes over.
 */
const useColiseumDeepLink = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const setTab = useSetAtom(coliseumTabAtom);
    const setSelectedTopicId = useSetAtom(selectedColiseumTopicIdAtom);

    useEffect(() => {
        const tabParam = searchParams.get('tab');
        const topicParam = searchParams.get('topic');
        if (!tabParam && !topicParam) return;
        if (topicParam) {
            setSelectedTopicId(topicParam);
            setTab(tabParam && isValidColiseumTab(tabParam) ? tabParam : 'debate');
        } else if (tabParam && isValidColiseumTab(tabParam)) {
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

export const coliseumRoutes: FeatureRoute[] = [{ path: '/coliseum', component: ColiseumRoutePage }];
