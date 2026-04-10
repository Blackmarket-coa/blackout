import { useMemo, useState } from 'react';
import type { MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
import type { RightPanelType } from '../../state/bmc-navigation';
import { GovernanceDashboard } from '../../features/governance';
import { RoleEditor } from '../../features/roles/RoleEditor';
import { RolePicker } from '../../features/roles/RolePicker';
import { ProfileModal } from '../../features/profile/ProfileModal';
import type { MemberProfile } from '../../features/profile/profileTypes';
import {
    getEventTimestamp,
    getPinnedEvents,
    getThreadEvents,
    getTimelineBody,
    groupMembersByPresence,
    searchEvents,
} from './rightPanelUtils';

interface RightPanelContentProps {
    panel: Exclude<RightPanelType, null>;
    room: Room | null;
    events: MatrixEvent[];
    onJumpToEvent: (eventId: string) => void;
    rolesEnabled?: boolean;
}

const buildMemberProfile = (room: Room, member: RoomMember): MemberProfile => ({
    userId: member.userId,
    displayName: member.name ?? member.userId,
    avatarUrl: member.getMxcAvatarUrl?.() ?? undefined,
    roleBadges: [],
    mutualSpaces: [],
    profile: {},
});

const GroupedMembersSection = ({
    title,
    members,
    room,
    rolesEnabled,
    onOpenProfile,
}: {
    title: string;
    members: RoomMember[];
    room: Room;
    rolesEnabled: boolean;
    onOpenProfile: (member: RoomMember) => void;
}) => (
    <section style={{ marginBottom: 12 }}>
        <strong style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {title} · {members.length}
        </strong>
        <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
            {members.map((member) => (
                <div key={member.userId} style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                background:
                                    title === 'Online'
                                        ? 'var(--success)'
                                        : title === 'Away'
                                          ? 'var(--warning)'
                                          : 'var(--text-muted)',
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => onOpenProfile(member)}
                            style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                padding: 0,
                            }}
                        >
                            {member.name ?? member.userId}
                        </button>
                    </div>
                    {rolesEnabled ? (
                        <details>
                            <summary style={{ cursor: 'pointer', fontSize: 12 }}>Role</summary>
                            <div style={{ marginTop: 4 }}>
                                <RolePicker roomId={room.roomId} userId={member.userId} />
                            </div>
                        </details>
                    ) : (
                        <small
                            data-testid="feature-admin-bmc-roles-unavailable"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Roles unavailable in this preset.
                        </small>
                    )}
                </div>
            ))}
        </div>
    </section>
);

