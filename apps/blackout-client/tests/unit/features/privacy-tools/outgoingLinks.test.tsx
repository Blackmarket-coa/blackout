// @vitest-environment jsdom
//
// The privacy tools said link tracking-parameter removal was "always on". It
// ran in the message box only: forum posts, forum replies and wall posts went
// out with `utm_*`, `fbclid` and the rest in their links.
// docs/security/trust-claims-2026-11-16.md, T12.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sent: Array<{ type: string; content: Record<string, unknown> }> = [];
const client = {
    getRoom: () => ({ hasEncryptionStateEvent: () => false }),
    getCrypto: () => undefined,
    sendEvent: vi.fn(async (_roomId: string, type: string, content: Record<string, unknown>) => {
        sent.push({ type, content });
        return { event_id: '$sent' };
    }),
};
const apiRequests: Array<{ method: string; path: string; body?: unknown }> = [];

vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyMatrixClientAdapter', () => ({
    useLegacyMatrixClientAdapter: () => client,
}));
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyRoomAdapter', () => ({
    useLegacyRoomAdapter: () => ({ data: null, loading: false, error: null }),
}));
vi.mock('../../../../src/app/sdk/client', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createAuthorizedApiClient:
        () => async (request: { method: string; path: string; body?: unknown }) => {
            apiRequests.push(request);
            return {
                id: 'w1',
                profileUserId: '@me:hs',
                authorId: '@me:hs',
                body: '',
                createdAt: '',
            };
        },
}));

import { useLegacySendMessageAdapter } from '../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';
import { postWall } from '../../../../src/app/features/profile/profileClient';

const TRACKED = 'https://news.example/story?id=7&utm_source=share&fbclid=abc';
const CLEAN = 'https://news.example/story?id=7';

const roots: ReactDOM.Root[] = [];
afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    sent.length = 0;
    apiRequests.length = 0;
});

const mountSender = async () => {
    const api: { current: ReturnType<typeof useLegacySendMessageAdapter> | null } = {
        current: null,
    };
    const Probe = () => {
        api.current = useLegacySendMessageAdapter('!forum:hs');
        return null;
    };
    const root = ReactDOM.createRoot(document.createElement('div'));
    roots.push(root);
    await act(async () => {
        root.render(<Probe />);
    });
    return api.current as ReturnType<typeof useLegacySendMessageAdapter>;
};

describe('links lose their tracking parameters wherever a message leaves the app', () => {
    it('a forum post', async () => {
        const send = await mountSender();
        await act(async () => {
            await send.sendRichText({
                msgtype: 'm.text',
                body: `Title\nread ${TRACKED}`,
                'co.bmc.forum.tags': [],
            });
        });
        expect(sent[0].content.body).toBe(`Title\nread ${CLEAN}`);
        expect(sent[0].content['co.bmc.forum.tags']).toEqual([]);
    });

    it('a forum reply', async () => {
        const send = await mountSender();
        await act(async () => {
            await send.sendThread(`agreed, see ${TRACKED}`, '$root');
        });
        expect(sent[0].content.body).toBe(`agreed, see ${CLEAN}`);
        expect(sent[0].content['m.relates_to']).toMatchObject({ event_id: '$root' });
    });

    it('a reply and a plain message', async () => {
        const send = await mountSender();
        await act(async () => {
            await send.sendReply(TRACKED, '$parent');
            await send.sendText(TRACKED);
        });
        expect(sent.map((entry) => entry.content.body)).toEqual([CLEAN, CLEAN]);
    });

    it('a wall post', async () => {
        await postWall('@friend:hs', `look ${TRACKED}`, 'token');
        expect(apiRequests[0]).toMatchObject({
            method: 'POST',
            body: { body: `look ${CLEAN}` },
        });
    });
});
