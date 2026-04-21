import {
    FEATURE_PRESET_BUNDLES,
    createCustomizationBundle,
    type BlackoutCustomizationBundle,
    type FeatureFlagMap,
    type FeaturePresetKey,
} from '../../lib/bmc-core';
import { atomWithStorage } from 'jotai/utils';

export interface ClientCustomizationState {
    activePreset: FeaturePresetKey;
    features: FeatureFlagMap;
    source: BlackoutCustomizationBundle['source'];
    importedAt: string | null;
}

const getOnInit = { getOnInit: true };

const defaultCustomizationState: ClientCustomizationState = {
    activePreset: 'sovereignty',
    features: { ...FEATURE_PRESET_BUNDLES.sovereignty },
    source: 'blackout-client',
    importedAt: null,
};

const customizationStorage = {
    getItem: (
        key: string,
        initialValue: ClientCustomizationState,
    ): ClientCustomizationState => {
        const raw = localStorage.getItem(key);
        if (!raw) return initialValue;

        try {
            const parsed = JSON.parse(raw) as Partial<ClientCustomizationState>;
            const activePreset =
                typeof parsed.activePreset === 'string' &&
                parsed.activePreset in FEATURE_PRESET_BUNDLES
                    ? (parsed.activePreset as FeaturePresetKey)
                    : initialValue.activePreset;

            return {
                ...initialValue,
                ...parsed,
                activePreset,
                features: {
                    ...FEATURE_PRESET_BUNDLES[activePreset],
                    ...(parsed.features ?? {}),
                },
            };
        } catch {
            return initialValue;
        }
    },
    setItem: (key: string, value: ClientCustomizationState) => {
        localStorage.setItem(key, JSON.stringify(value));
    },
    removeItem: (key: string) => {
        localStorage.removeItem(key);
    },
};

export const customizationAtom = atomWithStorage<ClientCustomizationState>(
    'blackout.customization.v1',
    defaultCustomizationState,
    customizationStorage,
    getOnInit,
);

export function customizationStateFromBundle(
    bundle: BlackoutCustomizationBundle,
): ClientCustomizationState {
    return {
        activePreset: bundle.activePreset,
        features: { ...bundle.features },
        source: bundle.source,
        importedAt: bundle.exportedAt,
    };
}

export function createClientCustomizationBundle(input: {
    activePreset: FeaturePresetKey;
    features: FeatureFlagMap;
    theme: string | null | undefined;
}): BlackoutCustomizationBundle {
    return createCustomizationBundle({
        source: 'blackout-client',
        activePreset: input.activePreset,
        features: input.features,
        theme: input.theme,
    });
}
