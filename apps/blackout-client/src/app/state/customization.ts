import {
    FEATURE_PRESET_BUNDLES,
    createCustomizationBundle,
    type BlackoutCustomizationBundle,
    type FeatureFlagMap,
    type FeaturePresetKey,
} from '../../lib/bmc-core';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';

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

const customizationStorage = createJSONStorage<ClientCustomizationState>(() => localStorage, {
    reviver: (key, value) => {
        if (key === 'activePreset' && typeof value === 'string') {
            return value in FEATURE_PRESET_BUNDLES ? value : 'sovereignty';
        }
        return value;
    },
});

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