export const RightPanelContent = ({
    panel,
    room,
    events,
    onJumpToEvent,
    rolesEnabled = false,
}: RightPanelContentProps) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [profileTarget, setProfileTarget] = useState<MemberProfile | null>(null);

    const threadEvents = useMemo(() => getThreadEvents(events), [events]);
    const pinnedEvents = useMemo(() => getPinnedEvents(room, events), [events, room]);
    const searchResults = useMemo(() => searchEvents(events, searchQuery), [events, searchQuery]);

    if (!room) {
        return (
            <div style={{ padding: 12, color: 'var(--text-secondary)' }}>
                Pick a room to view {panel}.
            </div>
        );
    }

    if (panel === 'members') {
        const members = groupMembersByPresence(room.getJoinedMembers());

        return (
            <div style={{ padding: 12, overflowY: 'auto', height: 'calc(100% - 44px)' }}>
                <GroupedMembersSection
                    title="Online"
                    members={members.online}
                    room={room}
                    rolesEnabled={rolesEnabled}
                    onOpenProfile={(member) => setProfileTarget(buildMemberProfile(room, member))}
                />
                <GroupedMembersSection
                    title="Away"
                    members={members.away}
                    room={room}
                    rolesEnabled={rolesEnabled}
                    onOpenProfile={(member) => setProfileTarget(buildMemberProfile(room, member))}
                />
                <GroupedMembersSection
                    title="Offline"
                    members={members.offline}
                    room={room}
                    rolesEnabled={rolesEnabled}
                    onOpenProfile={(member) => setProfileTarget(buildMemberProfile(room, member))}
                />
                <ProfileModal
                    open={Boolean(profileTarget)}
                    profile={
                        profileTarget ?? {
                            userId: '',
                            displayName: '',
                            roleBadges: [],
                            mutualSpaces: [],
                            profile: {},
                        }
                    }
                    onClose={() => setProfileTarget(null)}
                />
            </div>
        );
    }

    if (panel === 'threads') {
        return (
            <div
                style={{
                    padding: 12,
                    overflowY: 'auto',
                    height: 'calc(100% - 44px)',
                    display: 'grid',
                    gap: 8,
                }}
            >
                {threadEvents.length === 0 ? (
                    <small style={{ color: 'var(--text-secondary)' }}>No active threads yet.</small>
                ) : null}
                {threadEvents.map((event, index) => (
                    <button
                        key={event.getId() ?? `thread-${index}`}
                        type="button"
                        style={{
                            textAlign: 'left',
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            padding: 8,
                        }}
                        onClick={() => {
                            const eventId = event.getId();
                            if (eventId) onJumpToEvent(eventId);
                        }}
                    >
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {getEventTimestamp(event)}
                        </div>
                        <div>{getTimelineBody(event) || '[thread message]'}</div>
                    </button>
                ))}
            </div>
        );
    }

    if (panel === 'pins') {
        return (
            <div
                style={{
                    padding: 12,
                    overflowY: 'auto',
                    height: 'calc(100% - 44px)',
                    display: 'grid',
                    gap: 8,
                }}
            >
                {pinnedEvents.length === 0 ? (
                    <small style={{ color: 'var(--text-secondary)' }}>No pinned messages.</small>
                ) : null}
                {pinnedEvents.map((event, index) => (
                    <button
                        key={event.getId() ?? `pin-${index}`}
                        type="button"
                        style={{
                            textAlign: 'left',
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            padding: 8,
                        }}
                        onClick={() => {
                            const eventId = event.getId();
                            if (eventId) onJumpToEvent(eventId);
                        }}
                    >
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {getEventTimestamp(event)}
                        </div>
                        <div>{getTimelineBody(event) || '[pinned event]'}</div>
                    </button>
                ))}
            </div>
        );
    }

    if (panel === 'governance') {
        if (!room) {
            return (
                <div style={{ padding: 12, color: 'var(--text-secondary)' }}>
                    Pick a room to view governance.
                </div>
            );
        }

        return <GovernanceDashboard roomId={room.roomId} />;
    }
    if (panel === 'roles') {
        return <RoleEditor roomId={room.roomId} />;
    }

    return (
        <div
            style={{
                padding: 12,
                overflowY: 'auto',
                height: 'calc(100% - 44px)',
                display: 'grid',
                gap: 8,
            }}
        >
            <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search this room"
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 8,
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    padding: 8,
                }}
            />
            {searchQuery.trim().length === 0 ? (
                <small style={{ color: 'var(--text-secondary)' }}>
                    Type to search room messages.
                </small>
            ) : null}
            {searchResults.map((event, index) => (
                <button
                    key={event.getId() ?? `search-${index}`}
                    type="button"
                    style={{
                        textAlign: 'left',
                        border: '1px solid var(--border-default)',
                        borderRadius: 8,
                        background: 'var(--bg-input)',
                        padding: 8,
                    }}
                    onClick={() => {
                        const eventId = event.getId();
                        if (eventId) onJumpToEvent(eventId);
                    }}
                >
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {getEventTimestamp(event)}
                    </div>
                    <div>{getTimelineBody(event)}</div>
                </button>
            ))}
        </div>
    );
};

export default RightPanelContent;
