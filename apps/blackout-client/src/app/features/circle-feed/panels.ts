import type { ShellPanelEntry } from '../../core/features/types';
import { CIRCLE_FEED_PATH } from './nav';

export const circleFeedPanels: ShellPanelEntry[] = [
    {
        id: 'circle-feed.sidebar',
        kind: 'sidebar',
        label: 'Your feed',
        description: 'People you follow, and what they chose to relay onward',
        to: CIRCLE_FEED_PATH,
        // Ahead of Town Square (order 10): this is the default place to land.
        order: 5,
    },
];
