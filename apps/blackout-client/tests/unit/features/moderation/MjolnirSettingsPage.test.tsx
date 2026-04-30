// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MjolnirSettingsPage } from '../../../../src/app/features/moderation';
import type { MjolnirFetcher } from '../../../../src/app/features/moderation';
import type { BanListSnapshot, ProtectionDescriptor } from '@blackout/sdk';

const banList = (overrides: Partial<BanListSnapshot> = {}): BanListSnapshot => ({
    listId: 'personal',
    label: 'Personal',
    subscribed: true,
    rules: [],
    ...overrides,
});

const setInputValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

const mountPage = async (fetcher: MjolnirFetcher) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(<MjolnirSettingsPage fetcher={fetcher} />);
        await Promise.resolve();
        await Promise.resolve();
    });

    return { container, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('MjolnirSettingsPage (BKL-009 finished UI)', () => {
    it('renders the empty-state when no banlists or protections are loaded', async () => {
        const fetcher: MjolnirFetcher = {
            listBanLists: vi.fn(async () => ({ lists: [] })),
            addBanListRule: vi.fn(),
            removeBanListRule: vi.fn(),
            listProtections: vi.fn(async () => ({ protections: [] })),
            setProtectionEnabled: vi.fn(),
        };

        const { container } = await mountPage(fetcher);
        expect(container.querySelector('[data-testid="mjolnir-settings-page"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="mjolnir-banlists-empty"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="mjolnir-protections-empty"]')).toBeTruthy();
    });

    it('renders rules + protections and selects the first list by default', async () => {
        const fetcher: MjolnirFetcher = {
            listBanLists: vi.fn(async () => ({
                lists: [
                    banList({
                        listId: 'personal',
                        rules: [
                            {
                                ruleId: 'r-1',
                                kind: 'user',
                                entity: '@spam:bad.example',
                                reason: 'spam',
                                recommendation: 'ban',
                                updatedAt: '2026-04-30T00:00:00.000Z',
                            },
                        ],
                    }),
                    banList({ listId: 'coc', label: 'CoC' }),
                ],
            })),
            addBanListRule: vi.fn(),
            removeBanListRule: vi.fn(),
            listProtections: vi.fn(async () => ({
                protections: [
                    { id: 'BasicFloodingProtection', label: 'Flooding', enabled: false },
                    { id: 'MentionSpam', label: 'Mention spam', enabled: true },
                ],
            })),
            setProtectionEnabled: vi.fn(),
        };

        const { container } = await mountPage(fetcher);
        const select = container.querySelector(
            '[data-testid="mjolnir-active-list"]'
        ) as HTMLSelectElement;
        expect(select.value).toBe('personal');
        expect(container.querySelector('[data-testid="mjolnir-rule-r-1"]')).toBeTruthy();
        expect(
            container.querySelector('[data-testid="mjolnir-protection-BasicFloodingProtection"]')
        ).toBeTruthy();
        expect(
            container.querySelector('[data-testid="mjolnir-protection-MentionSpam"]')?.textContent
        ).toContain('Disable'); // enabled → button reads "Disable"
    });

    it('rejects empty entities when adding a rule', async () => {
        const fetcher: MjolnirFetcher = {
            listBanLists: vi.fn(async () => ({ lists: [banList()] })),
            addBanListRule: vi.fn(),
            removeBanListRule: vi.fn(),
            listProtections: vi.fn(async () => ({ protections: [] })),
            setProtectionEnabled: vi.fn(),
        };

        const { container } = await mountPage(fetcher);
        const form = container.querySelector(
            '[data-testid="mjolnir-add-rule-form"]'
        ) as HTMLFormElement;

        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
        });

        expect(fetcher.addBanListRule).not.toHaveBeenCalled();
        expect(container.querySelector('[data-testid="mjolnir-action-error"]')?.textContent).toContain(
            'non-empty entity'
        );
    });

    it('classifies @user entities as user-kind and posts the rule', async () => {
        const fetcher: MjolnirFetcher = {
            listBanLists: vi.fn(async () => ({ lists: [banList()] })),
            addBanListRule: vi.fn(async () => ({})),
            removeBanListRule: vi.fn(),
            listProtections: vi.fn(async () => ({ protections: [] })),
            setProtectionEnabled: vi.fn(),
        };

        const { container } = await mountPage(fetcher);
        const entity = container.querySelector(
            '[data-testid="mjolnir-entity-input"]'
        ) as HTMLInputElement;

        await act(async () => {
            setInputValue(entity, '@spam:bad.example');
            await Promise.resolve();
        });

        const form = container.querySelector(
            '[data-testid="mjolnir-add-rule-form"]'
        ) as HTMLFormElement;

        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.addBanListRule).toHaveBeenCalledTimes(1);
        const [listId, input] = (fetcher.addBanListRule as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(listId).toBe('personal');
        expect(input.kind).toBe('user');
        expect(input.entity).toBe('@spam:bad.example');
        // Refresh runs after add.
        expect(fetcher.listBanLists).toHaveBeenCalledTimes(2);
    });

    it('toggles a protection by inverting its current enabled state', async () => {
        const fetcher: MjolnirFetcher = {
            listBanLists: vi.fn(async () => ({ lists: [] })),
            addBanListRule: vi.fn(),
            removeBanListRule: vi.fn(),
            listProtections: vi.fn(async () => ({
                protections: [
                    { id: 'BasicFloodingProtection', label: 'Flooding', enabled: false },
                ] as ProtectionDescriptor[],
            })),
            setProtectionEnabled: vi.fn(async () => ({})),
        };

        const { container } = await mountPage(fetcher);
        const button = container.querySelector(
            '[data-testid="mjolnir-toggle-BasicFloodingProtection"]'
        ) as HTMLButtonElement;

        await act(async () => {
            button.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        // Disabled → enabled (true).
        expect(fetcher.setProtectionEnabled).toHaveBeenCalledWith('BasicFloodingProtection', true);
    });

    it('removes a rule and refreshes', async () => {
        const fetcher: MjolnirFetcher = {
            listBanLists: vi.fn(async () => ({
                lists: [
                    banList({
                        rules: [
                            {
                                ruleId: 'r-x',
                                kind: 'server',
                                entity: 'evil.example',
                                reason: 'shadow',
                                recommendation: 'ban',
                                updatedAt: '2026-04-30T00:00:00.000Z',
                            },
                        ],
                    }),
                ],
            })),
            addBanListRule: vi.fn(),
            removeBanListRule: vi.fn(async () => ({})),
            listProtections: vi.fn(async () => ({ protections: [] })),
            setProtectionEnabled: vi.fn(),
        };

        const { container } = await mountPage(fetcher);
        const remove = container.querySelector(
            '[data-testid="mjolnir-remove-rule-r-x"]'
        ) as HTMLButtonElement;

        await act(async () => {
            remove.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.removeBanListRule).toHaveBeenCalledWith('personal', 'r-x');
        expect(fetcher.listBanLists).toHaveBeenCalledTimes(2);
    });

    it('renders a load-error when fetcher rejects', async () => {
        const fetcher: MjolnirFetcher = {
            listBanLists: vi.fn(async () => {
                throw new Error('listing died');
            }),
            addBanListRule: vi.fn(),
            removeBanListRule: vi.fn(),
            listProtections: vi.fn(async () => ({ protections: [] })),
            setProtectionEnabled: vi.fn(),
        };

        const { container } = await mountPage(fetcher);
        expect(container.querySelector('[data-testid="mjolnir-load-error"]')?.textContent).toContain(
            'listing died'
        );
    });
});
