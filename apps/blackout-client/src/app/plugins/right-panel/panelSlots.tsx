import React, { useMemo, useState } from 'react';
import type { MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
import { GovernanceDashboard } from '../../features/governance';
import { RoleEditor } from '../../features/roles/RoleEditor';
import { RolePicker } from '../../features/roles/RolePicker';
import { ProfileModal } from '../../features/profile/ProfileModal';
import type { MemberProfile } from '../../features/profile/profileTypes';
import type { RightPanelType } from '../../state/bmc-navigation';
import {
    getEventTimestamp,
    getPinnedEvents,
    getThreadEvents,
    getTimelineBody,
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

const MembersPanel: RightPanelSlotRenderer = ({ room, rolesEnabled }) => {
    const [profileTarget, setProfileTarget] = useState<MemberProfile | null>(null);
    const members = useMemo(() => groupMembersByPresence(room.getJoinedMembers()), [room]);

    return (
        <div style={{ padding: 12, overflowY: 'auto', height: 'calc(100% - 44px)' }}>
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
