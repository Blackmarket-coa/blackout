import React, { ReactNode, Suspense, lazy } from 'react';
import { Box, Line } from 'folds';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { defaultFeatureFlags } from '../../core/features/featureFlags';

type ClientLayoutProps = {
    nav?: ReactNode;
    children?: ReactNode;
};

const LegacyClientLayout = lazy(() => import('./LegacyClientLayout'));

/**
 * Minimal shell extension point.
 *
 * PR-2 baseline keeps Cinny-compatible shell structure by default and allows
 * opt-in fallback to the detached legacy shell only through a named feature flag.
 */
export function ClientLayout({ nav, children }: ClientLayoutProps) {
    const screenSize = useScreenSizeContext();

    if (defaultFeatureFlags.legacyShellLayout) {
        return (
            <Suspense fallback={null}>
                <LegacyClientLayout />
            </Suspense>
        );
    }

    return (
        <Box grow="Yes">
            {nav}
            {screenSize !== ScreenSize.Mobile && (
                <Line
                    data-testid="client-shell-separator"
                    variant="Background"
                    direction="Vertical"
                    size="300"
                />
            )}
            {children}
        </Box>
    );
}

export default ClientLayout;
