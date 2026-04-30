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

    if (gate.allOf && !hasAll(gate.allOf, granted)) return false;
    if (gate.anyOf && !hasAny(gate.anyOf, granted)) return false;
    if (gate.not && hasAny(gate.not, granted)) return false;

    if (gate.flags?.length) {
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
    if (customizations?.length) {
        return customizations.filter((customization) =>
            isCapabilityGateSatisfied(customization.capabilityGate, context)
        );
    }

    // Backward-compat shim: features that don't declare `customizations`
    // but DO carry top-level `routes`/`navItems`/`settings`/`panels`
    // (even empty arrays — the explicit-empty signal is intentional)
    // get adapted into a single workflow-plugin customization. Features
    // that declare neither `customizations` nor any legacy field are
    // misconfigured and throw so the bug surfaces at registry build
    // time rather than as a silently-empty surface. New modules should
    // always declare `customizations` directly — see every BKL-001..013
    // module for the canonical shape.
    const hasLegacyShape =
        feature.routes !== undefined ||
        feature.navItems !== undefined ||
        feature.settings !== undefined ||
        feature.panels !== undefined;
    if (!hasLegacyShape) {
        throw new Error(
            `[feature-registry] Feature "${feature.id}" must define plugin customizations. Legacy top-level routes/nav/settings are not supported.`
        );
    }

    return [
        {
            id: `${feature.id}-legacy`,
            name: feature.name,
            category: 'workflow plugin',
            ...(feature.routes ? { routes: feature.routes } : {}),
            ...(feature.navItems ? { navItems: feature.navItems } : {}),
            ...(feature.settings ? { settings: feature.settings } : {}),
            ...(feature.panels ? { panels: feature.panels } : {}),
        },
    ];
};

export const enabledFlagsForGate = (gate?: CapabilityGate): FeatureFlagKey[] => gate?.flags ?? [];
