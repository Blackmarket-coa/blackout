import { describe, expect, it } from 'vitest';
import {
    isShellPanelSelectedEvent,
    SHELL_PANEL_KINDS,
    SHELL_PANEL_SELECTED_EVENT_NAME,
} from '@blackout/protocol';
import {
    createShellPanelCatalog,
    type PanelMetadata,
} from '@blackout/sdk';

const fixturePanels: PanelMetadata[] = [
    {
        id: 'governance.workspace',
        kind: 'workspace',
        label: 'Governance',
        to: '/governance',
        order: 50,
        requires: ['governance.read'],
    },
    {
        id: 'governance.mobile-tab',
        kind: 'mobile-tab',
        label: 'Governance',
        to: '/governance',
        order: 50,
    },
    {
        id: 'forum.workspace',
        kind: 'workspace',
        label: 'Forum',
        to: '/forum',
        order: 30,
    },
];

describe('@blackout/protocol shell event schema', () => {
    it('exposes a closed list of shell panel kinds', () => {
        expect([...SHELL_PANEL_KINDS]).toEqual([
            'workspace',
            'mobile-tab',
            'sidebar',
            'right-panel',
        ]);
    });

    it('isShellPanelSelectedEvent narrows valid payloads', () => {
        const valid = {
            event: SHELL_PANEL_SELECTED_EVENT_NAME,
            occurredAt: '2026-04-27T00:00:00.000Z',
            payload: {
                panelId: 'governance.workspace',
                kind: 'workspace' as const,
                to: '/governance',
                state: { tab: 'active' },
            },
        };
        expect(isShellPanelSelectedEvent(valid)).toBe(true);
    });

    it('isShellPanelSelectedEvent rejects malformed payloads', () => {
        expect(isShellPanelSelectedEvent(null)).toBe(false);
        expect(isShellPanelSelectedEvent({})).toBe(false);
        expect(
            isShellPanelSelectedEvent({
                event: 'shell.panel.selected',
                occurredAt: '2026-04-27T00:00:00.000Z',
                // missing payload
            })
        ).toBe(false);
        expect(
            isShellPanelSelectedEvent({
                event: 'shell.panel.selected',
                occurredAt: '2026-04-27T00:00:00.000Z',
                payload: {
                    panelId: 'x',
                    kind: 'not-a-kind',
                    to: '/x',
                },
            })
        ).toBe(false);
    });
});

describe('@blackout/sdk createShellPanelCatalog', () => {
    it('throws when constructing with duplicate panel ids', () => {
        expect(() =>
            createShellPanelCatalog([
                { id: 'dup', kind: 'workspace', label: 'A', to: '/a' },
                { id: 'dup', kind: 'sidebar', label: 'A', to: '/a' },
            ])
        ).toThrow(/duplicate panel id "dup"/);
    });

    it('listPanels filters by kind and orders by `order`', () => {
        const catalog = createShellPanelCatalog(fixturePanels);
        expect(catalog.listPanels('workspace').map((p) => p.id)).toEqual([
            'forum.workspace',
            'governance.workspace',
        ]);
        expect(catalog.listPanels('mobile-tab').map((p) => p.id)).toEqual([
            'governance.mobile-tab',
        ]);
        expect(catalog.listPanels('right-panel')).toEqual([]);
    });

    it('canAccess honors `requires` capability lists', () => {
        const catalog = createShellPanelCatalog(fixturePanels);
        expect(catalog.canAccess('governance.workspace', [])).toBe(false);
        expect(catalog.canAccess('governance.workspace', ['governance.read'])).toBe(true);
        expect(catalog.canAccess('forum.workspace', [])).toBe(true);
        expect(catalog.canAccess('does-not-exist', ['anything'])).toBe(false);
    });

    it('buildSelectionEvent produces a valid `shell.panel.selected` envelope', () => {
        const catalog = createShellPanelCatalog(fixturePanels);

        const event = catalog.buildSelectionEvent('governance.workspace', {
            state: { tab: 'active' },
            occurredAt: '2026-04-27T12:34:56.000Z',
        });
        expect(event).not.toBeNull();
        expect(event).toEqual({
            event: 'shell.panel.selected',
            occurredAt: '2026-04-27T12:34:56.000Z',
            payload: {
                panelId: 'governance.workspace',
                kind: 'workspace',
                to: '/governance',
                state: { tab: 'active' },
            },
        });
        expect(isShellPanelSelectedEvent(event)).toBe(true);
    });

    it('buildSelectionEvent omits `state` when none is supplied', () => {
        const catalog = createShellPanelCatalog(fixturePanels);
        const event = catalog.buildSelectionEvent('forum.workspace', {
            occurredAt: '2026-04-27T00:00:00.000Z',
        });
        expect(event?.payload).not.toHaveProperty('state');
    });

    it('buildSelectionEvent returns null for unknown panel ids', () => {
        const catalog = createShellPanelCatalog(fixturePanels);
        expect(catalog.buildSelectionEvent('nope')).toBeNull();
    });
});
