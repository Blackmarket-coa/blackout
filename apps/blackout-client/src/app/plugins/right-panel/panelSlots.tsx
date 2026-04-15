import React, { useMemo, useState } from 'react';
import type { MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
import { useNavigate } from 'react-router-dom';
import { GovernanceDashboard } from '../../features/governance';
import { RoleBadge } from '../../features/roles/RoleBadge';
import { RoleEditor } from '../../features/roles/RoleEditor';
import { RolePicker } from '../../features/roles/RolePicker';
import { ProfileModal } from '../../features/profile/ProfileModal';
import type { MemberProfile } from '../../features/profile/profileTypes';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { usePowerLevels, readPowerLevel } from '../../hooks/usePowerLevels';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useUserRoles } from '../../features/roles/useRoles';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import type { RightPanelType } from '../../state/bmc-navigation';
import {
    getEventTimestamp,
    getMemberActivitySummary,
    getPinnedEvents,
    getThreadEvents,
    getTimelineBody,
    getUserSharedRoomCount,
    groupMembersByPresence,
    searchEvents,
} from '../../features/right-panel/rightPanelUtils';
import type { PluginDefinition, UISlotRegistry } from '../contracts';
import { isRuntimePluginEnabled } from '../manifest';

export type RightPanelSlotProps = {
    panel: Exclude<RightPanelType, null>;
    room: Room;
    events: MatrixEvent[];
    onJumpToEvent: (eventId: string) => void;
    rolesEnabled: boolean;
};

export type RightPanelSlotName = Exclude<RightPanelType, null>;
export type RightPanelSlotRenderer = (props: RightPanelSlotProps) => JSX.Element;

export type RightPanelSlotRegistry = UISlotRegistry<RightPanelSlotName, RightPanelSlotProps>;

const buildMemberProfile = (member: RoomMember): MemberProfile => ({
    userId: member.userId,
    displayName: member.name ?? member.userId,
    avatarUrl: member.getMxcAvatarUrl?.() ?? undefined,
    roleBadges: [],
    mutualSpaces: [],
    profile: {},
});

const MemberRow = ({
    member,
    room,
    title,
    rolesEnabled,
    onOpenProfile,
}: {
    member: RoomMember;
    room: Room;
    title: string;
    rolesEnabled: boolean;
    onOpenProfile: (member: RoomMember) => void;
}) => {
    const navigate = useNavigate();
    const mx = useMatrixClient();
    const roomList = mx.getRooms();
    const roles = useUserRoles(room.roomId, member.userId);

    const powerLevels = usePowerLevels(room);
    const creators = useRoomCreators(room);
    const permissions = useRoomPermissions(creators, powerLevels);

    const currentUserId = mx.getUserId() ?? '';
    const currentUserPower = readPowerLevel.user(powerLevels, currentUserId);
    const targetUserPower = readPowerLevel.user(powerLevels, member.userId);

    const canModerate =
        currentUserId !== member.userId &&
        currentUserPower > targetUserPower &&
        (permissions.action('kick', currentUserId) ||
            permissions.action('ban', currentUserId) ||
            permissions.stateEvent('m.room.power_levels', currentUserId));

    const roleLabel = roles.data[0]?.name ?? `Power ${roles.powerLevel}`;
    const sharedRoomCount = getUserSharedRoomCount(roomList, member.userId, currentUserId);
    const activitySummary = getMemberActivitySummary(member, title.toLowerCase());

    return (
        <li
            style={{
                display: 'grid',
                gap: 8,
                border: '1px solid var(--border-default)',
                borderRadius: 8,
                padding: 8,
                background: 'var(--bg-input)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                    aria-hidden="true"
                    style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        border: '1px solid var(--border-default)',
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
                    aria-label={`Open profile for ${member.name ?? member.userId}`}
                    style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        padding: 0,
                        fontWeight: 600,
                    }}
                >
                    {member.name ?? member.userId}
                </button>
                <RoleBadge
                    role={roles.data[0] ?? null}
                    fallbackName={`PL ${roles.powerLevel}`}
                    compact
                />
            </div>
            <small style={{ color: 'var(--text-secondary)' }}>
                Presence: {title}. Role: {roleLabel}. Shared rooms: {sharedRoomCount}.{' '}
                {activitySummary}
            </small>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                    type="button"
                    aria-label={`Message ${member.name ?? member.userId}`}
                    onClick={() =>
                        void navigate(`/client/new/${encodeURIComponent(member.userId)}`)
                    }
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 6,
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        padding: '2px 8px',
                    }}
                >
                    Message
                </button>
                <button
                    type="button"
                    aria-label={`Mention ${member.name ?? member.userId}`}
                    onClick={() => void navigator.clipboard?.writeText(`@${member.userId}`)}
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 6,
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        padding: '2px 8px',
                    }}
                >
                    Mention
                </button>
                {canModerate ? (
                    <button
                        type="button"
                        aria-label={`Moderate ${member.name ?? member.userId}`}
                        onClick={() => onOpenProfile(member)}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 6,
                            background: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            padding: '2px 8px',
                        }}
                    >
                        Moderate
                    </button>
                ) : null}
            </div>
            {rolesEnabled && canModerate ? (
                <details>
                    <summary style={{ cursor: 'pointer', fontSize: 12 }}>
                        Role & moderation tools
                    </summary>
                    <div style={{ marginTop: 4 }}>
                        <RolePicker roomId={room.roomId} userId={member.userId} />
                    </div>
                </details>
            ) : null}
        </li>
    );
};

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
    <section style={{ marginBottom: 12 }} aria-label={`${title} members`}>
        <strong style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {title} · {members.length}
        </strong>
        <ul style={{ marginTop: 6, display: 'grid', gap: 6, listStyle: 'none', padding: 0 }}>
            {members.map((member) => (
                <MemberRow
                    key={member.userId}
                    member={member}
                    room={room}
                    title={title}
                    rolesEnabled={rolesEnabled}
                    onOpenProfile={onOpenProfile}
                />
            ))}
        </ul>
    </section>
);

