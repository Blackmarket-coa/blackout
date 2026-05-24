import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type HomeFeedTab = 'following' | 'discover';

/**
 * Bump to force the home feed's async sources (statuses, wall posts) to
 * refetch — e.g. right after the composer posts an update. A plain counter
 * the feed hooks include in their effect deps.
 */
export const homeFeedRefreshAtom = atom(0);

export const HOME_FEED_TABS: HomeFeedTab[] = ['following', 'discover'];

export const HOME_FEED_TAB_LABELS: Record<HomeFeedTab, string> = {
    following: 'Following',
    discover: 'Discover',
};

export const homeFeedTabAtom = atomWithStorage<HomeFeedTab>('bmc-home-feed-tab', 'following');
