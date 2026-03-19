import { atom } from 'jotai';
import { atomFamily, selectAtom } from 'jotai/utils';
import type { Room } from 'matrix-js-sdk';
import { allRoomsAtom } from './rooms';

export interface SpaceNode {
  roomId: string;
  children: SpaceNode[];
}

const getSpaceChildIds = (room: Room | null): string[] => {
  if (!room) return [];
  const childEvents = room.currentState.getStateEvents('m.space.child');
  return childEvents.map((event) => event.getStateKey()).filter((stateKey): stateKey is string => Boolean(stateKey));
};

/**
 * All rooms that are Matrix spaces (`m.space`).
 */
export const allSpacesAtom = selectAtom(allRoomsAtom, (rooms) =>
  rooms.filter((room) => room.getType() === 'm.space'),
);

/**
 * Atom family returning direct child room IDs for a given space.
 */
export const spaceChildrenAtom = atomFamily((spaceId: string) =>
  atom<string[]>((get) => {
    const room = get(allRoomsAtom).find((candidate) => candidate.roomId === spaceId) ?? null;
    return getSpaceChildIds(room);
  }),
);

const buildHierarchy = (space: Room, roomMap: Map<string, Room>, visited = new Set<string>()): SpaceNode => {
  if (visited.has(space.roomId)) {
    return { roomId: space.roomId, children: [] };
  }

  visited.add(space.roomId);

  const children = getSpaceChildIds(space)
    .map((roomId) => roomMap.get(roomId))
    .filter((room): room is Room => room !== undefined)
    .filter((room) => room.getType() === 'm.space')
    .map((childSpace) => buildHierarchy(childSpace, roomMap, new Set(visited)));

  return {
    roomId: space.roomId,
    children,
  };
};

/**
 * Full recursive tree of all spaces and nested space children.
 */
export const spaceHierarchyAtom = selectAtom(allSpacesAtom, (spaces) => {
  const roomMap = new Map(spaces.map((space) => [space.roomId, space]));
  return spaces.map((space) => buildHierarchy(space, roomMap));
});

/**
 * Currently selected space ID for navigation context.
 */
export const selectedSpaceAtom = atom<string | null>(null);
