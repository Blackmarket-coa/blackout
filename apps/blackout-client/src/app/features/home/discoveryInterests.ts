import { useEffect, useMemo, useState } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
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
 * Reads the viewer's saved interest tags once on mount. Not reactive to live
 * account-data pushes — onboarding writes the key before the user reaches
 * Home, so a mount-time read is enough for v1.
 */
export const useDiscoveryInterestTags = (): ReadonlySet<string> => {
    const client = useMatrixClientOrNull();
    const [tags, setTags] = useState<string[]>(() =>
        client ? readDiscoveryInterestTags(client) : []
    );

    useEffect(() => {
        if (!client) return;
        setTags(readDiscoveryInterestTags(client));
    }, [client]);

    return useMemo(() => new Set(tags), [tags]);
};
