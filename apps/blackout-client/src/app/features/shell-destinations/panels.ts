import type { ShellPanelEntry } from '../../core/features/types';
import {
    COMMUNITIES_PATH,
    CREATE_PATH,
    INBOX_PATH,
    MARKET_PATH,
    ROOT_PATH,
} from '../../pages/paths';

/**
 * Five canonical AppShell destinations rendered as mobile-tab entries
 * (and adopted by the desktop rail in PR 2). The `id` namespace is
 * intentional: BottomTabBar filters to exactly these ids so other
 * features that register mobile-tab panels (governance, etc.) stay out
 * of the AppShell tab bar.
 *
 * Each panel `to` points at an existing or near-term route so the bar
 * always navigates to a real surface as subsequent PRs come online:
 *   - shell.home → `/` (ClientLayout root today, HomeFeed in PR 2)
 *   - shell.communities → `/communities` (CommunitiesView, wired)
 *   - shell.create → `/create` (placeholder until PR 1 follow-up wires it)
 *   - shell.market → `/market` (PR 3 hoists existing MarketplaceSlice here)
 *   - shell.inbox → `/messages/` (existing MessagingHub)
 */
export const shellDestinationPanels: ShellPanelEntry[] = [
    {
        id: 'shell.home',
        kind: 'mobile-tab',
        label: 'Home',
        to: ROOT_PATH,
        order: 10,
    },
    {
        id: 'shell.communities',
        kind: 'mobile-tab',
        label: 'Communities',
        to: COMMUNITIES_PATH,
        order: 20,
    },
    {
        id: 'shell.create',
        kind: 'mobile-tab',
        label: 'Create',
        to: CREATE_PATH,
        order: 30,
    },
    {
        id: 'shell.market',
        kind: 'mobile-tab',
        label: 'Market',
        to: MARKET_PATH,
        order: 40,
    },
    {
        id: 'shell.inbox',
        kind: 'mobile-tab',
        label: 'Inbox',
        to: INBOX_PATH,
        order: 50,
    },
];
