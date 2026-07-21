import type { ShellPanelEntry } from '../../core/features/types';
import { MARKET_PATH } from '../../pages/paths';

/**
 * Primary-nav destination for the community marketplace. Registered as a
 * `mobile-tab` panel so it flows into both the desktop PrimaryNavBar and the
 * mobile BottomTabBar (which filter by panel id). `order: 45` sits it between
 * Coliseum (40) and Profile (50). Gated alongside the `/market` route (see
 * manifest.ts) so the tab only appears when the destination is actually
 * reachable.
 */
export const marketDestinationPanels: ShellPanelEntry[] = [
    {
        id: 'shell.market',
        kind: 'mobile-tab',
        label: 'The Black Market',
        to: MARKET_PATH,
        order: 45,
    },
];
