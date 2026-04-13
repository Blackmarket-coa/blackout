import React, { ReactNode } from 'react';
import { Box, Line } from 'folds';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { shellLayoutPlugin } from '../../plugins/shell/shellLayoutPlugin';

type ClientLayoutProps = {
    nav?: ReactNode;
    children?: ReactNode;
};

export function ClientLayout({ nav, children }: ClientLayoutProps) {
    const screenSize = useScreenSizeContext();

    if (shellLayoutPlugin.isEnabled()) {
        return shellLayoutPlugin.renderLegacyLayout();
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
