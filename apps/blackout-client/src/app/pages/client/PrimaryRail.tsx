import React, { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { RegistrySidebarList } from '../../core/features/RegistrySidebarList';
import { ThreadUnreadBadgeMount } from '../../features/auth-threads';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

type PrimaryRailProps = {
    /**
     * Home button rendered above the registry-driven entries. Owned by
     * ClientLayout so the click can both navigate and clear room/space
     * selection.
     */
    homeButton: ReactNode;
    /**
     * Optional global "create an invite link" button, pinned directly
     * below Home so it's reachable from anywhere in the app — not just
     * from inside a specific Den. Owned by ClientLayout so it can hold
     * the modal-open state next to the rest of the rail wiring.
     */
    inviteButton?: ReactNode;
    /**
     * The canopy (Matrix space) drag/drop block, owned by ClientLayout so
     * the rail does not reach into space-list state. The rail simply slots
     * it in between the registry-driven system entries and the bottom
     * controls.
     */
    canopyBlock: ReactNode;
    /** Click handler for the bottom "create canopy" affordance. */
    onCreateCanopy: () => void;
    /** Optional avatar button (settings entry) rendered at the bottom. */
    avatarButton?: ReactNode;
};

const RAIL_BUTTON_SIZE = 40;

export const PrimaryRail = ({
    homeButton,
    inviteButton,
    canopyBlock,
    onCreateCanopy,
    avatarButton,
}: PrimaryRailProps) => {
    const location = useLocation();

    return (
        <aside
            data-testid="primary-rail"
            data-shell-region="nav_shell"
            aria-label="Primary navigation"
            style={{
                borderRight: '1px solid var(--border-default)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '8px 0',
                gap: 8,
                background: 'var(--bg-nav)',
            }}
        >
            {homeButton}
            {inviteButton}

            <div style={{ position: 'relative', width: '100%' }}>
                <RegistrySidebarList
                    kind="sidebar"
                    mode="rail"
                    activePath={location.pathname}
                />
                <ThreadUnreadBadgeMount />
            </div>

            <div
                role="separator"
                aria-orientation="horizontal"
                style={{
                    width: 24,
                    height: 1,
                    background: 'var(--border-default)',
                    margin: '4px 0',
                }}
            />

            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    overflowY: 'auto',
                    alignItems: 'center',
                    width: '100%',
                }}
            >
                {canopyBlock}
            </div>

            <button
                type="button"
                onClick={onCreateCanopy}
                title={`New ${BLACKOUT_TERMS.canopy.singular}`}
                aria-label={`New ${BLACKOUT_TERMS.canopy.singular}`}
                style={{
                    width: RAIL_BUTTON_SIZE,
                    height: RAIL_BUTTON_SIZE,
                    borderRadius: 10,
                    border: '1px dashed var(--border-default)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                }}
            >
                ＋
            </button>

            {avatarButton}
        </aside>
    );
};

export default PrimaryRail;
