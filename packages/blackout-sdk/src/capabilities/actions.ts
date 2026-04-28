import {
    CAPABILITY_GRANTED_EVENT_NAME,
    CAPABILITY_REVOKED_EVENT_NAME,
    type CapabilityEvent,
    type CapabilityGrantedEvent,
    type CapabilityRevokedEvent,
    isCapabilityGrantedEvent,
    isCapabilityRevokedEvent,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

export type CapabilitiesResponse = {
    /**
     * Subject the response applies to (typically the authenticated Matrix
     * user id). Receivers should treat this as informational; the canonical
     * client uses the response together with its own auth state.
     */
    subject: string;
    capabilities: string[];
};

export const createCapabilityActions = (client: ApiClient) => ({
    /**
     * Fetches the canonical capability set for the authenticated subject.
     * Backed by `GET /v1/capabilities`. The contract returns the full set so
     * the canonical client can replace its in-memory snapshot atomically.
     */
    fetchCapabilities: () =>
        client<CapabilitiesResponse>({
            method: 'GET',
            path: '/v1/capabilities',
        }),
});

/**
 * Pure helpers for capability checks. Exposed at the SDK level so the
 * canonical client and any wrappers share a single source of truth instead
 * of forking ad-hoc admin gating.
 */

export const hasCapability = (
    granted: readonly string[] | ReadonlySet<string>,
    required: string
): boolean => {
    if (granted instanceof Set) return granted.has(required);
    return granted.includes(required);
};

export const hasAllCapabilities = (
    granted: readonly string[] | ReadonlySet<string>,
    required: readonly string[]
): boolean => required.every((cap) => hasCapability(granted, cap));

export const hasAnyCapability = (
    granted: readonly string[] | ReadonlySet<string>,
    required: readonly string[]
): boolean => required.some((cap) => hasCapability(granted, cap));

/**
 * Applies an in-flight grant/revoke event to a capability set, returning a
 * new array. Stable to call from a React reducer or atom updater.
 */
export const applyCapabilityEvent = (
    current: readonly string[],
    event: CapabilityEvent
): string[] => {
    if (isCapabilityGrantedEvent(event)) {
        const cap = event.payload.capability;
        return current.includes(cap) ? [...current] : [...current, cap];
    }
    if (isCapabilityRevokedEvent(event)) {
        const cap = event.payload.capability;
        return current.filter((entry) => entry !== cap);
    }
    return [...current];
};

export {
    CAPABILITY_GRANTED_EVENT_NAME,
    CAPABILITY_REVOKED_EVENT_NAME,
    type CapabilityEvent,
    type CapabilityGrantedEvent,
    type CapabilityRevokedEvent,
    isCapabilityGrantedEvent,
    isCapabilityRevokedEvent,
};
