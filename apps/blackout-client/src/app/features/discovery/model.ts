import { RoomType } from 'matrix-js-sdk';

export type DiscoveryTypeFilter = 'all' | 'rooms' | 'spaces';
export type DiscoveryAccessFilter = 'all' | 'joined' | 'joinable' | 'invite';
export type DiscoveryActivityFilter = 'all' | 'active' | 'quiet';

export type DiscoverySort = 'recency' | 'relevance' | 'member_count' | 'new_to_you';

export type DiscoveryFilters = {
  type: DiscoveryTypeFilter;
  access: DiscoveryAccessFilter;
  activity: DiscoveryActivityFilter;
};

export type DiscoveryItem = {
  roomIdOrAlias: string;
  roomId: string;
  name: string;
  topic?: string;
  roomType?: string;
  memberCount: number;
  joined: boolean;
  joinRule?: string;
  worldReadable?: boolean;
  lastActivityTs: number;
  inHierarchy: boolean;
  parentSpaceIds: string[];
};

const isSpace = (item: DiscoveryItem): boolean => item.roomType === RoomType.Space;

const getRelevanceScore = (item: DiscoveryItem, term?: string): number => {
  if (!term) return item.memberCount;
  const lowerTerm = term.toLowerCase();
  const lowerName = item.name.toLowerCase();
  const lowerTopic = item.topic?.toLowerCase() ?? '';

  if (lowerName === lowerTerm) return 1000;
  if (lowerName.startsWith(lowerTerm)) return 750;
  if (lowerName.includes(lowerTerm)) return 500;
  if (lowerTopic.includes(lowerTerm)) return 250;

  return 0;
};

export const filterDiscoveryItems = (
  items: DiscoveryItem[],
  filters: DiscoveryFilters
): DiscoveryItem[] =>
  items.filter((item) => {
    if (filters.type === 'spaces' && !isSpace(item)) return false;
    if (filters.type === 'rooms' && isSpace(item)) return false;

    if (filters.access === 'joined' && !item.joined) return false;
    if (filters.access === 'joinable' && item.joined) return false;
    if (filters.access === 'invite' && item.joinRule !== 'invite') return false;

    if (filters.activity === 'active' && item.lastActivityTs === 0) return false;
    if (filters.activity === 'quiet' && item.lastActivityTs > 0) return false;

    return true;
  });

export const sortDiscoveryItems = (
  items: DiscoveryItem[],
  sort: DiscoverySort,
  term?: string
): DiscoveryItem[] => {
  const copy = [...items];

  switch (sort) {
    case 'member_count':
      return copy.sort((a, b) => b.memberCount - a.memberCount || b.lastActivityTs - a.lastActivityTs);
    case 'new_to_you':
      return copy.sort(
        (a, b) =>
          Number(a.inHierarchy || a.joined) - Number(b.inHierarchy || b.joined) ||
          b.lastActivityTs - a.lastActivityTs
      );
    case 'relevance':
      return copy.sort(
        (a, b) =>
          getRelevanceScore(b, term) - getRelevanceScore(a, term) ||
          b.memberCount - a.memberCount
      );
    case 'recency':
    default:
      return copy.sort((a, b) => b.lastActivityTs - a.lastActivityTs || b.memberCount - a.memberCount);
  }
};

export const rankDiscoveryItems = (
  items: DiscoveryItem[],
  filters: DiscoveryFilters,
  sort: DiscoverySort,
  term?: string
): DiscoveryItem[] => sortDiscoveryItems(filterDiscoveryItems(items, filters), sort, term);

export type DiscoveryActionDeps = {
  joinRoom: (roomIdOrAlias: string, viaServers?: string[]) => Promise<{ roomId: string }>;
  openRoom: (roomId: string) => void;
  openSpace: (roomId: string) => void;
};

export const performDiscoveryAction = async (
  item: DiscoveryItem,
  deps: DiscoveryActionDeps,
  viaServers?: string[]
): Promise<'open' | 'join'> => {
  if (item.joined) {
    if (isSpace(item)) deps.openSpace(item.roomId);
    else deps.openRoom(item.roomId);
    return 'open';
  }

  const joined = await deps.joinRoom(item.roomIdOrAlias, viaServers);
  if (isSpace(item)) deps.openSpace(joined.roomId);
  else deps.openRoom(joined.roomId);
  return 'join';
};

export const getNextKeyboardIndex = (
  currentIndex: number,
  count: number,
  key: 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'
): number => {
  if (count < 1) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (currentIndex < 0) return 0;

  if (key === 'ArrowUp') return Math.max(0, currentIndex - 1);
  return Math.min(count - 1, currentIndex + 1);
};
