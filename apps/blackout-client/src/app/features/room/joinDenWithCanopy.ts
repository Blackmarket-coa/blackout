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
 *
 * Finally, any category the den sits in is joined too. The canopy sidebar
 * (`buildSpaceGroups`) walks *joined* rooms, so a den nested in a sub-space the
 * user isn't in renders nowhere under its canopy — joined, reachable by link,
 * but invisible in the channel list. This has to come after the den join, since
 * the den's `m.space.parent` state can't be read until we're in it.
 */
export const joinDenWithCanopy = async (
    mx: MatrixClient,
    denId: string,
    canopyId?: string | null
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
    await joinDenParentSpaces(mx, denId, canopyId);
};

/** Best-effort: join whatever spaces the den names as parents. */
const joinDenParentSpaces = async (
    mx: MatrixClient,
    denId: string,
    canopyId?: string | null
): Promise<void> => {
    const parentIds = (mx.getRoom(denId)?.currentState?.getStateEvents('m.space.parent') ?? [])
        .map((event) => event.getStateKey())
        .filter(
            (parentId): parentId is string =>
                isRealRoomId(parentId) &&
                parentId !== denId &&
                parentId !== canopyId &&
                mx.getRoom(parentId)?.getMyMembership() !== 'join'
        );
    await Promise.all(
        parentIds.map((parentId) =>
            mx.joinRoom(parentId).catch(() => {
                // The den is already joined and usable; sidebar placement is
                // the only thing lost, and a private category is a legitimate
                // reason to be refused.
            })
        )
    );
};

export default joinDenWithCanopy;
