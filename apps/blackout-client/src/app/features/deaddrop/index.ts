import { createElement } from 'react';
import { useAtomValue } from 'jotai';
import { selectedRoomIdAtom } from '../../state/navigation';
import type { BlackoutFeature } from '../../core/features/types';
import DeadDropSettings from './DeadDropSettings';

const DeadDropRoutePage = () => {
    const roomId = useAtomValue(selectedRoomIdAtom);

    if (!roomId) {
        return createElement('p', { style: { padding: 12 } }, 'Select a room to configure Dead Drop.');
    }

    return createElement(DeadDropSettings, { roomId });
};

export const deaddropFeature: BlackoutFeature = {
    id: 'deaddrop',
    name: 'Dead Drop',
    routes: [{ path: '/deaddrop', component: DeadDropRoutePage }],
    navItems: [{ label: 'Dead Drop', to: '/deaddrop' }],
    settings: [{ section: 'Dead Drop', component: DeadDropRoutePage }],
    capabilities: ['deaddrop.read', 'deaddrop.write'],
};

export { default as DeadDropIndicator } from './DeadDropIndicator';
export { default as DeadDropComposer } from './DeadDropComposer';
export { default as DeadDropSettings } from './DeadDropSettings';
export {
    DEAD_DROP_COMMAND_EVENT_TYPE,
    DEAD_DROP_EVENT_TYPE,
    DEAD_DROP_QUEUE_EVENT_TYPE,
    DEAD_DROP_SCHEMA_VERSION,
    describeDeadDropSchedule,
    getNextDeliveryDate,
    useDeadDrop,
    useDeadDropQueueActions,
    useSetDeadDrop,
    type DeadDropConfig,
    type DeadDropDiagnostics,
    type DeadDropSchedule,
    type DeadDropScheduleType,
} from './useDeadDrop';
