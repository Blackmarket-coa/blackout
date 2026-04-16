import { useAtom } from 'jotai';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { Room, RoomMember } from 'matrix-js-sdk';
import { useNavigate } from 'react-router-dom';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useMatrixClient } from '../../hooks/bmc-useMatrixClient';
import { getInboxNotificationsPath, getInboxPath } from '../../pages/pathUtils';
import { ROOM_SETTINGS_PATH, SPACE_SETTINGS_PATH } from '../../pages/paths';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/bmc-navigation';
import { keybindsSettingsAtom } from '../settings/settingsAtoms';

interface BaseResult {
    id: string;
    category: 'Rooms' | 'Spaces' | 'DMs' | 'Members' | 'Settings' | 'Actions' | 'Commands';
    title: string;
    subtitle?: string;
    avatarUrl?: string;
    badge?: string;
    keywords: string;
    recentScore?: number;
    unreadWeight?: number;
    hint?: string;
    route?: string;
    actionId?: 'mark-read' | 'open-inbox' | 'jump-mentions';
}

interface QuickSwitcherProps {
    open: boolean;
    onClose: () => void;
    onCommandPicked?: (command: string) => void;
    onActionPicked?: (actionId: 'mark-read' | 'open-inbox' | 'jump-mentions') => void;
}

const COMMANDS = [
    { cmd: '/invite', desc: 'Invite a user to this den' },
    { cmd: '/topic', desc: 'Set the den topic' },
    { cmd: '/nick', desc: 'Set your display name' },
    { cmd: '/me', desc: 'Send emote-style message' },
    { cmd: '/shrug', desc: 'Append ¯\\_(ツ)_/¯' },
    { cmd: '/leave', desc: 'Leave the current den' },
    { cmd: '/join', desc: 'Join by den alias' },
];

const CATEGORY_LABELS: Record<BaseResult['category'], string> = {
    Rooms: 'Dens',
    Spaces: 'Canopies',
    DMs: 'DMs',
    Members: 'Shadows',
    Settings: 'Settings',
    Actions: 'Actions',
    Commands: 'Commands',
};
const SETTINGS_ROUTES: Array<Pick<BaseResult, 'id' | 'title' | 'subtitle' | 'route' | 'keywords' | 'hint'>> = [
    {
        id: 'settings-room',
        title: 'Room settings',
        subtitle: 'Open room-level settings',
        route: ROOM_SETTINGS_PATH,
        keywords: 'room settings permissions moderation',
        hint: '↵',
    },
    {
        id: 'settings-space',
        title: 'Space settings',
        subtitle: 'Open space-level settings',
        route: SPACE_SETTINGS_PATH,
        keywords: 'space settings members roles',
        hint: '↵',
    },
    {
        id: 'settings-inbox',
        title: 'Inbox',
        subtitle: 'Open notifications inbox',
        route: getInboxPath(),
        keywords: 'inbox notifications unread',
        hint: '↵',
    },
    {
        id: 'settings-mentions',
        title: 'Mentions',
        subtitle: 'Jump to mention notifications',
        route: getInboxNotificationsPath(),
        keywords: 'mentions inbox notifications highlight',
        hint: '↵',
    },
];

const COMMON_ACTIONS: BaseResult[] = [
    {
        id: 'action-mark-read',
        category: 'Actions',
        title: 'Mark all mentions read',
        subtitle: 'Clear unread mention indicators',
        actionId: 'mark-read',
        hint: 'Shift+M',
        keywords: 'mark read clear inbox mentions unread',
    },
    {
        id: 'action-open-inbox',
        category: 'Actions',
        title: 'Open inbox',
        subtitle: 'View global mentions and notifications',
        actionId: 'open-inbox',
        hint: 'I',
        keywords: 'open inbox notifications mentions',
    },
    {
        id: 'action-jump-mentions',
        category: 'Actions',
        title: 'Jump to mentions',
        subtitle: 'Open mentions view quickly',
        actionId: 'jump-mentions',
        hint: 'M',
        keywords: 'jump mentions highlight unread',
    },
];

const fuzzyIncludes = (text: string, query: string): boolean => {
    const hay = text.toLowerCase();
    const needle = query.toLowerCase().trim();
    if (!needle) return true;
    let i = 0;
    for (const c of hay) {
        if (c === needle[i]) i += 1;
        if (i === needle.length) return true;
    }
    return hay.includes(needle);
};

