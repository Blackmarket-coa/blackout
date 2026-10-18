import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import { joinedRoomsAtom } from '../../state/rooms';
import { createRoomEncryptionState } from '../../utils/matrix-crypto';
import { restrictedSupported } from '../../utils/matrix';
import { createJoinRulesState, createRoomPreset } from '../../components/create-room/utils';
import { CreateRoomKind } from '../../components/create-room/kind';
import {
    newCategoryDefaults,
    newDenDefaults,
    parentKindOfJoinRule,
    type NewRoomDefaults,
    type NewRoomDefaultsInput,
    type NewRoomParentKind,
} from '../../components/create-room/newRoomDefaults';

/**
 * Channel-kind marker for a den. Kept deliberately separate from the den
 * *classification* (`co.bmc.den.classification`, which encodes trust class:
 * public/coalition/private/ai) — a channel can be a voice channel regardless
 * of its trust class, exactly like Discord. Default is `text`.
 */
export const DEN_KIND_STATE_EVENT_TYPE = 'co.bmc.den.kind';

export type DenKind = 'text' | 'voice' | 'forum' | 'stage' | 'announcement';

export interface DenKindContent {
    kind?: DenKind;
}

export const resolveDenKind = (content: DenKindContent | undefined): DenKind => {
    if (content?.kind === 'voice') return 'voice';
    if (content?.kind === 'forum') return 'forum';
    if (content?.kind === 'stage') return 'stage';
    if (content?.kind === 'announcement') return 'announcement';
    return 'text';
};

export const readDenKind = (room: Room | undefined): DenKind => {
    if (!room) return 'text';
    const content = room.currentState
        ?.getStateEvents(DEN_KIND_STATE_EVENT_TYPE, '')
        ?.getContent<DenKindContent>();
    return resolveDenKind(content && typeof content === 'object' ? content : undefined);
};

/**
 * Split a list of dens into text, voice, forum, stage, and announcement
 * channels, preserving input order within each bucket. Pure helper so the
 * channel sidebar's grouping is independently testable.
 */
export const partitionDensByKind = (
    rooms: Room[]
): {
    text: Room[];
    voice: Room[];
    forum: Room[];
    stage: Room[];
    announcement: Room[];
} => {
    const text: Room[] = [];
    const voice: Room[] = [];
    const forum: Room[] = [];
    const stage: Room[] = [];
    const announcement: Room[] = [];
    for (const room of rooms) {
        const kind = readDenKind(room);
        if (kind === 'voice') voice.push(room);
        else if (kind === 'forum') forum.push(room);
        else if (kind === 'stage') stage.push(room);
        else if (kind === 'announcement') announcement.push(room);
        else text.push(room);
    }
    return { text, voice, forum, stage, announcement };
};

/** Resolve a den's channel kind (text/voice/forum) from its Matrix room state. */
export const useDenKind = (roomId: string | null): DenKind => {
    const rooms = useAtomValue(joinedRoomsAtom);
    return useMemo(() => {
        if (!roomId) return 'text';
        const room = rooms.find((candidate) => candidate.roomId === roomId);
        return readDenKind(room);
    }, [roomId, rooms]);
};

const localDomain = (mx: MatrixClient): string[] => {
    const domain = mx.getDomain?.();
    return domain ? [domain] : [];
};

const FALLBACK_ROOM_VERSION = '1';

/**
 * The room version a `createRoom` without `room_version` gets, from the
 * homeserver's capabilities. Unknown (no capabilities, or a client that cannot
 * fetch them) is read as version 1, which does not support `restricted`, so
 * the den falls back to invite rather than sending a rule the server would
 * refuse.
 */
const resolveDefaultRoomVersion = async (mx: MatrixClient): Promise<string> => {
    try {
        const capabilities = await mx.getCapabilities();
        return capabilities?.['m.room_versions']?.default ?? FALLBACK_ROOM_VERSION;
    } catch {
        return FALLBACK_ROOM_VERSION;
    }
};

const MAX_PARENT_WALK = 8;

