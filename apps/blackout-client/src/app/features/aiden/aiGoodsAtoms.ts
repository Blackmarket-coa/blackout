import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { installedPluginsAtom } from '../monetization/install/installedPluginsAtom';
import type { OwnedAiPersona, OwnedAutomationRecipe } from './aiGoods';

/** AI personas the current user owns (from installed ai_persona entitlements). */
export const ownedAiPersonasAtom = atom<OwnedAiPersona[]>((get) => {
    const out: OwnedAiPersona[] = [];
    for (const record of get(installedPluginsAtom)) {
        if (record.aiPersona) out.push(record.aiPersona);
    }
    return out;
});

/** Automation recipes the current user owns (from installed automation_recipe entitlements). */
export const ownedAutomationRecipesAtom = atom<OwnedAutomationRecipe[]>((get) => {
    const out: OwnedAutomationRecipe[] = [];
    for (const record of get(installedPluginsAtom)) {
        if (record.automationRecipe) out.push(record.automationRecipe);
    }
    return out;
});

/**
 * The persona id equipped in AI dens (`null` = no persona). Persisted so the
 * choice survives reloads. Resolved against `ownedAiPersonasAtom` at use.
 */
export const equippedAiPersonaIdAtom = atomWithStorage<string | null>(
    'blackout.aiden.persona.v1',
    null
);

/** The currently-equipped persona, if it's still owned. */
export const equippedAiPersonaAtom = atom<OwnedAiPersona | null>((get) => {
    const id = get(equippedAiPersonaIdAtom);
    if (!id) return null;
    return get(ownedAiPersonasAtom).find((p) => p.id === id) ?? null;
});
