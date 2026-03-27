import { type DragEvent, type MouseEvent, useEffect, useState } from 'react';
import { atom, useAtom, useAtomValue } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { selectedRoomIdAtom } from '../../state/navigation';
import { joinedRoomsAtom } from '../../state/rooms';

interface HierarchyRoom {
  roomId: string;
  name: string;
  avatarUrl?: string;
  topic?: string;
  numJoinedMembers?: number;
  roomType?: string;
  worldReadable?: boolean;
  guestCanJoin?: boolean;
  childrenState?: Array<Record<string, unknown>>;
}

interface CategoryNode {
  id: string;
  name: string;
  children: HierarchyRoom[];
  subspaces: CategoryNode[];
}

const hierarchyCacheAtom = atomFamily(() => atom<CategoryNode[] | null>(null));
const hierarchyLoadingAtom = atomFamily(() => atom<boolean>(false));
const collapseStateAtom = atom<Record<string, boolean>>({});

const iconForRoom = (room: HierarchyRoom | Room): string => {
  const type = 'roomType' in room ? room.roomType ?? '' : room.getType?.() ?? '';
  if (type === 'm.space') return '🗂️';
  if (type.includes('voice')) return '🔊';
  if (type.includes('forum')) return '💬';
  if (type.includes('announcement')) return '📢';
  return '💭';
};

const sortByChildOrder = (rooms: HierarchyRoom[], childrenState: Array<Record<string, unknown>> | undefined): HierarchyRoom[] => {
  if (!childrenState?.length) return rooms;
  const orderMap = new Map<string, string>();

  childrenState.forEach((entry) => {
    const key = typeof entry.state_key === 'string' ? entry.state_key : null;
    const content = typeof entry.content === 'object' && entry.content ? (entry.content as Record<string, unknown>) : null;
    const order = content && typeof content.order === 'string' ? content.order : 'zzzz';
    if (key) orderMap.set(key, order);
  });

  return [...rooms].sort((a, b) => {
    const left = orderMap.get(a.roomId) ?? 'zzzz';
    const right = orderMap.get(b.roomId) ?? 'zzzz';
    if (left === right) return a.name.localeCompare(b.name);
    return left.localeCompare(right);
  });
};

const buildTree = (rootChildren: HierarchyRoom[], all: Map<string, HierarchyRoom[]>): CategoryNode[] => {
  const spaces = rootChildren.filter((child) => child.roomType === 'm.space');
  return spaces.map((space) => {
    const children = all.get(space.roomId) ?? [];
    const sorted = sortByChildOrder(children, space.childrenState);
    const subspaces = sorted.filter((child) => child.roomType === 'm.space');
    const rooms = sorted.filter((child) => child.roomType !== 'm.space');
    return {
      id: space.roomId,
      name: space.name || 'Unnamed',
      children: rooms,
      subspaces: buildTree(subspaces, all),
    };
  });
};

