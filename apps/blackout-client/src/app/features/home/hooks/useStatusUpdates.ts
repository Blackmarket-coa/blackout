import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { matrixClientAtom } from '../../../state/auth';
import { fetchProfile } from '../../profile/profileClient';
import type { MemberProfile } from '../../profile/profileTypes';
import type { StatusEntry } from '../unifiedFeedModel';

const isLiveStatus = (expiresAt: string | undefined, now: number): boolean => {
    if (!expiresAt) return true;
    const ts = Date.parse(expiresAt);
    return !Number.isFinite(ts) || ts > now;
};

const toEntry = (profile: MemberProfile, now: number): StatusEntry | null => {
    const status = profile.profile?.status;
    if (!status?.text || !isLiveStatus(status.expiresAt, now)) return null;
    return {
        userId: profile.userId,
        displayName: profile.displayName || profile.userId,
        text: status.text,
        emoji: status.emoji,
    };
};

/**
 * Best-effort, client-only status feed: fetch the current user's profile,
 * read their top-friends list, fetch those profiles, and surface any
 * non-expired statuses. N+1 by nature (no batch/global endpoint) so it's
 * capped at top-friends and fails silently — a status fetch error never
 * blocks the rest of the home feed.
 */
export function useStatusUpdates(enabled: boolean): StatusEntry[] {
    const client = useAtomValue(matrixClientAtom);
    const userId = client?.getUserId() ?? null;
    const [entries, setEntries] = useState<StatusEntry[]>([]);
    const requestId = useRef(0);

    useEffect(() => {
        if (!enabled || !userId) {
            setEntries([]);
            return;
        }
        const id = ++requestId.current;
        void (async () => {
            try {
                const me = await fetchProfile(userId);
                const friendIds = (me.profile?.topFriends?.userIds ?? []).filter(
                    (fid) => fid && fid !== userId
                );
                const friendResults = await Promise.allSettled(
                    friendIds.map((fid) => fetchProfile(fid))
                );
                if (id !== requestId.current) return;
                const now = Date.now();
                const collected = [
                    me,
                    ...friendResults.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
                ]
                    .map((profile) => toEntry(profile, now))
                    .filter((entry): entry is StatusEntry => entry !== null);
                setEntries(collected);
            } catch {
                if (id !== requestId.current) return;
                setEntries([]);
            }
        })();
    }, [enabled, userId]);

    return entries;
}
