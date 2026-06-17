import { type CSSProperties, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Link } from 'react-router-dom';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/navigation';
import { joinedRoomsAtom } from '../../state/rooms';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { CANOPIES_PATH } from '../../pages/paths';
import { CanopyChannelSidebar } from './CanopyChannelSidebar';
import { CanopyDenSurface } from './CanopyDenSurface';
import { CanopyMemberPanel } from './CanopyMemberPanel';
import { CanopySettingsDialog } from './CanopySettingsDialog';

const ROW_STYLE: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    width: '100%',
    height: '100%',
    minHeight: 0,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
};

const MEMBER_PANEL_MIN_WIDTH = 1100;

/** Hide the docked member list automatically on narrow viewports. */
const useWideViewport = (breakpoint: number): boolean => {
    const [wide, setWide] = useState(
        () => typeof window === 'undefined' || window.innerWidth >= breakpoint
    );
    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const onResize = () => setWide(window.innerWidth >= breakpoint);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [breakpoint]);
    return wide;
};

/**
 * Discord-style server page for the open canopy. Assembles existing building
 * blocks into a three-column layout: channel rail (`CanopyChannelSidebar`),
 * chat/voice surface (`CanopyDenSurface`), and a docked member list
 * (`CanopyMemberPanel`). Mounted by `CommunitiesRoute` on the canonical
 * `/communities/:canopyId(/dens/:denId)` route when the `canopyServer` flag is
 * on, so deep links, `?event=` jumps, and notifications keep working.
 */
export const CanopyServerPage = () => {
    const selectedSpaceId = useAtomValue(selectedSpaceIdAtom);
    const selectedRoomId = useAtomValue(selectedRoomIdAtom);
    const rooms = useAtomValue(joinedRoomsAtom);
    const mx = useMatrixClient();
    const wide = useWideViewport(MEMBER_PANEL_MIN_WIDTH);
    const [membersWanted, setMembersWanted] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const canopy =
        rooms.find((room) => room.roomId === selectedSpaceId && room.getType() === 'm.space') ?? null;

    if (!canopy) {
        return (
            <div
                style={{ ...ROW_STYLE, alignItems: 'center', justifyContent: 'center', padding: 32 }}
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

    const membersVisible = membersWanted && wide;
    const memberRoom = (selectedRoomId ? mx.getRoom(selectedRoomId) : null) ?? canopy;

    return (
        <section style={ROW_STYLE} data-testid="canopy-server-page" data-shell-region="room">
            <CanopyChannelSidebar canopy={canopy} onOpenSettings={() => setSettingsOpen(true)} />
            <CanopyDenSurface
                denId={selectedRoomId}
                canopy={canopy}
                membersVisible={membersVisible}
                onToggleMembers={() => setMembersWanted((value) => !value)}
            />
            {membersVisible && memberRoom ? <CanopyMemberPanel room={memberRoom} /> : null}
            {settingsOpen ? (
                <CanopySettingsDialog canopy={canopy} onClose={() => setSettingsOpen(false)} />
            ) : null}
        </section>
    );
};

export default CanopyServerPage;
