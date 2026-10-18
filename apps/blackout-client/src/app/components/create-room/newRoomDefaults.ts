/**
 * What a new canopy or den is by default, before the person creating it
 * touches the access chooser. One table, decided here; every creation path
 * that offers a default asks it (operator decisions of 2026-10-17).
 *
 * Two inputs decide the column:
 *
 * - **Surface.** `'panel'` when the client booted on a Black Mask chat panel
 *   path (`/embed`, decided once at load from the page's path, exactly as
 *   `main.tsx` decides "panel or full app"), else `'app'`.
 * - **The build-time switch** `VITE_BLACKOUT_NEW_ROOM_DEFAULT`. Set to
 *   `private` it makes the app surface use the panel column, for an operator
 *   who wants private-by-default everywhere. Unset, `public`, or anything else
 *   keeps the table below. The panel column never changes.
 *
 * | New…                          | app                                   | panel                                             |
 * | ----------------------------- | ------------------------------------- | ------------------------------------------------- |
 * | canopy (space)                | Public; listed in the directory       | Private; not listed (listing toggle shown, off)   |
 * | den with no canopy            | Public; not encrypted                 | Private; encrypted                                |
 * | den in a public canopy        | Public; not encrypted                 | Restricted to the canopy if supported, else Private; encrypted |
 * | den in a non-public canopy    | Restricted if supported, else Private; encrypted | same                                   |
 * | category (sub-space)          | follows the canopy's kind; never encrypted | same                                         |
 *
 * A Public room is never encrypted: encrypting a room anyone can join hides
 * history from later joiners without protecting anything (the rule
 * `CreateRoomForm` already applied). Every other den kind is encrypted.
 * Spaces (canopies and categories) hold hierarchy state, never messages, and
 * are never encrypted.
 *
 * Listing: a canopy is registered in the Blackout canopy directory only when
 * its kind is Public or the "List in the Blackout directory" toggle is on;
 * the toggle appears when the kind is not Public and is off by default.
 *
 * Paths that keep their own explicit choice and do not ask this table:
 * "Form a party" (`features/playbook/party/useParty.ts`: Restricted to the
 * parent den and encrypted, by design), streaming kits
 * (`features/streaming/kits/applyKit.ts`: per kit spec), the Discord structure
 * import's canopy (`features/create/runDiscordImport.ts`: Private, a bulk
 * import; its dens and categories go through `createDenInCanopy` and
 * `createCategoryInCanopy`, which do ask), and direct messages.
 *
 * Why the switch is read at build time and is not a `FeatureFlags` entry:
 * `FeatureFlags` (`app/core/features/featureFlags.ts`) has a beta switch
 * (`VITE_BLACKOUT_BETA_UNLOCK_ALL`) meant to turn every flag there on, and a
 * privacy default must only ever change on purpose; its overrides are also read
 * at run time from `process.env` and `Function('return import.meta')`, which
 * in a browser are undefined and throw, so a build-time setting would not
 * reach the page. `config.json` is fetched after the page starts, which is
 * fine for this table but would make the switch behave differently from
 * `VITE_BLACKOUT_PANEL_SESSION_LENGTHS` (`client/panelSessionLengthsFlag.ts`),
 * whose pattern this follows. Vite writes the value into the bundle in place
 * of the `import.meta.env` reference below. No build in this repository sets
 * it; `apps/blackout-client/.env.example` documents it.
 *
 * Nothing here is enforced by a server: the homeserver accepts whatever join
 * rule the client sends, and the API accepts a listing request from any
 * signed-in caller. This table is the client's default, not a guarantee.
 */
import { isEmbedPath } from '../../features/black-mask-embed/embedPaths';
import { CreateRoomKind } from './kind';

export type NewRoomSurface = 'app' | 'panel';

/** The build-time switch's two meanings. */
export type NewRoomDefaultSetting = 'public' | 'private';

/** What is being created. A category is a sub-space inside a canopy. */
export type NewRoomTarget = 'canopy' | 'den' | 'category';

/**
 * The kind of the canopy the new room is created inside: `'none'` for a
 * top-level canopy or a den with no canopy, `'public'` when the canopy's join
 * rule is `public`, `'non-public'` for every other join rule, and for a canopy
 * whose state this client cannot read (the private side is the safe guess).
 */
export type NewRoomParentKind = 'none' | 'public' | 'non-public';

export interface NewRoomDefaults {
    kind: CreateRoomKind;
    /** Whether `m.room.encryption` goes into the room's initial state. */
    encrypted: boolean;
    /** Canopies only: registered in the Blackout canopy directory without asking. */
    listed: boolean;
}