const ContextMenu = ({ x, y, onClose }: { x: number; y: number; onClose: () => void }) => (
  <div style={{ position: 'fixed', left: x, top: y, zIndex: 30, border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', padding: 4 }}>
    {['Mark read', 'Mute', 'Leave', 'Settings'].map((action) => (
      <button key={action} type="button" onClick={onClose} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--text-primary)', padding: '4px 8px' }}>
        {action}
      </button>
    ))}
  </div>
);

const TreeCategory = ({
  node,
  selectedRoomId,
  onSelect,
  collapsed,
  onToggle,
  onDropRoom,
  onContext,
}: {
  node: CategoryNode;
  selectedRoomId: string | null;
  onSelect: (roomId: string) => void;
  collapsed: boolean;
  onToggle: (id: string) => void;
  onDropRoom: (categoryId: string, roomId: string, targetIndex: number) => void;
  onContext: (event: MouseEvent<HTMLButtonElement>, room: HierarchyRoom) => void;
}) => {
  return (
    <section style={{ marginBottom: 8 }}>
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        style={{ width: '100%', border: 'none', background: 'transparent', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, padding: '2px 6px' }}
      >
        <span>{collapsed ? '▶' : '▼'}</span>
        <span>{node.name}</span>
      </button>

      {!collapsed ? (
        <div style={{ paddingLeft: 8 }}>
          {node.children.map((room, idx) => {
            const restricted = room.guestCanJoin === false && room.worldReadable === false;
            const suggested = room.worldReadable && !room.numJoinedMembers;
            const missing = room.name.toLowerCase().includes('deleted') || room.name.toLowerCase().includes('tombstone');
            const voice = (room.roomType ?? '').includes('voice');
            const connectedUsers = room.numJoinedMembers ?? 0;

            return (
              <button
                key={room.roomId}
                type="button"
                draggable
                onDragStart={(event: DragEvent<HTMLButtonElement>) => event.dataTransfer.setData('text/room-id', room.roomId)}
                onDragOver={(event: DragEvent<HTMLButtonElement>) => event.preventDefault()}
                onDrop={(event: DragEvent<HTMLButtonElement>) => {
                  event.preventDefault();
                  const roomId = event.dataTransfer.getData('text/room-id');
                  onDropRoom(node.id, roomId, idx);
                }}
                onContextMenu={(event) => onContext(event, room)}
                onClick={() => onSelect(room.roomId)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: selectedRoomId === room.roomId ? 'var(--accent-muted)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
                title={room.topic ?? room.name}
              >
                <span>{restricted ? '🔒' : iconForRoom(room)}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.name}</span>
                {voice ? <span style={{ color: 'var(--accent-primary)', fontSize: 11 }}>● {connectedUsers}</span> : null}
                {suggested ? <span style={{ border: '1px solid var(--border-default)', borderRadius: 999, padding: '0 6px', fontSize: 11 }}>Join</span> : null}
                {missing ? <span style={{ color: 'var(--danger)', fontSize: 11 }}>Missing</span> : null}
              </button>
            );
          })}

          {node.subspaces.map((child) => (
            <TreeCategory
              key={child.id}
              node={child}
              selectedRoomId={selectedRoomId}
              onSelect={onSelect}
              collapsed={collapsed}
              onToggle={onToggle}
              onDropRoom={onDropRoom}
              onContext={onContext}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
};

export const SpaceTree = ({ spaceId }: { spaceId: string | null }) => {
  const client = useMatrixClient();
  const joinedRooms = useAtomValue(joinedRoomsAtom);
  const [selectedRoomId, setSelectedRoomId] = useAtom(selectedRoomIdAtom);
  const [collapsed, setCollapsed] = useAtom(collapseStateAtom);

  const [cachedTree, setCachedTree] = useAtom(hierarchyCacheAtom(spaceId ?? 'home'));
  const [loading, setLoading] = useAtom(hierarchyLoadingAtom(spaceId ?? 'home'));

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; roomId: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!spaceId) {
      const generalRooms = joinedRooms.filter((room) => room.getType() !== 'm.space').map((room) => ({ roomId: room.roomId, name: room.name, roomType: room.getType?.(), numJoinedMembers: room.getJoinedMemberCount() }));
      setCachedTree([{ id: 'general', name: 'General', children: generalRooms, subspaces: [] }]);
      return;
    }

    const fetch = async () => {
      setLoading(true);
      try {
        const response = await client.getRoomHierarchy(spaceId, 50, undefined, 10);
        const rootChildren = ((response as { rooms?: HierarchyRoom[] }).rooms ?? []) as HierarchyRoom[];
        const map = new Map<string, HierarchyRoom[]>();

        await Promise.all(
          rootChildren
            .filter((room) => room.roomType === 'm.space')
            .map(async (space) => {
              const nested = await client.getRoomHierarchy(space.roomId, 50, undefined, 10);
              map.set(space.roomId, (((nested as { rooms?: HierarchyRoom[] }).rooms ?? []) as HierarchyRoom[]));
            }),
        );

        const tree = buildTree(rootChildren, map);
        const inTreeRoomIds = new Set(tree.flatMap((node) => node.children.map((child) => child.roomId)));
        const general = joinedRooms
          .filter((room) => room.getType() !== 'm.space')
          .filter((room) => !inTreeRoomIds.has(room.roomId))
          .map((room) => ({ roomId: room.roomId, name: room.name, roomType: room.getType?.(), numJoinedMembers: room.getJoinedMemberCount() }));

        if (general.length > 0) {
          tree.push({ id: 'general', name: 'General', children: general, subspaces: [] });
        }

        if (mounted) setCachedTree(tree);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void fetch();
    return () => {
      mounted = false;
    };
  }, [client, joinedRooms, setCachedTree, setLoading, spaceId]);

  const tree = cachedTree ?? [];

  const onDropRoom = (categoryId: string, roomId: string, targetIndex: number) => {
    setCachedTree((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev) as CategoryNode[];
      const category = next.find((node) => node.id === categoryId);
      if (!category) return prev;
      const from = category.children.findIndex((room) => room.roomId === roomId);
      if (from < 0) return prev;
      const [moved] = category.children.splice(from, 1);
      category.children.splice(targetIndex, 0, moved);
      return next;
    });
  };

  if (loading) {
    return <div style={{ padding: 8, color: 'var(--text-muted)' }}>Loading hierarchy…</div>;
  }

  return (
    <div style={{ position: 'relative' }}>
      {tree.map((node) => (
        <TreeCategory
          key={node.id}
          node={node}
          selectedRoomId={selectedRoomId}
          onSelect={setSelectedRoomId}
          collapsed={collapsed[node.id] ?? false}
          onToggle={(id) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))}
          onDropRoom={onDropRoom}
          onContext={(event, room) => {
            event.preventDefault();
            setContextMenu({ x: event.clientX, y: event.clientY, roomId: room.roomId });
          }}
        />
      ))}

      {contextMenu ? <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} /> : null}
    </div>
  );
};

export default SpaceTree;
