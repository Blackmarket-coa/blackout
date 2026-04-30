// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    LabsPage,
    PreferencesPage,
    SidebarPage,
    type LabsFetcher,
    type PreferencesFetcher,
    type SidebarFetcher,
} from '../../../../src/app/features/settings-parity';
import type { LabsFeatureDescriptor, SettingsBucket } from '@blackout/sdk';

const setInputValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

const setSelectValue = (select: HTMLSelectElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
    )?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
};

const mount = async (ui: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(ui);
        await Promise.resolve();
        await Promise.resolve();
    });
    return { container, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('PreferencesPage (BKL-007 finished UI)', () => {
    it('renders empty bucket state and switches scope to refetch', async () => {
        const fetcher: PreferencesFetcher = {
            fetchBucket: vi.fn(async (scope) => ({
                bucket: { scope, category: 'preferences', values: {} } as SettingsBucket,
            })),
            setSetting: vi.fn(),
        };

        const { container } = await mount(<PreferencesPage fetcher={fetcher} />);

        expect(container.querySelector('[data-testid="preferences-page"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="preferences-bucket-empty"]')).toBeTruthy();
        // First fetch is for 'device' on mount.
        expect(fetcher.fetchBucket).toHaveBeenCalledWith('device', 'preferences');

        const scope = container.querySelector(
            '[data-testid="preferences-scope"]'
        ) as HTMLSelectElement;
        await act(async () => {
            setSelectValue(scope, 'account');
            await Promise.resolve();
        });
        expect(fetcher.fetchBucket).toHaveBeenCalledWith('account', 'preferences');
    });

    it('lists current bucket values and clears one to null', async () => {
        const fetcher: PreferencesFetcher = {
            fetchBucket: vi.fn(async () => ({
                bucket: {
                    scope: 'device',
                    category: 'preferences',
                    values: { language: 'en-US', autocompleteDelay: 200 },
                } as SettingsBucket,
            })),
            setSetting: vi.fn(async () => ({})),
        };

        const { container } = await mount(<PreferencesPage fetcher={fetcher} />);

        expect(container.querySelector('[data-testid="preferences-row-language"]')).toBeTruthy();

        const clear = container.querySelector(
            '[data-testid="preferences-clear-language"]'
        ) as HTMLButtonElement;

        await act(async () => {
            clear.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.setSetting).toHaveBeenCalledWith(
            'device',
            'preferences',
            'language',
            null
        );
        // Optimistic merge should drop the row.
        expect(container.querySelector('[data-testid="preferences-row-language"]')).toBeNull();
    });

    it('saves a draft key/value via the form', async () => {
        const fetcher: PreferencesFetcher = {
            fetchBucket: vi.fn(async () => ({
                bucket: { scope: 'device', category: 'preferences', values: {} } as SettingsBucket,
            })),
            setSetting: vi.fn(async () => ({})),
        };

        const { container } = await mount(<PreferencesPage fetcher={fetcher} />);

        const key = container.querySelector(
            '[data-testid="preferences-draft-key"]'
        ) as HTMLInputElement;
        const value = container.querySelector(
            '[data-testid="preferences-draft-value"]'
        ) as HTMLInputElement;

        await act(async () => {
            setInputValue(key, 'language');
            setInputValue(value, 'es-ES');
            await Promise.resolve();
        });

        const form = container.querySelector(
            '[data-testid="preferences-add-form"]'
        ) as HTMLFormElement;

        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.setSetting).toHaveBeenCalledWith(
            'device',
            'preferences',
            'language',
            'es-ES'
        );
        // Optimistic merge inserts the new row.
        expect(container.querySelector('[data-testid="preferences-row-language"]')).toBeTruthy();
    });

    it('rejects empty key on draft submit', async () => {
        const fetcher: PreferencesFetcher = {
            fetchBucket: vi.fn(async () => ({
                bucket: { scope: 'device', category: 'preferences', values: {} } as SettingsBucket,
            })),
            setSetting: vi.fn(),
        };

        const { container } = await mount(<PreferencesPage fetcher={fetcher} />);
        const form = container.querySelector(
            '[data-testid="preferences-add-form"]'
        ) as HTMLFormElement;

        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
        });

        expect(fetcher.setSetting).not.toHaveBeenCalled();
        expect(
            container.querySelector('[data-testid="preferences-action-error"]')?.textContent
        ).toContain('Key is required');
    });
});

