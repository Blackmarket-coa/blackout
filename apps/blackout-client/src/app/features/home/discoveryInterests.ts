import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClientEvent, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk';
import { useMatrixClientOrNull } from '../../hooks/useMatrixClient';

/**
 * Account-data key holding the topic tags a user picked during onboarding.
 * Read by `useUnifiedFeed` to boost matching feed items so the Home feed
 * reflects stated interests on first load. Kept separate from the onboarding
 * progress snapshot so the feed can read it without depending on onboarding
 * internals.
 */
export const DISCOVERY_INTERESTS_KEY = 'co.bmc.discovery.interests.v1';

interface PersistedInterests {
    tags?: unknown;
    updatedAt?: number;
}

type AccountDataReader = {
    getAccountData?: (type: string) => { getContent: () => unknown } | undefined;
};

type AccountDataWriter = {
    setAccountData: (type: string, content: Record<string, unknown>) => Promise<unknown>;
};

export const readDiscoveryInterestTags = (client: MatrixClient): string[] => {
    const reader = client as unknown as AccountDataReader;
    const content = reader.getAccountData?.(DISCOVERY_INTERESTS_KEY)?.getContent() as
        | PersistedInterests
        | undefined;
    if (!content || !Array.isArray(content.tags)) return [];
    return content.tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
};

export const writeDiscoveryInterestTags = async (
    client: MatrixClient,
    tags: readonly string[]
): Promise<void> => {
    const writer = client as unknown as AccountDataWriter;
    const unique = Array.from(
        new Set(tags.filter((tag) => typeof tag === 'string' && tag.length > 0))
    );
    await writer.setAccountData(DISCOVERY_INTERESTS_KEY, {
        tags: unique,
        updatedAt: Date.now(),
    });
};

/**
 * Reads the viewer's saved interest tags and stays subscribed to account-data
 * pushes on the key, so a topic followed mid-session (see
 * {@link useTopicFollows}) re-ranks the feed without a remount.
 */
export const useDiscoveryInterestTags = (): ReadonlySet<string> => {
    const client = useMatrixClientOrNull();
    const [tags, setTags] = useState<string[]>(() =>
        client ? readDiscoveryInterestTags(client) : []
    );

    useEffect(() => {
        if (!client) return;
        setTags(readDiscoveryInterestTags(client));
        const onAccountData = (event: MatrixEvent) => {
            if (event.getType() !== DISCOVERY_INTERESTS_KEY) return;
            setTags(readDiscoveryInterestTags(client));
        };
        client.on(ClientEvent.AccountData, onAccountData);
        return () => {
            client.removeListener(ClientEvent.AccountData, onAccountData);
        };
    }, [client]);

    return useMemo(() => new Set(tags), [tags]);
};

export interface TopicFollows {
    /** Followed topics with any in-flight follow/unfollow applied on top. */
    followed: ReadonlySet<string>;
    isFollowing: (tag: string) => boolean;
    follow: (tag: string) => Promise<void>;
    unfollow: (tag: string) => Promise<void>;
    /** False when there is no signed-in Matrix client to persist against. */
    canFollow: boolean;
}

/**
 * Follow/unfollow topics. Follows persist into the same account-data key the
 * onboarding interest picker writes, so a followed topic immediately becomes a
 * feed-boost tag everywhere `useDiscoveryInterestTags` is read. Writes go
 * through a read-modify-write of the stored list; an optimistic overlay keeps
 * the UI instant while the server echo catches up, and reverts on failure.
 */
export const useTopicFollows = (): TopicFollows => {
    const client = useMatrixClientOrNull();
    const stored = useDiscoveryInterestTags();
    const [overrides, setOverrides] = useState<Record<string, boolean>>({});

    // Drop overrides the synced store has confirmed.
    useEffect(() => {
        setOverrides((prev) => {
            const entries = Object.entries(prev).filter(
                ([tag, following]) => stored.has(tag) !== following
            );
            return entries.length === Object.keys(prev).length ? prev : Object.fromEntries(entries);
        });
    }, [stored]);

    const followed = useMemo(() => {
        const merged = new Set(stored);
        for (const [tag, following] of Object.entries(overrides)) {
            if (following) merged.add(tag);
            else merged.delete(tag);
        }
        return merged as ReadonlySet<string>;
    }, [stored, overrides]);

    const write = useCallback(
        async (tag: string, following: boolean) => {
            const trimmed = tag.trim();
            if (!client || !trimmed) return;
            setOverrides((prev) => ({ ...prev, [trimmed]: following }));
            try {
                const current = readDiscoveryInterestTags(client);
                const next = following
                    ? [...current, trimmed]
                    : current.filter((existing) => existing !== trimmed);
                await writeDiscoveryInterestTags(client, next);
            } catch (error) {
                setOverrides((prev) => {
                    const { [trimmed]: _dropped, ...rest } = prev;
                    return rest;
                });
                throw error;
            }
        },
        [client]
    );

    const follow = useCallback((tag: string) => write(tag, true), [write]);
    const unfollow = useCallback((tag: string) => write(tag, false), [write]);
    const isFollowing = useCallback((tag: string) => followed.has(tag.trim()), [followed]);

    return { followed, isFollowing, follow, unfollow, canFollow: client !== null };
};
