// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

const listLinkedAccounts = vi.fn();
const listImportableGuilds = vi.fn();
const listBridges = vi.fn();
const startImport = vi.fn();
const applyImport = vi.fn();
const fetchDashboard = vi.fn();
const connectDiscord = vi.fn();
const createBridge = vi.fn();
const deleteBridge = vi.fn();

vi.mock('./migrationClient', () => ({
    listLinkedAccounts: (...a: unknown[]) => listLinkedAccounts(...a),
    listImportableGuilds: (...a: unknown[]) => listImportableGuilds(...a),
    listBridges: (...a: unknown[]) => listBridges(...a),
    startImport: (...a: unknown[]) => startImport(...a),
    applyImport: (...a: unknown[]) => applyImport(...a),
    fetchDashboard: (...a: unknown[]) => fetchDashboard(...a),
    connectDiscord: (...a: unknown[]) => connectDiscord(...a),
    createBridge: (...a: unknown[]) => createBridge(...a),
    deleteBridge: (...a: unknown[]) => deleteBridge(...a),
}));

import MigrationHubPage from './MigrationHubPage';

const flush = async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <MemoryRouter>
                <MigrationHubPage />
            </MemoryRouter>,
        );
        await flush();
    });
    return { container };
};

describe('MigrationHubPage', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        for (const m of [
            listLinkedAccounts,
            listImportableGuilds,
            listBridges,
            startImport,
            applyImport,
            fetchDashboard,
        ]) {
            m.mockReset();
        }
        listBridges.mockResolvedValue({ activations: [], modes: ['two-way'] });
    });

    it('prompts to connect Discord when not linked', async () => {
        listLinkedAccounts.mockResolvedValue({ providers: ['discord'], accounts: [] });
        const { container } = await mount();
        expect(container.querySelector('[data-testid="connect-discord"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="discord-linked"]')).toBeNull();
    });

    it('lists importable guilds and imports one end to end', async () => {
        listLinkedAccounts.mockResolvedValue({
            providers: ['discord'],
            accounts: [
                { id: 'la1', provider: 'discord', providerUserId: 'd1', providerUsername: 'owner', scopes: ['guilds'] },
            ],
        });
        listImportableGuilds.mockResolvedValue({
            guilds: [{ id: 'guild-1', name: 'My Server', owner: true, manageable: true, approximateMemberCount: 5000 }],
        });
        startImport.mockResolvedValue({ import: { id: 'imp-1' }, snapshot: {} });
        applyImport.mockResolvedValue({
            import: { id: 'imp-1' },
            summary: { spaceId: '!s:t', densCreated: 3, rolesMapped: 2, degraded: false },
        });

        const { container } = await mount();
        expect(container.querySelector('[data-testid="discord-linked"]')).not.toBeNull();
        const guild = container.querySelector('[data-testid="guild-guild-1"]');
        expect(guild).not.toBeNull();

        const importBtn = container.querySelector(
            '[data-testid="import-guild-1"]',
        ) as HTMLButtonElement;
        await act(async () => {
            importBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
        });

        expect(startImport).toHaveBeenCalledWith('guild-1');
        expect(applyImport).toHaveBeenCalledWith('imp-1');
        const summary = container.querySelector('[data-testid="import-summary-guild-1"]');
        expect(summary?.textContent).toContain('3 dens');
    });

    it('loads and renders the adoption dashboard', async () => {
        listLinkedAccounts.mockResolvedValue({
            providers: ['discord'],
            accounts: [{ id: 'la1', provider: 'discord', providerUserId: 'd1', scopes: ['guilds'] }],
        });
        listImportableGuilds.mockResolvedValue({
            guilds: [{ id: 'guild-1', name: 'My Server', owner: true, manageable: true }],
        });
        fetchDashboard.mockResolvedValue({
            guildId: 'guild-1',
            discordMembers: { value: 5000, source: 'discord_guild' },
            blackoutAccounts: { value: 1800, source: 'platform_total' },
            activeBridgedUsers: { value: null, source: 'unavailable' },
            marketplaceParticipants: { value: 450, source: 'platform_total' },
            importedDens: { value: 12, source: 'server_import' },
            bridgedChannels: { value: 4, source: 'bridge_activations' },
            degraded: false,
            generatedAt: '2026-05-31T00:00:00.000Z',
        });

        const { container } = await mount();
        const dashBtn = container.querySelector(
            '[data-testid="dashboard-guild-1"]',
        ) as HTMLButtonElement;
        await act(async () => {
            dashBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
        });
        expect(fetchDashboard).toHaveBeenCalledWith('guild-1');
        const cards = container.querySelector('[data-testid="dashboard-cards"]');
        expect(cards?.textContent).toContain('5000');
        // Unmeasured metric renders as an em dash, never a fabricated number.
        expect(cards?.textContent).toContain('—');
    });
});
