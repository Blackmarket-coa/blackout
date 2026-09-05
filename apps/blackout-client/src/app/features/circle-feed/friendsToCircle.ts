/**
 * One-shot reconciliation of the legacy Matrix-native friend list into the
 * Circle graph.
 *
 * Following is how a Circle is built now, but everyone who used Blackout before
 * that has their people in `co.bmc.friends` account data instead. Without this
 * they sign in to an empty feed and are told to go find people they already
 * know, which reads as the product losing their relationships.
 *
 * The friend list is **never deleted** — it stays as a legacy read source.
 *
 * The "already ran" marker lives in its **own** account-data key rather than
 * inside `co.bmc.friends`. It was originally stored alongside the friend list,
 * where `friendActions.writeFriends` and `useFriends.setContent` both replace
 * the content with exactly `{friends, outgoing}` — so any friend action wiped
 * the marker, the migration re-ran on the next sign-in, and it silently
 * re-followed people the user had since removed from their Circle. A marker
 * about migration state is not friends data, and keeping it separate means no
 * unrelated writer can clobber it.
 */

/** Account-data key holding the reconciliation marker. */
export const CIRCLE_MIGRATION_ACCOUNT_DATA_KEY = 'co.bmc.circle_migration';

export interface CircleMigrationMarker {
    /** ISO timestamp; present once reconciliation has completed cleanly. */
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
export const hasMigrated = (marker: CircleMigrationMarker): boolean =>
    typeof marker.circleMigratedAt === 'string' && marker.circleMigratedAt.length > 0;

/** Parse the marker key's content defensively. */
export function parseMigrationMarker(content: unknown): CircleMigrationMarker {
    const at = (content as CircleMigrationMarker | undefined)?.circleMigratedAt;
    return typeof at === 'string' && at.length > 0 ? { circleMigratedAt: at } : {};
}

/** The marker content to write once a run completes cleanly. */
export function migrationMarker(
    at: string = new Date().toISOString()
): Required<CircleMigrationMarker> {
    return { circleMigratedAt: at };
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
