/**
 * Plugin den factory (Phase 5) — pure planning helpers.
 *
 * A plugin may declare companion dens it wants provisioned when installed (a
 * support room, a tutorial room, etc.). This module turns that declaration into
 * a concrete, validated plan: name, den type, and the classification content to
 * stamp on the room. It performs no I/O — the API layer provisions the Matrix
 * rooms and persists the linkage; tests exercise the planning in isolation.
 */

import {
    DEN_CLASSIFICATION_STATE_EVENT_TYPE,
    DEFAULT_DEN_TYPE,
    isDenType,
    type DenClassificationContent,
    type DenType,
} from './classification';

export const PLUGIN_DEN_PURPOSES = ['support', 'tutorial', 'collaboration', 'update'] as const;
export type PluginDenPurpose = (typeof PLUGIN_DEN_PURPOSES)[number];

export function isPluginDenPurpose(value: unknown): value is PluginDenPurpose {
    return (
        typeof value === 'string' && (PLUGIN_DEN_PURPOSES as readonly string[]).includes(value)
    );
}

/** Raw den declaration as it appears on a plugin manifest (loosely typed). */
export interface PluginDenSpecInput {
    purpose: string;
    denType?: string;
    name?: string;
}

export interface PlannedPluginDen {
    purpose: PluginDenPurpose;
    denType: DenType;
    name: string;
    classification: DenClassificationContent;
    /** State event type the provisioner writes the classification under. */
    classificationStateEventType: typeof DEN_CLASSIFICATION_STATE_EVENT_TYPE;
}

const PURPOSE_LABEL: Record<PluginDenPurpose, string> = {
    support: 'Support',
    tutorial: 'Tutorial',
    collaboration: 'Collaboration',
    update: 'Updates',
};

function defaultDenName(pluginName: string, purpose: PluginDenPurpose): string {
    const base = pluginName.trim() || 'Plugin';
    return `${base} — ${PURPOSE_LABEL[purpose]}`;
}

/**
 * Validate and normalize a manifest's den declarations into a plan. Unknown
 * purposes are dropped; an unknown/absent den type defaults to `public`;
 * duplicate purposes collapse to the first (mirroring the one-den-per-purpose
 * uniqueness the store enforces).
 */
export function planPluginDens(
    specs: readonly PluginDenSpecInput[] | undefined,
    pluginName: string,
): PlannedPluginDen[] {
    if (!specs || specs.length === 0) return [];
    const seen = new Set<PluginDenPurpose>();
    const planned: PlannedPluginDen[] = [];
    for (const spec of specs) {
        if (!isPluginDenPurpose(spec.purpose) || seen.has(spec.purpose)) continue;
        seen.add(spec.purpose);
        const denType: DenType = isDenType(spec.denType) ? spec.denType : DEFAULT_DEN_TYPE;
        planned.push({
            purpose: spec.purpose,
            denType,
            name: spec.name?.trim() || defaultDenName(pluginName, spec.purpose),
            classification: { denType },
            classificationStateEventType: DEN_CLASSIFICATION_STATE_EVENT_TYPE,
        });
    }
    return planned;
}
