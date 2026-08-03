import { describe, expect, it } from 'vitest';
import type { Room } from 'matrix-js-sdk';
import {
    combineIntoFolder,
    itemKey,
    moveByOffset,
    moveEntry,
    normalizeLayout,
    orderCanopiesByLayout,
    parseCanopyRailLayout,
    pruneFolders,
    railEntries,
    toggleFolderCollapsed,
    type CanopyRailLayout,
} from '../../../src/app/state/canopyLayout';

const room = (roomId: string): Room => ({ roomId } as Room);

const canopy = (canopyId: string) => ({ type: 'canopy', canopyId } as const);

const folder = (id: string, canopyIds: string[], collapsed = false) =>
    ({ type: 'folder', id, canopyIds, collapsed } as const);

const layoutOf = (...items: CanopyRailLayout['items']): CanopyRailLayout => ({
    version: 1,
    items: [...items],
});

const keys = (layout: CanopyRailLayout): string[] => layout.items.map(itemKey);

describe('parseCanopyRailLayout', () => {
    it('returns the empty layout for junk content', () => {
        expect(parseCanopyRailLayout(null).items).toEqual([]);
        expect(parseCanopyRailLayout('nope').items).toEqual([]);
        expect(parseCanopyRailLayout({ version: 2, items: [canopy('!a:x')] }).items).toEqual([]);
    });

    it('keeps well-formed items and drops malformed ones', () => {
        const parsed = parseCanopyRailLayout({
            version: 1,
            items: [
                canopy('!a:x'),
                { type: 'folder', id: 'f1', canopyIds: ['!b:x', 42], name: 7, collapsed: 'yes' },
                { type: 'mystery' },
                null,
            ],
        });
        expect(parsed.items).toEqual([
            { type: 'canopy', canopyId: '!a:x' },
            { type: 'folder', id: 'f1', name: undefined, collapsed: false, canopyIds: ['!b:x'] },
        ]);
    });
});

describe('normalizeLayout', () => {
    it('drops unknown and duplicate references and appends unlisted canopies', () => {
        const layout = layoutOf(canopy('!gone:x'), canopy('!a:x'), canopy('!a:x'));
        const normalized = normalizeLayout(layout, ['!a:x', '!b:x']);
        expect(keys(normalized)).toEqual(['!a:x', '!b:x']);
    });

    it('inlines singleton folders and drops empty ones', () => {
        const layout = layoutOf(
            folder('f-empty', ['!gone:x']),
            folder('f-single', ['!a:x', '!left:x']),
            canopy('!b:x')
        );
        const normalized = normalizeLayout(layout, ['!a:x', '!b:x']);
        expect(normalized.items).toEqual([
            { type: 'canopy', canopyId: '!a:x' },
            { type: 'canopy', canopyId: '!b:x' },
        ]);
    });
});

describe('pruneFolders', () => {
    it('keeps folders with two or more members', () => {
        const layout = pruneFolders(layoutOf(folder('f1', ['!a:x', '!b:x'])));
        expect(layout.items).toHaveLength(1);
        expect(layout.items[0]).toMatchObject({ type: 'folder', id: 'f1' });
    });
});

describe('moveEntry', () => {
    it('reorders top-level items before and after a target', () => {
        const layout = layoutOf(canopy('!a:x'), canopy('!b:x'), canopy('!c:x'));
        expect(keys(moveEntry(layout, '!c:x', { key: '!a:x', position: 'before' }))).toEqual([
            '!c:x',
            '!a:x',
            '!b:x',
        ]);
        expect(keys(moveEntry(layout, '!a:x', { key: '!c:x', position: 'after' }))).toEqual([
            '!b:x',
            '!c:x',
            '!a:x',
        ]);
    });

    it('moves a canopy out of its folder, dissolving a resulting singleton', () => {
        const layout = layoutOf(folder('f1', ['!a:x', '!b:x']), canopy('!c:x'));
        const moved = moveEntry(layout, '!a:x', { key: '!c:x', position: 'after' });
        expect(moved.items).toEqual([
            { type: 'canopy', canopyId: '!b:x' },
            { type: 'canopy', canopyId: '!c:x' },
            { type: 'canopy', canopyId: '!a:x' },
        ]);
    });

    it('inserts a canopy between folder members when the drop targets one', () => {
        const layout = layoutOf(folder('f1', ['!a:x', '!b:x']), canopy('!c:x'));
        const moved = moveEntry(layout, '!c:x', {
            key: '!b:x',
            position: 'before',
            folderId: 'f1',
        });
        expect(moved.items).toEqual([
            { type: 'folder', id: 'f1', collapsed: false, canopyIds: ['!a:x', '!c:x', '!b:x'] },
        ]);
    });

    it('moves whole folders and refuses to nest one inside another', () => {
        const layout = layoutOf(folder('f1', ['!a:x', '!b:x']), canopy('!c:x'));
        expect(keys(moveEntry(layout, 'f1', { key: '!c:x', position: 'after' }))).toEqual([
            '!c:x',
            'f1',
        ]);
        expect(
            moveEntry(layout, 'f1', { key: '!a:x', position: 'before', folderId: 'f1' })
        ).toEqual(layout);
    });

    it('is a no-op when source and target are the same item', () => {
        const layout = layoutOf(canopy('!a:x'), canopy('!b:x'));
        expect(moveEntry(layout, '!a:x', { key: '!a:x', position: 'before' })).toEqual(layout);
    });
});

