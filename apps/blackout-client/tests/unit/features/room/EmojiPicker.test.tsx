// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmojiPicker } from '../../../../src/app/features/room/EmojiPicker';

type MountOptions = {
    customEmoji?: Record<string, string>;
    recents?: readonly string[];
    defaultPalette?: readonly string[];
    onSelect?: (emoji: string) => void;
    onClose?: () => void;
};

const mountPicker = async (options: MountOptions = {}) => {
    const onSelect = options.onSelect ?? vi.fn();
    const onClose = options.onClose ?? vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(
            <EmojiPicker
                customEmoji={options.customEmoji ?? {}}
                recents={options.recents ?? []}
                defaultPalette={options.defaultPalette}
                onSelect={onSelect}
                onClose={onClose}
            />,
        );
        await Promise.resolve();
    });

    // Allow the auto-focus setTimeout(0) to fire.
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
    });

    return { container, root, onSelect, onClose };
};

const dispatchKey = (key: string, target: EventTarget = document) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
};

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('EmojiPicker (Workstream C — keyboard accessible reaction picker)', () => {
    it('renders the picker dialog with the recent emoji grid', async () => {
        const { container } = await mountPicker({ recents: ['💯', '😎'] });

        const picker = container.querySelector('[data-testid="emoji-picker"]');
        expect(picker).not.toBeNull();
        expect(picker?.getAttribute('role')).toBe('dialog');
        expect(picker?.getAttribute('aria-label')).toBe('Emoji picker');
        expect(
            container.querySelector('[data-testid="emoji-picker-recent-grid"]'),
        ).not.toBeNull();
    });

    it('does not render the custom-emoji section when customEmoji is empty', async () => {
        const { container } = await mountPicker();
        expect(
            container.querySelector('[data-testid="emoji-picker-custom-grid"]'),
        ).toBeNull();
    });

    it('renders custom-emoji buttons when provided', async () => {
        const { container } = await mountPicker({
            customEmoji: { ':party:': 'mxc://example.org/party' },
        });
        const customGrid = container.querySelector(
            '[data-testid="emoji-picker-custom-grid"]',
        );
        expect(customGrid).not.toBeNull();
        const button = container.querySelector('[data-testid="emoji-picker-custom-:party:"]');
        expect(button).not.toBeNull();
        expect(button?.querySelector('img')?.getAttribute('alt')).toBe(':party:');
    });

    it('auto-focuses the first emoji button on mount', async () => {
        const { container } = await mountPicker({ recents: ['💯', '😎'] });

        // The picker grid order is `[...seed, ...recents, ...DEFAULT]` then
        // deduped via `new Set`. With no `defaultPalette`, seed === DEFAULT,
        // so the first button is the first DEFAULT entry: 👍.
        const firstButton = container.querySelector(
            '[data-testid="emoji-picker-recent-👍"]',
        );
        expect(firstButton).not.toBeNull();
        expect(document.activeElement).toBe(firstButton);

        // The recents are still present in the grid further along.
        expect(
            container.querySelector('[data-testid="emoji-picker-recent-💯"]'),
        ).not.toBeNull();
        expect(
            container.querySelector('[data-testid="emoji-picker-recent-😎"]'),
        ).not.toBeNull();
    });

    it('falls back to focusing the first default-seed button when no recents are provided', async () => {
        const { container } = await mountPicker();

        // Default seed first item is 👍.
        const firstButton = container.querySelector(
            '[data-testid="emoji-picker-recent-👍"]',
        );
        expect(firstButton).not.toBeNull();
        expect(document.activeElement).toBe(firstButton);
    });

    it('respects defaultPalette as the seed before recents', async () => {
        const { container } = await mountPicker({
            defaultPalette: ['🌱', '🌾', '🪨'],
            recents: ['💯'],
        });

        // The seed (🌱) should be the first button, not the first recent.
        const firstButton = container.querySelector(
            '[data-testid="emoji-picker-recent-🌱"]',
        );
        expect(firstButton).not.toBeNull();
        expect(document.activeElement).toBe(firstButton);
    });

    it('calls onSelect with the emoji key when a recent button is clicked', async () => {
        const { container, onSelect } = await mountPicker({ recents: ['💯'] });
        const button = container.querySelector(
            '[data-testid="emoji-picker-recent-💯"]',
        ) as HTMLButtonElement;

        await act(async () => {
            button.click();
            await Promise.resolve();
        });

        expect(onSelect).toHaveBeenCalledWith('💯');
    });

    it('calls onSelect with the emoji key when a custom-emoji button is clicked', async () => {
        const { container, onSelect } = await mountPicker({
            customEmoji: { ':party:': 'mxc://example.org/party' },
        });
        const button = container.querySelector(
            '[data-testid="emoji-picker-custom-:party:"]',
        ) as HTMLButtonElement;

        await act(async () => {
            button.click();
            await Promise.resolve();
        });

        expect(onSelect).toHaveBeenCalledWith(':party:');
    });

    it('calls onClose when the Escape key is pressed', async () => {
        const onClose = vi.fn();
        await mountPicker({ onClose });

        await act(async () => {
            dispatchKey('Escape');
            await Promise.resolve();
        });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose for non-Escape keys', async () => {
        const onClose = vi.fn();
        await mountPicker({ onClose });

        await act(async () => {
            dispatchKey('Enter');
            dispatchKey('Tab');
            dispatchKey('a');
            await Promise.resolve();
        });

        expect(onClose).not.toHaveBeenCalled();
    });

    it('removes the document Escape listener on unmount', async () => {
        const onClose = vi.fn();
        const { root } = await mountPicker({ onClose });

        await act(async () => {
            root.unmount();
            await Promise.resolve();
        });

        // After unmount, Escape should not call onClose.
        await act(async () => {
            dispatchKey('Escape');
            await Promise.resolve();
        });

        expect(onClose).not.toHaveBeenCalled();
    });

    it('caps the recent grid to 24 entries even when many recents are provided', async () => {
        const manyRecents = Array.from({ length: 50 }, (_, i) =>
            String.fromCodePoint(0x1f300 + i),
        );
        const { container } = await mountPicker({ recents: manyRecents });
        const buttons = container.querySelectorAll(
            '[data-testid="emoji-picker-recent-grid"] button',
        );
        expect(buttons.length).toBeLessThanOrEqual(24);
    });
});
