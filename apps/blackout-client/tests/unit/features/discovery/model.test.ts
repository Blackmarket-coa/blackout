import { describe, expect, it, vi } from 'vitest';
import {
  DiscoveryItem,
  performDiscoveryAction,
  rankDiscoveryItems,
} from '../../../../src/app/features/discovery/model';

const makeItem = (overrides: Partial<DiscoveryItem>): DiscoveryItem => ({
  roomId: '!r:hs',
  roomIdOrAlias: '!r:hs',
  name: 'General',
  memberCount: 10,
  joined: false,
  lastActivityTs: 0,
  inHierarchy: false,
  parentSpaceIds: [],
  ...overrides,
});

describe('discovery ranking and filters', () => {
  it('filters by type/access/activity chips', () => {
    const items = [
      makeItem({ roomId: '!space:hs', roomType: 'm.space', joined: true, lastActivityTs: 5 }),
      makeItem({ roomId: '!invite:hs', joinRule: 'invite', joined: false, lastActivityTs: 0 }),
    ];

    const result = rankDiscoveryItems(
      items,
      { type: 'spaces', access: 'joined', activity: 'active' },
      'recency'
    );

    expect(result).toHaveLength(1);
    expect(result[0].roomId).toBe('!space:hs');
  });

  it('sorts by member count and new-to-you', () => {
    const items = [
      makeItem({ roomId: '!known:hs', memberCount: 99, inHierarchy: true, joined: false }),
      makeItem({ roomId: '!new:hs', memberCount: 10, inHierarchy: false, joined: false, lastActivityTs: 9 }),
      makeItem({ roomId: '!joined:hs', memberCount: 50, joined: true }),
    ];

    const byMembers = rankDiscoveryItems(items, { type: 'all', access: 'all', activity: 'all' }, 'member_count');
    expect(byMembers.map((it) => it.roomId)).toEqual(['!known:hs', '!joined:hs', '!new:hs']);

    const byNew = rankDiscoveryItems(items, { type: 'all', access: 'all', activity: 'all' }, 'new_to_you');
    expect(byNew[0].roomId).toBe('!new:hs');
  });

  it('prioritizes exact and prefix matches for relevance', () => {
    const items = [
      makeItem({ roomId: '!1:hs', name: 'Alpha room' }),
      makeItem({ roomId: '!2:hs', name: 'alpha' }),
      makeItem({ roomId: '!3:hs', name: 'Discussion', topic: 'alpha friendly place' }),
    ];

    const result = rankDiscoveryItems(
      items,
      { type: 'all', access: 'all', activity: 'all' },
      'relevance',
      'alpha'
    );

    expect(result.map((it) => it.roomId)).toEqual(['!2:hs', '!1:hs', '!3:hs']);
  });
});

describe('performDiscoveryAction', () => {
  const makeDeps = () => ({
    joinRoom: vi.fn(async (roomIdOrAlias: string) => ({ roomId: roomIdOrAlias })),
    openRoom: vi.fn(),
    openSpace: vi.fn(),
  });

  it('joins a space then opens it as a canopy exactly once — never as a den', async () => {
    const deps = makeDeps();
    const item = makeItem({
      roomId: '!space:hs',
      roomIdOrAlias: '!space:hs',
      roomType: 'm.space',
      joined: false,
    });

    const action = await performDiscoveryAction(item, deps);

    expect(action).toBe('join');
    expect(deps.joinRoom).toHaveBeenCalledTimes(1);
    expect(deps.openSpace).toHaveBeenCalledTimes(1);
    expect(deps.openSpace).toHaveBeenCalledWith('!space:hs');
    expect(deps.openRoom).not.toHaveBeenCalled();
  });

  it('opens an already-joined space without re-joining', async () => {
    const deps = makeDeps();
    const item = makeItem({ roomId: '!space:hs', roomType: 'm.space', joined: true });

    const action = await performDiscoveryAction(item, deps);

    expect(action).toBe('open');
    expect(deps.joinRoom).not.toHaveBeenCalled();
    expect(deps.openSpace).toHaveBeenCalledTimes(1);
    expect(deps.openSpace).toHaveBeenCalledWith('!space:hs');
    expect(deps.openRoom).not.toHaveBeenCalled();
  });

  it('joins a room then opens it as a den — never as a canopy', async () => {
    const deps = makeDeps();
    const item = makeItem({ roomId: '!den:hs', roomIdOrAlias: '!den:hs', joined: false });

    const action = await performDiscoveryAction(item, deps);

    expect(action).toBe('join');
    expect(deps.openRoom).toHaveBeenCalledTimes(1);
    expect(deps.openRoom).toHaveBeenCalledWith('!den:hs');
    expect(deps.openSpace).not.toHaveBeenCalled();
  });
});
