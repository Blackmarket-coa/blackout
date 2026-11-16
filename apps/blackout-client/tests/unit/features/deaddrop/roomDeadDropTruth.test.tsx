// @vitest-environment jsdom
//
// The room "Dead Drop" mode. A room can carry a `co.bmc.deaddrop` state event
// that switches the composer, an indicator and a settings panel into dead-drop
// dress. Nothing reads that state but this client's own UI: no code queues a
// message, holds it for a schedule, or delivers it under another sender. A
// message typed there goes to the room at once, like any other.
//
// So the UI must not say otherwise. These tests pin what it may claim.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sendRichText = vi.fn().mockResolvedValue(undefined);
const sendMedia = vi.fn().mockResolvedValue(undefined);
const sendStateEvent = vi.fn().mockResolvedValue({ event_id: '$state' });

vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTimelineAdapter', () => ({
    useLegacySendMessageAdapter: () => ({ sendRichText, sendMedia }),
    useLegacyEditMessageAdapter: () => vi.fn(),
}));
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTypingAdapter', () => ({
    useLegacySendTypingAdapter: () => vi.fn().mockResolvedValue(undefined),
}));

const deadDropState: Record<string, unknown> = {
    schemaVersion: 1,
    enabled: true,
    schedule: { type: 'interval', intervalMinutes: 60 },
    anonymize: true,
    maxQueueSize: 100,
    retentionHours: 48,
};
const room = {
    roomId: '!room:test',
    hasEncryptionStateEvent: () => true,
    getMember: () => null,
    currentState: {
        getStateEvents: (type: string) =>
            type === 'co.bmc.deaddrop' ? { getContent: () => deadDropState } : null,
    },
};
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyRoomAdapter', () => ({
    useLegacyRoomMembersAdapter: () => ({ data: [] }),
    useLegacyRoomAdapter: () => ({ data: room, loading: false, error: null }),
}));
vi.mock('../../../../src/app/plugins/navigation', () => ({
    useNavigationSpaceTree: () => ({ data: [] }),
}));
vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({
        getRoom: () => room,
        getUserId: () => '@me:test',
        sendEvent: vi.fn(),
        sendStateEvent,
    }),
}));
vi.mock('../../../../src/app/hooks/useStateEvent', () => ({
    useStateEvent: () => ({ getContent: () => ({}) }),
}));
vi.mock('../../../../src/app/features/room/attachments/useAttachPhoto', () => ({
    useAttachPhoto: () => vi.fn(),
}));
vi.mock('../../../../src/app/features/room/scheduledMessagesClient', () => ({
    createScheduledMessage: vi.fn(),
}));

import {
    DEAD_DROP_NOTHING_TO_CONFIGURE,
    DEAD_DROP_NOT_BUILT_NOTICE,
    DeadDropComposer,
    DeadDropIndicator,
    DeadDropSettings,
    useDeadDrop,
} from '../../../../src/app/features/deaddrop';

const mounted: ReactDOM.Root[] = [];
const mount = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mounted.push(root);
    await act(async () => {
        root.render(<Provider store={createStore()}>{node}</Provider>);
        await Promise.resolve();
    });
    return container;
};

const click = async (el: Element | null | undefined) => {
    await act(async () => {
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await Promise.resolve();
    });
};

const findButton = (container: HTMLElement, text: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.matchMedia =
        window.matchMedia ??
        ((query: string) =>
            ({
                matches: false,
                media: query,
                onchange: null,
                addEventListener: () => {},
                removeEventListener: () => {},
                addListener: () => {},
                removeListener: () => {},
                dispatchEvent: () => false,
            } as unknown as MediaQueryList));
});

afterEach(async () => {
    await act(async () => {
        mounted.splice(0).forEach((root) => root.unmount());
        await Promise.resolve();
    });
    document.body.innerHTML = '';
});

/** Phrases that describe something the app does not do. */
const FALSE_CLAIMS = [
    /will be queued/i,
    /queued message/i,
    /until next dead drop release/i,
    /next delivery/i,
    /delivers every/i,
];

describe('the composer in a room with dead drop switched on', () => {
    it('sends the message to the room at once: nothing queues it', async () => {
        const container = await mount(<DeadDropComposer roomId="!room:test" />);
        // Seed a draft the way a person would have typed it.
        window.localStorage.setItem('blackout.draft.!room:test', 'meet at the old mill');
        await act(async () => {
            mounted.splice(0).forEach((root) => root.unmount());
        });
        const again = await mount(<DeadDropComposer roomId="!room:test" />);

        await click(findButton(again, 'Send'));

        expect(sendRichText).toHaveBeenCalledTimes(1);
        expect((sendRichText.mock.calls[0][0] as { body: string }).body).toContain(
            'meet at the old mill'
        );
        expect(container).toBeTruthy();
    });

    it('does not say the message will be queued, held or released later', async () => {
        const container = await mount(<DeadDropComposer roomId="!room:test" />);
        const text = `${container.textContent} ${[...container.querySelectorAll('[placeholder]')]
            .map((el) => el.getAttribute('placeholder'))
            .join(' ')} ${container.innerHTML}`;

        for (const claim of FALSE_CLAIMS) expect(text).not.toMatch(claim);
        expect(
            container.querySelector('[data-testid="deaddrop-composer-notice"]')?.textContent
        ).toBe(DEAD_DROP_NOT_BUILT_NOTICE);
        expect(container.textContent).toContain('delivered at once');
        expect(container.textContent).toContain('not built yet');
    });

    it('offers no delivery condition: there is nothing for one to control', async () => {
        const container = await mount(<DeadDropComposer roomId="!room:test" />);

        expect(container.textContent).not.toMatch(/delivery condition/i);
        expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
        expect([...container.querySelectorAll('option')].map((o) => o.textContent)).not.toContain(
            'Recipient online'
        );
    });
});

