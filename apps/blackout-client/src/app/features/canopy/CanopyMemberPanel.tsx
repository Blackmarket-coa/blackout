import { type CSSProperties, useMemo } from 'react';
import type { Room, RoomMember } from 'matrix-js-sdk';
import { groupMembersByPresence } from '../right-panel/rightPanelUtils';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { getPowerLevelTag, usePowerLevelTags } from '../../hooks/usePowerLevelTags';

const PANEL_WIDTH = 240;

const ASIDE_STYLE: CSSProperties = {
    width: PANEL_WIDTH,
    flex: `0 0 ${PANEL_WIDTH}px`,
    borderLeft: '1px solid var(--border-default)',
    background: 'var(--bg-nav)',
    color: 'var(--text-primary)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
};

const HEADER_STYLE: CSSProperties = {
    padding: '12px 14px',
    borderBottom: '1px solid var(--border-default)',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    minHeight: 52,
    display: 'flex',
    alignItems: 'center',
};

const LIST_STYLE: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '8px 8px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const sectionLabelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    padding: '10px 8px 2px',
};

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 8px',
    borderRadius: 8,
};

const avatarStyle = (online: boolean): CSSProperties => ({
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'var(--accent-muted)',
    display: 'grid',
    placeItems: 'center',
    fontSize: 11,
    fontWeight: 700,
    flex: '0 0 auto',
    opacity: online ? 1 : 0.55,
});

const initials = (member: RoomMember) => (member.name || member.userId).slice(0, 2).toUpperCase();

const MemberRow = ({
    member,
    online,
    badge,
}: {
    member: RoomMember;
    online: boolean;
    badge: { name: string; color?: string };
}) => (
    <div style={rowStyle} data-testid="canopy-member-row" title={member.userId}>
        <span style={avatarStyle(online)} aria-hidden>
            {initials(member)}
        </span>
        <span
            style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 14,
                color: online ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
        >
            {member.name || member.userId}
        </span>
        {member.powerLevel >= 50 ? (
            <span
                style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 999,
                    border: `1px solid ${badge.color ?? 'var(--border-default)'}`,
                    color: badge.color ?? 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                }}
            >
                {badge.name}
            </span>
        ) : null}
    </div>
);

/**
 * Docked member list for the canopy server page. Intentionally lightweight
 * (presence grouping via the shared `groupMembersByPresence` + power-level
 * role badges via `usePowerLevelTags`) rather than the heavy folds-based
 * `MembersDrawer`, which is tightly coupled to settings/media/search
 * providers and meant for the legacy shell.
 */
export const CanopyMemberPanel = ({ room }: { room: Room }) => {
    const powerLevels = usePowerLevels(room);
    const tags = usePowerLevelTags(room, powerLevels);

    const members = useMemo(() => room.getJoinedMembers(), [room]);
    const grouped = useMemo(() => groupMembersByPresence(members), [members]);

    const onlineMembers = [...grouped.online, ...grouped.away];
    const offlineMembers = grouped.offline;

    const renderSection = (label: string, list: RoomMember[], online: boolean) =>
        list.length === 0 ? null : (
            <>
                <div style={sectionLabelStyle}>
                    {label} — {list.length}
                </div>
                {list
                    .slice()
                    .sort((a, b) => b.powerLevel - a.powerLevel)
                    .map((member) => (
                        <MemberRow
                            key={member.userId}
                            member={member}
                            online={online}
                            badge={getPowerLevelTag(tags, member.powerLevel)}
                        />
                    ))}
            </>
        );

    return (
        <aside
            data-testid="canopy-member-panel"
            data-shell-region="canopy-members"
            aria-label="Members"
            style={ASIDE_STYLE}
        >
            <div style={HEADER_STYLE}>Members — {members.length}</div>
            <div style={LIST_STYLE}>
                {renderSection('Online', onlineMembers, true)}
                {renderSection('Offline', offlineMembers, false)}
            </div>
        </aside>
    );
};

export default CanopyMemberPanel;
