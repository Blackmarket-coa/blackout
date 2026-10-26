import { useMemo } from 'react';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';
import { ReleaseKeysPanel } from './ReleaseKeysPanel';

/** Settings → Release keys, bound to the signed-in account's API session. */
const ReleaseKeysSettings = () => {
    const token = readBlackoutApiToken();
    const apiClient = useMemo(() => createAuthorizedApiClient(token), [token]);

    if (!token) {
        return <p style={{ padding: 12 }}>Sign in to set up release keys.</p>;
    }
    return <ReleaseKeysPanel apiClient={apiClient} />;
};

export default ReleaseKeysSettings;
