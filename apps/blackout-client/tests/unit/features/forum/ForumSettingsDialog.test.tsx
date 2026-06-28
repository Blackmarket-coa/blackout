// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    saveSettings: vi.fn().mockResolvedValue(undefined),
    settings: {
        enabled: true,
        defaultSort: 'hot' as const,
        tags: [] as Array<{ name: string; color: string; emoji: string }>,
        guidelines: '',
        requireTag: false,
    },
}));

vi.mock('../../../../src/app/features/forum/useForum', () => ({
    FORUM_EVENT_TYPE: 'co.bmc.forum',
    useForumSettings: () => ({ data: mocks.settings, loading: false, error: undefined }),
    useSetForumSettings: () => mocks.saveSettings,
}));

import { ForumSettingsDialog } from '../../../../src/app/features/forum/ForumSettingsDialog';

const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
};

const click = (el: Element | null) => el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<ForumSettingsDialog roomId="!den:server" onClose={vi.fn()} />);
        await Promise.resolve();
    });
    return container;
};

beforeEach(() => {
    document.body.innerHTML = '';
    mocks.saveSettings.mockClear();
    mocks.settings = {
        enabled: true,
        defaultSort: 'hot',
        tags: [],
        guidelines: '',
        requireTag: false,
    };
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('ForumSettingsDialog', () => {
    it('adds a named tag and saves the cleaned settings', async () => {
        const container = await mount();

        await act(async () => {
            click(container.querySelector('[data-testid="forum-settings-add-tag"]'));
            await Promise.resolve();
        });

        const nameInput = container.querySelector<HTMLInputElement>(
            '[data-testid="forum-settings-tag-name"]'
        );
        await act(async () => {
            setNativeValue(nameInput!, 'bugs');
            await Promise.resolve();
        });

        await act(async () => {
            click(container.querySelector('[data-testid="forum-settings-save"]'));
            await Promise.resolve();
        });

        expect(mocks.saveSettings).toHaveBeenCalledTimes(1);
        const saved = mocks.saveSettings.mock.calls[0][0];
        expect(saved.tags).toEqual([{ name: 'bugs', color: '#7289da', emoji: '🏷️' }]);
        expect(saved.enabled).toBe(true);
    });

    it('drops empty-name tags on save', async () => {
        const container = await mount();

        await act(async () => {
            click(container.querySelector('[data-testid="forum-settings-add-tag"]'));
            await Promise.resolve();
        });
        await act(async () => {
            click(container.querySelector('[data-testid="forum-settings-save"]'));
            await Promise.resolve();
        });

        expect(mocks.saveSettings).toHaveBeenCalledTimes(1);
        expect(mocks.saveSettings.mock.calls[0][0].tags).toEqual([]);
    });
});
