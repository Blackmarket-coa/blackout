import { describe, expect, it } from 'vitest';
import type { MatrixClient, Room, RoomMember } from 'matrix-js-sdk';
import {
  getRoomName,
  getRoomAvatar,
  getRoomTopic,
  isSpace,
  isDM,
  getRoomType,
  getJoinedMembers,
  getPowerLevel,
  canDoAction,
} from '../../../src/app/utils/room';

const mockRoom = (overrides: {
  name?: string;
  roomId?: string;
  type?: string;
  avatarUrl?: string | null;
  topic?: string | null;
  joinedMembers?: RoomMember[];
  joinRule?: string;
  powerLevels?: Record<string, unknown>;
}): Room =>
  ({
    name: overrides.name ?? '',
    roomId: overrides.roomId ?? '!room:example.org',
    getType: () => overrides.type,
    getAvatarUrl: () => overrides.avatarUrl ?? null,
    getJoinedMembers: () => overrides.joinedMembers ?? [],
    currentState: {
      getStateEvents: (eventType: string, stateKey?: string) => {
        if (eventType === 'm.room.topic') {
          return overrides.topic != null ? { getContent: () => ({ topic: overrides.topic }) } : null;
        }
        if (eventType === 'm.room.join_rules') {
          return overrides.joinRule ? { getContent: () => ({ join_rule: overrides.joinRule }) } : null;
        }
        if (eventType === 'm.room.power_levels') {
          return overrides.powerLevels ? { getContent: () => overrides.powerLevels } : null;
        }
        return null;
      },
    },
  }) as unknown as Room;

const mockClient = (homeserverUrl = 'https://matrix.example.org'): MatrixClient =>
  ({
    getHomeserverUrl: () => homeserverUrl,
  }) as unknown as MatrixClient;

describe('room utils', () => {
  it('getRoomName returns display name fallback', () => {
    expect(getRoomName(mockRoom({ name: 'General' }))).toBe('General');
    expect(getRoomName(mockRoom({ name: '', roomId: '!abc:example.org' }))).toBe('!abc:example.org');
  });

  it('getRoomAvatar resolves avatar URL from mxc', () => {
    expect(getRoomAvatar(mockRoom({ avatarUrl: 'https://matrix.example.org/media/avatar.png' }), mockClient())).toBe(
      'https://matrix.example.org/media/avatar.png',
    );
    expect(getRoomAvatar(mockRoom({ avatarUrl: null }), mockClient())).toBeNull();
  });

  it('getRoomTopic extracts room topic state', () => {
    expect(getRoomTopic(mockRoom({ topic: 'Welcome!' }))).toBe('Welcome!');
    expect(getRoomTopic(mockRoom({ topic: null }))).toBeNull();
  });

  it('isSpace detects m.space rooms', () => {
    expect(isSpace(mockRoom({ type: 'm.space' }))).toBe(true);
    expect(isSpace(mockRoom({ type: undefined }))).toBe(false);
  });

  it('isDM detects direct-message rooms', () => {
    const twoMembers = [{}, {}] as RoomMember[];
    expect(isDM(mockRoom({ joinedMembers: twoMembers }))).toBe(true);
    expect(isDM(mockRoom({ joinedMembers: [{} as RoomMember] }))).toBe(false);
    expect(isDM(mockRoom({ type: 'm.space', joinedMembers: twoMembers }))).toBe(false);
  });

  it('getRoomType resolves room label', () => {
    expect(getRoomType(mockRoom({ type: 'm.space' }))).toBe('space');
    expect(getRoomType(mockRoom({ type: 'org.matrix.msc3417.call' }))).toBe('voice');
    expect(getRoomType(mockRoom({ type: 'io.element.thread' }))).toBe('forum');
    expect(getRoomType(mockRoom({ joinRule: 'knock' }))).toBe('announcement');
    expect(getRoomType(mockRoom({ joinRule: 'restricted' }))).toBe('announcement');
    expect(getRoomType(mockRoom({}))).toBe('text');
  });

  it('getJoinedMembers returns joined users', () => {
    const members = [{ userId: '@a:example.org' }, { userId: '@b:example.org' }] as RoomMember[];
    expect(getJoinedMembers(mockRoom({ joinedMembers: members }))).toEqual(members);
  });

  it('getPowerLevel resolves effective user level', () => {
    const powerLevels = { users: { '@admin:example.org': 100 }, users_default: 0 };
    const room = mockRoom({ powerLevels });
    expect(getPowerLevel(room, '@admin:example.org')).toBe(100);
    expect(getPowerLevel(room, '@user:example.org')).toBe(0);
  });

  it('canDoAction checks power-level permissions', () => {
    const powerLevels = {
      users: { '@mod:example.org': 50 },
      users_default: 0,
      events: { 'm.room.name': 50 },
      events_default: 0,
    };
    const room = mockRoom({ powerLevels });
    expect(canDoAction(room, '@mod:example.org', 'm.room.name')).toBe(true);
    expect(canDoAction(room, '@user:example.org', 'm.room.name')).toBe(false);
    expect(canDoAction(room, '@user:example.org', 'm.room.message')).toBe(true);
  });
});
