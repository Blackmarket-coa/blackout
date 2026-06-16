import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'jotai';
import { capabilityContextAtom } from '../../../../src/app/core/features/capabilityContext';
import { runtimeFeatureFlags } from '../../../../src/app/core/features/featureFlags';
import {
    FLAG_OVERRIDE_CATEGORY,
    FLAG_OVERRIDE_SCOPE,
    LABS_FLAG_GROUP,
    applyFlagOverrideToStore,
    applyFlagOverridesToStore,
    buildFlagLabsDescriptors,
    flagOverrideKey,
    hydrateFlagOverrides,
    parseFlagOverrideKey,
    readFlagOverridesFromValues,
    wrapLabsFetcherWithFlags,
} from '../../../../src/app/core/features/flagOverrides';

const baseLabsFetcher = () => ({
    fetchLabsFeatures: vi.fn(async () => ({
        features: [{ id: 'f.real', label: 'Real lab', enabled: false }],
    })),
    setLabsFeatureEnabled: vi.fn(async () => ({ ok: true })),
    fetchLabsGate: vi.fn(async () => ({
        visible: true,
        reason: 'developer_mode' as const,
        breakdown: { configFlag: false, developerMode: true },
    })),
    setDeveloperMode: vi.fn(async () => ({})),
});

describe('flag override keys', () => {
    it('round-trips allowlisted flag names', () => {
        expect(flagOverrideKey('topics')).toBe('flag.topics');
        expect(parseFlagOverrideKey('flag.topics')).toBe('topics');
    });

    it('rejects non-flag and non-allowlisted keys', () => {
        expect(parseFlagOverrideKey('f.real')).toBeNull();
        expect(parseFlagOverrideKey('flag.monetization')).toBeNull();
        expect(parseFlagOverrideKey('topics')).toBeNull();
    });
});

describe('readFlagOverridesFromValues', () => {
    it('extracts allowlisted flag overrides and ignores other keys', () => {
        expect(
            readFlagOverridesFromValues({
                'flag.topics': true,
                'flag.stegoToolkit': false,
                'flag.monetization': true, // not allowlisted
                'pref.theme': 'dark', // unrelated key
            })
        ).toEqual({ topics: true, stegoToolkit: false });
    });

    it('tolerates nullish input', () => {
        expect(readFlagOverridesFromValues(null)).toEqual({});
        expect(readFlagOverridesFromValues(undefined)).toEqual({});
    });
});

describe('buildFlagLabsDescriptors', () => {
    it('emits one grouped row per allowlisted flag with enabled from flags', () => {
        const descriptors = buildFlagLabsDescriptors({
            ...runtimeFeatureFlags,
            topics: true,
            stegoToolkit: false,
        });
        const topics = descriptors.find((d) => d.id === 'flag.topics');
        expect(topics).toMatchObject({ id: 'flag.topics', enabled: true, group: LABS_FLAG_GROUP });
        expect(descriptors.find((d) => d.id === 'flag.stegoToolkit')?.enabled).toBe(false);
        expect(descriptors).toHaveLength(7);
    });
});

describe('applyFlagOverrideToStore', () => {
    it('flips an allowlisted flag on the atom and preserves capabilities', () => {
        const store = createStore();
        store.set(capabilityContextAtom, { capabilities: ['x'], flags: runtimeFeatureFlags });

        applyFlagOverrideToStore(store, 'topics', true);

        const next = store.get(capabilityContextAtom);
        expect(next.flags.topics).toBe(true);
        expect(next.capabilities).toEqual(['x']);
        // unrelated flags untouched
        expect(next.flags.governance).toBe(runtimeFeatureFlags.governance);
    });

    it('ignores a non-allowlisted flag name', () => {
        const store = createStore();
        applyFlagOverrideToStore(store, 'monetization', true);
        expect(store.get(capabilityContextAtom).flags.monetization).toBe(
            runtimeFeatureFlags.monetization
        );
    });
});

describe('applyFlagOverridesToStore', () => {
    it('layers a fetched override set onto the atom', () => {
        const store = createStore();
        applyFlagOverridesToStore(store, { topics: true, seriesTag: true });
        const flags = store.get(capabilityContextAtom).flags;
        expect(flags.topics).toBe(true);
        expect(flags.seriesTag).toBe(true);
    });
});

describe('hydrateFlagOverrides', () => {
    it('applies persisted overrides from the (account, labs) bucket', async () => {
        const store = createStore();
        const fetchBucket = vi.fn(async () => ({
            bucket: { values: { 'flag.topics': true } },
        }));

        await hydrateFlagOverrides(store, fetchBucket);

        expect(fetchBucket).toHaveBeenCalledWith(FLAG_OVERRIDE_SCOPE, FLAG_OVERRIDE_CATEGORY);
        expect(store.get(capabilityContextAtom).flags.topics).toBe(true);
    });

    it('is a no-op when the fetch rejects', async () => {
        const store = createStore();
        await hydrateFlagOverrides(
            store,
            vi.fn(async () => {
                throw new Error('offline');
            })
        );
        expect(store.get(capabilityContextAtom).flags.topics).toBe(runtimeFeatureFlags.topics);
    });
});

describe('wrapLabsFetcherWithFlags', () => {
    const settings = () => ({
        fetchBucket: vi.fn(async () => ({ bucket: { values: { 'flag.topics': true } } })),
        setSetting: vi.fn(async () => ({ ok: true })),
    });

    it('appends flag descriptors after the real labs features', async () => {
        const store = createStore();
        const base = baseLabsFetcher();
        const wrapped = wrapLabsFetcherWithFlags(base, store, settings());

        const { features } = await wrapped.fetchLabsFeatures();

        expect(features[0]).toMatchObject({ id: 'f.real' });
        const topics = features.find((f) => f.id === 'flag.topics');
        expect(topics?.enabled).toBe(true); // override merged onto runtime base
        expect(features.filter((f) => f.group === LABS_FLAG_GROUP)).toHaveLength(7);
    });

    it('routes flag.* toggles to the settings bucket and updates the atom', async () => {
        const store = createStore();
        const base = baseLabsFetcher();
        const bridge = settings();
        const wrapped = wrapLabsFetcherWithFlags(base, store, bridge);

        await wrapped.setLabsFeatureEnabled('flag.topics', true);

        expect(bridge.setSetting).toHaveBeenCalledWith(
            FLAG_OVERRIDE_SCOPE,
            FLAG_OVERRIDE_CATEGORY,
            'flag.topics',
            true
        );
        expect(base.setLabsFeatureEnabled).not.toHaveBeenCalled();
        expect(store.get(capabilityContextAtom).flags.topics).toBe(true);
    });

    it('passes through non-flag ids to the real labs endpoint', async () => {
        const store = createStore();
        const base = baseLabsFetcher();
        const bridge = settings();
        const wrapped = wrapLabsFetcherWithFlags(base, store, bridge);

        await wrapped.setLabsFeatureEnabled('f.real', true);

        expect(base.setLabsFeatureEnabled).toHaveBeenCalledWith('f.real', true);
        expect(bridge.setSetting).not.toHaveBeenCalled();
    });
});
