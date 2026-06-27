/**
 * Coalition Kit manifest (Phase 4).
 *
 * A coalition kit is a creator-published bundle (artifactKind `coalition_kit`)
 * that, when applied to a coalition, brings a theme + feature flags
 * (`BlackoutCustomizationBundle`), a set of dens to provision, and a list of
 * plugins to install at coalition scope. This module defines the manifest shape
 * and a validating parser; application lives in the API layer.
 */

import {
    createCustomizationBundle,
    type BlackoutCustomizationBundle,
} from '../customization';
import { isDenType, type DenType } from '../den/classification';

export const COALITION_KIT_ARCHETYPES = [
    'organizer',
    'activist',
    'creator',
    'co-op',
    'gaming',
    'educational',
    'marketplace',
    'debate',
    'event',
] as const;
export type CoalitionKitArchetype = (typeof COALITION_KIT_ARCHETYPES)[number];

export function isCoalitionKitArchetype(value: unknown): value is CoalitionKitArchetype {
    return (
        typeof value === 'string' &&
        (COALITION_KIT_ARCHETYPES as readonly string[]).includes(value)
    );
}

/**
 * Den render/role shape within a kit. `chat` is an ordinary room; `broadcast`
 * is admin-send / all-read (announcements); `bounty_board` renders the
 * structured Refrain board. Defaults to `chat` when unspecified.
 */
export const COALITION_KIT_DEN_KINDS = ['chat', 'broadcast', 'bounty_board'] as const;
export type CoalitionKitDenKind = (typeof COALITION_KIT_DEN_KINDS)[number];

export function isCoalitionKitDenKind(value: unknown): value is CoalitionKitDenKind {
    return (
        typeof value === 'string' &&
        (COALITION_KIT_DEN_KINDS as readonly string[]).includes(value)
    );
}

export interface CoalitionKitDenSpec {
    slug: string;
    denType: DenType;
    name: string;
    topic?: string;
    /** Render/role shape; defaults to `chat`. */
    kind?: CoalitionKitDenKind;
    /**
     * Minimum subscription tier required to access this den, e.g. `tier_1`.
     * Omitted/empty = open to all (free tier). Maps to the existing tier→room
     * ACL config on provision; no new ACL engine.
     */
    minTier?: string;
}

export interface CoalitionKitManifest {
    version: 1;
    kitId: string;
    name: string;
    archetype: CoalitionKitArchetype;
    /** Theme + feature flags to record for the coalition. */
    customization: BlackoutCustomizationBundle;
    /** Dens to provision when the kit is applied. */
    dens: CoalitionKitDenSpec[];
    /** Plugins installed at coalition scope (per-den opt-in) on apply. */
    bundledPluginIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDens(input: unknown): CoalitionKitDenSpec[] {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    const dens: CoalitionKitDenSpec[] = [];
    for (const raw of input) {
        if (!isRecord(raw)) continue;
        const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
        const name = typeof raw.name === 'string' ? raw.name.trim() : '';
        if (!slug || !name || seen.has(slug)) continue;
        seen.add(slug);
        dens.push({
            slug,
            name,
            denType: isDenType(raw.denType) ? raw.denType : 'coalition',
            ...(typeof raw.topic === 'string' ? { topic: raw.topic } : {}),
            ...(isCoalitionKitDenKind(raw.kind) ? { kind: raw.kind } : {}),
            ...(typeof raw.minTier === 'string' && raw.minTier.trim()
                ? { minTier: raw.minTier.trim() }
                : {}),
        });
    }
    return dens;
}

/**
 * Validate and normalize a coalition kit manifest. Throws on missing required
 * fields. The customization block is normalized through
 * `createCustomizationBundle` (sanitizes flags, defaults theme/preset).
 */
export function parseCoalitionKitManifest(input: unknown): CoalitionKitManifest {
    if (!isRecord(input)) throw new Error('kit manifest must be an object');
    if (input.version !== 1) throw new Error('kit manifest version must be 1');
    const kitId = typeof input.kitId === 'string' ? input.kitId.trim() : '';
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!kitId) throw new Error('kitId is required');
    if (!name) throw new Error('name is required');
    if (!isCoalitionKitArchetype(input.archetype)) {
        throw new Error(`archetype must be one of ${COALITION_KIT_ARCHETYPES.join(', ')}`);
    }
    const customizationInput = isRecord(input.customization) ? input.customization : {};
    const customization = createCustomizationBundle({
        source: 'blackout-web',
        activePreset: customizationInput.activePreset as string | undefined,
        features: (customizationInput.features as Record<string, boolean>) ?? null,
        theme: customizationInput.theme as string | undefined,
    });
    const bundledPluginIds = Array.isArray(input.bundledPluginIds)
        ? input.bundledPluginIds.filter((p): p is string => typeof p === 'string')
        : [];
    return {
        version: 1,
        kitId,
        name,
        archetype: input.archetype,
        customization,
        dens: parseDens(input.dens),
        bundledPluginIds,
    };
}

/**
 * Canonical "creator" kit: a creator's public-facing home — a broadcast
 * announcements den, an open community den, two tier-gated supporter dens, and
 * a Refrain bounty board. Tier gates are declarative (`minTier`); the actual
 * room ACL is applied by FBM entitlements via fbmAclSync. Parsed through the
 * normal validator so it always satisfies `CoalitionKitManifest`.
 */
export const CREATOR_KIT_MANIFEST: CoalitionKitManifest = parseCoalitionKitManifest({
    version: 1,
    kitId: 'creator',
    name: 'Creator',
    archetype: 'creator',
    customization: { activePreset: 'creator' },
    dens: [
        {
            slug: 'announcements',
            name: 'Announcements',
            denType: 'public',
            kind: 'broadcast',
            topic: 'Updates, stream alerts, and important news',
        },
        { slug: 'community', name: 'Community', denType: 'public', kind: 'chat', topic: 'Open community chat' },
        {
            slug: 'supporters',
            name: 'Supporters',
            denType: 'coalition',
            kind: 'chat',
            minTier: 'tier_1',
            topic: 'Exclusive channel for paying supporters',
        },
        {
            slug: 'vip',
            name: 'VIP',
            denType: 'coalition',
            kind: 'chat',
            minTier: 'tier_2',
            topic: 'Top-tier member exclusive access',
        },
        {
            slug: 'refrain',
            name: 'Bounty Board',
            denType: 'public',
            kind: 'bounty_board',
            topic: 'Commission work from this creator',
        },
    ],
    bundledPluginIds: [],
});
