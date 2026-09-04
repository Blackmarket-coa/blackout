// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const relayOutOfRing = vi.fn();
vi.mock('../../../../src/app/features/coalition/coalitionClient', () => ({
    relayOutOfRing: (...a: unknown[]) => relayOutOfRing(...a),
}));

const { default: CrewRelayOut } = await import(
    '../../../../src/app/features/coalition/CrewRelayOut'
);

const mount = async (ui: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        ReactDOM.createRoot(container).render(ui);
        await Promise.resolve();
    });
    return container;
};

const type = async (el: Element | null, value: string) => {
    await act(async () => {
        const input = el as HTMLInputElement | HTMLTextAreaElement;
        const proto =
            input.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await Promise.resolve();
    });
};

const click = async (el: Element | null) => {
    await act(async () => {
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
    });
};

beforeEach(() => {
    document.body.innerHTML = '';
    relayOutOfRing.mockReset().mockResolvedValue({ feedItem: { id: 'f1' }, relay: { id: 'r1' } });
});

describe('CrewRelayOut', () => {
    it('says up front that this publishes in your name, outside the crew', async () => {
        const container = await mount(<CrewRelayOut ringId="ring-1" />);
        // The control composes rather than forwards; the copy has to match,
        // because a crew is only safe to think out loud in if that is clear.
        expect(container.textContent).toContain('in your name');
        expect(container.textContent).toContain('your own words');
    });

    it('will not submit without a title', async () => {
        const container = await mount(<CrewRelayOut ringId="ring-1" />);
        const button = container.querySelector('[data-testid="crew-relay-out-submit"]');
        expect(button).toHaveProperty('disabled', true);

        await click(button);
        expect(relayOutOfRing).not.toHaveBeenCalled();
    });

    it('carries title, body and note out to the named ring', async () => {
        const container = await mount(<CrewRelayOut ringId="ring-7" />);
        await type(container.querySelector('[aria-label="Title"]'), 'Need a van');
        await type(container.querySelector('[aria-label="Body"]'), 'Saturday.');
        await type(container.querySelector('[aria-label="Relay note"]'), 'because—');

        await click(container.querySelector('[data-testid="crew-relay-out-submit"]'));
        expect(relayOutOfRing).toHaveBeenCalledWith('ring-7', {
            title: 'Need a van',
            body: 'Saturday.',
            note: 'because—',
        });
    });

    it('clears the form and confirms once it has been carried out', async () => {
        const onRelayed = vi.fn();
        const container = await mount(<CrewRelayOut ringId="ring-1" onRelayed={onRelayed} />);
        await type(container.querySelector('[aria-label="Title"]'), 'Carried');
        await click(container.querySelector('[data-testid="crew-relay-out-submit"]'));

        expect(onRelayed).toHaveBeenCalledOnce();
        expect(container.textContent).toContain('Carried out.');
        expect((container.querySelector('[aria-label="Title"]') as HTMLInputElement).value).toBe(
            ''
        );
    });

    it('shows a refusal rather than pretending it worked', async () => {
        relayOutOfRing.mockRejectedValueOnce(new Error('Only members can relay out of this crew'));
        const container = await mount(<CrewRelayOut ringId="ring-1" />);
        await type(container.querySelector('[aria-label="Title"]'), 'Not mine');
        await click(container.querySelector('[data-testid="crew-relay-out-submit"]'));
        expect(container.textContent).toContain('Only members can relay out');
    });
});
