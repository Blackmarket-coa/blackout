// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { ProfileThemeEditor } from '../../../../src/app/features/profile/ProfileThemeEditor';
import type { ProfileCustomTheme } from '../../../../src/app/features/profile/profileTypes';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const HEX6 = /^#[0-9a-f]{6}$/i;

async function renderEditor(theme: ProfileCustomTheme | undefined) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<ProfileThemeEditor theme={theme} onChange={() => {}} />);
    });
    return container;
}

const colorInputs = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLInputElement>('input[type="color"]'));

describe('ProfileThemeEditor', () => {
    it('never feeds a color input an empty value (the #rrggbb console flood)', async () => {
        // An un-customized profile has every theme token unset — the exact state
        // that used to render `<input type="color" value="">`.
        const container = await renderEditor(undefined);
        const inputs = colorInputs(container);
        expect(inputs.length).toBeGreaterThan(0);
        for (const input of inputs) {
            expect(input.value).not.toBe('');
            expect(input.value).toMatch(HEX6);
        }
    });

    it('uses the themed default (not black) for an unset accent token', async () => {
        // Distinguishes the fix from the old bug even where jsdom coerces an
        // empty color value to '#000000'.
        const container = await renderEditor(undefined);
        const accent = colorInputs(container)[0]!; // first field is Accent
        expect(accent.value.toLowerCase()).toBe('#d7ff3f');
    });

    it('reflects a saved token value', async () => {
        const container = await renderEditor({ tokens: { accent: '#123456' } });
        const accent = colorInputs(container)[0]!;
        expect(accent.value.toLowerCase()).toBe('#123456');
    });
});
