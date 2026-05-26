export const COALITION_STATE_EVENT_TYPE = 'co.bmc.coalition' as const;

export const COALITION_TABS = ['chat', 'video', 'map', 'events', 'shop', 'tasks', 'documents', 'ai'] as const;
export type CoalitionTabId = (typeof COALITION_TABS)[number];

export const DEFAULT_COALITION_TAB: CoalitionTabId = 'chat';

export interface CoalitionStateEventContent {
    enabled: boolean;
    defaultTab?: CoalitionTabId;
    enabledTabs?: CoalitionTabId[];
    canopyId?: string;
    description?: string;
}

export function isValidCoalitionTab(value: string): value is CoalitionTabId {
    return (COALITION_TABS as readonly string[]).includes(value);
}

export function resolveEnabledTabs(
    content: CoalitionStateEventContent | undefined,
): CoalitionTabId[] {
    if (!content || content.enabled === false) return [];
    if (!content.enabledTabs || content.enabledTabs.length === 0) {
        return [...COALITION_TABS];
    }
    return content.enabledTabs.filter(isValidCoalitionTab);
}
