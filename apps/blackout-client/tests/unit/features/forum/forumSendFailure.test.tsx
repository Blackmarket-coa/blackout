// @vitest-environment jsdom
//
// A forum post or reply that does not go out. Before, the dialog stayed open
// and the reply stayed in its box with nothing said. What was written is
// still kept; now the person is told why it did not go.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sendRichText = vi.fn();
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTimelineAdapter', () => ({
    useLegacySendMessageAdapter: () => ({ sendRichText }),
}));
// The dialog's focus trap needs layout, which jsdom does not do.
vi.mock('focus-trap-react', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import {
    CreatePostModal,
    forumSendFailureNotice,
} from '../../../../src/app/features/forum/CreatePostModal';
import { RoomNotReadyError } from '../../../../src/app/features/room/roomSendGuard';

const mounted: ReactDOM.Root[] = [];
const mount = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mounted.push(root);
    await act(async () => {
        root.render(node);
        await Promise.resolve();
    });
    return container;
};

const type = async (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
};

const settle = async () => {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

beforeEach(() => {
    sendRichText.mockReset();
});

afterEach(async () => {
    await act(async () => {
        mounted.splice(0).forEach((root) => root.unmount());
        await Promise.resolve();
    });
    document.body.innerHTML = '';
});

describe('forumSendFailureNotice', () => {
    it('gives the refusal for an unloaded room in its own words', () => {
        expect(forumSendFailureNotice(new RoomNotReadyError())).toBe(
            'This room has not finished loading, so nothing was sent. Try again shortly.'
        );
    });

    it('says the text is kept for any other failure', () => {
        expect(forumSendFailureNotice(new Error('M_FORBIDDEN'))).toBe(
            'This was not sent. What you wrote is still here: try again.'
        );
    });
});

describe('a forum post that is not sent', () => {
    it('leaves the dialog open with the title in it, and says why', async () => {
        sendRichText.mockRejectedValueOnce(new RoomNotReadyError());
        const onClose = vi.fn();
        const onPosted = vi.fn();
        const container = await mount(
            <CreatePostModal
                roomId="!forum:test"
                open
                tags={[]}
                requireTag={false}
                onClose={onClose}
                onPosted={onPosted}
            />
        );
        const title = container.querySelector('input') as HTMLInputElement;
        await type(title, 'Meeting notes');

        const post = [...container.querySelectorAll('button')].find(
            (button) => !button.disabled && /post|create|publish/i.test(button.textContent ?? '')
        );
        expect(post).toBeTruthy();
        await act(async () => {
            post?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await settle();

        expect(sendRichText).toHaveBeenCalledTimes(1);
        expect(container.querySelector('[data-testid="forum-post-failure"]')?.textContent).toBe(
            'This room has not finished loading, so nothing was sent. Try again shortly.'
        );
        expect(onClose).not.toHaveBeenCalled();
        expect(onPosted).not.toHaveBeenCalled();
        expect((container.querySelector('input') as HTMLInputElement).value).toBe('Meeting notes');
    });
});