describe('the indicator above the timeline', () => {
    const Probe = () => {
        const deadDrop = useDeadDrop('!room:test');
        return <DeadDropIndicator config={deadDrop.data} queueCount={deadDrop.queueCount} />;
    };

    it('does not count down to a delivery or show a queue', async () => {
        const container = await mount(<Probe />);
        const text = container.textContent ?? '';

        for (const claim of FALSE_CLAIMS) expect(text).not.toMatch(claim);
        expect(text).not.toMatch(/queue:\s*\d/i);
        expect(text).toContain('not built yet');
        expect(text).toContain('delivered at once');
    });
});

describe('the settings panel', () => {
    it('says what the settings do: they are stored, and change nothing about delivery', async () => {
        const container = await mount(<DeadDropSettings roomId="!room:test" />);
        const text = container.textContent ?? '';

        expect(text).toContain('planned and not built yet');
        expect(text).toContain('delivered at once');
        expect(text).toContain("under the sender's own name");
    });

    it('does not sell an upgrade for scheduling or anonymized delivery', async () => {
        const container = await mount(<DeadDropSettings roomId="!room:test" />);
        const text = container.textContent ?? '';

        expect(text).not.toMatch(/requires the Pro tier/i);
        expect(text).not.toMatch(/upgrade/i);
        expect(container.querySelector('[data-testid="deaddrop-anonymize-warning"]')).toBeNull();
        expect(container.querySelector('[data-testid="deaddrop-schedule-warning"]')).toBeNull();
    });

    it('offers no queue to flush or clear, and no anonymized delivery to switch on', async () => {
        const container = await mount(<DeadDropSettings roomId="!room:test" />);

        expect(findButton(container, 'Flush queue')).toBeUndefined();
        expect(findButton(container, 'Clear queue')).toBeUndefined();
        expect(container.textContent).not.toMatch(/Anonymize delivery via bot account/);
        expect(container.textContent).not.toMatch(/current queue count/i);
    });

    it('can still switch the mode off, so a room can drop the notice; what was stored is kept', async () => {
        const container = await mount(<DeadDropSettings roomId="!room:test" />);

        await click(container.querySelector('[data-testid="deaddrop-switch-off"]'));

        expect(sendStateEvent).toHaveBeenCalledTimes(1);
        const [roomId, type, content] = sendStateEvent.mock.calls[0] as [
            string,
            string,
            Record<string, unknown>
        ];
        expect(roomId).toBe('!room:test');
        expect(type).toBe('co.bmc.deaddrop');
        expect(content.enabled).toBe(false);
        expect(content.schedule).toEqual({ type: 'interval', intervalMinutes: 60 });
        expect(content.retentionHours).toBe(48);
    });

    it('offers no way to switch the mode on, and no form', async () => {
        const container = await mount(<DeadDropSettings roomId="!room:test" />);

        expect(container.querySelectorAll('input, select')).toHaveLength(0);
        expect([...container.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(
            ['Switch off dead drop for this room']
        );
    });
});

describe('a room without dead drop switched on', () => {
    beforeEach(() => {
        deadDropState.enabled = false;
    });
    afterEach(() => {
        deadDropState.enabled = true;
    });

    it('shows no dead-drop panel under its composer', async () => {
        const container = await mount(<DeadDropSettings roomId="!room:test" hideWhenOff />);
        expect(container.querySelector('[data-testid="deaddrop-settings"]')).toBeNull();
        expect(container.textContent).toBe('');
    });

    it('on the settings page says there is nothing to switch on, and offers nothing', async () => {
        const container = await mount(<DeadDropSettings roomId="!room:test" />);

        expect(container.textContent).toContain(DEAD_DROP_NOTHING_TO_CONFIGURE);
        expect(container.textContent).toContain('planned and not built yet');
        expect(container.querySelectorAll('button, input, select')).toHaveLength(0);
    });

    it('shows no indicator', async () => {
        const Probe = () => {
            const deadDrop = useDeadDrop('!room:test');
            return <DeadDropIndicator config={deadDrop.data} queueCount={deadDrop.queueCount} />;
        };
        const container = await mount(<Probe />);
        expect(container.textContent).toBe('');
    });
});