const getUnreadWeight = (room: Room): number => {
    const unread = room.getUnreadNotificationCount();
    const mentionCount = typeof room.getUnreadCountForEventContext === 'function' ? 1 : 0;
    return unread > 0 ? unread + mentionCount : 0;
};

const isDMRoom = (room: Room): boolean => {
    const dmInviter =
        typeof (room as unknown as { getDMInviter?: () => string | undefined }).getDMInviter === 'function'
            ? (room as unknown as { getDMInviter: () => string | undefined }).getDMInviter()
            : undefined;
    return Boolean(dmInviter);
};

export const buildQuickSwitcherIndex = (rooms: Room[]): BaseResult[] => {
    const list: BaseResult[] = [];
    const seenUsers = new Set<string>();

    rooms.forEach((room) => {
        const alias = room.getCanonicalAlias() ?? '';
        const unread = room.getUnreadNotificationCount();
        const isSpace = room.getType() === 'm.space';
        const isDM = !isSpace && isDMRoom(room);
        const recentScore =
            typeof (room as unknown as { getLastActiveTimestamp?: () => number }).getLastActiveTimestamp ===
            'function'
                ? (room as unknown as { getLastActiveTimestamp: () => number }).getLastActiveTimestamp()
                : 0;

        list.push({
            id: room.roomId,
            category: isSpace ? 'Spaces' : isDM ? 'DMs' : 'Rooms',
            title: room.name,
            subtitle: alias || room.roomId,
            badge: unread > 0 ? String(unread) : undefined,
            keywords: `${room.name} ${alias} ${room.roomId}`,
            recentScore,
            unreadWeight: getUnreadWeight(room),
            hint: '↵',
        });

        room.getJoinedMembers().forEach((member: RoomMember) => {
            if (seenUsers.has(member.userId)) return;
            seenUsers.add(member.userId);
            list.push({
                id: member.userId,
                category: 'Members',
                title: member.name || member.userId,
                subtitle: member.userId,
                keywords: `${member.name ?? ''} ${member.userId}`,
                hint: '↵',
            });
        });
    });

    SETTINGS_ROUTES.forEach((route) => {
        list.push({
            ...route,
            category: 'Settings',
        });
    });

    list.push(...COMMON_ACTIONS);

    COMMANDS.forEach((command) => {
        list.push({
            id: command.cmd,
            category: 'Commands',
            title: command.cmd,
            subtitle: command.desc,
            keywords: `${command.cmd} ${command.desc}`,
            hint: '↵',
        });
    });

    return list;
};

const getRankBucket = (entry: BaseResult, query: string): number => {
    const needle = query.toLowerCase().trim();
    if (!needle) return 5;
    const title = entry.title.toLowerCase();
    const keyword = entry.keywords.toLowerCase();
    const exact = title === needle || title.startsWith(needle) || keyword.includes(` ${needle}`);
    if (exact) return 0;
    if ((entry.recentScore ?? 0) > 0) return 1;
    if ((entry.unreadWeight ?? 0) > 0 || entry.keywords.includes('mentions')) return 2;
    if (fuzzyIncludes(keyword, needle)) return 3;
    return 9;
};

export const rankQuickSwitcherResults = (entries: BaseResult[], query: string): BaseResult[] =>
    entries
        .map((entry) => ({ entry, bucket: getRankBucket(entry, query) }))
        .filter(({ bucket }) => bucket <= 3 || query.trim().length === 0)
        .sort((left, right) => {
            if (left.bucket !== right.bucket) return left.bucket - right.bucket;
            if ((right.entry.unreadWeight ?? 0) !== (left.entry.unreadWeight ?? 0)) {
                return (right.entry.unreadWeight ?? 0) - (left.entry.unreadWeight ?? 0);
            }
            if ((right.entry.recentScore ?? 0) !== (left.entry.recentScore ?? 0)) {
                return (right.entry.recentScore ?? 0) - (left.entry.recentScore ?? 0);
            }
            return left.entry.title.localeCompare(right.entry.title);
        })
        .map(({ entry }) => entry);

