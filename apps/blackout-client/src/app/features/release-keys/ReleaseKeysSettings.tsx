import { useMemo } from 'react';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';
import { ReleaseKeysPanel } from './ReleaseKeysPanel';

/** Settings → Release keys, bound to the signed-in account's API session. */
const ReleaseKeysSettings = () => {
    const token = readBlackoutApiToken();
    // No token is bound in: each request reads the stored one. After "Sign out
    // every Blackout session" a token bound at render would be sent on every
    // request, refused, and wiped along with the fresh one the retry stored,
    // costing an exchange per request against the auth rate limit.
    const apiClient = useMemo(() => createAuthorizedApiClient(null), []);

    if (!token) {
        return <p style={{ padding: 12 }}>Sign in to set up release keys.</p>;
    }
    return <ReleaseKeysPanel apiClient={apiClient} />;
};

export default ReleaseKeysSettings;
