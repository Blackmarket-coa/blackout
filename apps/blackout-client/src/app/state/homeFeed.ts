import { atom } from 'jotai';

/**
 * Bump to force the home feed's async sources (statuses, wall posts) to
 * refetch — e.g. right after the composer posts an update. A plain counter
 * the feed hooks include in their effect deps.
 */
export const homeFeedRefreshAtom = atom(0);
