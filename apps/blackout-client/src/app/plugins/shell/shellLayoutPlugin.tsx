import React, { Suspense, lazy } from 'react';
import { isRuntimePluginEnabled } from '../manifest';

const LegacyClientLayout = lazy(() => import('../../pages/client/LegacyClientLayout'));

export const shellLayoutPlugin = {
    id: 'shell.legacy-layout' as const,
    hasLegacyFallbackEnabled: (): boolean => isRuntimePluginEnabled('shell.legacy-layout'),
    renderLegacyFallbackLayout: (): JSX.Element => (
        <Suspense fallback={null}>
            <LegacyClientLayout />
        </Suspense>
    ),
    // Back-compat aliases while call sites migrate to explicit fallback naming.
    isEnabled(): boolean {
        return this.hasLegacyFallbackEnabled();
    },
    renderLegacyLayout(): JSX.Element {
        return this.renderLegacyFallbackLayout();
    },
};
