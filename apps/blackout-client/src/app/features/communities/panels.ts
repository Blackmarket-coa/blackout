import type { ShellPanelEntry } from '../../core/features/types';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { CANOPIES_PATH } from '../../pages/paths';

/**
 * One door, not two. This entry is labelled "Canopies" and now points at the
 * canopies hub, which is what the label always implied — it previously targeted
 * `/communities`, so the app had two separate destinations for the same idea.
 * The canonical `/communities/:canopyId(/dens/:denId)` server-page routes are
 * untouched; only the bare index is superseded.
 */
export const communitiesPanels: ShellPanelEntry[] = [
    {
        id: 'communities.sidebar',
        kind: 'sidebar',
        label: BLACKOUT_TERMS.canopy.titlePlural,
        to: CANOPIES_PATH,
        order: 20,
    },
];
