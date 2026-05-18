import type { ShellPanelEntry } from '../../core/features/types';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

export const communitiesPanels: ShellPanelEntry[] = [
    {
        id: 'communities.sidebar',
        kind: 'sidebar',
        label: BLACKOUT_TERMS.canopy.titlePlural,
        to: '/communities',
        order: 20,
    },
];
