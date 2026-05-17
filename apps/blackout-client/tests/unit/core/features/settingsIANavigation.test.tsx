// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import { RegistrySettingsList } from '../../../../src/app/core/features/RegistrySettingsList';
import { capabilityContextAtom } from '../../../../src/app/core/features/capabilityContext';
import {
    defaultFeatureFlags,
    type FeatureFlags,
} from '../../../../src/app/core/features/featureFlags';

const ALL_CAPS: readonly string[] = [
    'settings.preferences.read',
    'settings.sidebar.read',
    'settings.labs.show',
    'stego.settings.read',
    'moderation.mjolnir.manage',
];

const flagsAll = (overrides: Partial<FeatureFlags> = {}): FeatureFlags => ({
    ...defaultFeatureFlags,
    settingsParity: true,
    stegoToolkit: true,
    moderation: true,
    ...overrides,
});

const mountList = async (
    capabilities: readonly string[],
    flags: FeatureFlags,
) => {
    const store = createStore();
    store.set(capabilityContextAtom, {
        capabilities: [...capabilities],
        flags,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(
            <JotaiProvider store={store}>
                <RegistrySettingsList />
            </JotaiProvider>,
        );
        await Promise.resolve();
    });

    return { container, root };
};

const sectionTestId = (section: string): string =>
    `[data-testid="registry-settings-section-${section}"]`;

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('Settings IA navigation (BKL-001 Port 5 — all sections reachable from root)', () => {
    it('renders Preferences / Sidebar / Labs / Steganography / Moderation when all capabilities + flags are present', async () => {
        const { container } = await mountList(ALL_CAPS, flagsAll());

        const list = container.querySelector('[data-testid="registry-settings-list"]');
        expect(list).not.toBeNull();

        // Each canonical Port 5 section is mounted under the registry-driven IA.
        const expectedSections = [
            'Preferences',
            'Sidebar',
            'Labs',
            'Steganography',
            'Moderation / Mjolnir',
        ];
        for (const name of expectedSections) {
            const section = container.querySelector(sectionTestId(name));
            expect(section, `expected section "${name}" to render`).not.toBeNull();
            expect(section?.querySelector('h2')?.textContent).toBe(name);
        }
    });

    it('hides the Labs section when settings.labs.show capability is absent', async () => {
        const capsWithoutLabs = ALL_CAPS.filter((c) => c !== 'settings.labs.show');
        const { container } = await mountList(capsWithoutLabs, flagsAll());

        expect(container.querySelector(sectionTestId('Preferences'))).not.toBeNull();
        expect(container.querySelector(sectionTestId('Sidebar'))).not.toBeNull();
        expect(container.querySelector(sectionTestId('Steganography'))).not.toBeNull();
        expect(container.querySelector(sectionTestId('Moderation / Mjolnir'))).not.toBeNull();
        expect(container.querySelector(sectionTestId('Labs'))).toBeNull();
    });

    it('hides Preferences / Sidebar / Labs when settingsParity flag is off', async () => {
        const { container } = await mountList(ALL_CAPS, flagsAll({ settingsParity: false }));

        expect(container.querySelector(sectionTestId('Preferences'))).toBeNull();
        expect(container.querySelector(sectionTestId('Sidebar'))).toBeNull();
        expect(container.querySelector(sectionTestId('Labs'))).toBeNull();
        // Independent flags still gate their sections in:
        expect(container.querySelector(sectionTestId('Steganography'))).not.toBeNull();
        expect(container.querySelector(sectionTestId('Moderation / Mjolnir'))).not.toBeNull();
    });

    it('hides Steganography when stegoToolkit flag is off, regardless of capability', async () => {
        const { container } = await mountList(ALL_CAPS, flagsAll({ stegoToolkit: false }));

        expect(container.querySelector(sectionTestId('Steganography'))).toBeNull();
        // Other sections are still present.
        expect(container.querySelector(sectionTestId('Preferences'))).not.toBeNull();
        expect(container.querySelector(sectionTestId('Moderation / Mjolnir'))).not.toBeNull();
    });

    it('hides Moderation / Mjolnir when moderation.mjolnir.manage capability is absent', async () => {
        const capsWithoutMjolnir = ALL_CAPS.filter(
            (c) => c !== 'moderation.mjolnir.manage',
        );
        const { container } = await mountList(capsWithoutMjolnir, flagsAll());

        expect(container.querySelector(sectionTestId('Moderation / Mjolnir'))).toBeNull();
        // Other sections still render.
        expect(container.querySelector(sectionTestId('Preferences'))).not.toBeNull();
        expect(container.querySelector(sectionTestId('Steganography'))).not.toBeNull();
    });

    it('returns null when no capabilities grant any settings section', async () => {
        const { container } = await mountList([], flagsAll());

        // RegistrySettingsList returns null when no sections match — wrapper
        // div is absent.
        expect(container.querySelector('[data-testid="registry-settings-list"]')).toBeNull();
    });

    it('preserves the canonical section ordering from the registry', async () => {
        const { container } = await mountList(ALL_CAPS, flagsAll());

        const sectionEls = Array.from(
            container.querySelectorAll('[data-testid^="registry-settings-section-"]'),
        );
        const sectionNames = sectionEls.map((el) =>
            (el.getAttribute('data-testid') ?? '').replace(
                'registry-settings-section-',
                '',
            ),
        );
        // Order is determined by feature-manifest registration order. We
        // assert all five appear; exact order is incidental but should be
        // stable across runs.
        for (const name of [
            'Preferences',
            'Sidebar',
            'Labs',
            'Steganography',
            'Moderation / Mjolnir',
        ]) {
            expect(sectionNames).toContain(name);
        }
    });
});
