import { createElement } from 'react';
import { useAtomValue } from 'jotai';
import { selectedRoomIdAtom } from '../../state/bmc-navigation';
import type { FeatureRoute } from '../../core/features/types';
import ForumView from './ForumView';

const ForumRoutePage = () => {
    const roomId = useAtomValue(selectedRoomIdAtom);

    if (!roomId) {
        return createElement('p', { style: { padding: 12 } }, 'Select a room to open Forum.');
    }

    return createElement(ForumView, { roomId });
};

export const forumRoutes: FeatureRoute[] = [{ path: '/forum', component: ForumRoutePage }];
