/**
 * Capability protocol events for runtime grant/revoke updates.
 *
 * The canonical client subscribes to these events to keep its in-memory
 * capability set in sync with the server-side authority. They are
 * cross-runtime (web / desktop / mobile) and not Matrix room events, so
 * they live outside `BlackoutEventName` / `EventEnvelope`.
 *
 * Foundation for BKL-002: replaces ad-hoc admin visibility booleans with
 * manifest capability declarations driven by these events.
 */

export const CAPABILITY_GRANTED_EVENT_NAME = 'capability.granted' as const;
export const CAPABILITY_REVOKED_EVENT_NAME = 'capability.revoked' as const;

export type CapabilityGrantedPayload = {
    /**
     * The capability identifier being granted (for example
     * `platform-ops.read` or `platform-ops.admin`).
     */
    capability: string;
    /**
     * The subject the grant applies to. Typically a Matrix user id, but
     * receivers should treat the field opaquely so the protocol can
     * accommodate device or session scopes later without a contract change.
     */
    subject: string;
    /**
     * Optional opaque metadata for the grant — e.g. expiry timestamp, role
     * label, or originating policy id.
     */
    metadata?: Record<string, string>;
};

export type CapabilityRevokedPayload = {
    capability: string;
    subject: string;
    /**
     * Optional reason the grant was revoked. Receivers should not depend on
     * specific values; treat as informational telemetry.
     */
    reason?: string;
};

export type CapabilityGrantedEvent = {
    event: typeof CAPABILITY_GRANTED_EVENT_NAME;
    occurredAt: string;
    payload: CapabilityGrantedPayload;
};

export type CapabilityRevokedEvent = {
    event: typeof CAPABILITY_REVOKED_EVENT_NAME;
    occurredAt: string;
    payload: CapabilityRevokedPayload;
};

export type CapabilityEvent = CapabilityGrantedEvent | CapabilityRevokedEvent;

export const isCapabilityGrantedEvent = (
    value: unknown
): value is CapabilityGrantedEvent => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<CapabilityGrantedEvent>;
    if (candidate.event !== CAPABILITY_GRANTED_EVENT_NAME) return false;
    if (typeof candidate.occurredAt !== 'string') return false;
    const payload = candidate.payload;
    if (!payload || typeof payload !== 'object') return false;
    return (
        typeof payload.capability === 'string' &&
        typeof payload.subject === 'string'
    );
};

export const isCapabilityRevokedEvent = (
    value: unknown
): value is CapabilityRevokedEvent => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<CapabilityRevokedEvent>;
    if (candidate.event !== CAPABILITY_REVOKED_EVENT_NAME) return false;
    if (typeof candidate.occurredAt !== 'string') return false;
    const payload = candidate.payload;
    if (!payload || typeof payload !== 'object') return false;
    return (
        typeof payload.capability === 'string' &&
        typeof payload.subject === 'string'
    );
};
