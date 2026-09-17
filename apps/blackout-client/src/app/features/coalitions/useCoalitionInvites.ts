import { useCallback, useEffect, useState } from 'react';
import { fetchMyInvites, type CoalitionInviteView } from './coalitionsClient';

/**
 * Invitations addressed to the signed-in user. Fetched on mount and on demand;
 * the count badges the canopies hub tab the way pending friend requests used to.
 * Degrades to an empty list when the API is unreachable (Matrix-only sessions).
 */
export function useCoalitionInvites(): {
    invites: CoalitionInviteView[];
    loaded: boolean;
    refresh: () => Promise<void>;
} {
    const [invites, setInvites] = useState<CoalitionInviteView[]>([]);
    const [loaded, setLoaded] = useState(false);

    const refresh = useCallback(async () => {
        try {
            setInvites(await fetchMyInvites());
        } catch {
            setInvites([]);
        } finally {
            setLoaded(true);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetchMyInvites()
            .then((rows) => {
                if (!cancelled) setInvites(rows);
            })
            .catch(() => {
                if (!cancelled) setInvites([]);
            })
            .finally(() => {
                if (!cancelled) setLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return { invites, loaded, refresh };
}
