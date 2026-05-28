// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import { userIdAtom } from '../../../../src/app/state/auth';
import {
    activeBurnerAtom,
    burnersAtom,
    isBurnerActiveAtom,
    type BurnerRecord,
} from '../../../../src/app/features/burner-identity/burnerAtoms';

const burner = (burnerUserId: string, label: string): BurnerRecord => ({
    id: `id-${burnerUserId}`,
    burnerUserId,
    label,
    expiresAt: null,
    createdAt: new Date().toISOString(),
});

describe('isBurnerActiveAtom', () => {
    it('is false when the active session is the primary account', () => {
        const store = createStore();
        store.set(userIdAtom, '@primary:hs');
        store.set(burnersAtom, [burner('@burn-1:hs', 'Tip line')]);
        expect(store.get(isBurnerActiveAtom)).toBe(false);
    });

    it('is true when the active session is a known burner', () => {
        const store = createStore();
        store.set(burnersAtom, [burner('@burn-1:hs', 'Tip line')]);
        store.set(userIdAtom, '@burn-1:hs');
        expect(store.get(isBurnerActiveAtom)).toBe(true);
    });

    it('is false when there is no active session', () => {
        const store = createStore();
        store.set(userIdAtom, null);
        store.set(burnersAtom, [burner('@burn-1:hs', 'Tip line')]);
        expect(store.get(isBurnerActiveAtom)).toBe(false);
    });
});

describe('activeBurnerAtom', () => {
    it('resolves the burner record matching the active session', () => {
        const store = createStore();
        store.set(burnersAtom, [burner('@burn-1:hs', 'Tip line'), burner('@burn-2:hs', 'Market')]);
        store.set(userIdAtom, '@burn-2:hs');
        expect(store.get(activeBurnerAtom)?.label).toBe('Market');
    });

    it('is null on the primary account', () => {
        const store = createStore();
        store.set(burnersAtom, [burner('@burn-1:hs', 'Tip line')]);
        store.set(userIdAtom, '@primary:hs');
        expect(store.get(activeBurnerAtom)).toBeNull();
    });
});