export const QuickSwitcher = ({ open, onClose, onCommandPicked, onActionPicked }: QuickSwitcherProps) => {
    const client = useMatrixClient();
    const navigate = useNavigate();
    const { navigateRoom, navigateSpace } = useRoomNavigate();
    const [, setSelectedRoomId] = useAtom(selectedRoomIdAtom);
    const [, setSelectedSpaceId] = useAtom(selectedSpaceIdAtom);
    const [keybinds] = useAtom(keybindsSettingsAtom);

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [index, setIndex] = useState<BaseResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search), 150);
        return () => window.clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        const rebuild = () => setIndex(buildQuickSwitcherIndex(client.getRooms()));
        rebuild();

        const emitter = client as unknown as {
            on: (event: string, cb: () => void) => void;
            off: (event: string, cb: () => void) => void;
        };

        const onSync = () => rebuild();
        const onRoomUpdate = () => rebuild();

        emitter.on('sync', onSync);
        emitter.on('Room', onRoomUpdate);
        emitter.on('Room.name', onRoomUpdate);
        emitter.on('RoomState.events', onRoomUpdate);
        emitter.on('RoomMember.name', onRoomUpdate);

        return () => {
            emitter.off('sync', onSync);
            emitter.off('Room', onRoomUpdate);
            emitter.off('Room.name', onRoomUpdate);
            emitter.off('RoomState.events', onRoomUpdate);
            emitter.off('RoomMember.name', onRoomUpdate);
        };
    }, [client]);

    const grouped = useMemo(() => {
        const filtered = rankQuickSwitcherResults(index, debouncedSearch);
        const groups: Record<BaseResult['category'], BaseResult[]> = {
            Rooms: [],
            Spaces: [],
            DMs: [],
            Members: [],
            Settings: [],
            Actions: [],
            Commands: [],
        };

        filtered.forEach((entry) => {
            if (groups[entry.category].length < 20) {
                groups[entry.category].push(entry);
            }
        });

        return groups;
    }, [debouncedSearch, index]);

    const flattened = useMemo(
        () =>
            (Object.keys(grouped) as Array<keyof typeof grouped>).flatMap(
                (category) => grouped[category],
            ),
        [grouped],
    );

    useEffect(() => {
        setSelectedIndex(0);
    }, [debouncedSearch, open]);

    const activate = useCallback(
        async (result: BaseResult) => {
            if (result.category === 'Rooms') {
                navigateRoom(result.id);
                setSelectedSpaceId(null);
                onClose();
                return;
            }

            if (result.category === 'Spaces') {
                navigateSpace(result.id);
                setSelectedRoomId(null);
                onClose();
                return;
            }

            if (result.category === 'DMs') {
                navigateRoom(result.id);
                onClose();
                return;
            }

            if (result.category === 'Members') {
                const room = await client.createRoom({
                    is_direct: true,
                    invite: [result.id],
                    preset: 'private_chat' as never,
                });
                setSelectedRoomId(room.room_id);
                onClose();
                return;
            }

            if (result.category === 'Settings' && result.route) {
                navigate(result.route);
                onClose();
                return;
            }

            if (result.category === 'Actions' && result.actionId) {
                onActionPicked?.(result.actionId);
                onClose();
                return;
            }

            if (result.category === 'Commands') {
                onCommandPicked?.(result.id);
                onClose();
            }
        },
        [
            client,
            navigate,
            navigateRoom,
            navigateSpace,
            onActionPicked,
            onClose,
            onCommandPicked,
            setSelectedRoomId,
            setSelectedSpaceId,
        ],
    );

    const handleSelectionKey = useCallback(
        (key: string, preventDefault: () => void) => {
            if (key === 'Escape') {
                preventDefault();
                onClose();
                return;
            }

            if (!flattened.length) return;
            if (key === 'ArrowDown') {
                preventDefault();
                setSelectedIndex((prev) => (prev + 1) % flattened.length);
                return;
            }
            if (key === 'ArrowUp') {
                preventDefault();
                setSelectedIndex((prev) => (prev - 1 + flattened.length) % flattened.length);
                return;
            }
            if (key === 'Enter') {
                preventDefault();
                const item = flattened[selectedIndex];
                if (item) void activate(item);
            }
        },
        [activate, flattened, onClose, selectedIndex],
    );

    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        handleSelectionKey(event.key, () => event.preventDefault());
    };

    useEffect(() => {
        if (!open) return;
        const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
            handleSelectionKey(event.key, () => event.preventDefault());
        };

        window.addEventListener('keydown', onWindowKeyDown);
        return () => window.removeEventListener('keydown', onWindowKeyDown);
    }, [handleSelectionKey, open]);

    if (!open) return null;

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 100 }}
            onClick={onClose}
        >
            <section
                style={{
                    width: 'min(880px, 95vw)',
                    margin: '6vh auto',
                    maxHeight: '80vh',
                    border: '1px solid var(--border-default)',
                    borderRadius: 14,
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    boxShadow: '0 10px 40px rgba(0,0,0,.35)',
                }}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                <input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search dens, canopies, users, commands"
                    style={{
                        width: '100%',
                        border: 'none',
                        borderBottom: '1px solid var(--border-default)',
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        padding: '14px 16px',
                        fontSize: 16,
                    }}
                />

                <div style={{ maxHeight: 'calc(80vh - 56px)', overflowY: 'auto', padding: 8 }}>
                    <small
                        style={{
                            display: 'block',
                            color: 'var(--text-muted)',
                            fontSize: 11,
                            padding: '2px 8px 8px',
                        }}
                    >
                        Tip: press {keybinds.quickSwitcher} to open, use ↑/↓ to move, Enter to run.
                    </small>
                    {(Object.keys(grouped) as Array<keyof typeof grouped>).map((category) => {
                        const items = grouped[category];
                        if (!items.length) return null;
                        return (
                            <div key={category} style={{ marginBottom: 12 }}>
                                <div
                                    style={{
                                        color: 'var(--text-muted)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        padding: '4px 8px',
                                    }}
                                >
                                    {CATEGORY_LABELS[category]}
                                </div>
                                {items.map((item) => {
                                    const absoluteIndex = flattened.findIndex(
                                        (entry) =>
                                            entry.id === item.id &&
                                            entry.category === item.category,
                                    );
                                    const active = absoluteIndex === selectedIndex;

                                    return (
                                        <button
                                            key={`${item.category}-${item.id}`}
                                            type="button"
                                            onClick={() => void activate(item)}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                border: 'none',
                                                borderRadius: 8,
                                                padding: '8px 10px',
                                                display: 'grid',
                                                gridTemplateColumns: '28px 1fr auto',
                                                gap: 10,
                                                alignItems: 'center',
                                                background: active
                                                    ? 'var(--accent-muted)'
                                                    : 'transparent',
                                                color: 'var(--text-primary)',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    width: 24,
                                                    height: 24,
                                                    borderRadius: 999,
                                                    background: 'var(--bg-input)',
                                                    display: 'grid',
                                                    placeItems: 'center',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {item.avatarUrl ? (
                                                    <img
                                                        src={item.avatarUrl}
                                                        alt={item.title}
                                                        style={{ width: '100%', height: '100%' }}
                                                    />
                                                ) : item.category === 'Commands' ? (
                                                    '⌘'
                                                ) : item.category === 'Members' ? (
                                                    '👤'
                                                ) : item.category === 'Spaces' ? (
                                                    '🗂️'
                                                ) : item.category === 'DMs' ? (
                                                    '💌'
                                                ) : item.category === 'Settings' ? (
                                                    '⚙️'
                                                ) : item.category === 'Actions' ? (
                                                    '⚡'
                                                ) : (
                                                    '💬'
                                                )}
                                            </span>
                                            <span style={{ minWidth: 0 }}>
                                                <span
                                                    style={{
                                                        display: 'block',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {item.title}
                                                </span>
                                                {item.subtitle ? (
                                                    <span
                                                        style={{
                                                            color: 'var(--text-muted)',
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        {item.subtitle}
                                                    </span>
                                                ) : null}
                                            </span>
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                }}
                                            >
                                                {item.hint ? (
                                                    <span
                                                        style={{
                                                            color: 'var(--text-muted)',
                                                            fontSize: 10,
                                                            border: '1px solid var(--border-default)',
                                                            borderRadius: 6,
                                                            padding: '1px 5px',
                                                        }}
                                                    >
                                                        {item.hint}
                                                    </span>
                                                ) : null}
                                                {item.badge ? (
                                                    <span
                                                        style={{
                                                            background: 'var(--accent-primary)',
                                                            color: 'var(--bg-surface)',
                                                            borderRadius: 999,
                                                            fontSize: 11,
                                                            minWidth: 18,
                                                            textAlign: 'center',
                                                            padding: '0 5px',
                                                        }}
                                                    >
                                                        {item.badge}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
};

export default QuickSwitcher;
