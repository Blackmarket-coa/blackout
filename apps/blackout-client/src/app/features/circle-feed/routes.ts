import { createElement } from 'react';
import { useAtomValue } from 'jotai';
import type { FeatureRoute } from '../../core/features/types';
import { myProfileAtom } from '../profile/profileAtoms';
import CircleFeed from './CircleFeed';
import { CIRCLE_FEED_PATH } from './nav';

const CircleFeedRoutePage = () => {
    // The feed labels the viewer's own hop as "You", so it needs to know who
    // they are; the profile atom is already hydrated at login.
    const profile = useAtomValue(myProfileAtom);
    return createElement(CircleFeed, { viewerId: profile.userId ?? null });
};

export const circleFeedRoutes: FeatureRoute[] = [
    { path: CIRCLE_FEED_PATH, component: CircleFeedRoutePage },
];
