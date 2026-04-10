import { createElement } from 'react';
import { useAtomValue } from 'jotai';
import { selectedRoomIdAtom } from '../../state/navigation';
import type { BlackoutFeature } from '../../core/features/types';
import ForumView from './ForumView';

const ForumRoutePage = () => {
    const roomId = useAtomValue(selectedRoomIdAtom);

    if (!roomId) {
        return createElement('p', { style: { padding: 12 } }, 'Select a room to open Forum.');
    }

    return createElement(ForumView, { roomId });
};

export const forumFeature: BlackoutFeature = {
    id: 'forum',
    name: 'Forum',
    routes: [{ path: '/forum', component: ForumRoutePage }],
    navItems: [{ label: 'Forum', to: '/forum' }],
    capabilities: ['forum.read', 'forum.write'],
};

export * from './useForum';
export * from './ForumPost';
export * from './CreatePostModal';
export * from './ForumView';
