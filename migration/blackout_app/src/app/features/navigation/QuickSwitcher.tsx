import { useAtom } from 'jotai';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { Room, RoomMember } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/bmc-useMatrixClient';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/bmc-navigation';
import type { QuickActionId } from '../quick-actions/featureEntrypoints';

interface BaseResult {
    id: string;
    category: 'Rooms' | 'Spaces' | 'Users' | 'Commands' | 'Actions';
    title: string;
    subtitle?: string;
    avatarUrl?: string;
    badge?: string;
    keywords: string;
}

interface QuickSwitcherProps {
    open: boolean;
    onClose: () => void;
    onCommandPicked?: (command: string) => void;
    quickActions?: Array<{ id: QuickActionId; label: string; description: string }>;
    onQuickActionPicked?: (actionId: QuickActionId) => void;
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

const buildIndex = (
    rooms: Room[],
    quickActions: Array<{ id: QuickActionId; label: string; description: string }>,
): BaseResult[] => {
    const list: BaseResult[] = [];
    const seenUsers = new Set<string>();

    rooms.forEach((room) => {
        const alias = room.getCanonicalAlias() ?? '';
        const unread = room.getUnreadNotificationCount();
        const isSpace = room.getType() === 'm.space';

        list.push({
            id: room.roomId,
            category: isSpace ? 'Spaces' : 'Rooms',
            title: room.name,
            subtitle: alias || room.roomId,
            badge: unread > 0 ? String(unread) : undefined,
            keywords: `${room.name} ${alias} ${room.roomId}`,
        });

        room.getJoinedMembers().forEach((member: RoomMember) => {
            if (seenUsers.has(member.userId)) return;
            seenUsers.add(member.userId);
            list.push({
                id: member.userId,
                category: 'Users',
                title: member.name || member.userId,
                subtitle: member.userId,
                keywords: `${member.name ?? ''} ${member.userId}`,
            });
        });
    });

    COMMANDS.forEach((command) => {
        list.push({
            id: command.cmd,
            category: 'Commands',
            title: command.cmd,
            subtitle: command.desc,
            keywords: `${command.cmd} ${command.desc}`,
        });
    });
    quickActions.forEach((action) => {
        list.push({
            id: action.id,
            category: 'Actions',
            title: action.label,
            subtitle: action.description,
            keywords: `${action.label} ${action.description} ${action.id}`,
        });
    });

    return list;
};

export const QuickSwitcher = ({
    open,
    onClose,
    onCommandPicked,
    quickActions = [],
    onQuickActionPicked,
}: QuickSwitcherProps) => {
    const client = useMatrixClient();
    const [, setSelectedRoomId] = useAtom(selectedRoomIdAtom);
    const [, setSelectedSpaceId] = useAtom(selectedSpaceIdAtom);

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [index, setIndex] = useState<BaseResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search), 150);
        return () => window.clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        const rebuild = () => setIndex(buildIndex(client.getRooms(), quickActions));
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
    }, [client, quickActions]);

    const grouped = useMemo(() => {
        const filtered = index.filter((entry) => fuzzyIncludes(entry.keywords, debouncedSearch));
        const groups: Record<BaseResult['category'], BaseResult[]> = {
            Rooms: [],
            Spaces: [],
            Users: [],
            Commands: [],
            Actions: [],
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
                setSelectedRoomId(result.id);
                setSelectedSpaceId(null);
                onClose();
                return;
            }

            if (result.category === 'Spaces') {
                setSelectedSpaceId(result.id);
                setSelectedRoomId(null);
                onClose();
                return;
            }

            if (result.category === 'Users') {
                const room = await client.createRoom({
                    is_direct: true,
                    invite: [result.id],
                    preset: 'private_chat' as never,
                });
                setSelectedRoomId(room.room_id);
                onClose();
                return;
            }

            if (result.category === 'Commands') {
                onCommandPicked?.(result.id);
                onClose();
                return;
            }

            if (result.category === 'Actions') {
                onQuickActionPicked?.(result.id as QuickActionId);
                onClose();
            }
        },
        [client, onClose, onCommandPicked, onQuickActionPicked, setSelectedRoomId, setSelectedSpaceId],
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
                    placeholder="Search rooms, spaces, users, commands"
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
                                    {category}
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
                                                ) : item.category === 'Users' ? (
                                                    '👤'
                                                ) : item.category === 'Spaces' ? (
                                                    '🗂️'
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