/** Pure: the switch's meaning for a raw environment value. Only `private` changes anything. */
export const newRoomDefaultSettingIn = (raw: unknown): NewRoomDefaultSetting =>
    typeof raw === 'string' && raw.trim().toLowerCase() === 'private' ? 'private' : 'public';

/** The build's setting of the switch. */
export const newRoomDefaultSetting = (): NewRoomDefaultSetting =>
    newRoomDefaultSettingIn(import.meta.env.VITE_BLACKOUT_NEW_ROOM_DEFAULT);

const detectSurface = (): NewRoomSurface => {
    try {
        return isEmbedPath(window.location.pathname) ? 'panel' : 'app';
    } catch {
        return 'app';
    }
};

// Decided once, from the path the page loaded on, so nothing that happens
// later in the page (a navigation inside the panel, a rewritten URL) can move
// a creation from one column to the other.
let currentSurface: NewRoomSurface = detectSurface();

/** The surface this page booted as. */
export const newRoomSurface = (): NewRoomSurface => currentSurface;

/** Test-only: force a surface, or re-detect from the current path (null). */
export const setNewRoomSurfaceForTests = (surface: NewRoomSurface | null): void => {
    currentSurface = surface ?? detectSurface();
};

/** The parent kind for a join rule read off a canopy, or none when the canopy is unknown. */
export const parentKindOfJoinRule = (joinRule: string | null | undefined): NewRoomParentKind =>
    joinRule === 'public' ? 'public' : 'non-public';

/**
 * The parent kind for the canopy a form was opened inside, or `'none'` when
 * it was opened at the top level. `getJoinRule()` defaults to `invite` when
 * the room's join rule is not loaded, which lands on the private side.
 */
export const parentKindOf = (
    parent: { getJoinRule: () => string } | null | undefined
): NewRoomParentKind => {
    if (!parent) return 'none';
    try {
        return parentKindOfJoinRule(parent.getJoinRule());
    } catch {
        return 'non-public';
    }
};

export interface NewRoomDefaultsInput {
    target: NewRoomTarget;
    parentKind: NewRoomParentKind;
    /** Whether the room version the new room will use supports `restricted`. */
    restrictedSupported: boolean;
}

const restrictedOrPrivate = (restrictedSupported: boolean): CreateRoomKind =>
    restrictedSupported ? CreateRoomKind.Restricted : CreateRoomKind.Private;

/**
 * Pure: the table, for an explicit surface and switch setting. The wrappers
 * below fill those in from the page.
 */
export const newRoomDefaultsFor = (
    input: NewRoomDefaultsInput & { surface: NewRoomSurface; setting: NewRoomDefaultSetting }
): NewRoomDefaults => {
    const { target, parentKind, restrictedSupported } = input;
    const column: NewRoomSurface =
        input.surface === 'panel' || input.setting === 'private' ? 'panel' : 'app';

    let kind: CreateRoomKind;
    if (parentKind === 'non-public') {
        // Inside a canopy that is not public, on either surface.
        kind = restrictedOrPrivate(restrictedSupported);
    } else if (parentKind === 'public' && target === 'category') {
        // A category follows its canopy's kind on either surface.
        kind = CreateRoomKind.Public;
    } else if (column === 'app') {
        kind = CreateRoomKind.Public;
    } else if (parentKind === 'public') {
        kind = restrictedOrPrivate(restrictedSupported);
    } else {
        kind = CreateRoomKind.Private;
    }

    return {
        kind,
        // Spaces never; a Public room never; every other den kind.
        encrypted: target === 'den' && kind !== CreateRoomKind.Public,
        listed: target === 'canopy' && kind === CreateRoomKind.Public,
    };
};

const fromPage = (input: NewRoomDefaultsInput): NewRoomDefaults =>
    newRoomDefaultsFor({ ...input, surface: newRoomSurface(), setting: newRoomDefaultSetting() });

/** Defaults for a new canopy, created at the top level or inside `parentKind`. */
export const newCanopyDefaults = (input: Omit<NewRoomDefaultsInput, 'target'>): NewRoomDefaults =>
    fromPage({ ...input, target: 'canopy' });

/** Defaults for a new den, loose (`parentKind: 'none'`) or inside a canopy. */
export const newDenDefaults = (input: Omit<NewRoomDefaultsInput, 'target'>): NewRoomDefaults =>
    fromPage({ ...input, target: 'den' });

/** Defaults for a new category (sub-space) inside a canopy. */
export const newCategoryDefaults = (input: Omit<NewRoomDefaultsInput, 'target'>): NewRoomDefaults =>
    fromPage({ ...input, target: 'category' });
