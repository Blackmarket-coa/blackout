import { atom } from 'jotai';
import { installedPluginsAtom } from '../monetization/install/installedPluginsAtom';
import type { OwnedVaultGrant } from './vaultGoods';

const BASE_VAULT_SLOTS = 5;

/** Vault grants the current user owns (from installed vault_item entitlements). */
export const ownedVaultGrantsAtom = atom<OwnedVaultGrant[]>((get) => {
    const out: OwnedVaultGrant[] = [];
    for (const record of get(installedPluginsAtom)) {
        if (record.vaultGrant) out.push(record.vaultGrant);
    }
    return out;
});

/** Starter templates the user has purchased (vault_item of kind 'template'). */
export const ownedVaultTemplatesAtom = atom<OwnedVaultGrant[]>((get) =>
    get(ownedVaultGrantsAtom).filter((g) => g.vaultKind === 'template')
);

/** Total vault slots = a free baseline plus any purchased slot grants. */
export const vaultSlotCapacityAtom = atom<number>((get) => {
    const extra = get(ownedVaultGrantsAtom)
        .filter((g) => g.vaultKind === 'slot')
        .reduce((sum, g) => sum + (g.slots ?? 0), 0);
    return BASE_VAULT_SLOTS + extra;
});