/**
 * The spaces that decide a new den's or category's default access, and the
 * rooms a restricted den admits members of.
 *
 * `canopyId` may be a category (a sub-space): `useDiscussionDen` and "add
 * channel" from a category menu pass the category's id. The walk follows
 * canonical `m.space.parent` edges up through spaces this client has loaded,
 * and the kind is the most private one on that chain: public only when every
 * space from the placement room to the top is public, non-public otherwise.
 * So a den made directly in a private sub-canopy nested under a public canopy
 * comes out restricted and encrypted, as the forms opened in that sub-canopy
 * make it; the walk cannot tell a nested canopy from a hand-made category, so
 * both land on the private side. A restricted den names every space on the
 * chain: members of any of them can join, so the invite redemption in
 * `packages/api/src/services/invitations.ts`, which admits the redeemer to the
 * den's immediate parent, keeps working for dens in categories, and ordinary
 * canopy members are not kept out by a category nobody joins.
 *
 * A room this client has not loaded cannot be walked from or through. A
 * category created a moment ago is the common case (`useDiscussionDen` and
 * the Discord import make the category and then its dens before the sync
 * brings either back), so a caller that knows the canopy names it as
 * `rootCanopyId`. The hint counts only when the walk did not get past the
 * placement room: it is then admitted, and its join rule joins the chain when
 * it is loaded. Once the walk has reached a parent, the walk is trusted and
 * the hint is ignored, whether it names the space the walk reached or another
 * one. With no hint and nothing loaded the kind is read as non-public, the
 * private side.
 */
const resolveCanopy = (
    mx: MatrixClient,
    canopyId: string,
    rootCanopyId?: string
): { parentKind: NewRoomParentKind; allowRoomIds: string[] } => {
    const allowRoomIds = [canopyId];
    // The loaded spaces whose join rules decide the kind, placement room first.
    const chain: Room[] = [];
    let current: Room | null | undefined = mx.getRoom(canopyId);
    if (current) chain.push(current);
    for (let depth = 0; current && depth < MAX_PARENT_WALK; depth += 1) {
        const parents: string[] = (current.currentState?.getStateEvents('m.space.parent') ?? [])
            .filter((event) => event.getContent<{ canonical?: boolean }>()?.canonical === true)
            .map((event) => event.getStateKey())
            .filter((id): id is string => Boolean(id) && !allowRoomIds.includes(id as string));
        const next: Room | null | undefined = parents.length ? mx.getRoom(parents[0]) : null;
        if (!next || next.getType?.() !== 'm.space') break;
        allowRoomIds.push(next.roomId);
        chain.push(next);
        current = next;
    }
    const walkedPastPlacement = allowRoomIds.length > 1;
    if (rootCanopyId && !walkedPastPlacement && !allowRoomIds.includes(rootCanopyId)) {
        allowRoomIds.push(rootCanopyId);
        const root = mx.getRoom(rootCanopyId);
        if (root) chain.push(root);
    }
    const parentKind: NewRoomParentKind =
        chain.length > 0 &&
        chain.every((space) => parentKindOfJoinRule(space.getJoinRule()) === 'public')
            ? 'public'
            : 'non-public';
    return { parentKind, allowRoomIds };
};

/**
 * The table's answer for a parent kind, fetching the homeserver's default
 * room version only when the answer could be Restricted: the version decides
 * nothing but whether Restricted falls back to Private, so a Public answer
 * needs no capabilities round-trip.
 */
const defaultsFor = async (
    mx: MatrixClient,
    pick: (input: Omit<NewRoomDefaultsInput, 'target'>) => NewRoomDefaults,
    parentKind: NewRoomParentKind
): Promise<NewRoomDefaults> => {
    const ifSupported = pick({ parentKind, restrictedSupported: true });
    if (ifSupported.kind !== CreateRoomKind.Restricted) return ifSupported;
    return pick({
        parentKind,
        restrictedSupported: restrictedSupported(await resolveDefaultRoomVersion(mx)),
    });
};

// Forum settings event read by `features/forum/ForumView` — a forum den is
// inert (renders "Forum mode is not enabled") until this exists with
// `enabled: true`, so we stamp sane defaults at creation. Kept as a local
// literal to avoid a forum→canopy import cycle; the shape matches
// `ForumSettings` in `features/forum/useForum.ts`.
const FORUM_SETTINGS_STATE_EVENT_TYPE = 'co.bmc.forum';
const DEFAULT_FORUM_SETTINGS = {
    enabled: true,
    defaultSort: 'hot',
    tags: [],
    guidelines: '',
    requireTag: false,
};

/**
 * Create a den inside a canopy and link it via Matrix space semantics
 * (`m.space.parent` on the den, `m.space.child` on the canopy), stamping the
 * channel kind so the server page can bucket it as a text, voice, forum,
 * stage, or announcement channel. Forum dens additionally get a default
 * `co.bmc.forum` settings event so they render a working forum immediately;
 * announcement dens raise `events_default` to 50 so only moderators can post
 * (enforced server-side, mirrored by the composer gate). Returns the new den's
 * room id. No `addRoomToSpace` helper exists in the codebase, so the
 * parent/child edges are written explicitly here.
 */
