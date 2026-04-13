import type { FeatureFlags } from './featureFlags';
import type {
    BlackoutFeature,
    CapabilityGate,
    FeatureCustomizationManifest,
    FeatureFlagKey,
} from './types';

export type CapabilityGateContext = {
    capabilities?: string[];
    flags?: Partial<FeatureFlags>;
};

const hasAny = (required: string[], granted: Set<string>): boolean =>
    required.some((capability) => granted.has(capability));

const hasAll = (required: string[], granted: Set<string>): boolean =>
    required.every((capability) => granted.has(capability));

export const isCapabilityGateSatisfied = (
    gate: CapabilityGate | undefined,
    context: CapabilityGateContext
): boolean => {
    if (!gate) return true;

    const granted = new Set(context.capabilities ?? []);
    const hasCapabilityContext = Array.isArray(context.capabilities);

    if (hasCapabilityContext && gate.allOf && !hasAll(gate.allOf, granted)) return false;
    if (hasCapabilityContext && gate.anyOf && !hasAny(gate.anyOf, granted)) return false;
    if (hasCapabilityContext && gate.not && hasAny(gate.not, granted)) return false;

    if (gate.flags?.length && context.flags) {
        const hasFlags = gate.flags.every((flag) => Boolean(context.flags?.[flag]));
        if (!hasFlags) return false;
    }

    return true;
};

export const resolveFeatureCustomizations = (
    feature: BlackoutFeature,
    context: CapabilityGateContext = {}
): FeatureCustomizationManifest[] => {
    const customizations = feature.customizations;
    if (!customizations?.length) {
        return [
            {
                id: `${feature.id}-legacy`,
                name: `${feature.name} Legacy`,
                category: 'workflow plugin',
                routes: feature.routes,
                navItems: feature.navItems,
                settings: feature.settings,
            },
        ];
    }

    return customizations.filter((customization) =>
        isCapabilityGateSatisfied(customization.capabilityGate, context)
    );
};

export const enabledFlagsForGate = (gate?: CapabilityGate): FeatureFlagKey[] => gate?.flags ?? [];
