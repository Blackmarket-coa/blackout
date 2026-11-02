import type { CoalitionTabId } from '@blackout/core';

/**
 * What lives in the tool bag.
 *
 * Coalition is a map now. The test for whether something belongs on the map is
 * simply whether it has coordinates — a place can be a pin. Everything else is
 * a *tool*: something you carry and use, not somewhere you go.
 *
 * `map` is the world itself, so it is not in the bag. `shop` and `events` are
 * not either: both already have spatial layers (Marketplace, Events) and are
 * reached by tapping a pin.
 *
 * The three boards at the bottom of this list are in the bag for a duller
 * reason — `CoalitionNeed` and `CoalitionProject` carry no location fields at
 * all, and `CoalitionResource.location` is a free-text address rather than
 * lat/long. They are real-world things that ought to be pins; giving them
 * coordinates is a migration and belongs in its own change.
 */
export interface ToolBagEntry {
    id: CoalitionTabId;
    label: string;
    glyph: string;
    /** One line explaining what the tool is for, shown under its label. */
    hint: string;
}

export const TOOL_BAG_ENTRIES: readonly ToolBagEntry[] = [
    { id: 'chat', label: 'Chat', glyph: '💬', hint: 'Talk in this den' },
    { id: 'rings', label: 'Rings', glyph: '⭕', hint: 'Your circles and crews' },
    { id: 'tasks', label: 'Tasks', glyph: '✅', hint: 'To-do, doing, done' },
    { id: 'needs', label: 'Needs', glyph: '🙋', hint: 'What this coalition is looking for' },
    { id: 'projects', label: 'Projects', glyph: '🌱', hint: 'What it is building' },
    { id: 'resources', label: 'Resources', glyph: '🧰', hint: 'Gear and spaces to share' },
    { id: 'kits', label: 'Kits', glyph: '🎒', hint: 'Choose what is in this bag' },
    { id: 'documents', label: 'Documents', glyph: '📄', hint: 'Shared files and references' },
    { id: 'ai', label: 'AI', glyph: '🤖', hint: 'Helpers for this den' },
];

/** Tool ids, for membership checks. */
export const TOOL_BAG_IDS: readonly CoalitionTabId[] = TOOL_BAG_ENTRIES.map((entry) => entry.id);

export function isToolBagId(value: string): value is CoalitionTabId {
    return (TOOL_BAG_IDS as readonly string[]).includes(value);
}

/**
 * The tools this den actually offers.
 *
 * `enabledTabs` still gates, exactly as it did when these were tabs — `KitsTab`
 * writes that state event and its presets (`coalitionKit.ts`) are unchanged, so
 * a kit now decides what is in the bag rather than what is on a strip. An empty
 * or absent gate means everything.
 *
 * `documents` additionally needs a den to read state from, and `ai` only
 * surfaces in AI dens, so both are filtered on capability rather than config.
 */
export function resolveToolBag(options: {
    enabledTabs?: readonly CoalitionTabId[];
    hasDen: boolean;
    aiEnabled: boolean;
}): ToolBagEntry[] {
    const { enabledTabs, hasDen, aiEnabled } = options;
    const gated = enabledTabs && enabledTabs.length > 0 ? new Set(enabledTabs) : null;

    return TOOL_BAG_ENTRIES.filter((entry) => {
        if (entry.id === 'ai') return aiEnabled;
        if (gated && !gated.has(entry.id)) return false;
        // Both read from a Matrix room; without one they would render an empty
        // shell, which is the clutter this consolidation exists to remove.
        if ((entry.id === 'documents' || entry.id === 'chat') && !hasDen) return false;
        return true;
    });
}
