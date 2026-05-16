// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixEvent } from 'matrix-js-sdk';
import { ThreadPanel } from '../../../../src/app/features/right-panel/ThreadPanel';

type FakeEvent = {
    id: string;
    body?: string;
    sender?: string;
    rootEventId?: string;
    ts?: number;
};

const makeEvent = ({
    id,
    body,
    sender = '@user:example.org',
    rootEventId,
    ts = 1_700_000_000_000,
}: FakeEvent): MatrixEvent =>
    ({
        getId: () => id,
        getTs: () => ts,
        getSender: () => sender,
        getType: () => 'm.room.message',
        getContent: () => ({
            ...(body !== undefined ? { body } : {}),
            ...(rootEventId
                ? {
                      'm.relates_to': {
                          rel_type: 'm.thread',
                          event_id: rootEventId,
                      },
                  }
                : {}),
        }),
    }) as unknown as MatrixEvent;

type Props = React.ComponentProps<typeof ThreadPanel>;

const mountPanel = async (props: Props) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(<ThreadPanel {...props} />);
        await Promise.resolve();
    });

    return { container, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('ThreadPanel (Workstream C — in-room thread panel tree UI)', () => {
    it('renders the root header + each chronological reply', async () => {
        const root = makeEvent({
            id: '$root',
            body: 'How should we phase the rollout?',
            sender: '@alice:example.org',
        });
        const reply1 = makeEvent({
            id: '$r1',
            body: 'Canary 5% first.',
            sender: '@bob:example.org',
            rootEventId: '$root',
        });
        const reply2 = makeEvent({
            id: '$r2',
            body: 'Then ramp over the week.',
            sender: '@cat:example.org',
            rootEventId: '$root',
        });

        const { container } = await mountPanel({
            events: [root, reply1, reply2],
            rootEventId: '$root',
        });

        const header = container.querySelector('[data-testid="thread-panel-root"]');
        expect(header).not.toBeNull();
        expect(header?.textContent).toContain('@alice:example.org');
        expect(header?.textContent).toContain('How should we phase the rollout?');

        const r1 = container.querySelector('[data-testid="thread-panel-reply-$r1"]');
        const r2 = container.querySelector('[data-testid="thread-panel-reply-$r2"]');
        expect(r1?.textContent).toContain('Canary 5% first.');
        expect(r2?.textContent).toContain('Then ramp over the week.');

        // Reply ordering matches input order (chronological).
        const rendered = Array.from(
            container.querySelectorAll(
                '[data-testid="thread-panel-replies"] [data-testid^="thread-panel-reply-"]',
            ),
        ).map((el) => el.getAttribute('data-testid'));
        expect(rendered).toEqual([
            'thread-panel-reply-$r1',
            'thread-panel-reply-$r2',
        ]);

        // Reply-fallback button renders since no renderComposer was provided.
        expect(
            container.querySelector('[data-testid="thread-panel-reply-fallback"]'),
        ).not.toBeNull();
    });

    it('renders the root-missing empty state when the root is not in the window', async () => {
        const reply = makeEvent({
            id: '$r1',
            body: 'standalone reply',
            rootEventId: '$root-not-loaded',
        });

        const { container } = await mountPanel({
            events: [reply],
            rootEventId: '$root-not-loaded',
        });

        expect(container.querySelector('[data-testid="thread-panel-root"]')).toBeNull();
        const missing = container.querySelector(
            '[data-testid="thread-panel-root-missing"]',
        );
        expect(missing?.textContent).toContain('Thread root not loaded');
        // Reply still renders alongside the missing-root notice.
        expect(
            container.querySelector('[data-testid="thread-panel-reply-$r1"]'),
        ).not.toBeNull();
    });

    it('renders the no-replies empty state when only the root is present', async () => {
        const root = makeEvent({ id: '$root', body: 'first message' });

        const { container } = await mountPanel({
            events: [root],
            rootEventId: '$root',
        });

        expect(container.querySelector('[data-testid="thread-panel-root"]')).not.toBeNull();
        expect(
            container.querySelector('[data-testid="thread-panel-empty"]')?.textContent,
        ).toContain('No replies yet');
    });

    it('uses the fallback body when an event has no body content (encrypted preview)', async () => {
        const root = makeEvent({ id: '$root' /* no body */ });
        const { container } = await mountPanel({
            events: [root],
            rootEventId: '$root',
            fallbackBody: '[encrypted thread root]',
        });
        expect(
            container.querySelector('[data-testid="thread-panel-root"]')?.textContent,
        ).toContain('[encrypted thread root]');
    });

    it('renders the parent-injected composer slot in place of the fallback button', async () => {
        const root = makeEvent({ id: '$root', body: 'first' });
        const renderComposer = vi.fn((rootEventId: string) => (
            <div data-testid="injected-composer" data-target-root={rootEventId}>
                injected
            </div>
        ));

        const { container } = await mountPanel({
            events: [root],
            rootEventId: '$root',
            renderComposer,
        });

        const injected = container.querySelector('[data-testid="injected-composer"]');
        expect(injected).not.toBeNull();
        expect(injected?.getAttribute('data-target-root')).toBe('$root');
        // Fallback button is not rendered when renderComposer is provided.
        expect(
            container.querySelector('[data-testid="thread-panel-reply-fallback"]'),
        ).toBeNull();
        expect(renderComposer).toHaveBeenCalledWith('$root');
    });

    it('disables the fallback Reply button when no onReply handler is provided', async () => {
        const root = makeEvent({ id: '$root', body: 'first' });
        const { container } = await mountPanel({
            events: [root],
            rootEventId: '$root',
        });
        const button = container.querySelector(
            '[data-testid="thread-panel-reply-fallback"]',
        ) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
    });

    it('calls onReply with the root id when the fallback button is clicked', async () => {
        const root = makeEvent({ id: '$root', body: 'first' });
        const onReply = vi.fn();
        const { container } = await mountPanel({
            events: [root],
            rootEventId: '$root',
            onReply,
        });

        const button = container.querySelector(
            '[data-testid="thread-panel-reply-fallback"]',
        ) as HTMLButtonElement;
        await act(async () => {
            button.click();
            await Promise.resolve();
        });
        expect(onReply).toHaveBeenCalledWith('$root');
    });

    it('calls onJumpToEvent with the root id when the root header is clicked', async () => {
        const root = makeEvent({ id: '$root', body: 'first' });
        const reply = makeEvent({
            id: '$r1',
            body: 'reply',
            rootEventId: '$root',
        });
        const onJumpToEvent = vi.fn();

        const { container } = await mountPanel({
            events: [root, reply],
            rootEventId: '$root',
            onJumpToEvent,
        });

        const header = container.querySelector(
            '[data-testid="thread-panel-root"]',
        ) as HTMLElement;
        expect(header.getAttribute('role')).toBe('button');
        await act(async () => {
            header.click();
            await Promise.resolve();
        });
        expect(onJumpToEvent).toHaveBeenCalledWith('$root');
    });

    it('calls onJumpToEvent with the reply id when a reply card is clicked', async () => {
        const root = makeEvent({ id: '$root', body: 'first' });
        const reply = makeEvent({
            id: '$r1',
            body: 'reply',
            rootEventId: '$root',
        });
        const onJumpToEvent = vi.fn();

        const { container } = await mountPanel({
            events: [root, reply],
            rootEventId: '$root',
            onJumpToEvent,
        });

        const card = container.querySelector(
            '[data-testid="thread-panel-reply-$r1"]',
        ) as HTMLElement;
        await act(async () => {
            card.click();
            await Promise.resolve();
        });
        expect(onJumpToEvent).toHaveBeenCalledWith('$r1');
    });

    it('ignores replies for unrelated thread roots in the same window', async () => {
        const rootA = makeEvent({ id: '$rootA', body: 'thread A' });
        const replyA = makeEvent({
            id: '$rA1',
            body: 'A reply',
            rootEventId: '$rootA',
        });
        const replyOther = makeEvent({
            id: '$rOther',
            body: 'unrelated reply',
            rootEventId: '$rootB',
        });

        const { container } = await mountPanel({
            events: [rootA, replyA, replyOther],
            rootEventId: '$rootA',
        });

        expect(
            container.querySelector('[data-testid="thread-panel-reply-$rA1"]'),
        ).not.toBeNull();
        // Unrelated reply doesn't appear in the panel.
        expect(
            container.querySelector('[data-testid="thread-panel-reply-$rOther"]'),
        ).toBeNull();
    });

    it('records the rootEventId in a data attribute on the panel container', async () => {
        const { container } = await mountPanel({
            events: [],
            rootEventId: '$root-attr',
        });
        const panel = container.querySelector('[data-testid="thread-panel"]');
        expect(panel?.getAttribute('data-root-event-id')).toBe('$root-attr');
    });
});
