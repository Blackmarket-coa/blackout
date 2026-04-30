// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, expect, it, vi } from 'vitest';

import {
    RegistryFetcherProvider,
    useRegistryFetcher,
} from '../../../../src/app/core/features/RegistryFetcherProvider';
import { buildRegistryFetchers } from '../../../../src/app/core/features/registryFetchers';
import type { ApiClient, ApiRequest } from '@blackout/sdk';

const recordingClient = () => {
    const calls: ApiRequest[] = [];
    const apiClient: ApiClient = async (request) => {
        calls.push(request);
        // Default empty-list shape covers the listChannels / listAlerts / etc paths.
        if (request.path === '/v1/auth/oidc/continue') {
            return {
                roomId: '!a:srv',
                senderId: '@server:srv',
                occurredAt: '2026-04-30T00:00:00.000Z',
                event: 'blackout.auth.session.continued',
                payload: {
                    subject: '@a:srv',
                    issuer: 'https://idp.example',
                    issuedAt: '2026-04-30T00:00:00.000Z',
                    expiresAt: '2026-04-30T01:00:00.000Z',
                    reason: 'login',
                },
            } as never;
        }
        return {} as never;
    };
    return { apiClient, calls };
};

describe('buildRegistryFetchers', () => {
    it('produces fetchers that wire through to the supplied ApiClient', async () => {
        const { apiClient, calls } = recordingClient();
        const fetchers = buildRegistryFetchers(apiClient);

        await fetchers.stegoToolkit.listChannels();
        await fetchers.stegoLifecycle.expireChannel('ch-1');
        await fetchers.mjolnir.listBanLists();
        await fetchers.preferences.fetchBucket('device', 'preferences');
        await fetchers.labs.fetchLabsGate();
        await fetchers.federationHealth.listAlerts();
        await fetchers.townhall.listTownhalls();
        await fetchers.revenueOps.listRevenueSnapshots({ limit: 5 });
        await fetchers.threadActivity.listActivity();
        await fetchers.education.listModules();
        await fetchers.mutualAid.listThreads();

        const paths = calls.map((call) => call.path);
        expect(paths).toEqual(
            expect.arrayContaining([
                '/v1/stego/channels',
                `/v1/stego/channels/${encodeURIComponent('ch-1')}`,
                '/v1/moderation/mjolnir/banlists',
                '/v1/settings/device/preferences',
                '/v1/settings/labs/gate',
                '/v1/federation/alerts',
                '/v1/townhalls',
                '/v1/revenue/ops/snapshots?limit=5',
                '/v1/threads/activity',
                '/v1/education/modules',
                '/v1/deaddrop/mutual-aid/threads',
            ])
        );
    });

    it('unwraps the auth continueOidcSession envelope into { payload }', async () => {
        const { apiClient } = recordingClient();
        const fetchers = buildRegistryFetchers(apiClient);

        const result = await fetchers.auth.continueOidcSession({ reason: 'refresh' });
        expect(result.payload.subject).toBe('@a:srv');
    });
});

describe('RegistryFetcherProvider + useRegistryFetcher', () => {
    it('returns null when the provider is absent', async () => {
        let captured: unknown = 'sentinel';
        const Probe = () => {
            captured = useRegistryFetcher('stegoToolkit');
            return null;
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(<Probe />);
            await Promise.resolve();
        });
        expect(captured).toBeNull();
    });

    it('returns the matching fetcher when the provider is mounted', async () => {
        const { apiClient } = recordingClient();
        const fetchers = buildRegistryFetchers(apiClient);

        let captured: unknown = null;
        const Probe = () => {
            captured = useRegistryFetcher('stegoToolkit');
            return null;
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(
                <RegistryFetcherProvider fetchers={fetchers}>
                    <Probe />
                </RegistryFetcherProvider>
            );
            await Promise.resolve();
        });

        expect(captured).toBe(fetchers.stegoToolkit);
    });

    it('returns null for keys the partial provider didn’t supply', async () => {
        let captured: unknown = 'sentinel';
        const Probe = () => {
            captured = useRegistryFetcher('mutualAid');
            return null;
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(
                <RegistryFetcherProvider fetchers={{}}>
                    <Probe />
                </RegistryFetcherProvider>
            );
            await Promise.resolve();
        });
        expect(captured).toBeNull();
    });
});

describe('Page consumption — stego toolkit example', () => {
    it('uses the context fetcher when no explicit prop is supplied', async () => {
        // Lazy-load the page to keep the import graph isolated; vitest's jsdom
        // already initialized above.
        const { StegoToolkitPage } = await import('../../../../src/app/features/stego-toolkit');

        const listChannels = vi.fn(async () => ({ channels: [] }));
        const fetchers = {
            stegoToolkit: {
                listChannels,
                createChannel: vi.fn(async () => ({})),
            },
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <RegistryFetcherProvider fetchers={fetchers as never}>
                    <StegoToolkitPage />
                </RegistryFetcherProvider>
            );
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(listChannels).toHaveBeenCalled();
    });

    it('explicit fetcher prop wins over the context fetcher', async () => {
        const { StegoToolkitPage } = await import('../../../../src/app/features/stego-toolkit');

        const contextList = vi.fn(async () => ({ channels: [] }));
        const explicitList = vi.fn(async () => ({ channels: [] }));
        const fetchers = {
            stegoToolkit: {
                listChannels: contextList,
                createChannel: vi.fn(async () => ({})),
            },
        };
        const explicit = {
            listChannels: explicitList,
            createChannel: vi.fn(async () => ({})),
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <RegistryFetcherProvider fetchers={fetchers as never}>
                    <StegoToolkitPage fetcher={explicit} />
                </RegistryFetcherProvider>
            );
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(explicitList).toHaveBeenCalled();
        expect(contextList).not.toHaveBeenCalled();
    });
});
