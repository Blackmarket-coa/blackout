export { deadmanFeature } from './manifest';
export { deadmanNavItems } from './nav';
export { deadmanRoutes, DeadmanRoutePage } from './routes';
export { deadmanSettings } from './settings';
export {
    ARMING_CLOSED_NOTE,
    DeadmanSwitchPanel,
    EXISTING_SWITCH_NOTE,
    describeSwitch,
    formatLocalTime,
} from './DeadmanSwitchPanel';
export { createBoundDeadmanActions } from './deadmanClient';
export {
    DEADMAN_EVENT_NAMES,
    type DeadmanSwitchPayload,
    type DeadmanSwitchStatus,
} from '@blackout/protocol';
