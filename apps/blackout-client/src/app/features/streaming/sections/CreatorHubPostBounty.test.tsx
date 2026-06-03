// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const createBounty = vi.fn();
vi.mock('../../bounty/bountyClient', () => ({
    createBounty: (...a: unknown[]) => createBounty(...a),
}));

import { CreatorHubPostBounty } from './CreatorHubPostBounty';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(React.createElement(CreatorHubPostBounty));
        await flush();
    });
    return container;
};

const setValue = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
    const proto =
        el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : el instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('CreatorHubPostBounty', () => {
    beforeEach(() => {
        createBounty.mockReset();
    });

    it('disables submit until the required fields are filled', async () => {
        const container = await mount();
        const submit = container.querySelector(
            '[data-testid="post-bounty-submit"]',
        ) as HTMLButtonElement;
        expect(submit.disabled).toBe(true);
    });

    it('submits a bounty with parsed line-separated requirements/deliverables', async () => {
        createBounty.mockResolvedValue({ bounty: { id: 'b1' } });
        const container = await mount();
        const q = <T extends Element>(id: string) =>
            container.querySelector(`[data-testid="${id}"]`) as unknown as T;

        await act(async () => {
            setValue(q<HTMLSelectElement>('post-bounty-category'), 'content');
            setValue(q<HTMLSelectElement>('post-bounty-reward-type'), 'revenue_share');
            setValue(q<HTMLInputElement>('post-bounty-title'), 'Need a review video');
            setValue(q<HTMLInputElement>('post-bounty-reward-summary'), '10% rev-share');
            setValue(q<HTMLTextAreaElement>('post-bounty-description'), 'Honest review');
            setValue(q<HTMLTextAreaElement>('post-bounty-requirements'), '5k followers\nfood niche');
            setValue(q<HTMLTextAreaElement>('post-bounty-deliverables'), '1 video');
            await flush();
        });

        const submit = q<HTMLButtonElement>('post-bounty-submit');
        expect(submit.disabled).toBe(false);
        await act(async () => {
            submit.click();
            await flush();
        });

        expect(createBounty).toHaveBeenCalledTimes(1);
        expect(createBounty).toHaveBeenCalledWith({
            category: 'content',
            rewardType: 'revenue_share',
            title: 'Need a review video',
            rewardSummary: '10% rev-share',
            description: 'Honest review',
            requirements: ['5k followers', 'food niche'],
            deliverables: ['1 video'],
        });
        expect(container.querySelector('[data-testid="post-bounty-success"]')).not.toBeNull();
        // Form resets the title after a successful post.
        expect(q<HTMLInputElement>('post-bounty-title').value).toBe('');
    });

    it('shows an error when the post fails', async () => {
        createBounty.mockRejectedValue(new Error('nope'));
        const container = await mount();
        const q = <T extends Element>(id: string) =>
            container.querySelector(`[data-testid="${id}"]`) as unknown as T;
        await act(async () => {
            setValue(q<HTMLInputElement>('post-bounty-title'), 'T');
            setValue(q<HTMLInputElement>('post-bounty-reward-summary'), '$1');
            setValue(q<HTMLTextAreaElement>('post-bounty-description'), 'D');
            await flush();
        });
        await act(async () => {
            (q<HTMLButtonElement>('post-bounty-submit')).click();
            await flush();
        });
        expect(container.querySelector('[data-testid="post-bounty-error"]')).not.toBeNull();
    });
});
