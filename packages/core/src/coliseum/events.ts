export const COLISEUM_STATE_EVENT_TYPE = 'co.bmc.coliseum' as const;

export const COLISEUM_TABS = [
    'reel',
    'arena',
    'match',
    'shouts',
    'topics',
    'debate',
    'live',
    'challenges',
    'leaderboards',
    'sources',
    'knowledge',
] as const;
export type ColiseumTabId = typeof COLISEUM_TABS[number];

// Coliseum is video-first: the vertical argument reel leads and is the default.
export const DEFAULT_COLISEUM_TAB: ColiseumTabId = 'reel';

export interface ColiseumStateEventContent {
    enabled: boolean;
    defaultTab?: ColiseumTabId;
    enabledTabs?: ColiseumTabId[];
    canopyId?: string;
    description?: string;
}

export function isValidColiseumTab(value: string): value is ColiseumTabId {
    return (COLISEUM_TABS as readonly string[]).includes(value);
}

export function resolveEnabledColiseumTabs(
    content: ColiseumStateEventContent | undefined
): ColiseumTabId[] {
    if (!content || content.enabled === false) return [];
    if (!content.enabledTabs || content.enabledTabs.length === 0) {
        return [...COLISEUM_TABS];
    }
    return content.enabledTabs.filter(isValidColiseumTab);
}
