import { useEffect, type CSSProperties } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { shellModeAtom } from '../../state/navigation';
import { createSpaceModalAtom } from '../../state/createSpaceModal';
import { createRoomModalAtom } from '../../state/createRoomModal';
import { searchModalAtom } from '../../state/searchModal';
import { isMobileViewport } from '../client/layoutMetrics';
import { useViewportWidth } from '../../hooks/useViewportWidth';
import { resolveShellMode } from './modeRouter';
import { BottomTabBar } from './BottomTabBar';
import { MobileTopBar } from './MobileTopBar';
import { DynamicRightPanel } from './DynamicRightPanel';
import { WorkspaceTabBar } from './WorkspaceTabBar';

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
    const setCreateSpaceModal = useSetAtom(createSpaceModalAtom);
    const setCreateRoomModal = useSetAtom(createRoomModalAtom);
    const setSearchModal = useSetAtom(searchModalAtom);
    const viewportWidth = useViewportWidth();
    const mobile = isMobileViewport(viewportWidth);

    const mode = resolveShellMode(location.pathname);
    useEffect(() => {
        setShellMode(mode);
    }, [mode, setShellMode]);

    // Bridge so the navigation audit (tools/audit-navigation/crawl-web.ts
    // and playwright/e2e/navigation-audit/modal-closure.spec.ts) can open
    // every registered modal deterministically. Enabled in dev builds and
    // whenever the audit driver sets `window.__BLACKOUT_AUDIT__ = true`
    // via Playwright's `addInitScript`, so the same wiring works against
    // `vite preview` production bundles.
    useEffect(() => {
        const win = window as unknown as {
            __BLACKOUT_AUDIT__?: boolean;
            __openModal?: (name: string) => void;
            __closeModal?: (name: string) => void;
        };
        if (!import.meta.env.DEV && win.__BLACKOUT_AUDIT__ !== true) return undefined;
        const open: Record<string, () => void> = {
            createSpace: () => setCreateSpaceModal({}),
            createRoom: () => setCreateRoomModal({}),
            search: () => setSearchModal(true),
        };
        const close: Record<string, () => void> = {
            createSpace: () => setCreateSpaceModal(undefined),
            createRoom: () => setCreateRoomModal(undefined),
            search: () => setSearchModal(false),
        };
        win.__openModal = (name) => {
            const opener = open[name];
            if (!opener) {
                // eslint-disable-next-line no-console
                console.warn(`__openModal: no opener wired for "${name}"`);
                return;
            }
            opener();
        };
        win.__closeModal = (name) => {
            const closer = close[name];
            if (closer) closer();
        };
        return () => {
            delete win.__openModal;
            delete win.__closeModal;
        };
    }, [setCreateSpaceModal, setCreateRoomModal, setSearchModal]);

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
                    {mobile ? null : <WorkspaceTabBar />}
                    <Outlet />
                </main>
                {mobile ? null : <DynamicRightPanel />}
            </div>
            {mobile ? <BottomTabBar /> : null}
        </div>
    );
};

export default AppShell;
