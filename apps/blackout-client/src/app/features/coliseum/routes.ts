import { createElement } from 'react';
import { useAtomValue } from 'jotai';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/bmc-navigation';
import type { FeatureRoute } from '../../core/features/types';
import ColiseumView from './ColiseumView';
import { useColiseumStateForRoom } from './useColiseumState';

const ColiseumRoutePage = () => {
    const denId = useAtomValue(selectedRoomIdAtom);
    const canopyId = useAtomValue(selectedSpaceIdAtom);
    const denState = useColiseumStateForRoom(denId);

    const scopeLabel = denId
        ? `Den · ${denId}`
        : canopyId
        ? `Canopy · ${canopyId}`
        : 'Standalone';

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
];
