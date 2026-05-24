import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { matrixClientAtom } from '../../../state/auth';
import { homeFeedRefreshAtom } from '../../../state/homeFeed';
import { fetchFollowing, fetchProfile, fetchWall } from '../../profile/profileClient';
import type { MemberProfile } from '../../profile/profileTypes';
import type { StatusEntry, WallEntry } from '../unifiedFeedModel';

const AUTHOR_CAP = 12;
const WALL_POSTS_PER_AUTHOR = 3;

const isLiveStatus = (expiresAt: string | undefined, now: number): boolean => {
    if (!expiresAt) return true;
    const ts = Date.parse(expiresAt);
    return !Number.isFinite(ts) || ts > now;
};

const toStatusEntry = (profile: MemberProfile, now: number): StatusEntry | null => {
    const status = profile.profile?.status;
    if (!status?.text || !isLiveStatus(status.expiresAt, now)) return null;
    return {
        userId: profile.userId,
        displayName: profile.displayName || profile.userId,
        text: status.text,
        emoji: status.emoji,
    };
};

export interface FollowedActivity {
    statuses: StatusEntry[];
    walls: WallEntry[];
}

const EMPTY: FollowedActivity = { statuses: [], walls: [] };

/**
 * Best-effort, client-only fanout that surfaces the viewer's own and their
 * followed users' (and top-friends') statuses and recent wall posts. N+1 by
 * nature — no batch/global endpoint exists — so the author set is capped and
 * every fetch is isolated; a failure never blocks the rest of the home feed.
 */
export function useFollowedActivity(enabled: boolean): FollowedActivity {
    const client = useAtomValue(matrixClientAtom);
    const meId = client?.getUserId() ?? null;
    const refreshKey = useAtomValue(homeFeedRefreshAtom);
    const [activity, setActivity] = useState<FollowedActivity>(EMPTY);
    const requestId = useRef(0);

    useEffect(() => {
        if (!enabled || !meId) {
            setActivity(EMPTY);
            return;
        }
        const id = ++requestId.current;
        void (async () => {
            // Resolve the author set: me + people I follow + my top friends.
            const authorIds = new Set<string>([meId]);
            try {
                const { following } = await fetchFollowing();
                for (const f of following) {
                    if (f.matrixUserId) authorIds.add(f.matrixUserId);
                }
            } catch {
                /* following is best-effort */
            }
            try {
                const me = await fetchProfile(meId);
                for (const fid of me.profile?.topFriends?.userIds ?? []) authorIds.add(fid);
            } catch {
                /* topFriends is best-effort */
            }

            const ids = [...authorIds].slice(0, AUTHOR_CAP + 1);
            const [profiles, walls] = await Promise.all([
                Promise.allSettled(ids.map((uid) => fetchProfile(uid))),
                Promise.allSettled(ids.map((uid) => fetchWall(uid))),
            ]);
            if (id !== requestId.current) return;

            const now = Date.now();
            const displayNameById = new Map<string, string>();
            const statuses: StatusEntry[] = [];
            for (const result of profiles) {
                if (result.status !== 'fulfilled') continue;
                const profile = result.value;
                displayNameById.set(profile.userId, profile.displayName || profile.userId);
                const entry = toStatusEntry(profile, now);
                if (entry) statuses.push(entry);
            }

            const wallEntries: WallEntry[] = [];
            for (const result of walls) {
                if (result.status !== 'fulfilled') continue;
                const { userId, posts } = result.value;
                const owner = displayNameById.get(userId) ?? userId;
                for (const post of posts.slice(0, WALL_POSTS_PER_AUTHOR)) {
                    wallEntries.push({
                        id: post.id,
                        ownerUserId: post.profileUserId,
                        ownerDisplayName: owner,
                        body: post.body,
                        authorId: post.authorId,
                        createdAt: post.createdAt,
                    });
                }
            }

            setActivity({ statuses, walls: wallEntries });
        })();
    }, [enabled, meId, refreshKey]);

    return activity;
}
