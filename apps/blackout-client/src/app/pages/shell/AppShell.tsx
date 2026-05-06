import { useEffect, type CSSProperties } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { shellModeAtom } from '../../state/navigation';
import { isMobileViewport } from '../client/layoutMetrics';
import { useViewportWidth } from '../../hooks/useViewportWidth';
import { resolveShellMode } from './modeRouter';
import { BottomTabBar } from './BottomTabBar';
import { MobileTopBar } from './MobileTopBar';
import { DynamicRightPanel } from './DynamicRightPanel';

const ROOT_STYLE: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const BODY_DESKTOP_STYLE: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    flex: 1,
    minHeight: 0,
    width: '100%',
    overflow: 'hidden',
};

const BODY_MOBILE_STYLE: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    width: '100%',
};

const OUTLET_DESKTOP_STYLE: CSSProperties = {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
};

const OUTLET_MOBILE_STYLE: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
};

/**
 * AppShell is the canonical wrapper around every routed destination when
 * the `shellAppShell` feature flag is enabled. It owns:
 *   1. mode resolution (route → ShellMode → atom)
 *   2. mobile bottom-tab bar + mode-aware top bar
 *   3. desktop dynamic right-panel slot
 *
 * Destination components render through `<Outlet />`. They retain full
 * control over their own internal layout (e.g. ClientLayout still owns
 * its 3-column chat shell when mounted under `/communities/...`); the
 * shell only adds outer chrome.
 *
 * The shell deliberately avoids remounting on mode change so Matrix
 * sync, Jotai atoms, and Capacitor lifecycle subscribers stay alive.
 */
export const AppShell = () => {
    const location = useLocation();
    const setShellMode = useSetAtom(shellModeAtom);
    const viewportWidth = useViewportWidth();
    const mobile = isMobileViewport(viewportWidth);

    const mode = resolveShellMode(location.pathname);
    useEffect(() => {
        setShellMode(mode);
    }, [mode, setShellMode]);

    return (
        <div
            style={ROOT_STYLE}
            data-shell="app"
            data-shell-mode={mode}
            data-shell-viewport={mobile ? 'mobile' : 'desktop'}
        >
            {mobile ? <MobileTopBar /> : null}
            <div style={mobile ? BODY_MOBILE_STYLE : BODY_DESKTOP_STYLE}>
                <main style={mobile ? OUTLET_MOBILE_STYLE : OUTLET_DESKTOP_STYLE}>
                    <Outlet />
                </main>
                {mobile ? null : <DynamicRightPanel />}
            </div>
            {mobile ? <BottomTabBar /> : null}
        </div>
    );
};

export default AppShell;
