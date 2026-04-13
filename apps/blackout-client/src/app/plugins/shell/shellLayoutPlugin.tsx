import React, { Suspense, lazy } from 'react';
import { isRuntimePluginEnabled } from '../manifest';

const LegacyClientLayout = lazy(() => import('../../pages/client/LegacyClientLayout'));

export const shellLayoutPlugin = {
    id: 'shell.legacy-layout' as const,
    isEnabled: (): boolean => isRuntimePluginEnabled('shell.legacy-layout'),
    renderLegacyLayout: (): JSX.Element => (
        <Suspense fallback={null}>
            <LegacyClientLayout />
        </Suspense>
    ),
};
