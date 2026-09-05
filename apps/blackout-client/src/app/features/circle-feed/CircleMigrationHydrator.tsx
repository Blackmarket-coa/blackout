import { useEffect } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { FRIENDS_ACCOUNT_DATA_KEY, parseFriends } from '../friends/friendsModel';
import { fetchCircleFollowing, followInCircle } from './circleClient';
import {
    CIRCLE_MIGRATION_ACCOUNT_DATA_KEY,
    hasMigrated,
    migrationMarker,
    parseMigrationMarker,
    pendingCircleFollows,
    reconcileFriendsToCircle,
    type CircleMigrationMarker,
} from './friendsToCircle';

type AccountDataClient = {
    getAccountData: (type: string) => { getContent: () => unknown } | undefined;
    setAccountData: (type: string, content: Record<string, unknown>) => Promise<unknown>;
};

/** The legacy friend list. Read-only here — this never writes it back. */
const readFriends = (mx: MatrixClient): string[] =>
    parseFriends(
        (mx as unknown as AccountDataClient).getAccountData(FRIENDS_ACCOUNT_DATA_KEY)?.getContent()
    ).friends;

const readMarker = (mx: MatrixClient): CircleMigrationMarker =>
    parseMigrationMarker(
        (mx as unknown as AccountDataClient)
            .getAccountData(CIRCLE_MIGRATION_ACCOUNT_DATA_KEY)
            ?.getContent()
    );

const writeMarker = async (mx: MatrixClient): Promise<void> => {
    await (mx as unknown as AccountDataClient).setAccountData(
        CIRCLE_MIGRATION_ACCOUNT_DATA_KEY,
        migrationMarker()
    );
};

/**
 * Boot-time reconciliation of the legacy friend list into the Circle graph.
 *
 * Mounted once the viewer is logged in, next to `SelfProfileHydrator`, which
 * already does this kind of hydrate-on-login. Runs at most once per account and
 * is silent: nothing is shown, because from the user's point of view their
 * people were simply always there.
 *
 * Failures are non-fatal and unmarked, so the next sign-in retries the ones that
 * did not land.
 */
export const CircleMigrationHydrator = (): null => {
    const mx = useMatrixClient();
    const userId = mx.getUserId();

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;

        void (async () => {
            try {
                if (hasMigrated(readMarker(mx))) return;
                const friends = readFriends(mx);
                if (friends.length === 0) return;

                const following = await fetchCircleFollowing();
                if (cancelled) return;

                const pending = pendingCircleFollows({
                    friends,
                    alreadyFollowing: new Set(
                        following.map((entry) => entry.matrixUserId ?? entry.userId)
                    ),
                    viewerId: userId,
                });

                // Nothing left to do, but still mark it so this stops running.
                if (pending.length === 0) {
                    await writeMarker(mx);
                    return;
                }

                const outcome = await reconcileFriendsToCircle(pending, async (id) => {
                    await followInCircle(id);
                });
                if (cancelled) return;

                // Only a clean run is marked done; a partial one retries next time
                // rather than silently costing someone a relationship.
                if (outcome.complete) {
                    await writeMarker(mx);
                }
            } catch {
                // Non-fatal by design: the marker is not written, so this simply
                // runs again on the next sign-in.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [mx, userId]);

    return null;
};

export default CircleMigrationHydrator;
