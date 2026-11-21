// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { CreatorParticipationPrompt } from './CreatorParticipationPrompt';

const { context } = vi.hoisted(() => ({
    context: { flags: { creatorsListings: false, streaming: false, creatorContent: false } },
}));
vi.mock('../../core/features/capabilityContext', () => ({
    useCapabilityContext: () => context,
}));

let root: Root | undefined;
afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = undefined;
    document.body.innerHTML = '';
});

async function render(flags: typeof context.flags) {
    context.flags = flags;
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () =>
        root?.render(
            <MemoryRouter>
                <CreatorParticipationPrompt />
            </MemoryRouter>
        )
    );
    return container;
}

describe('creator participation prompts', () => {
    it('links to supported product templates and the actual guide composer', async () => {
        const container = await render({
            creatorsListings: true,
            streaming: true,
            creatorContent: true,
        });
        expect(
            Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
        ).toEqual([
            '/creator/sell?template=digital_download',
            '/creator/sell?template=asset_bundle',
            '/streaming?compose=guide#creator-content',
        ]);
    });

    it('hides selling while preserving an available free publishing route', async () => {
        const container = await render({
            creatorsListings: false,
            streaming: true,
            creatorContent: true,
        });
        expect(container.querySelectorAll('a')).toHaveLength(1);
        expect(container.textContent).toContain('Publish a free guide');
    });

    it('does not advertise a disabled composer or leave an empty prompt', async () => {
        const container = await render({
            creatorsListings: false,
            streaming: false,
            creatorContent: true,
        });
        expect(container.querySelector('[data-testid="creator-participation-prompt"]')).toBeNull();
    });
});
