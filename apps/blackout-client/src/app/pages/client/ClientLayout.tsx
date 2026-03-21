import { type DragEvent, useEffect, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { joinedRoomsAtom } from '../../state/rooms';
import { selectedRoomIdAtom, selectedSpaceIdAtom, rightPanelAtom, type RightPanelType } from '../../state/navigation';
import { settingsAtom } from '../../state/settings';
import { DeadDropComposer, DeadDropIndicator, DeadDropSettings, useDeadDrop } from '../../features/deaddrop';
import MessageComposer from '../../features/room/MessageComposer';

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

const isTablet = (width: number): boolean => width < 1100;
const isMobile = (width: number): boolean => width < 760;

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

  const groups = useMemo(() => {
    const bucket = new Map<string, Room[]>();
    selectedSpaceRooms.forEach((room) => {
      const key = room.name.charAt(0).toUpperCase() || '#';
      bucket.set(key, [...(bucket.get(key) ?? []), room]);
    });
    return [...bucket.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [selectedSpaceRooms]);

  const persistSpaceOrder = async (next: string[]) => {
    setSpaceOrder(next);
    await client.setAccountData('blackout.space_order', { order: next });
  };

  const renderRoomContent = () => {
    if (selectedRoomId) {
      const room = rooms.find((r) => r.roomId === selectedRoomId);
      const roomName = room?.name ?? selectedRoomId;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <header style={{
            height: 48,
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 1px 0 rgba(4,4,5,0.2)',
            flexShrink: 0,
          }}>
            <span style={{ color: '#6d717a', fontSize: '1.25rem', fontWeight: 600, lineHeight: 1 }}>#</span>
            <strong style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{roomName}</strong>
            <div style={{ width: 1, height: 20, background: '#3a3d45', flexShrink: 0, margin: '0 2px' }} />
            <DeadDropIndicator config={deadDrop.data} queueCount={deadDrop.queueCount} />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              {RIGHT_PANELS.map((panel) => (
                <button
                  key={panel}
                  type="button"
                  onClick={() => setRightPanel(panel === rightPanel ? null : panel)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    border: 'none',
                    background: rightPanel === panel ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: rightPanel === panel ? 'var(--text-primary)' : '#949ba4',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {panel}
                </button>
              ))}
            </div>
          </header>

          <section style={{ flex: 1, minHeight: 0, padding: '12px 16px', overflowY: 'auto', opacity: 0.7 }}>
            <p style={{ marginTop: 0, fontSize: '0.85rem' }}>Room timeline: {selectedRoomId}</p>
            <small>Timeline UI is elided in this shell build.</small>
          </section>

          <div style={{ padding: '0 16px 16px' }}>
            {deadDrop.data.enabled ? <DeadDropComposer roomId={selectedRoomId} /> : <MessageComposer roomId={selectedRoomId} />}
            <DeadDropSettings roomId={selectedRoomId} />
          </div>
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
        <aside style={{ borderRight: '1px solid rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 8, background: 'var(--bg-nav)' }}>
          <button
            type="button"
            onClick={() => { setSelectedSpaceId(null); setSelectedRoomId(null); }}
            style={{ width: 48, height: 48, borderRadius: selectedSpaceId ? '50%' : '30%', border: 'none', background: selectedSpaceId ? 'var(--bg-input)' : 'var(--accent-primary)', color: 'var(--text-primary)', fontSize: '1.2rem', transition: 'border-radius 200ms ease, background 200ms ease' }}
          >🏠</button>
          <div style={{ width: 32, height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 1, margin: '0 auto' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', alignItems: 'center' }}>
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
                style={{ width: 48, height: 48, borderRadius: selectedSpaceId === space.roomId ? '30%' : '50%', border: 'none', background: selectedSpaceId === space.roomId ? 'var(--accent-primary)' : 'var(--bg-input)', color: 'var(--text-primary)', position: 'relative', fontWeight: 700, fontSize: '0.85rem', transition: 'border-radius 200ms ease, background 200ms ease' }}
                title={space.name}
              >
                {space.name.charAt(0).toUpperCase()}
                {roomUnread(space) > 0 ? <span style={{ position: 'absolute', bottom: -2, right: -2, background: 'var(--danger)', color: '#fff', borderRadius: 999, minWidth: 16, fontSize: 10, lineHeight: '16px', textAlign: 'center' }}>{roomUnread(space)}</span> : null}
              </button>
            ))}
          </div>
          <button type="button" style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', background: 'rgba(59,165,92,0.15)', color: '#3ba55c', fontSize: '1.4rem', fontWeight: 300, transition: 'border-radius 200ms ease, background 200ms ease' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderRadius = '30%'; (e.currentTarget as HTMLButtonElement).style.background = '#3ba55c'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderRadius = '50%'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,165,92,0.15)'; (e.currentTarget as HTMLButtonElement).style.color = '#3ba55c'; }}
          >＋</button>
        </aside>
      ) : null}

      {(desktop || !mobile) ? (
        <aside style={{ borderRight: '1px solid var(--border-default)', background: 'var(--bg-surface)', display: mobile && selectedRoomId ? 'none' : 'block' }}>
          <header style={{ height: 48, minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 1px 0 rgba(4,4,5,0.2)', padding: '0 12px', flexShrink: 0 }}>
            <strong style={{ fontSize: '0.95rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedSpaceId ? rooms.find((room) => room.roomId === selectedSpaceId)?.name ?? 'Space' : 'Home'}</strong>
            <button type="button" onClick={() => setQuickOpen(true)} style={{ border: 'none', borderRadius: 6, background: 'transparent', color: '#949ba4', padding: '4px', cursor: 'pointer', flexShrink: 0 }} title="Quick switcher (Ctrl+K)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
          </header>

          <div style={{ padding: '8px 0', overflowY: 'auto', height: 'calc(100vh - 48px)' }}>
            {groups.map(([category, categoryRooms]) => {
              const collapsed = collapsedFolders[category] ?? false;
              return (
                <section key={category} style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 0 12px', marginBottom: 2 }}>
                    <button
                      type="button"
                      onClick={() => setCollapsedFolders((prev) => ({ ...prev, [category]: !collapsed }))}
                      style={{ border: 'none', background: 'transparent', color: '#6d717a', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer' }}
                    >
                      {collapsed ? '▶' : '▼'} {category}
                    </button>
                    <button type="button" style={{ border: 'none', background: 'transparent', color: '#6d717a', fontSize: '1rem', lineHeight: 1, cursor: 'pointer', padding: '0 4px' }}>+</button>
                  </div>

                  {!collapsed ? (
                    <div>
                      {categoryRooms.map((room) => (
                        <button
                          key={room.roomId}
                          type="button"
                          onClick={() => setSelectedRoomId(room.roomId)}
                          style={{ width: '100%', textAlign: 'left', border: 'none', background: selectedRoomId === room.roomId ? 'rgba(255,255,255,0.1)' : 'transparent', color: selectedRoomId === room.roomId ? 'var(--text-primary)' : '#949ba4', borderRadius: 6, margin: '0 8px', width: 'calc(100% - 16px)', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem' }}
                        >
                          <span style={{ color: '#6d717a', fontSize: '1rem', fontWeight: 600, flexShrink: 0 }}>#</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.name}</span>
                          {roomUnread(room) > 0 ? (
                            <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 999, minWidth: 18, textAlign: 'center', fontSize: 11, lineHeight: '18px', padding: '0 4px', flexShrink: 0 }}>{roomUnread(room)}</span>
                          ) : null}
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
          </aside>
        ) : null}

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
