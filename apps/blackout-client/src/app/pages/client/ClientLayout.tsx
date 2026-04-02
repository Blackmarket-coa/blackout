import { type DragEvent, useEffect, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { useAtomValue } from 'jotai';
import type { MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { joinedRoomsAtom } from '../../state/rooms';
import {
  selectedRoomIdAtom,
  selectedSpaceIdAtom,
  rightPanelAtom,
  roomJumpTargetEventIdAtom,
  roomUnreadMarkerEventIdAtom,
  type RightPanelType,
} from '../../state/navigation';
import { settingsAtom } from '../../state/settings';
import { DeadDropComposer, DeadDropIndicator, DeadDropSettings, useDeadDrop } from '../../features/deaddrop';
import MessageComposer from '../../features/room/MessageComposer';
import RoomTimeline from '../../features/room/RoomTimeline';
import { useRoomTimeline } from '../../hooks/useTimeline';
import { useRoom } from '../../hooks/useRoom';

const RIGHT_PANELS: RightPanelType[] = ['members', 'threads', 'pins', 'search'];

const roomKindIcon = (room: Room): string => {
  const type = room.getType?.() ?? '';
  if (type === 'm.space') return '🗂️';
  if (room.getCanonicalAlias()?.includes('voice')) return '🔊';
  if (room.getCanonicalAlias()?.includes('forum')) return '💬';
  if (room.getCanonicalAlias()?.includes('announce')) return '📢';
  return '💭';
};

const roomUnread = (room: Room): number => room.getUnreadNotificationCount('total') || 0;

const getTimelineBody = (event: MatrixEvent): string => {
  const content = event.getContent<Record<string, unknown>>();
  return typeof content.body === 'string' ? content.body : '';
};

const getTimelineRelation = (event: MatrixEvent): Record<string, unknown> | null => {
  const content = event.getContent<Record<string, unknown>>();
  const relation = content['m.relates_to'];
  return typeof relation === 'object' && relation !== null ? (relation as Record<string, unknown>) : null;
};

const getEventTimestamp = (event: MatrixEvent): string => {
  const ts = event.getTs?.() ?? Date.now();
  return new Date(ts).toLocaleString();
};

const isTablet = (width: number): boolean => width < 1100;
const isMobile = (width: number): boolean => width < 760;

const groupedMembers = (members: RoomMember[]) => {
  const online = members.filter((member) => member.membership === 'join' && (member as RoomMember & { presence?: string }).presence === 'online');
  const away = members.filter((member) => member.membership === 'join' && (member as RoomMember & { presence?: string }).presence === 'unavailable');
  const offline = members.filter((member) => member.membership === 'join' && !(member as RoomMember & { presence?: string }).presence);
  return { online, away, offline };
};

const RightPanelContent = ({
  panel,
  room,
  events,
  onJumpToEvent,
}: {
  panel: Exclude<RightPanelType, null>;
  room: Room | null;
  events: MatrixEvent[];
  onJumpToEvent: (eventId: string) => void;
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  if (!room) {
    return <div style={{ padding: 12, color: 'var(--text-secondary)' }}>Pick a room to view {panel}.</div>;
  }

  if (panel === 'members') {
    const members = groupedMembers(room.getJoinedMembers());
    const renderGroup = (title: string, group: RoomMember[]) => (
      <section style={{ marginBottom: 12 }}>
        <strong style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{title} · {group.length}</strong>
        <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
          {group.map((member) => (
            <div key={member.userId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: title === 'Online' ? 'var(--success)' : title === 'Away' ? 'var(--warning)' : 'var(--text-muted)' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name ?? member.userId}</span>
            </div>
          ))}
        </div>
      </section>
    );

    return (
      <div style={{ padding: 12, overflowY: 'auto', height: 'calc(100% - 44px)' }}>
        {renderGroup('Online', members.online)}
        {renderGroup('Away', members.away)}
        {renderGroup('Offline', members.offline)}
      </div>
    );
  }

  if (panel === 'threads') {
    const threadEvents = events.filter((event) => getTimelineRelation(event)?.rel_type === 'm.thread');
    return (
      <div style={{ padding: 12, overflowY: 'auto', height: 'calc(100% - 44px)', display: 'grid', gap: 8 }}>
        {threadEvents.length === 0 ? <small style={{ color: 'var(--text-secondary)' }}>No active threads yet.</small> : null}
        {threadEvents.map((event, index) => (
          <button
            key={event.getId() ?? `thread-${index}`}
            type="button"
            style={{ textAlign: 'left', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-input)', padding: 8 }}
            onClick={() => {
              const eventId = event.getId();
              if (eventId) onJumpToEvent(eventId);
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{getEventTimestamp(event)}</div>
            <div>{getTimelineBody(event) || '[thread message]'}</div>
          </button>
        ))}
      </div>
    );
  }

  if (panel === 'pins') {
    const pinState = room.currentState.getStateEvents('m.room.pinned_events', '');
    const pinnedIds = Array.isArray(pinState?.getContent<Record<string, unknown>>()?.pinned)
      ? (pinState?.getContent<Record<string, unknown>>()?.pinned as string[])
      : [];
    const pinnedEvents = pinnedIds
      .map((eventId) => events.find((event) => event.getId() === eventId))
      .filter((event): event is MatrixEvent => Boolean(event));

    return (
      <div style={{ padding: 12, overflowY: 'auto', height: 'calc(100% - 44px)', display: 'grid', gap: 8 }}>
        {pinnedEvents.length === 0 ? <small style={{ color: 'var(--text-secondary)' }}>No pinned messages.</small> : null}
        {pinnedEvents.map((event, index) => (
          <button
            key={event.getId() ?? `pin-${index}`}
            type="button"
            style={{ textAlign: 'left', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-input)', padding: 8 }}
            onClick={() => {
              const eventId = event.getId();
              if (eventId) onJumpToEvent(eventId);
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{getEventTimestamp(event)}</div>
            <div>{getTimelineBody(event) || '[pinned event]'}</div>
          </button>
        ))}
      </div>
    );
  }

  const searchResults = events.filter((event) => getTimelineBody(event).toLowerCase().includes(searchQuery.toLowerCase())).slice(-50).reverse();
  return (
    <div style={{ padding: 12, overflowY: 'auto', height: 'calc(100% - 44px)', display: 'grid', gap: 8 }}>
      <input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search this room"
        style={{ border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-primary)', padding: 8 }}
      />
      {searchQuery.trim().length === 0 ? <small style={{ color: 'var(--text-secondary)' }}>Type to search room messages.</small> : null}
      {searchResults.map((event, index) => (
        <button
          key={event.getId() ?? `search-${index}`}
          type="button"
          style={{ textAlign: 'left', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-input)', padding: 8 }}
          onClick={() => {
            const eventId = event.getId();
            if (eventId) onJumpToEvent(eventId);
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{getEventTimestamp(event)}</div>
          <div>{getTimelineBody(event)}</div>
        </button>
      ))}
    </div>
  );
};

const QuickSwitcher = ({
  rooms,
  open,
  onClose,
  onPick,
}: {
  rooms: Room[];
  open: boolean;
  onClose: () => void;
  onPick: (roomId: string) => void;
}) => {
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => rooms.filter((room) => room.name.toLowerCase().includes(query.toLowerCase())).slice(0, 20),
    [query, rooms],
  );

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 30 }} onClick={onClose}>
      <div
        style={{ width: 520, maxWidth: '92vw', margin: '10vh auto', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 10 }}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
          placeholder="Jump to room…"
          style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 8 }}
        />
        <div style={{ marginTop: 8, maxHeight: 340, overflowY: 'auto' }}>
          {filtered.map((room) => (
            <button
              key={room.roomId}
              type="button"
              onClick={() => onPick(room.roomId)}
              style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--text-primary)', padding: '6px 4px' }}
            >
              {roomKindIcon(room)} {room.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ClientLayout = () => {
  const client = useMatrixClient();
  const rooms = useAtomValue(joinedRoomsAtom);
  const [settings, setSettings] = useAtom(settingsAtom);
  const [selectedRoomId, setSelectedRoomId] = useAtom(selectedRoomIdAtom);
  const [selectedSpaceId, setSelectedSpaceId] = useAtom(selectedSpaceIdAtom);
  const [rightPanel, setRightPanel] = useAtom(rightPanelAtom);
  const [jumpTargetEventId, setJumpTargetEventId] = useAtom(roomJumpTargetEventIdAtom);
  const [unreadMarkerEventId] = useAtom(roomUnreadMarkerEventIdAtom);

  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [quickOpen, setQuickOpen] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [spaceOrder, setSpaceOrder] = useState<string[]>([]);

  const layout = settings.layout ?? { spaceColumnWidth: 64, roomColumnWidth: 260 };
  const spaces = useMemo(() => rooms.filter((room) => room.getType() === 'm.space'), [rooms]);
  const homeRooms = useMemo(() => rooms.filter((room) => room.getType() !== 'm.space'), [rooms]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuickOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (spaceOrder.length > 0) return;
    setSpaceOrder(spaces.map((room) => room.roomId));
  }, [spaceOrder.length, spaces]);

  const orderedSpaces = useMemo(
    () => [...spaces].sort((a, b) => spaceOrder.indexOf(a.roomId) - spaceOrder.indexOf(b.roomId)),
    [spaceOrder, spaces],
  );

  const selectedSpaceRooms = useMemo(() => {
    if (!selectedSpaceId) return homeRooms;
    return homeRooms.filter((room) => room.roomId.includes(selectedSpaceId.slice(1, 5)) || room.name.toLowerCase().includes(selectedSpaceId.slice(1, 4).toLowerCase()));
  }, [homeRooms, selectedSpaceId]);

  const deadDrop = useDeadDrop(selectedRoomId ?? '');
  const activeRoomState = useRoom(selectedRoomId ?? '');
  const timelineState = useRoomTimeline(selectedRoomId ?? '');

  const groups = useMemo(() => {
    if (!selectedSpaceId) {
      return [['Rooms', selectedSpaceRooms] as const];
    }

    const selectedSpace = rooms.find((room) => room.roomId === selectedSpaceId);
    if (!selectedSpace) {
      return [['Rooms', selectedSpaceRooms] as const];
    }

    const childEvents = selectedSpace.currentState.getStateEvents('m.space.child');
    if (!childEvents.length) {
      return [['Rooms', selectedSpaceRooms] as const];
    }

    const orderedChildRoomIds = childEvents
      .map((event) => ({
        roomId: event.getStateKey(),
        order: typeof event.getContent<Record<string, unknown>>().order === 'string' ? event.getContent<Record<string, unknown>>().order as string : 'zzz',
      }))
      .filter((entry): entry is { roomId: string; order: string } => Boolean(entry.roomId))
      .sort((a, b) => a.order.localeCompare(b.order))
      .map((entry) => entry.roomId);

    const roomById = new Map(rooms.map((room) => [room.roomId, room]));
    const directRooms = orderedChildRoomIds.map((roomId) => roomById.get(roomId)).filter((room): room is Room => Boolean(room) && room.getType() !== 'm.space');
    const childSpaces = orderedChildRoomIds.map((roomId) => roomById.get(roomId)).filter((room): room is Room => Boolean(room) && room.getType() === 'm.space');

    const spaceGroups = childSpaces.map((space) => {
      const nestedIds = space.currentState.getStateEvents('m.space.child').map((event) => event.getStateKey()).filter((id): id is string => Boolean(id));
      const nestedRooms = nestedIds.map((id) => roomById.get(id)).filter((room): room is Room => Boolean(room) && room.getType() !== 'm.space');
      return [space.name, nestedRooms] as const;
    });

    return [['General', directRooms] as const, ...spaceGroups];
  }, [rooms, selectedSpaceId, selectedSpaceRooms]);

  const persistSpaceOrder = async (next: string[]) => {
    setSpaceOrder(next);
    await client.setAccountData('blackout.space_order', { order: next });
  };

  const renderRoomContent = () => {
    if (selectedRoomId) {
      return (
        <div style={{ padding: 16, display: 'grid', gap: 12 }}>
          <header style={{ display: 'grid', gap: 8 }}>
            <strong>{rooms.find((room) => room.roomId === selectedRoomId)?.name ?? selectedRoomId}</strong>
            <DeadDropIndicator config={deadDrop.data} queueCount={deadDrop.queueCount} />
          </header>

          <section style={{ border: '1px solid var(--border-default)', borderRadius: 10, height: 'min(62vh, 760px)', minHeight: 360, overflow: 'hidden' }}>
            <RoomTimeline
              roomId={selectedRoomId}
              unreadEventId={unreadMarkerEventId ?? undefined}
              jumpToEventId={jumpTargetEventId ?? undefined}
              onJumpResolved={(eventId, found) => {
                if (eventId === jumpTargetEventId && found) {
                  setJumpTargetEventId(null);
                }
              }}
            />
          </section>

          {deadDrop.data.enabled ? <DeadDropComposer roomId={selectedRoomId} /> : <MessageComposer roomId={selectedRoomId} />}

          <DeadDropSettings roomId={selectedRoomId} />
        </div>
      );
    }
    if (selectedSpaceId) return <div style={{ padding: 16 }}>Space overview: {selectedSpaceId}</div>;
    return <div style={{ padding: 16 }}>Welcome to Blackout.</div>;
  };

  const desktop = !isTablet(viewportWidth);
  const mobile = isMobile(viewportWidth);

  return (
    <section style={{ height: '100vh', width: '100%', display: 'grid', gridTemplateColumns: desktop ? `${layout.spaceColumnWidth}px ${layout.roomColumnWidth}px 1fr` : mobile ? '1fr' : '1fr', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
      <QuickSwitcher
        rooms={homeRooms}
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onPick={(roomId) => {
          setSelectedRoomId(roomId);
          setQuickOpen(false);
        }}
      />

      {(desktop || (!mobile && !selectedRoomId)) ? (
        <aside style={{ borderRight: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 8, background: 'var(--bg-nav)' }}>
          <button type="button" onClick={() => { setSelectedSpaceId(null); setSelectedRoomId(null); }} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-input)' }}>🏠</button>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
            {orderedSpaces.map((space, idx) => (
              <button
                key={space.roomId}
                type="button"
                draggable
                onDragStart={(event: DragEvent<HTMLButtonElement>) => event.dataTransfer.setData('text/plain', space.roomId)}
                onDragOver={(event: DragEvent<HTMLButtonElement>) => event.preventDefault()}
                onDrop={(event: DragEvent<HTMLButtonElement>) => {
                  event.preventDefault();
                  const dragged = event.dataTransfer.getData('text/plain');
                  const next = [...spaceOrder.filter((id) => id !== dragged)];
                  next.splice(idx, 0, dragged);
                  void persistSpaceOrder(next);
                }}
                onClick={() => { setSelectedSpaceId(space.roomId); setSelectedRoomId(null); }}
                style={{ width: 40, height: 40, borderRadius: 12, border: selectedSpaceId === space.roomId ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)', background: 'var(--bg-input)', position: 'relative' }}
                title={space.name}
              >
                {space.name.charAt(0)}
                {roomUnread(space) > 0 ? <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--danger)', color: '#fff', borderRadius: 999, minWidth: 16, fontSize: 10 }}>{roomUnread(space)}</span> : null}
              </button>
            ))}
          </div>
          <button type="button" style={{ width: 40, height: 40, borderRadius: 10, border: '1px dashed var(--border-default)', background: 'var(--bg-input)' }}>＋</button>
        </aside>
      ) : null}

      {(desktop || !mobile) ? (
        <aside style={{ borderRight: '1px solid var(--border-default)', background: 'var(--bg-surface)', display: mobile && selectedRoomId ? 'none' : 'block' }}>
          <header style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', padding: '0 10px' }}>
            <strong>{selectedSpaceId ? rooms.find((room) => room.roomId === selectedSpaceId)?.name ?? 'Space' : 'Home'}</strong>
            <button type="button" onClick={() => setQuickOpen(true)} style={{ border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-input)' }}>Ctrl+K</button>
          </header>

          <div style={{ padding: 8, overflowY: 'auto', height: 'calc(100vh - 52px)' }}>
            {groups.map(([category, categoryRooms]) => {
              const collapsed = collapsedFolders[category] ?? false;
              return (
                <section key={category} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button type="button" onClick={() => setCollapsedFolders((prev) => ({ ...prev, [category]: !collapsed }))} style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary)' }}>
                      {collapsed ? '▶' : '▼'} {category}
                    </button>
                    <button type="button" style={{ border: '1px solid var(--border-default)', borderRadius: 6, background: 'var(--bg-input)' }}>+</button>
                  </div>

                  {!collapsed ? (
                    <div style={{ marginTop: 4 }}>
                      {categoryRooms.length === 0 ? (
                        <small style={{ opacity: 0.8, padding: '4px 8px', display: 'block' }}>No rooms</small>
                      ) : null}
                      {categoryRooms.map((room) => (
                        <button
                          key={room.roomId}
                          type="button"
                          onClick={() => setSelectedRoomId(room.roomId)}
                          style={{ width: '100%', textAlign: 'left', border: 'none', background: selectedRoomId === room.roomId ? 'var(--bg-surface-hover)' : 'transparent', color: 'var(--text-primary)', borderRadius: 8, padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          <span>{roomKindIcon(room)}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.name}</span>
                          {roomUnread(room) > 0 ? (
                            <span style={{ background: 'var(--accent-primary)', color: 'var(--bg-surface)', borderRadius: 999, minWidth: 18, textAlign: 'center', fontSize: 11 }}>{roomUnread(room)}</span>
                          ) : (
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-muted)' }} />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </aside>
      ) : null}

      <main style={{ position: 'relative', minWidth: 0 }}>
        {mobile && selectedRoomId ? (
          <button type="button" onClick={() => setSelectedRoomId(null)} style={{ margin: 8, border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-input)' }}>
            ← Back
          </button>
        ) : null}

        {renderRoomContent()}

        {rightPanel ? (
          <aside style={{ position: 'absolute', top: 0, right: 0, width: 320, height: '100%', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)', boxShadow: '-4px 0 16px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 10, borderBottom: '1px solid var(--border-default)' }}>
              <strong>{rightPanel}</strong>
              <button type="button" onClick={() => setRightPanel(null)}>Close</button>
            </div>
            <RightPanelContent
              panel={rightPanel}
              room={activeRoomState.data}
              events={timelineState.data}
              onJumpToEvent={(eventId) => {
                setJumpTargetEventId(eventId);
                setRightPanel(null);
              }}
            />
          </aside>
        ) : null}

        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
          {RIGHT_PANELS.map((panel) => (
            <button key={panel} type="button" onClick={() => setRightPanel(panel)} style={{ border: '1px solid var(--border-default)', background: 'var(--bg-input)', borderRadius: 8, padding: '4px 8px' }}>
              {panel}
            </button>
          ))}
        </div>
      </main>

      {desktop ? (
        <>
          <div
            role="separator"
            aria-label="Resize space sidebar"
            style={{ position: 'fixed', left: layout.spaceColumnWidth - 2, top: 0, width: 4, height: '100vh', cursor: 'col-resize' }}
            onMouseDown={(event) => {
              const origin = event.clientX;
              const start = layout.spaceColumnWidth;
              const onMove = (moveEvent: MouseEvent) => {
                const width = Math.min(96, Math.max(52, start + (moveEvent.clientX - origin)));
                setSettings((prev) => ({ ...prev, layout: { ...(prev.layout ?? {}), spaceColumnWidth: width } }));
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          />
          <div
            role="separator"
            aria-label="Resize room sidebar"
            style={{ position: 'fixed', left: layout.spaceColumnWidth + layout.roomColumnWidth - 2, top: 0, width: 4, height: '100vh', cursor: 'col-resize' }}
            onMouseDown={(event) => {
              const origin = event.clientX;
              const start = layout.roomColumnWidth;
              const onMove = (moveEvent: MouseEvent) => {
                const width = Math.min(360, Math.max(220, start + (moveEvent.clientX - origin)));
                setSettings((prev) => ({ ...prev, layout: { ...(prev.layout ?? {}), roomColumnWidth: width } }));
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          />
        </>
      ) : null}
    </section>
  );
};

export default ClientLayout;
