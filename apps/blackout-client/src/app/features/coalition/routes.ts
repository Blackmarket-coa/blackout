import { createElement } from 'react';
import { useAtomValue } from 'jotai';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/bmc-navigation';
import type { FeatureRoute } from '../../core/features/types';
import CoalitionView from './CoalitionView';
import { useCoalitionStateForRoom } from './useCoalitionState';

const CoalitionRoutePage = () => {
    const denId = useAtomValue(selectedRoomIdAtom);
    const canopyId = useAtomValue(selectedSpaceIdAtom);
    const denState = useCoalitionStateForRoom(denId);

    const scopeLabel = denId
        ? `Den · ${denId}`
        : canopyId
        ? `Canopy · ${canopyId}`
        : 'Standalone';

    return createElement(CoalitionView, {
        denId,
        canopyId,
        scopeLabel,
        enabledTabs: denState.enabled && denState.enabledTabs.length > 0 ? denState.enabledTabs : undefined,
    });
};

export const coalitionRoutes: FeatureRoute[] = [
    { path: '/coalition', component: CoalitionRoutePage },
];
