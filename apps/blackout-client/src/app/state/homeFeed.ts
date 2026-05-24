import { atomWithStorage } from 'jotai/utils';

export type HomeFeedTab = 'following' | 'discover';

export const HOME_FEED_TABS: HomeFeedTab[] = ['following', 'discover'];

export const HOME_FEED_TAB_LABELS: Record<HomeFeedTab, string> = {
    following: 'Following',
    discover: 'Discover',
};

export const homeFeedTabAtom = atomWithStorage<HomeFeedTab>('bmc-home-feed-tab', 'following');
