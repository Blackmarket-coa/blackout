import { createElement, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { selectedRoomIdAtom } from '../../state/bmc-navigation';
import type { FeatureRoute } from '../../core/features/types';
import { DeadmanSwitchPanel } from './DeadmanSwitchPanel';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const DeadmanRoutePage = () => {
    const roomId = useAtomValue(selectedRoomIdAtom);
    const token = readBlackoutApiToken();
    const apiClient = useMemo(() => createAuthorizedApiClient(token), [token]);

    if (!token) {
        return createElement(
            'p',
            { style: { padding: 12 } },
            'Sign in to manage deadman switches.'
        );
    }

    return createElement(DeadmanSwitchPanel, {
        apiClient,
        roomId,
    });
};

export const deadmanRoutes: FeatureRoute[] = [
    { path: '/deadman', component: DeadmanRoutePage },
];

export { DeadmanRoutePage };
