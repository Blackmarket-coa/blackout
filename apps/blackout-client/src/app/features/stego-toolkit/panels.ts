import type { ShellPanelEntry } from '../../core/features/types';

/**
 * Sidebar + workspace + right-panel surfaces for the stego toolkit. The
 * workspace tab renders the channel manager; the right-panel slot exposes
 * the per-room composer (`composer_action:feature-composer-bmc-steganography`
 * parity); the sidebar entry deep-links to the toolkit route.
 */
export const stegoToolkitPanels: ShellPanelEntry[] = [
    {
        id: 'stego.toolkit.workspace',
        kind: 'workspace',
        label: 'Stego toolkit',
        to: '/stego/channels',
        order: 85,
    },
    {
        id: 'stego.toolkit.sidebar',
        kind: 'sidebar',
        label: 'Stego toolkit',
        to: '/stego/channels',
        order: 85,
    },
    {
        id: 'stego.toolkit.right-panel',
        kind: 'right-panel',
        label: 'Stego composer',
        to: '/stego/channels',
        order: 85,
    },
];

/**
 * Ephemeral lifecycle controls — exposed as a room-action analogue
 * (`room_action:feature-room-ephemeral-stego` parity) via a right-panel
 * slot, plus a sidebar entry for direct access.
 */
export const ephemeralStegoLifecyclePanels: ShellPanelEntry[] = [
    {
        id: 'stego.lifecycle.right-panel',
        kind: 'right-panel',
        label: 'Stego lifecycle',
        to: '/stego/channels/lifecycle',
        order: 86,
    },
    {
        id: 'stego.lifecycle.sidebar',
        kind: 'sidebar',
        label: 'Stego lifecycle',
        to: '/stego/channels/lifecycle',
        order: 86,
    },
];
