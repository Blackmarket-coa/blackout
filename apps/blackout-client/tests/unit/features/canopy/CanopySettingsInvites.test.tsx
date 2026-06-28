// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from 'matrix-js-sdk';

// Controllable power levels, hoisted so the vi.mock factory can read it.
const h = vi.hoisted(() => ({ powerLevels: {} as Record<string, unknown> }));

vi.mock('../../../../src/app/hooks/usePowerLevels', async (importOriginal) => {
    const actual = await importOriginal<
        typeof import('../../../../src/app/hooks/usePowerLevels')
    >();
    return { ...actual, usePowerLevels: () => h.powerLevels };
});

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({
        getUserId: () => '@me:server',
        invite: vi.fn().mockResolvedValue(undefined),
        sendStateEvent: vi.fn().mockResolvedValue(undefined),
    }),
}));

// Stub the heavy sub-surfaces composed by the dialog.
vi.mock('../../../../src/app/features/roles/RoleEditor', () => ({
    RoleEditor: () => <div data-testid="role-editor" />,
}));
vi.mock('../../../../src/app/features/moderation/AutoModPanel', () => ({
    AutoModPanel: () => <div data-testid="automod-panel" />,
}));
vi.mock('../../../../src/app/components/invitations', () => ({
    InvitationsManager: () => <div data-testid="invitations-manager" />,
}));

import { CanopySettingsDialog } from '../../../../src/app/features/canopy/CanopySettingsDialog';

const canopy = {
    roomId: '!canopy:server',
    name: 'Test Canopy',
    currentState: { getStateEvents: () => ({ getContent: () => ({}) }) },
} as unknown as Room;

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<CanopySettingsDialog canopy={canopy} onClose={vi.fn()} />);
        await Promise.resolve();
    });
    return { container, root };
};

const clickInvitesTab = async (container: HTMLElement) => {
    const tab = container.querySelector<HTMLButtonElement>(
        '[data-testid="canopy-settings-tab-invites"]'
    );
    await act(async () => {
        tab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
    });
};

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('CanopySettingsDialog — Invites', () => {
    it('shows the shareable-link button for a member with invite power', async () => {
        h.powerLevels = { users: { '@me:server': 100 }, invite: 50 };
        const { container } = await mount();
        await clickInvitesTab(container);

        expect(container.querySelector('[data-testid="canopy-invite-links-open"]')).not.toBeNull();
    });

    it('hides the Invites tab when the user lacks invite power', async () => {
        h.powerLevels = { invite: 50 };
        const { container } = await mount();

        expect(container.querySelector('[data-testid="canopy-settings-tab-invites"]')).toBeNull();
    });
});
