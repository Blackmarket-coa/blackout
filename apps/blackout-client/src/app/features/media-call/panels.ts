import type { ShellPanelEntry } from '../../core/features/types';

/**
 * Right-panel widget + sidebar entry for the media pipeline. The widget
 * shows in-flight uploads / completion status; the sidebar entry deep-links
 * to the full route for inspection.
 */
export const mediaPipelinePanels: ShellPanelEntry[] = [
    {
        id: 'media.pipeline.right-panel',
        kind: 'right-panel',
        label: 'Media pipeline',
        to: '/media/uploads',
        order: 70,
    },
    {
        id: 'media.pipeline.sidebar',
        kind: 'sidebar',
        label: 'Media pipeline',
        to: '/media/uploads',
        order: 70,
    },
];

/**
 * Dialpad as a sidebar+workspace surface plus a left-panel-style entry
 * (`port.nav.leftpanel.dialpad` parity).
 */
export const callDialpadPanels: ShellPanelEntry[] = [
    {
        id: 'call.dialpad.workspace',
        kind: 'workspace',
        label: 'Dialpad',
        to: '/call/dialpad',
        order: 75,
    },
    {
        id: 'call.dialpad.sidebar',
        kind: 'sidebar',
        label: 'Dialpad',
        to: '/call/dialpad',
        order: 75,
    },
];

/**
 * Element Call as a sidebar entry behind the legacy `elementCall` flag.
 * No workspace tab — the Element Call surface launches in a dedicated view.
 */
export const callElementPanels: ShellPanelEntry[] = [
    {
        id: 'call.element.sidebar',
        kind: 'sidebar',
        label: 'Element Call',
        to: '/call/element',
        order: 76,
    },
];
