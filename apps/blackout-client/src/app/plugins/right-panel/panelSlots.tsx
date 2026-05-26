import React, { useMemo, useState } from 'react';
import type { MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
import { useNavigate } from 'react-router-dom';
import { GovernanceDashboard } from '../../features/governance';
import { NotificationsDrawer } from '../../features/notifications/components/NotificationsDrawer';
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
import type { RightPanelType } from '../../state/navigation';
import {
    findThreadRoot,
    getEventTimestamp,
    getMemberActivitySummary,
    getPinnedEvents,
    getThreadRootIds,
    getTimelineBody,
    getUserSharedRoomCount,
    groupMembersByPresence,
    groupThreadReplies,
    searchEvents,
} from '../../features/right-panel/rightPanelUtils';
import { ThreadPanel } from '../../features/right-panel/ThreadPanel';
import { MessageComposer } from '../../features/room/MessageComposer';
import type { PluginDefinition, UISlotRegistry } from '../contracts';
import { isRuntimePluginEnabled } from '../manifest';
import {
    buildShellMonetizationSlotProps,
    resolveShellMonetizationSlotRegistry,
} from '../shell/shellLayoutPlugin';
import {
    getLiveInteractionDiagnostics,
    isLiveInteractionWidgetPanelId,
    LIVE_INTERACTION_WIDGET_PANEL_IDS,
} from '../../features/call/liveInteractionBundle';

export type RightPanelSlotProps = {
    panel: Exclude<RightPanelType, null>;
    room: Room;
    events: MatrixEvent[];
    onJumpToEvent: (eventId: string) => void;
    rolesEnabled: boolean;
    /**
     * Root event id of the currently focused thread, or `null` when the
     * threads slot should render its list of thread roots. Threaded by
     * `RightPanelContent` from `activeThreadRootIdAtom`.
     */
    activeThreadRootId: string | null;
    /** Drill into a thread root (sets `activeThreadRootIdAtom`). */
    onSelectThread?: (rootEventId: string) => void;
    /** Return from a thread to the list of roots (clears `activeThreadRootIdAtom`). */
    onClearThread?: () => void;
};

export type RightPanelSlotName = Exclude<RightPanelType, null>;
export type RightPanelSlotRenderer = (props: RightPanelSlotProps) => JSX.Element;

export type RightPanelSlotRegistry = UISlotRegistry<RightPanelSlotName, RightPanelSlotProps>;
export const WIDGET_PANEL_INVENTORY_IDS = [
    'townhall_sfu',
    'widget_shell_layouts',
    'media_pipeline',
    'media_spoilers',
    'media_codeblocks',
    'media_link_previews',
    'element_call',
    'matrix_widget_compat',
    'soundboard',
    'numbers_station',
    'stage_channels',
] as const;

export type WidgetPanelInventoryId = (typeof WIDGET_PANEL_INVENTORY_IDS)[number];

export const isWidgetPanelInventoryId = (panel: RightPanelSlotName): panel is WidgetPanelInventoryId =>
    WIDGET_PANEL_INVENTORY_IDS.some((inventoryId) => inventoryId === panel);

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

/**
 * Lists the distinct thread roots in a den (one row per thread, not one per
 * reply) with a reply count, so threads read as a navigable third tier rather
 * than a flat dump of reply events. Selecting a row drills into the thread.
 */
const ThreadRootList = ({
    events,
    onSelectThread,
    onJumpToEvent,
    fallbackBody,
}: {
    events: MatrixEvent[];
    onSelectThread?: (rootEventId: string) => void;
    onJumpToEvent: (eventId: string) => void;
    fallbackBody: string;
}) => {
    const rootIds = useMemo(() => getThreadRootIds(events), [events]);
    const replies = useMemo(() => groupThreadReplies(events), [events]);

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
            {rootIds.length === 0 ? (
                <small style={{ color: 'var(--text-secondary)' }}>No active threads yet.</small>
            ) : null}
            {rootIds.map((rootId) => {
                const root = findThreadRoot(events, rootId);
                const replyCount = replies.get(rootId)?.length ?? 0;
                return (
                    <button
                        key={rootId}
                        type="button"
                        data-testid={`thread-root-${rootId}`}
                        style={{
                            textAlign: 'left',
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            padding: 8,
                            display: 'grid',
                            gap: 4,
                        }}
                        onClick={() =>
                            onSelectThread ? onSelectThread(rootId) : onJumpToEvent(rootId)
                        }
                    >
                        <div>{(root ? getTimelineBody(root) : '') || fallbackBody}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

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
                placeholder="Search this den"
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
                    Type to search den messages.
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

const MonetizationPanel: RightPanelSlotRenderer = ({ room }) => {
    const slotProps = buildShellMonetizationSlotProps(room.roomId);
    const slots = resolveShellMonetizationSlotRegistry();
    const Summary = slots.summary;
    const Actions = slots.actions;

    return (
        <section
            aria-label="Monetization panel"
            style={{
                padding: slotProps.panelPaddingPx,
                display: 'grid',
                gap: slotProps.sectionGapPx,
            }}
        >
            <header style={{ display: 'grid', gap: slotProps.itemGapPx }}>
                <h3 style={{ margin: 0 }}>Monetization</h3>
                {Summary ? <Summary {...slotProps} /> : null}
            </header>
            {Actions ? <Actions {...slotProps} /> : null}
        </section>
    );
};

const baselineSlotRegistry: RightPanelSlotRegistry = {
    members: MembersPanel,
    threads: ({ events, room, onJumpToEvent, activeThreadRootId, onSelectThread, onClearThread }) => {
        if (!activeThreadRootId) {
            return (
                <ThreadRootList
                    events={events}
                    onSelectThread={onSelectThread}
                    onJumpToEvent={onJumpToEvent}
                    fallbackBody="[thread message]"
                />
            );
        }
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                <button
                    type="button"
                    data-testid="thread-back-to-list"
                    onClick={() => onClearThread?.()}
                    style={{
                        alignSelf: 'flex-start',
                        margin: 8,
                        border: '1px solid var(--border-default)',
                        borderRadius: 8,
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        padding: '4px 10px',
                        cursor: 'pointer',
                    }}
                >
                    ← All threads
                </button>
                <ThreadPanel
                    events={events}
                    rootEventId={activeThreadRootId}
                    fallbackBody="[thread message]"
                    onJumpToEvent={onJumpToEvent}
                    renderComposer={(rootEventId) => (
                        <MessageComposer
                            roomId={room.roomId}
                            target={{ mode: 'thread', rootEventId }}
                            placeholder="Reply in thread"
                        />
                    )}
                />
            </div>
        );
    },
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
    monetization: MonetizationPanel,
    notifications: ({ room }) => <NotificationsDrawer roomId={room.roomId} />,
};

const pluginSlots: RightPanelSlotRegistry = {
    roles: ({ room }) => <RoleEditor roomId={room.roomId} />,
};

const WidgetInventoryPanel = ({ panel, room }: RightPanelSlotProps) => {
    const rightPanelPluginEnabled = isRuntimePluginEnabled('right-panel.slots');
    const liveInteractionBundleEnabled = isRuntimePluginEnabled('live-interaction.bundle');
    const diagnostics =
        isLiveInteractionWidgetPanelId(panel) && liveInteractionBundleEnabled
            ? getLiveInteractionDiagnostics({
                  rightPanelPluginEnabled,
                  bundlePluginEnabled: liveInteractionBundleEnabled,
              })
            : null;

    return (
        <section
            aria-label={`${panel} widget panel`}
            style={{
                display: 'grid',
                gap: 8,
                border: '1px solid var(--border-default)',
                borderRadius: 10,
                padding: 12,
                background: 'var(--bg-input)',
            }}
        >
            <header style={{ display: 'grid', gap: 4 }}>
                <strong style={{ textTransform: 'capitalize' }}>{panel.replace(/_/g, ' ')}</strong>
                <small style={{ color: 'var(--text-secondary)' }}>
                    Installable widget inventory ID: <code>{panel}</code>
                </small>
            </header>
            <small style={{ color: 'var(--text-secondary)' }}>
                Mounted through right-panel plugin slots for room <code>{room.roomId}</code>.
            </small>
            {diagnostics ? (
                <section
                    aria-label={`${panel} dependency diagnostics`}
                    data-testid={`widget-${panel}-dependency-diagnostics`}
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 8,
                        padding: 8,
                        display: 'grid',
                        gap: 4,
                    }}
                >
                    <strong style={{ fontSize: 12 }}>Dependency health: {diagnostics.status}</strong>
                    {diagnostics.failures.length === 0 ? (
                        <small style={{ color: 'var(--text-secondary)' }}>
                            All live interaction dependencies are available.
                        </small>
                    ) : (
                        <ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 4 }}>
                            {diagnostics.failures.map((failure) => (
                                <li key={failure.id} style={{ fontSize: 12 }}>
                                    {failure.message} Admin action: {failure.adminHint}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            ) : null}
        </section>
    );
};

const buildWidgetSlots = (liveInteractionBundleEnabled: boolean): RightPanelSlotRegistry => {
    const allowedWidgetInventory = WIDGET_PANEL_INVENTORY_IDS.filter(
        (inventoryId) =>
            !isLiveInteractionWidgetPanelId(inventoryId) || liveInteractionBundleEnabled
    );

    return Object.fromEntries(
        allowedWidgetInventory.map((inventoryId) => [inventoryId, WidgetInventoryPanel])
    ) as RightPanelSlotRegistry;
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
    rolesEnabled: boolean,
    widgetPackEnabled = pluginEnabled,
    liveInteractionBundleEnabled = isRuntimePluginEnabled('live-interaction.bundle')
): RightPanelSlotRegistry => {
    if (!pluginEnabled) return baselineSlotRegistry;

    return {
        ...baselineSlotRegistry,
        ...(rolesEnabled ? pluginSlots : {}),
        ...(widgetPackEnabled ? buildWidgetSlots(liveInteractionBundleEnabled) : {}),
    };
};
