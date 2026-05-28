import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { userIdAtom } from '../../state/auth';

/** Local metadata for a provisioned burner identity (UI list source). */
export interface BurnerRecord {
    id: string;
    burnerUserId: string;
    label: string;
    expiresAt: string | null;
    createdAt: string;
}

export const burnersAtom = atomWithStorage<BurnerRecord[]>('blackout.burners.v1', []);

/**
 * The primary account's mxid, remembered while the app is switched into a
 * burner so "exit burner mode" knows where to return. Null when on the primary.
 */
export const burnerPrimaryUserIdAtom = atomWithStorage<string | null>(
    'blackout.burner.primary.v1',
    null
);

/** True when the active session is one of our known burners. */
export const isBurnerActiveAtom = atom((get) => {
    const active = get(userIdAtom);
    if (!active) return false;
    return get(burnersAtom).some((b) => b.burnerUserId === active);
});

/** The burner record matching the active session, if any. */
export const activeBurnerAtom = atom((get) => {
    const active = get(userIdAtom);
    if (!active) return null;
    return get(burnersAtom).find((b) => b.burnerUserId === active) ?? null;
});
