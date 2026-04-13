import { describe, expect, it, vi } from 'vitest';
import { composerQuickActionsPlugin } from '../../../src/app/plugins/composer';
import { assertPluginDoesNotMutatePayloadShape } from '../../../src/app/plugins/protocolPayloadGuard';
import { createReadOnlyMatrixAdapters } from '../../../src/app/plugins/matrix-adapters';

describe('plugin protocol payload guard', () => {
    it('asserts composer plugin does not mutate Matrix event content payload shape', () => {
        const payload = {
            msgtype: 'm.text',
            body: 'hello',
            'm.relates_to': {
                rel_type: 'm.thread',
                event_id: '$abc:example.org',
            },
        };

        expect(() =>
            assertPluginDoesNotMutatePayloadShape(payload, (input) => {
                composerQuickActionsPlugin.getTimelineQuickActions(input);
            })
        ).not.toThrow();
    });

    it('asserts matrix adapter plugin preserves protocol payload shape', () => {
        const contentPayload = {
            msgtype: 'm.text',
            body: 'message',
            format: 'org.matrix.custom.html',
            formatted_body: '<p>message</p>',
        };
        const event = {
            getId: vi.fn(() => '$event:example.org'),
            getType: vi.fn(() => 'm.room.message'),
            getSender: vi.fn(() => '@alice:example.org'),
            getTs: vi.fn(() => 123),
            getContent: vi.fn(() => contentPayload),
        } as any;

        expect(() =>
            assertPluginDoesNotMutatePayloadShape(contentPayload, () => {
                createReadOnlyMatrixAdapters(
                    { getRoom: vi.fn(), getRooms: vi.fn() } as any,
                    { roomId: '!room:example.org', getJoinedMembers: vi.fn() } as any,
                    event
                ).event.getContent();
            })
        ).not.toThrow();
    });
});
