import type { MatrixClient } from 'matrix-js-sdk';

const isRealRoomId = (id?: string | null): id is string => !!id && id.startsWith('!');

/**
 * Join the parent canopy first, then join the den. Dens are created
 * `restricted` to their canopy, so a user can only join a den once they're a
 * member of its canopy — the canopy join is what unlocks the den.
 *
 * The canopy join is best-effort (already-joined / no invite / public canopy
 * are all fine); the den join is what the caller awaits and catches. The `'-'`
 * no-canopy sentinel and a canopy that equals the den are filtered by the
 * `startsWith('!')` / equality guards.
 */
export const joinDenWithCanopy = async (
    mx: MatrixClient,
    denId: string,
    canopyId?: string | null,
): Promise<void> => {
    if (
        isRealRoomId(canopyId) &&
        canopyId !== denId &&
        mx.getRoom(canopyId)?.getMyMembership() !== 'join'
    ) {
        try {
            await mx.joinRoom(canopyId);
        } catch {
            // Best-effort: the den join below surfaces the real error.
        }
    }
    await mx.joinRoom(denId);
};

export default joinDenWithCanopy;
