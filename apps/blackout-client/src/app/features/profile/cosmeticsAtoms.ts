import { atom } from 'jotai';
import { installedPluginsAtom } from '../monetization/install/installedPluginsAtom';
import { availableDecorations } from './profileAtoms';
import type { DecorationOption } from './profileTypes';
import type { OwnedCosmetic } from './cosmeticTypes';

/**
 * Built-in (free) cosmetics shipped with the client. Purchasable cosmetics are
 * appended via `ownedCosmeticsAtom`, derived from installed `profile_cosmetic`
 * entitlements.
 */
export const builtinNameplates: OwnedCosmetic[] = [
    {
        cosmeticType: 'nameplate',
        id: 'nameplate-default',
        label: 'Default',
    },
    {
        cosmeticType: 'nameplate',
        id: 'nameplate-civic',
        label: 'Civic',
        cssGradient: 'linear-gradient(135deg, #1ABC9C, #3498DB)',
        textColor: '#ffffff',
    },
];

export const builtinProfileEffects: OwnedCosmetic[] = [
    { cosmeticType: 'profile_effect', id: 'effect-none', label: 'None' },
    { cosmeticType: 'profile_effect', id: 'effect-sparkle', label: 'Sparkle', effect: 'sparkle' },
];

export const builtinBadges: OwnedCosmetic[] = [
    { cosmeticType: 'badge', id: 'badge-builder', label: 'Builder', glyph: '🛠', color: '#f9c74f' },
];

/** All cosmetics the current user owns (from installed profile_cosmetic records). */
export const ownedCosmeticsAtom = atom<OwnedCosmetic[]>((get) => {
    const out: OwnedCosmetic[] = [];
    for (const record of get(installedPluginsAtom)) {
        if (record.cosmetic) out.push(record.cosmetic);
    }
    return out;
});

function ownedOfType(owned: OwnedCosmetic[], type: OwnedCosmetic['cosmeticType']): OwnedCosmetic[] {
    return owned.filter((c) => c.cosmeticType === type);
}

/** Built-in avatar decorations + owned avatar-decoration cosmetics, as DecorationOptions. */
export const avatarDecorationCatalogAtom = atom<DecorationOption[]>((get) => {
    const owned = ownedOfType(get(ownedCosmeticsAtom), 'avatar_decoration').map(
        (c): DecorationOption => ({
            id: c.id,
            label: c.label,
            cssGradient: c.cssGradient ?? 'transparent',
            cssGlow: c.cssGlow ?? 'transparent',
        })
    );
    return [...availableDecorations, ...owned];
});

export const nameplateCatalogAtom = atom<OwnedCosmetic[]>((get) => [
    ...builtinNameplates,
    ...ownedOfType(get(ownedCosmeticsAtom), 'nameplate'),
]);

export const profileEffectCatalogAtom = atom<OwnedCosmetic[]>((get) => [
    ...builtinProfileEffects,
    ...ownedOfType(get(ownedCosmeticsAtom), 'profile_effect'),
]);

export const badgeCatalogAtom = atom<OwnedCosmetic[]>((get) => [
    ...builtinBadges,
    ...ownedOfType(get(ownedCosmeticsAtom), 'badge'),
]);

export function findCosmetic(
    catalog: OwnedCosmetic[],
    id: string | undefined
): OwnedCosmetic | undefined {
    if (!id) return undefined;
    return catalog.find((c) => c.id === id);
}
