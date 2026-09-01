import { useEffect } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { FRIENDS_ACCOUNT_DATA_KEY, parseFriends } from '../friends/friendsModel';
import { fetchCircleFollowing, followInCircle } from './circleClient';
import {
    hasMigrated,
    pendingCircleFollows,
    reconcileFriendsToCircle,
    withMigrationMarker,
    type FriendsAccountData,
} from './friendsToCircle';

const readFriendsData = (mx: MatrixClient): FriendsAccountData => {
    const client = mx as unknown as {
        getAccountData: (type: string) => { getContent: () => unknown } | undefined;
    };
    const raw = client.getAccountData(FRIENDS_ACCOUNT_DATA_KEY)?.getContent() as
        | Record<string, unknown>
        | undefined;
    const parsed = parseFriends(raw);
    return {
        friends: parsed.friends,
        outgoing: parsed.outgoing,
        circleMigratedAt:
            typeof raw?.circleMigratedAt === 'string' ? raw.circleMigratedAt : undefined,
    };
};

const writeFriendsData = async (mx: MatrixClient, data: FriendsAccountData): Promise<void> => {
    const client = mx as unknown as {
        setAccountData: (type: string, content: Record<string, unknown>) => Promise<unknown>;
    };
    await client.setAccountData(FRIENDS_ACCOUNT_DATA_KEY, {
        ...data,
    } as unknown as Record<string, unknown>);
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
                const data = readFriendsData(mx);
                if (hasMigrated(data) || data.friends.length === 0) return;

                const following = await fetchCircleFollowing();
                if (cancelled) return;

                const pending = pendingCircleFollows({
                    friends: data.friends,
                    alreadyFollowing: new Set(
                        following.map((entry) => entry.matrixUserId ?? entry.userId)
                    ),
                    viewerId: userId,
                });

                // Nothing left to do, but still mark it so this stops running.
                if (pending.length === 0) {
                    await writeFriendsData(mx, withMigrationMarker(data));
                    return;
                }

                const outcome = await reconcileFriendsToCircle(pending, async (id) => {
                    await followInCircle(id);
                });
                if (cancelled) return;

                // Only a clean run is marked done; a partial one retries next time
                // rather than silently costing someone a relationship.
                if (outcome.complete) {
                    await writeFriendsData(mx, withMigrationMarker(data));
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
