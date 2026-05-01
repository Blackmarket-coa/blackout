// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';

vi.mock('../../../../src/app/features/settings/AccountSettings', () => ({ default: () => <div>Account view</div> }));
vi.mock('../../../../src/app/features/settings/AppearanceSettings', () => ({ default: () => <div>Appearance view</div> }));
vi.mock('../../../../src/app/features/settings/NotificationSettings', () => ({ default: () => <div>Notifications view</div> }));
vi.mock('../../../../src/app/features/settings/PrivacySettings', () => ({ default: () => <div>Privacy view</div> }));
vi.mock('../../../../src/app/features/settings/VoiceVideoSettings', () => ({ default: () => <div>Voice view</div> }));
vi.mock('../../../../src/app/features/settings/AccessibilitySettings', () => ({ default: () => <div>Accessibility view</div> }));
vi.mock('../../../../src/app/features/settings/KeybindsSettings', () => ({ default: () => <div>Keybinds view</div> }));
vi.mock('../../../../src/app/features/settings/DeveloperSettings', () => ({ default: () => <div>Developer view</div> }));
vi.mock('../../../../src/app/features/settings/AboutSettings', () => ({ default: () => <div>About view</div> }));

import { SettingsPage } from '../../../../src/app/features/settings';

const setViewportWidth = (width: number) => {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: width,
    });
    window.dispatchEvent(new Event('resize'));
};

describe('SettingsPage surfaces', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
    });

    it('renders desktop layout and emits telemetry on section switch', async () => {
        setViewportWidth(1280);
        const telemetry = vi.fn();
        window.addEventListener('blackout:telemetry', telemetry as EventListener);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <SettingsPage />
                </Provider>,
            );
            await Promise.resolve();
        });

        const navButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('About'),
        );
        expect(navButton).toBeTruthy();

        await act(async () => {
            navButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        const pageSection = container.querySelector('section');
        expect((pageSection as HTMLElement).style.gridTemplateColumns).toBe('300px minmax(0, 1fr)');
        expect(telemetry).toHaveBeenCalled();

        root.unmount();
    });

    it('renders mobile layout at <=768px', async () => {
        setViewportWidth(480);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <Provider store={createStore()}>
                    <SettingsPage />
                </Provider>,
            );
            await Promise.resolve();
        });

        const pageSection = container.querySelector('section');
        expect(pageSection).toBeTruthy();
        expect((pageSection as HTMLElement).style.gridTemplateColumns).toBe('1fr');

        root.unmount();
    });
});
