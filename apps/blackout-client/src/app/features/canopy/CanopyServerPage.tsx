import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Link, useParams } from 'react-router';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/navigation';
import { joinedRoomsAtom } from '../../state/rooms';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useViewportWidth } from '../../hooks/useViewportWidth';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { CANOPIES_PATH } from '../../pages/paths';
import { CanopyRail } from '../../pages/shell/CanopyRail';
import { isMobileViewport, isTabletViewport } from '../../pages/client/layoutMetrics';
import { CanopyChannelSidebar } from './CanopyChannelSidebar';
import { CanopyDenSurface, type RightDock } from './CanopyDenSurface';
import { CanopyMemberPanel } from './CanopyMemberPanel';
import { CanopyThreadsPanel } from './CanopyThreadsPanel';
import { CanopyPinsPanel } from './CanopyPinsPanel';
import { CanopySettingsDialog } from './CanopySettingsDialog';
import { CanopyWelcomeGate } from './CanopyWelcomeGate';

const ROW_STYLE: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'row',
    width: '100%',
    height: '100%',
    minHeight: 0,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
};

const Drawer = ({
    side,
    onClose,
    width,
    children,
}: {
    side: 'left' | 'right';
    onClose: () => void;
    /** Fixed drawer width; defaults to content-sized capped at 85%. */
    width?: string;
    children: ReactNode;
}) => (
    <>
        <div
            onClick={onClose}
            data-testid="canopy-drawer-scrim"
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 30 }}
        />
        <div
            style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                ...(side === 'left' ? { left: 0 } : { right: 0 }),
                zIndex: 31,
                display: 'flex',
                ...(width ? { width, maxWidth: width } : { maxWidth: '85%' }),
                boxShadow:
                    side === 'left' ? '4px 0 24px rgba(0,0,0,0.4)' : '-4px 0 24px rgba(0,0,0,0.4)',
            }}
        >
            {children}
        </div>
    </>
);

/**
 * Discord-style server page for the open canopy. Assembles existing building
 * blocks into a responsive layout: channel rail (`CanopyChannelSidebar`),
 * chat/voice surface (`CanopyDenSurface`), and a right dock that toggles
 * between the member list (`CanopyMemberPanel`) and threads
 * (`CanopyThreadsPanel`). On narrow viewports the rail and dock collapse into
 * slide-in drawers. Mounted by `CommunitiesRoute` on the canonical
 * `/communities/:canopyId(/dens/:denId)` route when `canopyServer` is on.
 */
export const CanopyServerPage = () => {
    const selectedSpaceId = useAtomValue(selectedSpaceIdAtom);
    const selectedRoomId = useAtomValue(selectedRoomIdAtom);
    const rooms = useAtomValue(joinedRoomsAtom);
    const mx = useMatrixClient();
    // Breakpoints come from the shared design tokens (mobileMaxPx /
    // tabletMaxPx), so this page flips to compact exactly when the AppShell
    // flips to its mobile chrome — the old local 768/1100 constants left a
    // 751–767px dead zone with a drawer but no rail.
    const width = useViewportWidth();
    const compact = isMobileViewport(width);
    const dockInline = !isTabletViewport(width);
    // The canopy-only and den routes are separate route entries, so switching
    // canopies from the drawer's rail remounts this page. Deriving the initial
    // drawer state from the route (open on a canopy root, closed on a den)
    // keeps the drawer up while the user hops between canopies — Discord's
    // mobile behavior — and route params are synchronously correct at mount,
    // unlike the selection atoms which CommunitiesRoute writes in an effect.
    const { denId: routeDenId } = useParams<{ denId?: string }>();

    const [rightDock, setRightDock] = useState<RightDock>(() =>
        typeof window !== 'undefined' && !isTabletViewport(window.innerWidth) ? 'members' : null
    );
    const [channelsOpen, setChannelsOpen] = useState(
        () => typeof window !== 'undefined' && isMobileViewport(window.innerWidth) && !routeDenId
    );
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Closing the channel drawer whenever the layout stops being compact keeps
    // the overlay from lingering after a resize back to desktop.
    useEffect(() => {
        if (!compact) setChannelsOpen(false);
    }, [compact]);

    const canopy =
        rooms.find((room) => room.roomId === selectedSpaceId && room.getType() === 'm.space') ??
        null;

    if (!canopy) {
        return (
            <div
                style={{
                    ...ROW_STYLE,
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 32,
                }}
                data-testid="canopy-server-page-empty"
            >
                <div style={{ textAlign: 'center', maxWidth: 420 }}>
                    <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>
                        Pick a {BLACKOUT_TERMS.canopy.singular}
                    </h2>
                    <p style={{ margin: '0 0 16px', color: 'var(--text-muted)' }}>
                        Choose a {BLACKOUT_TERMS.canopy.singular} from the left, or browse all of
                        yours.
                    </p>
                    <Link
                        to={CANOPIES_PATH}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            padding: '8px 14px',
                            color: 'var(--text-primary)',
                            textDecoration: 'none',
                        }}
                    >
                        Browse {BLACKOUT_TERMS.canopy.plural}
                    </Link>
                </div>
            </div>
        );
    }

    const memberRoom = (selectedRoomId ? mx.getRoom(selectedRoomId) : null) ?? canopy;
    const toggleDock = (dock: Exclude<RightDock, null>) =>
        setRightDock((current) => (current === dock ? null : dock));

    const dockContent =
        rightDock === 'members' ? (
            <CanopyMemberPanel room={memberRoom} />
        ) : rightDock === 'threads' && selectedRoomId ? (
            <CanopyThreadsPanel roomId={selectedRoomId} />
        ) : rightDock === 'pins' && selectedRoomId ? (
            <CanopyPinsPanel roomId={selectedRoomId} />
        ) : null;

    return (
        <section style={ROW_STYLE} data-testid="canopy-server-page" data-shell-region="room">
            {compact ? null : (
                <CanopyChannelSidebar
                    canopy={canopy}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onNavigate={() => setChannelsOpen(false)}
                />
            )}
            {compact && channelsOpen ? (
                <Drawer side="left" width="min(85%, 336px)" onClose={() => setChannelsOpen(false)}>
                    {/* `compact` now equals the AppShell's mobile switch, so the
                        shell rail is never mounted at the same time as this one. */}
                    <CanopyRail variant="drawer" />
                    <CanopyChannelSidebar
                        canopy={canopy}
                        fluid
                        onOpenSettings={() => setSettingsOpen(true)}
                        onNavigate={() => setChannelsOpen(false)}
                    />
                </Drawer>
            ) : null}

            <CanopyDenSurface
                denId={selectedRoomId}
                canopy={canopy}
                rightDock={rightDock}
                compact={compact}
                onOpenChannels={() => setChannelsOpen(true)}
                onToggleMembers={() => toggleDock('members')}
                onToggleThreads={() => toggleDock('threads')}
                onTogglePins={() => toggleDock('pins')}
            />

            {dockContent && dockInline ? dockContent : null}
            {dockContent && !dockInline ? (
                <Drawer side="right" onClose={() => setRightDock(null)}>
                    {dockContent}
                </Drawer>
            ) : null}

            {settingsOpen ? (
                <CanopySettingsDialog canopy={canopy} onClose={() => setSettingsOpen(false)} />
            ) : null}

            <CanopyWelcomeGate key={canopy.roomId} canopy={canopy} />
        </section>
    );
};

export default CanopyServerPage;
