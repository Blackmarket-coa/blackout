import { createElement } from 'react';
import { useAtomValue } from 'jotai';
import { selectedRoomIdAtom } from '../../state/bmc-navigation';
import type { FeatureRoute } from '../../core/features/types';
import DeadDropSettings from './DeadDropSettings';

const DeadDropRoutePage = () => {
    const roomId = useAtomValue(selectedRoomIdAtom);

    if (!roomId) {
        return createElement('p', { style: { padding: 12 } }, 'Select a room to configure Dead Drop.');
    }

    return createElement(DeadDropSettings, { roomId });
};

export const deaddropRoutes: FeatureRoute[] = [{ path: '/deaddrop', component: DeadDropRoutePage }];
export { DeadDropRoutePage };
