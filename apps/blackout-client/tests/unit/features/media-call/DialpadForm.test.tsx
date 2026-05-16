// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DialpadForm } from '../../../../src/app/features/media-call/DialpadForm';
import type { CallBootstrapDescriptor } from '../../../../src/app/features/media-call/mediaCallClient';

type DialpadFetcher = {
    dialpadCall: ReturnType<typeof vi.fn>;
};

const descriptor = (
    overrides: Partial<CallBootstrapDescriptor> = {},
): CallBootstrapDescriptor => ({
    intentId: 'dialpad-fixed-id',
    kind: 'pstn-dialpad',
    transportUrl: 'sip:bridge.example.org:5060',
    ...overrides,
});

const createFetcher = (overrides: Partial<DialpadFetcher> = {}): DialpadFetcher => ({
    dialpadCall: vi.fn(async () => descriptor()),
    ...overrides,
});

const mountForm = async (fetcher: DialpadFetcher) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(
            <DialpadForm
                dialpadCall={
                    fetcher.dialpadCall as unknown as React.ComponentProps<
                        typeof DialpadForm
                    >['dialpadCall']
                }
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

describe('DialpadForm (BKL-006 Port 4 — dialpad surface)', () => {
    it('renders the dialpad with all 12 keys', async () => {
        const fetcher = createFetcher();
        const { container } = await mountForm(fetcher);

        expect(container.querySelector('[data-testid="dialpad-form"]')).not.toBeNull();
        const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
        for (const key of keys) {
            expect(
                container.querySelector(`[data-testid="dialpad-key-${key}"]`),
            ).not.toBeNull();
        }
    });

    it('rejects submit when the input is not a valid E.164 number', async () => {
        const fetcher = createFetcher();
        const { container } = await mountForm(fetcher);

        const input = container.querySelector(
            '[data-testid="dialpad-target-input"]',
        ) as HTMLInputElement;
        await act(async () => {
            setInputValue(input, '12345');
            await Promise.resolve();
        });

        const submitBtn = container.querySelector(
            '[data-testid="dialpad-submit"]',
        ) as HTMLButtonElement;
        // The submit button is disabled when the sanitized input fails E.164.
        expect(submitBtn.disabled).toBe(true);
        expect(fetcher.dialpadCall).not.toHaveBeenCalled();
    });

    it('strips formatting characters in the sanitized preview', async () => {
        const fetcher = createFetcher();
        const { container } = await mountForm(fetcher);

        const input = container.querySelector(
            '[data-testid="dialpad-target-input"]',
        ) as HTMLInputElement;
        await act(async () => {
            setInputValue(input, '+1 (415) 555-0100');
            await Promise.resolve();
        });

        const sanitized = container.querySelector('[data-testid="dialpad-sanitized-preview"]');
        expect(sanitized?.textContent).toContain('+14155550100');

        const submitBtn = container.querySelector(
            '[data-testid="dialpad-submit"]',
        ) as HTMLButtonElement;
        // Valid E.164 once stripped.
        expect(submitBtn.disabled).toBe(false);
    });

    it('submits a stripped E.164 number via dialpadCall and renders the descriptor', async () => {
        const dialpadCallMock = vi.fn(async () => descriptor());
        const { container } = await mountForm({ dialpadCall: dialpadCallMock });

        const input = container.querySelector(
            '[data-testid="dialpad-target-input"]',
        ) as HTMLInputElement;
        await act(async () => {
            setInputValue(input, '+1 (415) 555-0100');
            await Promise.resolve();
        });

        const form = container.querySelector(
            '[data-testid="dialpad-form-form"]',
        ) as HTMLFormElement;
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(dialpadCallMock).toHaveBeenCalledTimes(1);
        const sent = dialpadCallMock.mock.calls[0][0] as {
            target: string;
            intentId: string;
            issuedAt: string;
        };
        // Sanitized: formatting stripped before submission.
        expect(sent.target).toBe('+14155550100');
        // buildDialpadIntent auto-generates an id that starts with `dialpad-`.
        expect(sent.intentId).toMatch(/^dialpad-/);
        // issuedAt is a parseable ISO-8601 timestamp.
        expect(Number.isNaN(new Date(sent.issuedAt).getTime())).toBe(false);

        const descriptorCard = container.querySelector('[data-testid="dialpad-descriptor"]');
        expect(descriptorCard?.textContent).toContain('dialpad-fixed-id');
        expect(descriptorCard?.textContent).toContain('pstn-dialpad');
        const transport = container.querySelector('[data-testid="dialpad-transport-url"]');
        expect(transport?.textContent).toBe('sip:bridge.example.org:5060');

        // Input cleared after success.
        const inputAfter = container.querySelector(
            '[data-testid="dialpad-target-input"]',
        ) as HTMLInputElement;
        expect(inputAfter.value).toBe('');
    });

    it('appends digits when dialpad keys are clicked', async () => {
        const fetcher = createFetcher();
        const { container } = await mountForm(fetcher);

        const key1 = container.querySelector(
            '[data-testid="dialpad-key-1"]',
        ) as HTMLButtonElement;
        const key4 = container.querySelector(
            '[data-testid="dialpad-key-4"]',
        ) as HTMLButtonElement;
        const key5 = container.querySelector(
            '[data-testid="dialpad-key-5"]',
        ) as HTMLButtonElement;

        await act(async () => {
            key1.click();
            key4.click();
            key5.click();
            await Promise.resolve();
        });

        const input = container.querySelector(
            '[data-testid="dialpad-target-input"]',
        ) as HTMLInputElement;
        expect(input.value).toBe('145');
    });

    it('backspace removes the last typed character and clear resets the form', async () => {
        const fetcher = createFetcher();
        const { container } = await mountForm(fetcher);

        const input = container.querySelector(
            '[data-testid="dialpad-target-input"]',
        ) as HTMLInputElement;
        await act(async () => {
            setInputValue(input, '+14155550100');
            await Promise.resolve();
        });

        const backspace = container.querySelector(
            '[data-testid="dialpad-backspace"]',
        ) as HTMLButtonElement;
        await act(async () => {
            backspace.click();
            await Promise.resolve();
        });
        expect(input.value).toBe('+1415555010');

        const clear = container.querySelector(
            '[data-testid="dialpad-clear"]',
        ) as HTMLButtonElement;
        await act(async () => {
            clear.click();
            await Promise.resolve();
        });
        expect(input.value).toBe('');
    });

    it('surfaces SDK errors via role="alert"', async () => {
        const fetcher = createFetcher({
            dialpadCall: vi.fn(async () => {
                throw new Error('pstn bridge unreachable');
            }),
        });
        const { container } = await mountForm(fetcher);

        const input = container.querySelector(
            '[data-testid="dialpad-target-input"]',
        ) as HTMLInputElement;
        await act(async () => {
            setInputValue(input, '+14155550100');
            await Promise.resolve();
        });

        const form = container.querySelector(
            '[data-testid="dialpad-form-form"]',
        ) as HTMLFormElement;
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
            await Promise.resolve();
        });

        const error = container.querySelector('[data-testid="dialpad-submit-error"]');
        expect(error?.textContent).toContain('pstn bridge unreachable');
        expect(error?.getAttribute('role')).toBe('alert');
        // No descriptor card rendered on failure.
        expect(container.querySelector('[data-testid="dialpad-descriptor"]')).toBeNull();
    });
});
