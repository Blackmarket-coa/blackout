/**
 * One-shot reconciliation of the legacy Matrix-native friend list into the
 * Circle graph.
 *
 * Following is how a Circle is built now, but everyone who used Blackout before
 * that has their people in `co.bmc.friends` account data instead. Without this
 * they sign in to an empty feed and are told to go find people they already
 * know, which reads as the product losing their relationships.
 *
 * The account data is **never deleted** — it stays as a legacy read source, and
 * a `circleMigratedAt` marker written alongside it is what stops this running
 * twice. Server-side follows are idempotent, so a re-run after a partial failure
 * is safe rather than duplicating edges.
 */

export const CIRCLE_MIGRATED_AT_KEY = 'circleMigratedAt';

export interface FriendsAccountData {
    friends: string[];
    outgoing: string[];
    /** ISO timestamp; present once reconciliation has completed. */
    circleMigratedAt?: string;
}

/**
 * Who still needs a Circle edge.
 *
 * Confirmed friends only — an `outgoing` entry is a request the other person
 * never accepted, and turning it into a follow would quietly grant a
 * relationship that was never agreed to. Already-followed users are skipped so
 * a re-run is cheap, and the viewer is never included.
 */
export function pendingCircleFollows(input: {
    friends: readonly string[];
    alreadyFollowing: ReadonlySet<string>;
    viewerId: string | null;
}): string[] {
    const out: string[] = [];
    for (const friend of input.friends) {
        if (!friend || friend === input.viewerId) continue;
        if (input.alreadyFollowing.has(friend)) continue;
        if (out.includes(friend)) continue;
        out.push(friend);
    }
    return out;
}

/** True when reconciliation has already run for this account. */
export const hasMigrated = (data: Pick<FriendsAccountData, 'circleMigratedAt'>): boolean =>
    typeof data.circleMigratedAt === 'string' && data.circleMigratedAt.length > 0;

/**
 * The account data to write back after a run.
 *
 * Friends and outgoing requests are carried through untouched — this adds the
 * marker, it does not migrate data out of the old shape.
 */
export function withMigrationMarker(
    data: FriendsAccountData,
    at: string = new Date().toISOString()
): FriendsAccountData {
    return { friends: data.friends, outgoing: data.outgoing, [CIRCLE_MIGRATED_AT_KEY]: at };
}

export interface ReconcileOutcome {
    attempted: number;
    followed: number;
    failed: string[];
    /** False when the marker is only written after a fully clean run. */
    complete: boolean;
}

/**
 * Follow each pending friend, tolerating individual failures.
 *
 * A partial run does **not** stamp the marker, so the next sign-in retries only
 * the users that failed — losing one edge to a transient error should not
 * silently cost someone a relationship forever.
 */
export async function reconcileFriendsToCircle(
    pending: readonly string[],
    follow: (userId: string) => Promise<void>
): Promise<ReconcileOutcome> {
    const failed: string[] = [];
    let followed = 0;

    for (const userId of pending) {
        try {
            await follow(userId);
            followed += 1;
        } catch {
            failed.push(userId);
        }
    }

    return {
        attempted: pending.length,
        followed,
        failed,
        complete: failed.length === 0,
    };
}
