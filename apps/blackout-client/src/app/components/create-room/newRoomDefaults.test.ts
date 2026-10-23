// @vitest-environment jsdom
/**
 * The one table that decides what a new canopy or den is before anyone
 * touches the access chooser (operator decisions of 2026-10-17): every row,
 * both surfaces, with and without the build-time override.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateRoomKind } from './kind';
import {
    newCanopyDefaults,
    newCategoryDefaults,
    newDenDefaults,
    newRoomDefaultSetting,
    newRoomDefaultSettingIn,
    newRoomDefaultsFor,
    newRoomSurface,
    parentKindOf,
    parentKindOfJoinRule,
    setNewRoomSurfaceForTests,
    type NewRoomDefaultSetting,
    type NewRoomSurface,
} from './newRoomDefaults';

const { Public, Private, Restricted } = CreateRoomKind;

const row = (
    surface: NewRoomSurface,
    setting: NewRoomDefaultSetting,
    target: 'canopy' | 'den' | 'category',
    parentKind: 'none' | 'public' | 'non-public',
    restrictedSupported = true
) => newRoomDefaultsFor({ surface, setting, target, parentKind, restrictedSupported });

afterEach(() => {
    vi.unstubAllEnvs();
    window.history.replaceState(null, '', '/');
    setNewRoomSurfaceForTests(null);
});

describe('the table, app surface, switch unset', () => {
    it('a new canopy is public, not encrypted and listed', () => {
        expect(row('app', 'public', 'canopy', 'none')).toEqual({
            kind: Public,
            encrypted: false,
            listed: true,
        });
    });

    it('a new den with no canopy is public and not encrypted', () => {
        expect(row('app', 'public', 'den', 'none')).toEqual({
            kind: Public,
            encrypted: false,
            listed: false,
        });
    });

    it('a new den inside a public canopy is public and not encrypted', () => {
        expect(row('app', 'public', 'den', 'public')).toEqual({
            kind: Public,
            encrypted: false,
            listed: false,
        });
    });

    it('a new den inside a non-public canopy is restricted to it and encrypted', () => {
        expect(row('app', 'public', 'den', 'non-public')).toEqual({
            kind: Restricted,
            encrypted: true,
            listed: false,
        });
    });

    it('…or private and encrypted when the room version has no restricted rule', () => {
        expect(row('app', 'public', 'den', 'non-public', false)).toEqual({
            kind: Private,
            encrypted: true,
            listed: false,
        });
    });

    it('a category follows its canopy and is never encrypted', () => {
        expect(row('app', 'public', 'category', 'public')).toEqual({
            kind: Public,
            encrypted: false,
            listed: false,
        });
        expect(row('app', 'public', 'category', 'non-public')).toEqual({
            kind: Restricted,
            encrypted: false,
            listed: false,
        });
        expect(row('app', 'public', 'category', 'non-public', false).kind).toBe(Private);
    });

    it('a canopy created inside another follows the den rule and is listed only when public', () => {
        expect(row('app', 'public', 'canopy', 'public')).toEqual({
            kind: Public,
            encrypted: false,
            listed: true,
        });
        expect(row('app', 'public', 'canopy', 'non-public')).toEqual({
            kind: Restricted,
            encrypted: false,
            listed: false,
        });
    });
});

describe('the table, panel surface', () => {
    it('a new canopy is private and not listed', () => {
        expect(row('panel', 'public', 'canopy', 'none')).toEqual({
            kind: Private,
            encrypted: false,
            listed: false,
        });
    });

    it('a new den with no canopy is private and encrypted', () => {
        expect(row('panel', 'public', 'den', 'none')).toEqual({
            kind: Private,
            encrypted: true,
            listed: false,
        });
    });

    it('a new den inside a public canopy is restricted to it (else private) and encrypted', () => {
        expect(row('panel', 'public', 'den', 'public')).toEqual({
            kind: Restricted,
            encrypted: true,
            listed: false,
        });
        expect(row('panel', 'public', 'den', 'public', false)).toEqual({
            kind: Private,
            encrypted: true,
            listed: false,
        });
    });

    it('a new den inside a non-public canopy is the same as in the app', () => {
        expect(row('panel', 'public', 'den', 'non-public')).toEqual(
            row('app', 'public', 'den', 'non-public')
        );
        expect(row('panel', 'public', 'den', 'non-public', false)).toEqual(
            row('app', 'public', 'den', 'non-public', false)
        );
    });

    it('a canopy created inside another is private whatever its parent (L6)', () => {
        for (const parentKind of ['public', 'non-public'] as const) {
            for (const supported of [true, false]) {
                expect(row('panel', 'public', 'canopy', parentKind, supported)).toEqual({
                    kind: Private,
                    encrypted: false,
                    listed: false,
                });
            }
        }
    });

    it('a category still follows its canopy: public in a public canopy', () => {
        expect(row('panel', 'public', 'category', 'public').kind).toBe(Public);
        expect(row('panel', 'public', 'category', 'non-public').kind).toBe(Restricted);
        expect(row('panel', 'public', 'category', 'public').encrypted).toBe(false);
    });

    it('the switch set to private changes nothing on the panel', () => {
        for (const target of ['canopy', 'den', 'category'] as const) {
            for (const parentKind of ['none', 'public', 'non-public'] as const) {
                for (const supported of [true, false]) {
                    expect(row('panel', 'private', target, parentKind, supported)).toEqual(
                        row('panel', 'public', target, parentKind, supported)
                    );
                }
            }
        }
    });
});

describe('the build-time switch', () => {
    it('set to private, the app surface uses the panel column for every row', () => {
        for (const target of ['canopy', 'den', 'category'] as const) {
            for (const parentKind of ['none', 'public', 'non-public'] as const) {
                for (const supported of [true, false]) {
                    expect(row('app', 'private', target, parentKind, supported)).toEqual(
                        row('panel', 'public', target, parentKind, supported)
                    );
                }
            }
        }
        // The rows that actually differ between the columns.
        expect(row('app', 'private', 'canopy', 'none').kind).toBe(Private);
        expect(row('app', 'private', 'canopy', 'none').listed).toBe(false);
        expect(row('app', 'private', 'canopy', 'public').kind).toBe(Private);
        expect(row('app', 'private', 'canopy', 'non-public').kind).toBe(Private);
        expect(row('app', 'private', 'den', 'none')).toEqual({
            kind: Private,
            encrypted: true,
            listed: false,
        });
        expect(row('app', 'private', 'den', 'public')).toEqual({
            kind: Restricted,
            encrypted: true,
            listed: false,
        });
    });

    it('only the word private counts; unset, public and anything else keep the table', () => {
        expect(newRoomDefaultSettingIn('private')).toBe('private');
        expect(newRoomDefaultSettingIn(' Private ')).toBe('private');
        expect(newRoomDefaultSettingIn('PRIVATE')).toBe('private');
        expect(newRoomDefaultSettingIn('public')).toBe('public');
        expect(newRoomDefaultSettingIn(undefined)).toBe('public');
        expect(newRoomDefaultSettingIn('')).toBe('public');
        expect(newRoomDefaultSettingIn('1')).toBe('public');
        expect(newRoomDefaultSettingIn('true')).toBe('public');
        expect(newRoomDefaultSettingIn(1)).toBe('public');
    });

    it('is read from VITE_BLACKOUT_NEW_ROOM_DEFAULT', () => {
        expect(newRoomDefaultSetting()).toBe('public');
        vi.stubEnv('VITE_BLACKOUT_NEW_ROOM_DEFAULT', 'private');
        expect(newRoomDefaultSetting()).toBe('private');
    });
});

describe('the wrappers read the page', () => {
    it('the surface is the panel only when the page loaded on a panel path', () => {
        window.history.replaceState(null, '', '/embed/canopies/abc');
        setNewRoomSurfaceForTests(null);
        expect(newRoomSurface()).toBe('panel');
        window.history.replaceState(null, '', '/embedded');
        setNewRoomSurfaceForTests(null);
        expect(newRoomSurface()).toBe('app');
        window.history.replaceState(null, '', '/');
        setNewRoomSurfaceForTests(null);
        expect(newRoomSurface()).toBe('app');
    });

    it('newCanopyDefaults / newDenDefaults / newCategoryDefaults use the surface and the switch', () => {
        setNewRoomSurfaceForTests('app');
        expect(newCanopyDefaults({ parentKind: 'none', restrictedSupported: true }).kind).toBe(
            Public
        );
        expect(newDenDefaults({ parentKind: 'public', restrictedSupported: true }).kind).toBe(
            Public
        );
        expect(
            newCategoryDefaults({ parentKind: 'non-public', restrictedSupported: true }).kind
        ).toBe(Restricted);

        setNewRoomSurfaceForTests('panel');
        expect(newCanopyDefaults({ parentKind: 'none', restrictedSupported: true })).toEqual({
            kind: Private,
            encrypted: false,
            listed: false,
        });
        expect(newDenDefaults({ parentKind: 'public', restrictedSupported: true })).toEqual({
            kind: Restricted,
            encrypted: true,
            listed: false,
        });

        setNewRoomSurfaceForTests('app');
        vi.stubEnv('VITE_BLACKOUT_NEW_ROOM_DEFAULT', 'private');
        expect(newDenDefaults({ parentKind: 'none', restrictedSupported: true })).toEqual({
            kind: Private,
            encrypted: true,
            listed: false,
        });
    });
});

describe('parent kind', () => {
    it('is public only for a public join rule, and non-public for everything else', () => {
        expect(parentKindOfJoinRule('public')).toBe('public');
        for (const rule of ['invite', 'restricted', 'knock', 'knock_restricted', 'private']) {
            expect(parentKindOfJoinRule(rule)).toBe('non-public');
        }
        expect(parentKindOfJoinRule(undefined)).toBe('non-public');
        expect(parentKindOfJoinRule(null)).toBe('non-public');
    });

    it('reads the canopy the form was opened inside, or none at the top level', () => {
        expect(parentKindOf(undefined)).toBe('none');
        expect(parentKindOf(null)).toBe('none');
        expect(parentKindOf({ getJoinRule: () => 'public' })).toBe('public');
        expect(parentKindOf({ getJoinRule: () => 'invite' })).toBe('non-public');
        expect(
            parentKindOf({
                getJoinRule: () => {
                    throw new Error('state not loaded');
                },
            })
        ).toBe('non-public');
    });
});
