import { describe, expect, it, vi } from 'vitest';
import {
    applyCapabilityEvent,
    CAPABILITY_GRANTED_EVENT_NAME,
    CAPABILITY_REVOKED_EVENT_NAME,
    createCapabilityActions,
    hasAllCapabilities,
    hasAnyCapability,
    hasCapability,
    isCapabilityGrantedEvent,
    isCapabilityRevokedEvent,
} from '@blackout/sdk';

describe('@blackout/sdk capability helpers', () => {
    it('hasCapability supports both arrays and Sets', () => {
        expect(hasCapability(['platform-ops.read'], 'platform-ops.read')).toBe(true);
        expect(hasCapability(['platform-ops.read'], 'platform-ops.admin')).toBe(false);
        expect(hasCapability(new Set(['governance.read']), 'governance.read')).toBe(true);
        expect(hasCapability(new Set(['governance.read']), 'governance.write')).toBe(false);
    });

    it('hasAllCapabilities and hasAnyCapability behave conjunctively / disjunctively', () => {
        expect(hasAllCapabilities(['a', 'b'], ['a', 'b'])).toBe(true);
        expect(hasAllCapabilities(['a'], ['a', 'b'])).toBe(false);
        expect(hasAnyCapability(['a'], ['a', 'b'])).toBe(true);
        expect(hasAnyCapability(['c'], ['a', 'b'])).toBe(false);
        expect(hasAllCapabilities(['a'], [])).toBe(true);
        expect(hasAnyCapability(['a'], [])).toBe(false);
    });

    it('applyCapabilityEvent merges grants idempotently', () => {
        const event = {
            event: CAPABILITY_GRANTED_EVENT_NAME,
            occurredAt: '2026-04-27T00:00:00.000Z',
            payload: { capability: 'platform-ops.admin', subject: '@op:server' },
        } as const;

        expect(applyCapabilityEvent([], event)).toEqual(['platform-ops.admin']);
        expect(applyCapabilityEvent(['platform-ops.admin'], event)).toEqual([
            'platform-ops.admin',
        ]);
    });

    it('applyCapabilityEvent removes revoked capabilities', () => {
        const event = {
            event: CAPABILITY_REVOKED_EVENT_NAME,
            occurredAt: '2026-04-27T00:00:00.000Z',
            payload: { capability: 'platform-ops.admin', subject: '@op:server' },
        } as const;

        expect(applyCapabilityEvent(['platform-ops.read', 'platform-ops.admin'], event)).toEqual([
            'platform-ops.read',
        ]);
        expect(applyCapabilityEvent(['platform-ops.read'], event)).toEqual(['platform-ops.read']);
    });

    it('isCapabilityGrantedEvent and isCapabilityRevokedEvent narrow valid payloads', () => {
        const granted = {
            event: CAPABILITY_GRANTED_EVENT_NAME,
            occurredAt: '2026-04-27T00:00:00.000Z',
            payload: { capability: 'x', subject: '@a:b' },
        };
        const revoked = {
            event: CAPABILITY_REVOKED_EVENT_NAME,
            occurredAt: '2026-04-27T00:00:00.000Z',
            payload: { capability: 'x', subject: '@a:b', reason: 'rotation' },
        };
        expect(isCapabilityGrantedEvent(granted)).toBe(true);
        expect(isCapabilityRevokedEvent(revoked)).toBe(true);
        expect(isCapabilityGrantedEvent(revoked)).toBe(false);
        expect(isCapabilityRevokedEvent(granted)).toBe(false);

        // Reject malformed events.
        expect(isCapabilityGrantedEvent({ event: CAPABILITY_GRANTED_EVENT_NAME })).toBe(false);
        expect(
            isCapabilityGrantedEvent({
                event: CAPABILITY_GRANTED_EVENT_NAME,
                occurredAt: '...',
                payload: { capability: 'x' },
            })
        ).toBe(false);
    });

    it('createCapabilityActions.fetchCapabilities calls GET /v1/capabilities', async () => {
        const apiClient = vi.fn(async (_request: unknown) => ({
            subject: '@op:server',
            capabilities: ['platform-ops.read', 'platform-ops.admin'],
        }));
        const actions = createCapabilityActions(apiClient as never);

        const result = await actions.fetchCapabilities();
        expect(apiClient).toHaveBeenCalledWith({
            method: 'GET',
            path: '/v1/capabilities',
        });
        expect(result.capabilities).toEqual(['platform-ops.read', 'platform-ops.admin']);
        expect(result.subject).toBe('@op:server');
    });
});
