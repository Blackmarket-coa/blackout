import type { ShellPanelEntry } from '../../core/features/types';
import { STREAMING_PATH } from '../../pages/paths';

export const streamingPanels: ShellPanelEntry[] = [
    {
        id: 'streaming.sidebar',
        kind: 'sidebar',
        label: 'Creator Hub',
        to: STREAMING_PATH,
        order: 50,
    },
];
