import { useEffect, useState } from 'react';
import type { Bounty } from '@blackout/core';
import { fetchBounties } from '../../bounty/bountyClient';

export interface BountyBoardState {
    bounties: Bounty[];
    loading: boolean;
}

/**
 * Standalone home-feed source for the Bounty Board. Deliberately NOT folded
 * into `useUnifiedFeed`: bounties are a categorized board, not time-ranked feed
 * cards, and keeping the fetch isolated means a bounty-API outage degrades to an
 * empty board without ever touching the main feed (a rejected fetch is swallowed
 * to `[]`). Returns `[]` immediately and issues no request when `enabled` is
 * false, so the slice ships dark behind its feature flag.
 */
export function useBountyBoard(enabled: boolean): BountyBoardState {
    const [bounties, setBounties] = useState<Bounty[]>([]);
    const [loading, setLoading] = useState(enabled);

    useEffect(() => {
        if (!enabled) {
            setBounties([]);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        fetchBounties({ status: 'open' })
            .then((res) => {
                if (!cancelled) setBounties(res.bounties);
            })
            .catch(() => {
                if (!cancelled) setBounties([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [enabled]);

    return { bounties, loading };
}
