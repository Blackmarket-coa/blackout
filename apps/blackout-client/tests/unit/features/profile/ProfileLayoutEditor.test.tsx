// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DEFAULT_PROFILE_LAYOUT, paletteAvailability, type ProfileLayout } from '@blackout/core';
import ProfileLayoutEditor from '../../../../src/app/features/profile/ProfileLayoutEditor';

const mount = async (ui: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(ui);
        await Promise.resolve();
    });
    return container;
};

const click = async (el: Element | null) => {
    await act(async () => {
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
    });
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('ProfileLayoutEditor', () => {
    it('reorders a block without dropping any of the others', async () => {
        const onChange = vi.fn();
        const container = await mount(
            <ProfileLayoutEditor layout={DEFAULT_PROFILE_LAYOUT} onChange={onChange} />
        );

        const rows = Array.from(container.querySelectorAll('[data-block-kind]'));
        const second = rows[1]!;
        await click(second.querySelector('[aria-label^="Move"]'));

        const next = onChange.mock.calls[0]?.[0] as ProfileLayout;
        expect(next.blocks[0]?.kind).toBe('status');
        expect(next.blocks[1]?.kind).toBe('bio');
        expect(next.blocks).toHaveLength(DEFAULT_PROFILE_LAYOUT.blocks.length);
    });

    it('hides a block in place rather than removing it', async () => {
        const onChange = vi.fn();
        const container = await mount(
            <ProfileLayoutEditor layout={DEFAULT_PROFILE_LAYOUT} onChange={onChange} />
        );

        const bioRow = container.querySelector('[data-block-kind="bio"]');
        await click(bioRow?.querySelector('[aria-label^="Hide"]') ?? null);

        const next = onChange.mock.calls[0]?.[0] as ProfileLayout;
        // Still first — so turning it back on restores the arrangement.
        expect(next.blocks[0]?.kind).toBe('bio');
        expect(next.blocks[0]?.visible).toBe(false);
    });

    it('cannot move the first block up or the last block down', async () => {
        const container = await mount(
            <ProfileLayoutEditor layout={DEFAULT_PROFILE_LAYOUT} onChange={vi.fn()} />
        );
        const rows = Array.from(container.querySelectorAll('[data-block-kind]'));
        expect(rows[0]?.querySelector('[aria-label^="Move"][aria-label$="up"]')).toHaveProperty(
            'disabled',
            true
        );
        expect(rows[rows.length - 1]?.querySelector('[aria-label$="down"]')).toHaveProperty(
            'disabled',
            true
        );
    });

    it('shows locked palettes with their progress instead of hiding them', async () => {
        const palettes = paletteAvailability({
            relaysMade: 0,
            circleSize: 4,
            circleOverlaps: 0,
            chainDepthReached: 0,
            peopleReached: 0,
        });
        const container = await mount(
            <ProfileLayoutEditor
                layout={DEFAULT_PROFILE_LAYOUT}
                onChange={vi.fn()}
                palettes={palettes}
            />
        );

        const locked = container.querySelector('[data-testid="profile-palette-gathered"]');
        expect(locked).not.toBeNull();
        expect(locked).toHaveProperty('disabled', true);
        // Says how far off it is, rather than pretending it does not exist.
        expect(locked?.textContent).toContain('4 of 10');
    });

    it('selects an unlocked palette and ignores clicks on locked ones', async () => {
        const onSelectPalette = vi.fn();
        const palettes = paletteAvailability({
            relaysMade: 0,
            circleSize: 0,
            circleOverlaps: 0,
            chainDepthReached: 0,
            peopleReached: 0,
        });
        const container = await mount(
            <ProfileLayoutEditor
                layout={DEFAULT_PROFILE_LAYOUT}
                onChange={vi.fn()}
                palettes={palettes}
                onSelectPalette={onSelectPalette}
            />
        );

        await click(container.querySelector('[data-testid="profile-palette-canopy_floor"]'));
        expect(onSelectPalette).toHaveBeenCalledWith('canopy_floor');

        await click(container.querySelector('[data-testid="profile-palette-long_relay"]'));
        expect(onSelectPalette).toHaveBeenCalledTimes(1);
    });
});