const MembersPanel: RightPanelSlotRenderer = ({ room, rolesEnabled }) => {
    const [profileTarget, setProfileTarget] = useState<MemberProfile | null>(null);
    const members = useMemo(() => groupMembersByPresence(room.getJoinedMembers()), [room]);

    return (
        <div
            style={{ padding: 12, overflowY: 'auto', height: 'calc(100% - 44px)' }}
            aria-label="Members panel"
        >
            <GroupedMembersSection
                title="Online"
                members={members.online}
                room={room}
                rolesEnabled={rolesEnabled}
                onOpenProfile={(member) => setProfileTarget(buildMemberProfile(member))}
            />
            <GroupedMembersSection
                title="Away"
                members={members.away}
                room={room}
                rolesEnabled={rolesEnabled}
                onOpenProfile={(member) => setProfileTarget(buildMemberProfile(member))}
            />
            <GroupedMembersSection
                title="Offline"
                members={members.offline}
                room={room}
                rolesEnabled={rolesEnabled}
                onOpenProfile={(member) => setProfileTarget(buildMemberProfile(member))}
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
};

const TimelineEventList = ({
    events,
    emptyMessage,
    fallbackBody,
    onJumpToEvent,
}: {
    events: MatrixEvent[];
    emptyMessage: string;
    fallbackBody: string;
    onJumpToEvent: (eventId: string) => void;
}) => (
    <div
        style={{
            padding: 12,
            overflowY: 'auto',
            height: 'calc(100% - 44px)',
            display: 'grid',
            gap: 8,
        }}
    >
        {events.length === 0 ? (
            <small style={{ color: 'var(--text-secondary)' }}>{emptyMessage}</small>
        ) : null}
        {events.map((event, index) => (
            <button
                key={event.getId() ?? `event-${index}`}
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
                <div>{getTimelineBody(event) || fallbackBody}</div>
            </button>
        ))}
    </div>
);

const SearchPanel: RightPanelSlotRenderer = ({ events, onJumpToEvent }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const searchResults = useMemo(() => searchEvents(events, searchQuery), [events, searchQuery]);

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

const baselineSlotRegistry: RightPanelSlotRegistry = {
    members: MembersPanel,
    threads: ({ events, onJumpToEvent }) => (
        <TimelineEventList
            events={getThreadEvents(events)}
            emptyMessage="No active threads yet."
            fallbackBody="[thread message]"
            onJumpToEvent={onJumpToEvent}
        />
    ),
    pins: ({ events, room, onJumpToEvent }) => (
        <TimelineEventList
            events={getPinnedEvents(room, events)}
            emptyMessage="No pinned messages."
            fallbackBody="[pinned event]"
            onJumpToEvent={onJumpToEvent}
        />
    ),
    search: SearchPanel,
    governance: ({ room }) => <GovernanceDashboard roomId={room.roomId} />,
};

const pluginSlots: RightPanelSlotRegistry = {
    roles: ({ room }) => <RoleEditor roomId={room.roomId} />,
};

let unregisterLifecycle = (): void => {};

export const rightPanelPlugin: PluginDefinition<'right-panel.slots'> = {
    id: 'right-panel.slots',
    isEnabled: () => isRuntimePluginEnabled('right-panel.slots'),
    register: () => {
        unregisterLifecycle = (): void => {};
        return unregisterLifecycle;
    },
    unregister: () => {
        unregisterLifecycle();
    },
};

export const resolveRightPanelSlotRegistry = (
    pluginEnabled: boolean,
    rolesEnabled: boolean
): RightPanelSlotRegistry => {
    if (!pluginEnabled) return baselineSlotRegistry;
    if (!rolesEnabled) return baselineSlotRegistry;

    return {
        ...baselineSlotRegistry,
        ...pluginSlots,
    };
};
