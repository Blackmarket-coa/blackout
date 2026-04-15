import { describe, expect, it, vi } from 'vitest';
import {
  DiscoveryItem,
  getNextKeyboardIndex,
  performDiscoveryAction,
} from '../../../src/app/features/discovery/model';

const makeItem = (overrides: Partial<DiscoveryItem>): DiscoveryItem => ({
  roomId: '!room:hs',
  roomIdOrAlias: '!room:hs',
  name: 'Room',
  memberCount: 1,
  joined: false,
  lastActivityTs: 0,
  inHierarchy: false,
  parentSpaceIds: [],
  ...overrides,
});

describe('discovery keyboard smoke path', () => {
  it('walks list via keyboard and joins then opens the selected room', async () => {
    const items = [makeItem({ roomId: '!a:hs' }), makeItem({ roomId: '!b:hs', roomIdOrAlias: '#b:hs' })];

    let index = -1;
    index = getNextKeyboardIndex(index, items.length, 'ArrowDown');
    index = getNextKeyboardIndex(index, items.length, 'ArrowDown');
    expect(index).toBe(1);

    const joinRoom = vi.fn(async () => ({ roomId: '!b:hs' }));
    const openRoom = vi.fn();
    const openSpace = vi.fn();

    const action = await performDiscoveryAction(items[index], { joinRoom, openRoom, openSpace });

    expect(action).toBe('join');
    expect(joinRoom).toHaveBeenCalledWith('#b:hs', undefined);
    expect(openRoom).toHaveBeenCalledWith('!b:hs');
    expect(openSpace).not.toHaveBeenCalled();
  });

  it('opens joined spaces without rejoining', async () => {
    const space = makeItem({ roomId: '!space:hs', roomType: 'm.space', joined: true });
    const joinRoom = vi.fn(async () => ({ roomId: '!space:hs' }));
    const openRoom = vi.fn();
    const openSpace = vi.fn();

    const action = await performDiscoveryAction(space, { joinRoom, openRoom, openSpace });

    expect(action).toBe('open');
    expect(joinRoom).not.toHaveBeenCalled();
    expect(openSpace).toHaveBeenCalledWith('!space:hs');
    expect(openRoom).not.toHaveBeenCalled();
  });
});