describe('SidebarPage (BKL-007 finished UI)', () => {
    it('renders meta-space toggles with default visibility', async () => {
        const fetcher: SidebarFetcher = {
            fetchBucket: vi.fn(async () => ({
                bucket: { scope: 'account', category: 'sidebar', values: {} } as SettingsBucket,
            })),
            setSetting: vi.fn(),
        };

        const { container } = await mount(<SidebarPage fetcher={fetcher} />);

        expect(container.querySelector('[data-testid="sidebar-row-Home"]')).toBeTruthy();
        expect(
            (container.querySelector('[data-testid="sidebar-toggle-Home"]') as HTMLInputElement).checked
        ).toBe(true);
        expect(
            (container.querySelector('[data-testid="sidebar-toggle-Favourites"]') as HTMLInputElement).checked
        ).toBe(false);
    });

    it('toggles a meta-space and posts the setting', async () => {
        const fetcher: SidebarFetcher = {
            fetchBucket: vi.fn(async () => ({
                bucket: { scope: 'account', category: 'sidebar', values: {} } as SettingsBucket,
            })),
            setSetting: vi.fn(async () => ({})),
        };

        const { container } = await mount(<SidebarPage fetcher={fetcher} />);

        const toggle = container.querySelector(
            '[data-testid="sidebar-toggle-Favourites"]'
        ) as HTMLInputElement;

        await act(async () => {
            toggle.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.setSetting).toHaveBeenCalledWith(
            'account',
            'sidebar',
            'Spaces.enabledMetaSpaces.Favourites',
            true
        );
        expect(
            (container.querySelector('[data-testid="sidebar-toggle-Favourites"]') as HTMLInputElement).checked
        ).toBe(true);
    });

    it('hydrates from a pre-existing bucket', async () => {
        const fetcher: SidebarFetcher = {
            fetchBucket: vi.fn(async () => ({
                bucket: {
                    scope: 'account',
                    category: 'sidebar',
                    values: { 'Spaces.enabledMetaSpaces.People': true },
                } as SettingsBucket,
            })),
            setSetting: vi.fn(),
        };

        const { container } = await mount(<SidebarPage fetcher={fetcher} />);
        expect(
            (container.querySelector('[data-testid="sidebar-toggle-People"]') as HTMLInputElement).checked
        ).toBe(true);
    });
});

describe('LabsPage (BKL-007 finished UI)', () => {
    const baseFetcher = (overrides: Partial<LabsFetcher> = {}): LabsFetcher => ({
        fetchLabsFeatures: vi.fn(async () => ({ features: [] })),
        setLabsFeatureEnabled: vi.fn(async () => ({})),
        fetchLabsGate: vi.fn(async () => ({
            visible: false,
            reason: 'developer_mode',
            breakdown: { configFlag: false, developerMode: false },
        })),
        setDeveloperMode: vi.fn(async () => ({})),
        ...overrides,
    });

    it('hides feature list when the gate resolves not-visible', async () => {
        const fetcher = baseFetcher();
        const { container } = await mount(<LabsPage fetcher={fetcher} />);

        expect(container.querySelector('[data-testid="labs-page"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="labs-hidden-notice"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="labs-features"]')).toBeNull();
    });

    it('renders feature list when the gate resolves visible via configFlag', async () => {
        const features: LabsFeatureDescriptor[] = [
            { id: 'feat.A', label: 'Feature A', enabled: false },
            { id: 'feat.B', label: 'Feature B', enabled: true, beta: true, group: 'analytics' },
        ];
        const fetcher = baseFetcher({
            fetchLabsFeatures: vi.fn(async () => ({ features })),
            fetchLabsGate: vi.fn(async () => ({
                visible: true,
                reason: 'config_flag',
                breakdown: { configFlag: true, developerMode: false },
            })),
        });

        const { container } = await mount(<LabsPage fetcher={fetcher} />);

        expect(container.querySelector('[data-testid="labs-features"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="labs-feature-feat.A"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="labs-feature-feat.B"]')).toBeTruthy();
        expect(
            container.querySelector('[data-testid="labs-toggle-feat.B"]')?.textContent
        ).toBe('Disable');
    });

    it('toggles developer mode and updates the gate optimistically', async () => {
        const fetcher = baseFetcher();
        const { container } = await mount(<LabsPage fetcher={fetcher} />);

        const button = container.querySelector(
            '[data-testid="labs-toggle-developer-mode"]'
        ) as HTMLButtonElement;

        await act(async () => {
            button.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.setDeveloperMode).toHaveBeenCalledWith(true);
        // Gate flips to visible; the hidden notice goes away on next render.
        expect(container.querySelector('[data-testid="labs-hidden-notice"]')).toBeNull();
    });

    it('toggles a feature and refreshes the list', async () => {
        const features: LabsFeatureDescriptor[] = [
            { id: 'feat.A', label: 'Feature A', enabled: false },
        ];
        const fetcher = baseFetcher({
            fetchLabsFeatures: vi.fn(async () => ({ features })),
            fetchLabsGate: vi.fn(async () => ({
                visible: true,
                reason: 'config_flag',
                breakdown: { configFlag: true, developerMode: false },
            })),
        });

        const { container } = await mount(<LabsPage fetcher={fetcher} />);

        const toggle = container.querySelector(
            '[data-testid="labs-toggle-feat.A"]'
        ) as HTMLButtonElement;

        await act(async () => {
            toggle.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.setLabsFeatureEnabled).toHaveBeenCalledWith('feat.A', true);
        expect(fetcher.fetchLabsFeatures).toHaveBeenCalledTimes(2);
    });
});