export const createDenInCanopy = async (
    mx: MatrixClient,
    {
        canopyId,
        rootCanopyId,
        name,
        kind = 'text',
        topic,
    }: {
        /** The space the den is placed in: the canopy, or a category inside it. */
        canopyId: string;
        /**
         * When `canopyId` is a category, the canopy it sits in. Needed when the
         * category was created a moment ago and this client has not synced it
         * yet, so the den's default access can still follow the canopy and
         * admit its members (see `resolveCanopy`).
         */
        rootCanopyId?: string;
        name: string;
        kind?: DenKind;
        topic?: string;
    }
): Promise<string> => {
    const via = localDomain(mx);
    // Access and encryption come from the one table in `newRoomDefaults.ts`:
    // inside a public canopy the den is public and plaintext in the Blackout
    // app (restricted to the canopy and encrypted in the Black Mask panel);
    // inside any other canopy, or a category or sub-canopy that is not public
    // itself (`resolveCanopy`), it is restricted to the canopy when the room
    // version allows, else invite-only, and encrypted. Encryption goes in
    // `initial_state`, not in a later event: this is the main channel-creation
    // path in the app and it created every den in plaintext until the
    // 2026-08-10 encryption audit; a follow-up event would leave a window where
    // the den exists unencrypted. Until 2026-10 this call sent no join rule,
    // so dens were invite-only by homeserver preset while the invitations
    // service believed them restricted.
    const { parentKind, allowRoomIds } = resolveCanopy(mx, canopyId, rootCanopyId);
    const { kind: accessKind, encrypted } = await defaultsFor(mx, newDenDefaults, parentKind);
    const initialState = [
        ...(encrypted ? [createRoomEncryptionState()] : []),
        createJoinRulesState(accessKind, allowRoomIds, false),
    ];
    const { room_id: roomId } = await mx.createRoom({
        name,
        topic,
        visibility: undefined,
        // `public_chat` for a public den, else `private_chat`: the homeserver
        // adds encryption to every `private_chat` room, so a public den must
        // say which it is (`createRoomPreset`).
        preset: createRoomPreset(accessKind),
        // Announcement dens are read-only for non-moderators: posting any
        // message event requires power 50, enforced by the homeserver.
        power_level_content_override: kind === 'announcement' ? { events_default: 50 } : undefined,
        initial_state: initialState,
    });

    // Custom + space state-event types aren't in matrix-js-sdk's typed
    // `StateEvents` map; cast the event type as the codebase does elsewhere
    // (see `useRoomAliases`).
    await mx.sendStateEvent(roomId, DEN_KIND_STATE_EVENT_TYPE as any, { kind }, '');
    if (kind === 'forum') {
        await mx.sendStateEvent(
            roomId,
            FORUM_SETTINGS_STATE_EVENT_TYPE as any,
            DEFAULT_FORUM_SETTINGS,
            ''
        );
    }
    await mx.sendStateEvent(roomId, 'm.space.parent' as any, { via, canonical: true }, canopyId);
    await mx.sendStateEvent(canopyId, 'm.space.child' as any, { via, suggested: true }, roomId);

    return roomId;
};

/**
 * Machine-readable marker for a category, following the `co.bmc.den.kind`
 * pattern. Without it a category is identifiable only by
 * `getType() === 'm.space'` plus its display name, and matching "the Topics
 * category" by name is fragile — names are user-editable, localizable, and
 * collide with any hand-made category someone happens to call Topics.
 */
export const CATEGORY_STATE_EVENT_TYPE = 'co.bmc.category';

/**
 * What an auto-created category is *for*. Stable across renames, unlike the
 * display name. Hand-made categories carry no purpose.
 */
export type CategoryPurpose = 'topics';

export interface CategoryContent {
    purpose?: CategoryPurpose;
}

/**
 * Create a category inside a canopy. A category is a Matrix **sub-space**
 * (`type: 'm.space'`) linked to the canopy via the same `m.space.parent` /
 * `m.space.child` edges as a den — `buildSpaceGroups` already renders any child
 * sub-space as a category group. Dens are placed into a category by passing the
 * category's room id as `canopyId` to `createDenInCanopy`. Returns the new
 * category's room id.
 */