describe('combineIntoFolder', () => {
    it('forms a folder at the target position from two canopies', () => {
        const layout = layoutOf(canopy('!a:x'), canopy('!b:x'), canopy('!c:x'));
        const combined = combineIntoFolder(layout, '!c:x', '!a:x', 'f-new');
        expect(combined.items).toEqual([
            { type: 'folder', id: 'f-new', collapsed: false, canopyIds: ['!a:x', '!c:x'] },
            { type: 'canopy', canopyId: '!b:x' },
        ]);
    });

    it('files a canopy into an existing folder, deduplicating membership', () => {
        const layout = layoutOf(folder('f1', ['!a:x', '!b:x']), canopy('!c:x'));
        const combined = combineIntoFolder(layout, '!c:x', 'f1');
        expect(combined.items).toEqual([
            { type: 'folder', id: 'f1', collapsed: false, canopyIds: ['!a:x', '!b:x', '!c:x'] },
        ]);
        expect(combineIntoFolder(combined, '!c:x', 'f1')).toEqual(combined);
    });

    it('ignores folder sources and self-drops', () => {
        const layout = layoutOf(folder('f1', ['!a:x', '!b:x']), canopy('!c:x'));
        expect(combineIntoFolder(layout, 'f1', '!c:x')).toEqual(layout);
        expect(combineIntoFolder(layout, '!c:x', '!c:x')).toEqual(layout);
    });
});

describe('toggleFolderCollapsed', () => {
    it('flips only the addressed folder', () => {
        const layout = layoutOf(folder('f1', ['!a:x', '!b:x']), folder('f2', ['!c:x', '!d:x']));
        const toggled = toggleFolderCollapsed(layout, 'f1');
        expect(toggled.items[0]).toMatchObject({ id: 'f1', collapsed: true });
        expect(toggled.items[1]).toMatchObject({ id: 'f2', collapsed: false });
    });
});

describe('moveByOffset', () => {
    it('moves top-level items and clamps at the ends', () => {
        const layout = layoutOf(canopy('!a:x'), folder('f1', ['!b:x', '!c:x']), canopy('!d:x'));
        expect(keys(moveByOffset(layout, '!a:x', 1))).toEqual(['f1', '!a:x', '!d:x']);
        expect(moveByOffset(layout, '!a:x', -1)).toEqual(layout);
        expect(moveByOffset(layout, '!d:x', 1)).toEqual(layout);
    });

    it('moves a canopy within its folder', () => {
        const layout = layoutOf(folder('f1', ['!a:x', '!b:x', '!c:x']));
        const moved = moveByOffset(layout, '!c:x', -1, 'f1');
        expect(moved.items[0]).toMatchObject({ canopyIds: ['!a:x', '!c:x', '!b:x'] });
    });
});

describe('railEntries / orderCanopiesByLayout', () => {
    it('resolves layout items into rooms, folders expanded in place', () => {
        const rooms = [room('!a:x'), room('!b:x'), room('!c:x'), room('!d:x')];
        const layout = layoutOf(canopy('!d:x'), folder('f1', ['!b:x', '!a:x']));
        const entries = railEntries(rooms, layout);
        expect(entries).toHaveLength(3);
        expect(entries[0]).toMatchObject({ kind: 'canopy', room: { roomId: '!d:x' } });
        expect(entries[1]).toMatchObject({ kind: 'folder' });
        expect(orderCanopiesByLayout(rooms, layout).map((entry) => entry.roomId)).toEqual([
            '!d:x',
            '!b:x',
            '!a:x',
            '!c:x',
        ]);
    });
});
