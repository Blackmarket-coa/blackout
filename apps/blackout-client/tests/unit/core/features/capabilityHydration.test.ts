import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

import {
    applyCapabilityEventToStore,
    buildCapabilityContextValue,
    hydrateCapabilityContext,
    resolveDevCapabilitySeed,
} from '../../../../src/app/core/features/capabilityHydration';
import { capabilityContextAtom } from '../../../../src/app/core/features/capabilityContext';
import { runtimeFeatureFlags } from '../../../../src/app/core/features/featureFlags';

describe('resolveDevCapabilitySeed', () => {
    it('returns [] when no env entry is set', () => {
        expect(resolveDevCapabilitySeed({})).toEqual([]);
    });

    it('parses comma-separated tokens, trims, and drops empties', () => {
        expect(
            resolveDevCapabilitySeed({
                BLACKOUT_DEV_CAPABILITIES: ' stego.toolkit.use ,, settings.preferences.read,',
            })
        ).toEqual(['stego.toolkit.use', 'settings.preferences.read']);
    });

    it('prefers VITE_-prefixed entries over the bare name', () => {
        expect(
            resolveDevCapabilitySeed({
                VITE_BLACKOUT_DEV_CAPABILITIES: 'a,b',
                BLACKOUT_DEV_CAPABILITIES: 'c,d',
            })
        ).toEqual(['a', 'b']);
    });

    it('falls back to bare name when VITE_ entry is empty', () => {
        expect(
            resolveDevCapabilitySeed({
                VITE_BLACKOUT_DEV_CAPABILITIES: '',
                BLACKOUT_DEV_CAPABILITIES: 'c,d',
            })
        ).toEqual(['c', 'd']);
    });
});

describe('buildCapabilityContextValue', () => {
    it('merges fetched + dev seed and dedupes preserving order', () => {
        const next = buildCapabilityContextValue({
            fetched: ['a', 'b', 'c'],
            devSeed: ['c', 'd', 'b'],
            flags: runtimeFeatureFlags,
        });
        expect(next.capabilities).toEqual(['a', 'b', 'c', 'd']);
        expect(next.flags).toBe(runtimeFeatureFlags);
    });

    it('handles empty inputs', () => {
        expect(
            buildCapabilityContextValue({ fetched: [], devSeed: [], flags: runtimeFeatureFlags })
        ).toEqual({ capabilities: [], flags: runtimeFeatureFlags });
    });
});

describe('hydrateCapabilityContext', () => {
    it('writes fetched capabilities into the store', async () => {
        const store = createStore();
        const fetcher = vi.fn(async () => ({ subject: '@a:srv', capabilities: ['x', 'y'] }));

        const written = await hydrateCapabilityContext(
            store as unknown as Parameters<typeof hydrateCapabilityContext>[0],
            fetcher
        );

        expect(written).toContain('x');
        expect(written).toContain('y');
        expect(store.get(capabilityContextAtom).capabilities).toEqual(written);
    });

    it('falls back to [] capabilities when fetcher rejects (no dev seed configured)', async () => {
        const store = createStore();
        const fetcher = vi.fn(async () => {
            throw new Error('network down');
        });

        const written = await hydrateCapabilityContext(
            store as unknown as Parameters<typeof hydrateCapabilityContext>[0],
            fetcher
        );

        // No dev seed in this test process env; fallback is empty.
        expect(written).toEqual([]);
        expect(store.get(capabilityContextAtom).flags).toBe(runtimeFeatureFlags);
    });
});

describe('applyCapabilityEventToStore', () => {
    it('grants a capability via a granted envelope', () => {
        const store = createStore();
        store.set(capabilityContextAtom, {
            capabilities: ['existing'],
            flags: runtimeFeatureFlags,
        });

        applyCapabilityEventToStore(
            store as unknown as Parameters<typeof applyCapabilityEventToStore>[0],
            {
                event: 'capability.granted',
                occurredAt: '2026-04-30T00:00:00.000Z',
                payload: { capability: 'new.cap', subject: '@a:srv' },
            }
        );

        expect(store.get(capabilityContextAtom).capabilities).toContain('new.cap');
        expect(store.get(capabilityContextAtom).capabilities).toContain('existing');
    });

    it('revokes a capability via a revoked envelope', () => {
        const store = createStore();
        store.set(capabilityContextAtom, {
            capabilities: ['old.cap', 'kept.cap'],
            flags: runtimeFeatureFlags,
        });

        applyCapabilityEventToStore(
            store as unknown as Parameters<typeof applyCapabilityEventToStore>[0],
            {
                event: 'capability.revoked',
                occurredAt: '2026-04-30T00:00:00.000Z',
                payload: { capability: 'old.cap', subject: '@a:srv' },
            }
        );

        expect(store.get(capabilityContextAtom).capabilities).not.toContain('old.cap');
        expect(store.get(capabilityContextAtom).capabilities).toContain('kept.cap');
    });

    it('ignores non-capability envelopes', () => {
        const store = createStore();
        store.set(capabilityContextAtom, {
            capabilities: ['existing'],
            flags: runtimeFeatureFlags,
        });

        applyCapabilityEventToStore(
            store as unknown as Parameters<typeof applyCapabilityEventToStore>[0],
            {
                event: 'blackout.governance.proposal.created',
                roomId: '!g:srv',
                senderId: '@a:srv',
                occurredAt: '2026-04-30T00:00:00.000Z',
                payload: { proposalId: 'p-1' },
            }
        );

        expect(store.get(capabilityContextAtom).capabilities).toEqual(['existing']);
    });
});
