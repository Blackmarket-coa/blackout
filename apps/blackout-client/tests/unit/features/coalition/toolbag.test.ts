import { describe, expect, it } from 'vitest';
import type { CoalitionTabId } from '@blackout/core';
import {
    resolveToolBag,
    TOOL_BAG_ENTRIES,
    TOOL_BAG_IDS,
    isToolBagId,
} from '../../../../src/app/features/coalition/toolbag/toolbag';

const ids = (entries: ReturnType<typeof resolveToolBag>) => entries.map((entry) => entry.id);

describe('tool bag membership', () => {
    /**
     * The map is the world; the bag holds what isn't a place. `map` must never
     * appear in it, and `shop`/`events` are reached as pins because both
     * already have spatial layers.
     */
    it('excludes the map itself and the two layers reachable as pins', () => {
        expect(TOOL_BAG_IDS).not.toContain('map');
        expect(TOOL_BAG_IDS).not.toContain('shop');
        expect(TOOL_BAG_IDS).not.toContain('events');
    });

    it('carries the boards that have no coordinates to be pinned by', () => {
        // CoalitionNeed and CoalitionProject have no location fields at all,
        // and CoalitionResource.location is a free-text address, not lat/lng.
        expect(TOOL_BAG_IDS).toEqual(expect.arrayContaining(['needs', 'projects', 'resources']));
    });

    it('labels and hints every entry, so no tile renders bare', () => {
        TOOL_BAG_ENTRIES.forEach((entry) => {
            expect(entry.label).toBeTruthy();
            expect(entry.hint).toBeTruthy();
            expect(entry.glyph).toBeTruthy();
        });
    });

    it('recognises its own ids and rejects others', () => {
        expect(isToolBagId('tasks')).toBe(true);
        expect(isToolBagId('map')).toBe(false);
        expect(isToolBagId('')).toBe(false);
    });
});

describe('resolveToolBag', () => {
    const full = { hasDen: true, aiEnabled: false };

    it('offers everything but AI in an ordinary den with no gate', () => {
        const entries = resolveToolBag(full);
        expect(ids(entries)).not.toContain('ai');
        expect(ids(entries)).toEqual(expect.arrayContaining(['chat', 'tasks', 'kits']));
    });

    /**
     * `enabledTabs` gated the old tab strip and still gates here — a Coalition
     * Kit now decides what is in the bag rather than what is on a strip.
     */
    it('honours a kit that enables only some tools', () => {
        const entries = resolveToolBag({
            ...full,
            enabledTabs: ['chat', 'map', 'events', 'tasks'] as CoalitionTabId[],
        });
        // `map` and `events` are not bag members, so the gate yields chat+tasks.
        expect(ids(entries)).toEqual(['chat', 'tasks']);
    });

    it('treats an empty gate as no gate rather than an empty bag', () => {
        expect(resolveToolBag({ ...full, enabledTabs: [] }).length).toBeGreaterThan(0);
    });

    it('drops den-backed tools when there is no den to read', () => {
        // Chat and Documents both need a Matrix room; without one they would
        // render an empty shell.
        const entries = resolveToolBag({ hasDen: false, aiEnabled: false });
        expect(ids(entries)).not.toContain('chat');
        expect(ids(entries)).not.toContain('documents');
        expect(ids(entries)).toContain('needs');
    });

    it('surfaces AI only in an AI den, regardless of the gate', () => {
        expect(ids(resolveToolBag({ ...full, aiEnabled: true }))).toContain('ai');
        expect(ids(resolveToolBag({ ...full, aiEnabled: false }))).not.toContain('ai');
        // Even a gate that names `ai` cannot force it into a non-AI den.
        const gated = resolveToolBag({
            ...full,
            aiEnabled: false,
            enabledTabs: ['ai'] as CoalitionTabId[],
        });
        expect(ids(gated)).not.toContain('ai');
    });

    it('can return an empty bag when a gate enables only non-bag tools', () => {
        // The UI shows an explanatory empty state rather than a blank sheet.
        const entries = resolveToolBag({ ...full, enabledTabs: ['map'] as CoalitionTabId[] });
        expect(entries).toEqual([]);
    });
});
