import { useCallback, useState } from 'react';
import { useMatrixClientOrNull } from '../../hooks/useMatrixClient';
import { joinDenWithCanopy } from '../room/joinDenWithCanopy';
import { createDenInCanopy, DEN_KIND_STATE_EVENT_TYPE, findOrCreateCategory } from './denKind';

export interface UseDiscussionDenOptions {
    /** The den already linked to this thing, if one has been created. */
    denRoomId?: string | null;
    /** Canopy to parent a new den under. Omit for a standalone, unparented den. */
    canopyId?: string | null;
    /** Channel name for a newly created den. */
    name: string;
    /**
     * Persist the new den id and return whatever the server considers
     * authoritative. First-writer-wins: if someone else linked a den first this
     * returns *their* id, and the room we just made is abandoned.
     */
    link: (denRoomId: string) => Promise<string>;
}

export interface UseDiscussionDenResult {
    /** The den to render, once one exists. */
    denRoomId: string | null;
    creating: boolean;
    error: string | null;
    /** Create-or-join the den. Safe to call repeatedly. */
    open: () => Promise<string | null>;
}

/**
 * Lazily attach a canopy den to something that needs a conversation.
 *
 * Every chat, comment and piece of written media in Blackout is a Matrix event
 * in a den — no feature ships its own message store or comment UI. This is the
 * shared way to get one.
 *
 * **Lazy, not eager.** Creating a den when the topic is *proposed* would mint a
 * Matrix room for every throwaway idea and bury the canopy's channel list. The
 * den appears on the first comment instead.
 *
 * **Client-side.** The API is a separate service with no Matrix identity for
 * the user, so the room has to be created here and then registered.
 *
 * **Additive.** If creation fails the caller keeps working — discussion is
 * never load-bearing for the surface it hangs off.
 */
export const useDiscussionDen = ({
    denRoomId,
    canopyId,
    name,
    link,
}: UseDiscussionDenOptions): UseDiscussionDenResult => {
    const mx = useMatrixClientOrNull();
    const [localDenId, setLocalDenId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resolved = denRoomId ?? localDenId;

    const open = useCallback(async (): Promise<string | null> => {
        if (!mx) {
            setError('Sign in to join the discussion.');
            return null;
        }
        if (resolved) {
            // Dens are `restricted` to their canopy, so the canopy join is what
            // unlocks the den; both are no-ops when already a member.
            await joinDenWithCanopy(mx, resolved, canopyId).catch(() => undefined);
            return resolved;
        }

        setCreating(true);
        setError(null);
        try {
            // A forum den is threaded discussion, which is what a comment
            // section is. A standalone topic has no canopy to parent under, so
            // its den is an unparented room — deliberately not a global
            // "Coliseum canopy", which would be a seeding dependency with no
            // owner. Either way it is marked `forum` so it renders the same.
            let created: string;
            if (canopyId) {
                // Dens are placed by whichever space id `createDenInCanopy`
                // receives, so pass the canopy's Topics category rather than the
                // canopy itself. Otherwise every auto-created den lands loose in
                // General alongside the hand-made channels and buries them.
                const categoryId = await findOrCreateCategory(mx, {
                    canopyId,
                    purpose: 'topics',
                });
                created = await createDenInCanopy(mx, {
                    canopyId: categoryId,
                    name,
                    kind: 'forum',
                });
            } else {
                created = (await mx.createRoom({ name })).room_id;
                // Custom state-event types aren't in matrix-js-sdk's typed
                // `StateEvents` map; cast as `createDenInCanopy` does.
                await mx.sendStateEvent(
                    created,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    DEN_KIND_STATE_EVENT_TYPE as any,
                    { kind: 'forum' },
                    ''
                );
            }

            const authoritative = await link(created);
            if (authoritative !== created) {
                // Someone else linked a den first. Theirs is the discussion;
                // leave the room we just made rather than stranding a second one.
                await mx.leave(created).catch(() => undefined);
            }
            setLocalDenId(authoritative);
            return authoritative;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not start the discussion.');
            return null;
        } finally {
            setCreating(false);
        }
    }, [mx, resolved, canopyId, name, link]);

    return { denRoomId: resolved, creating, error, open };
};

export default useDiscussionDen;
