// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElementCallLauncher } from '../../../../src/app/features/media-call/ElementCallLauncher';
import type { CallBootstrapDescriptor } from '../../../../src/app/features/media-call/mediaCallClient';

type Fetcher = {
    launchCall: ReturnType<typeof vi.fn>;
};

const descriptor = (
    overrides: Partial<CallBootstrapDescriptor> = {},
): CallBootstrapDescriptor => ({
    intentId: 'element-call-fixed',
    kind: 'element-call',
    transportUrl: 'https://call.example.org/room/abc',
    ...overrides,
});

const createFetcher = (overrides: Partial<Fetcher> = {}): Fetcher => ({
    launchCall: vi.fn(async () => descriptor()),
    ...overrides,
});

const mountLauncher = async (
    fetcher: Fetcher,
    options: { capabilityAvailable?: boolean } = {},
) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(
            <ElementCallLauncher
                launchCall={
                    fetcher.launchCall as unknown as React.ComponentProps<
                        typeof ElementCallLauncher
                    >['launchCall']
                }
                capabilityAvailable={options.capabilityAvailable}
            />,
        );
        await Promise.resolve();
    });

    return { container, root };
};

const setInputValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('ElementCallLauncher (BKL-006 Port 4 — Element Call surface)', () => {
    it('renders the unsupported-capability fallback when capabilityAvailable is false', async () => {
        const fetcher = createFetcher();
        const { container } = await mountLauncher(fetcher, { capabilityAvailable: false });

        expect(
            container.querySelector('[data-testid="element-call-launcher"]'),
        ).not.toBeNull();
        const unsupported = container.querySelector(
            '[data-testid="element-call-unsupported"]',
        );
        expect(unsupported).not.toBeNull();
        expect(unsupported?.textContent).toContain('not available');
        // No launch form rendered in the fallback.
        expect(container.querySelector('[data-testid="element-call-form"]')).toBeNull();
        expect(fetcher.launchCall).not.toHaveBeenCalled();
    });

    it('renders the launch form when capabilityAvailable is true', async () => {
        const fetcher = createFetcher();
        const { container } = await mountLauncher(fetcher);

        expect(container.querySelector('[data-testid="element-call-form"]')).not.toBeNull();
        expect(
            container.querySelector('[data-testid="element-call-unsupported"]'),
        ).toBeNull();
    });

    it('rejects submit when the input is not a Matrix room id', async () => {
        const fetcher = createFetcher();
        const { container } = await mountLauncher(fetcher);

        const input = container.querySelector(
            '[data-testid="element-call-target-input"]',
        ) as HTMLInputElement;
        await act(async () => {
            setInputValue(input, 'not-a-room');
            await Promise.resolve();
        });

        const submitBtn = container.querySelector(
            '[data-testid="element-call-submit"]',
        ) as HTMLButtonElement;
        expect(submitBtn.disabled).toBe(true);
        expect(fetcher.launchCall).not.toHaveBeenCalled();
    });

    it('launches the call with a kind:element-call intent and renders the descriptor', async () => {
        const launchCallMock = vi.fn(async () => descriptor());
        const { container } = await mountLauncher({ launchCall: launchCallMock });

        const input = container.querySelector(
            '[data-testid="element-call-target-input"]',
        ) as HTMLInputElement;
        await act(async () => {
            setInputValue(input, '!room:example.org');
            await Promise.resolve();
        });

        const form = container.querySelector(
            '[data-testid="element-call-form"]',
        ) as HTMLFormElement;
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(launchCallMock).toHaveBeenCalledTimes(1);
        const sent = launchCallMock.mock.calls[0][0] as {
            intentId: string;
            kind: string;
            target: string;
            issuedAt: string;
        };
        expect(sent.kind).toBe('element-call');
        expect(sent.target).toBe('!room:example.org');
        expect(sent.intentId).toMatch(/^element-call-/);
        expect(Number.isNaN(new Date(sent.issuedAt).getTime())).toBe(false);

        const descriptorCard = container.querySelector(
            '[data-testid="element-call-descriptor"]',
        );
        expect(descriptorCard?.textContent).toContain('element-call-fixed');
        const transport = container.querySelector(
            '[data-testid="element-call-transport-url"]',
        );
        expect(transport?.textContent).toBe('https://call.example.org/room/abc');
        // Emitted-intent surface advertises the room target so receivers can
        // assert the protocol intent was issued.
        const emitted = container.querySelector(
            '[data-testid="element-call-emitted-intent"]',
        );
        expect(emitted?.getAttribute('data-intent-target')).toBe('!room:example.org');
        expect(emitted?.getAttribute('data-intent-kind')).toBe('element-call');

        // Input cleared after success.
        const inputAfter = container.querySelector(
            '[data-testid="element-call-target-input"]',
        ) as HTMLInputElement;
        expect(inputAfter.value).toBe('');
    });

    it('surfaces SDK errors via role="alert"', async () => {
        const fetcher = createFetcher({
            launchCall: vi.fn(async () => {
                throw new Error('element call bootstrap failed');
            }),
        });
        const { container } = await mountLauncher(fetcher);

        const input = container.querySelector(
            '[data-testid="element-call-target-input"]',
        ) as HTMLInputElement;
        await act(async () => {
            setInputValue(input, '!room:example.org');
            await Promise.resolve();
        });

        const form = container.querySelector(
            '[data-testid="element-call-form"]',
        ) as HTMLFormElement;
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
            await Promise.resolve();
        });

        const error = container.querySelector('[data-testid="element-call-submit-error"]');
        expect(error?.textContent).toContain('element call bootstrap failed');
        expect(error?.getAttribute('role')).toBe('alert');
        // No descriptor card rendered on failure.
        expect(container.querySelector('[data-testid="element-call-descriptor"]')).toBeNull();
    });
});
