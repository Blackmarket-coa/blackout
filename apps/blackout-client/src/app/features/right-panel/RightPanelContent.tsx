import { useMemo, useState } from 'react';
import type { MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
import type { RightPanelType } from '../../state/navigation';
import { GovernanceDashboard } from '../../features/governance';
import { RoleEditor } from '../../features/roles/RoleEditor';
import { RolePicker } from '../../features/roles/RolePicker';
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
    rolesEnabled?: boolean;
    onJumpToEvent: (eventId: string) => void;
}

const GroupedMembersSection = ({
    title,
    members,
    roomId,
    rolesEnabled,
    rolePickerUserId,
    onToggleRolePicker,
}: {
    title: string;
    members: RoomMember[];
    roomId: string;
    rolesEnabled: boolean;
    rolePickerUserId: string | null;
    onToggleRolePicker: (userId: string) => void;
}) => (
    <section style={{ marginBottom: 12 }}>
        <strong style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {title} · {members.length}
        </strong>
        <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
            {members.map((member) => (
                <div key={member.userId}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                flexShrink: 0,
                                background:
                                    title === 'Online'
                                        ? 'var(--success)'
                                        : title === 'Away'
                                          ? 'var(--warning)'
                                          : 'var(--text-muted)',
                            }}
                        />
                        <span
                            style={{
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {member.name ?? member.userId}
                        </span>
                        {rolesEnabled ? (
                            <button
                                type="button"
                                aria-label={`Assign role to ${member.name ?? member.userId}`}
                                onClick={() => onToggleRolePicker(member.userId)}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 4,
                                    background: 'var(--bg-input)',
                                    fontSize: 10,
                                    padding: '1px 5px',
                                    flexShrink: 0,
                                }}
                            >
                                ⋯
                            </button>
                        ) : null}
                    </div>
                    {rolesEnabled && rolePickerUserId === member.userId ? (
                        <div
                            style={{
                                marginTop: 4,
                                marginLeft: 16,
                                border: '1px solid var(--border-default)',
                                borderRadius: 6,
                                background: 'var(--bg-surface-hover)',
                                padding: 6,
                            }}
                        >
                            <RolePicker roomId={roomId} userId={member.userId} />
                        </div>
                    ) : null}
                </div>
            ))}
        </div>
    </section>
);

export const RightPanelContent = ({
    panel,
    room,
    events,
    rolesEnabled = false,
    onJumpToEvent,
}: RightPanelContentProps) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [rolePickerUserId, setRolePickerUserId] = useState<string | null>(null);

    const threadEvents = useMemo(() => getThreadEvents(events), [events]);
    const pinnedEvents = useMemo(() => getPinnedEvents(room, events), [events, room]);
    const searchResults = useMemo(() => searchEvents(events, searchQuery), [events, searchQuery]);

    const toggleRolePicker = (userId: string) => {
        setRolePickerUserId((prev) => (prev === userId ? null : userId));
    };

    if (!room) {
        return (
            <div style={{ padding: 12, color: 'var(--text-secondary)' }}>
                Pick a room to view {panel}.
            </div>
        );
    }

    if (panel === 'roles') {
        if (!rolesEnabled) {
            return (
                <div
                    style={{ padding: 12, color: 'var(--text-secondary)' }}
                    data-testid="feature-admin-bmc-roles-unavailable"
                >
                    Roles are not enabled for this workspace.
                </div>
            );
        }
        return (
            <div style={{ padding: 12, overflowY: 'auto', height: 'calc(100% - 44px)' }}>
                <RoleEditor roomId={room.roomId} />
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
                    roomId={room.roomId}
                    rolesEnabled={rolesEnabled}
                    rolePickerUserId={rolePickerUserId}
                    onToggleRolePicker={toggleRolePicker}
                />
                <GroupedMembersSection
                    title="Away"
                    members={members.away}
                    roomId={room.roomId}
                    rolesEnabled={rolesEnabled}
                    rolePickerUserId={rolePickerUserId}
                    onToggleRolePicker={toggleRolePicker}
                />
                <GroupedMembersSection
                    title="Offline"
                    members={members.offline}
                    roomId={room.roomId}
                    rolesEnabled={rolesEnabled}
                    rolePickerUserId={rolePickerUserId}
                    onToggleRolePicker={toggleRolePicker}
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