export const createCategoryInCanopy = async (
    mx: MatrixClient,
    {
        canopyId,
        name,
        purpose,
        order,
    }: { canopyId: string; name: string; purpose?: CategoryPurpose; order?: string }
): Promise<string> => {
    const via = localDomain(mx);
    // A category follows its canopy's kind (`newRoomDefaults.ts`): public in a
    // public canopy, else restricted to the canopy when the room version
    // allows, else invite-only. Spaces hold hierarchy state, never messages,
    // so the client asks for no encryption (the homeserver may still add it
    // to a `private_chat` space; harmless, nothing is ever sent in one). Until
    // 2026-10 this sent no join rule and every category was invite-only by
    // homeserver preset.
    const { parentKind, allowRoomIds } = resolveCanopy(mx, canopyId);
    const { kind } = await defaultsFor(mx, newCategoryDefaults, parentKind);
    const { room_id: roomId } = await mx.createRoom({
        name,
        creation_content: { type: 'm.space' },
        preset: createRoomPreset(kind),
        // Match the canopy's own space convention: only moderators add channels.
        power_level_content_override: { events_default: 50 },
        initial_state: [createJoinRulesState(kind, allowRoomIds, false)],
    });
    if (purpose) {
        await mx.sendStateEvent(roomId, CATEGORY_STATE_EVENT_TYPE as any, { purpose }, '');
    }
    await mx.sendStateEvent(roomId, 'm.space.parent' as any, { via, canonical: true }, canopyId);
    await mx.sendStateEvent(
        canopyId,
        'm.space.child' as any,
        order ? { via, suggested: true, order } : { via, suggested: true },
        roomId
    );
    return roomId;
};

/** The purpose stamped on a category room, if any. */
export const readCategoryPurpose = (room: Room | undefined): CategoryPurpose | null => {
    if (!room || room.getType() !== 'm.space') return null;
    const content = room.currentState
        ?.getStateEvents(CATEGORY_STATE_EVENT_TYPE, '')
        ?.getContent<CategoryContent>();
    return content?.purpose === 'topics' ? 'topics' : null;
};

/**
 * `getOrderedChildIds` gives an unordered child the literal `'zzz'`, so this
 * sorts an auto-created category *after* every hand-made channel that has no
 * explicit order. Deliberate: a category the app made on someone's behalf
 * should not outrank the channels they built themselves.
 */
export const AUTO_CATEGORY_ORDER = 'zzzz';

const TOPICS_CATEGORY_NAME = 'Topics';

/**
 * Find the canopy's category for `purpose`, creating it if absent.
 *
 * Matching is on the `co.bmc.category` marker, never on the display name — a
 * renamed category still holds its dens, and a hand-made category that happens
 * to be called "Topics" is left alone.
 *
 * First-writer-wins is *not* enforced here: two clients racing can each mint a
 * category. That is a cosmetic duplicate in the channel list, unlike two rival
 * discussion dens, and resolving it would need a lock the client does not have.
 * Both categories work; the loser simply holds one den.
 */
export const findOrCreateCategory = async (
    mx: MatrixClient,
    { canopyId, purpose }: { canopyId: string; purpose: CategoryPurpose }
): Promise<string> => {
    const childIds = (mx.getRoom(canopyId)?.currentState.getStateEvents('m.space.child') ?? [])
        .map((event) => event.getStateKey())
        .filter((childId): childId is string => Boolean(childId));
    const existing = childIds.find(
        (childId) => readCategoryPurpose(mx.getRoom(childId) ?? undefined) === purpose
    );
    if (existing) return existing;

    return createCategoryInCanopy(mx, {
        canopyId,
        name: TOPICS_CATEGORY_NAME,
        purpose,
        order: AUTO_CATEGORY_ORDER,
    });
};

/**
 * Remove a den from a canopy by clearing the `m.space.child` edge (empty
 * content unlinks the child — the inverse of the write in `createDenInCanopy`)
 * and leaving the room. Mirrors `createDenInCanopy` so the removal is a single,
 * unit-testable call. Requires `m.space.child` power on the *canopy*.
 */
export const removeDenFromCanopy = async (
    mx: MatrixClient,
    { canopyId, denId }: { canopyId: string; denId: string }
): Promise<void> => {
    await mx.sendStateEvent(canopyId, 'm.space.child' as any, {}, denId);
    try {
        await mx.leave(denId);
    } catch {
        // Unlinking the child is the meaningful action; leaving is best-effort
        // (the user may lack membership, or already have left).
    }
};

/** Rename a den via its `m.room.name` state event. Requires `m.room.name` power. */
export const renameDen = async (
    mx: MatrixClient,
    { denId, name }: { denId: string; name: string }
): Promise<void> => {
    await mx.sendStateEvent(denId, 'm.room.name' as any, { name: name.trim() }, '');
};
