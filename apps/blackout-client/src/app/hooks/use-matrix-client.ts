import { useMemo } from 'react';
import { createMatrixClient } from '../../client/matrix-client';
import type { SessionSnapshot } from '../../client/session';

export const useMatrixClient = (session: SessionSnapshot | null) => {
    return useMemo(() => {
        if (!session) return null;
        return createMatrixClient(session);
    }, [session]);
};
