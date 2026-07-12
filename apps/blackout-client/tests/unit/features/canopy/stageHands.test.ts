import { describe, expect, it } from 'vitest';
import type { MatrixEvent } from 'matrix-js-sdk';

import {
    STAGE_HAND_EVENT_TYPE,
    buildStageHandContent,
    collectRaisedHands,
    stageHandSignalFromEvent,
    type StageHandSignal,
} from '../../../../src/app/features/canopy/stageHands';

const signal = (
    sender: string,
    ts: number,
    raised: boolean,
    extra: Partial<StageHandSignal> = {}
): StageHandSignal => ({
    sender,
    ts,
    raised,
    senderIsModerator: false,
    ...extra,
});

const noSpeakers = new Set<string>();

describe('collectRaisedHands', () => {
    it('queues raised hands oldest-first', () => {
        expect(
            collectRaisedHands([signal('@b:x', 20, true), signal('@a:x', 10, true)], noSpeakers)
        ).toEqual(['@a:x', '@b:x']);
    });

    it('a member lowering their own hand removes it; re-raising re-queues at the back', () => {
        expect(
            collectRaisedHands(
                [
                    signal('@a:x', 10, true),
                    signal('@b:x', 20, true),
                    signal('@a:x', 30, false),
                    signal('@a:x', 40, true),
                ],
                noSpeakers
            )
        ).toEqual(['@b:x', '@a:x']);
    });

    it('keeps the original queue slot while a hand stays raised (duplicate raises)', () => {
        expect(
            collectRaisedHands(
                [signal('@a:x', 10, true), signal('@b:x', 20, true), signal('@a:x', 30, true)],
                noSpeakers
            )
        ).toEqual(['@a:x', '@b:x']);
    });

    it('moderators can lower someone else via `for`; non-moderators cannot', () => {
        const base = [signal('@a:x', 10, true)];
        expect(
            collectRaisedHands(
                [
                    ...base,
                    signal('@mod:x', 20, false, { subject: '@a:x', senderIsModerator: true }),
                ],
                noSpeakers
            )
        ).toEqual([]);
        expect(
            collectRaisedHands(
                [...base, signal('@peer:x', 20, false, { subject: '@a:x' })],
                noSpeakers
            )
        ).toEqual(['@a:x']);
    });

    it('nobody can raise a hand FOR someone else', () => {
        expect(
            collectRaisedHands(
                [signal('@mod:x', 10, true, { subject: '@a:x', senderIsModerator: true })],
                noSpeakers
            )
        ).toEqual([]);
    });

    it('a raise after a moderator lower wins (member asks again)', () => {
        expect(
            collectRaisedHands(
                [
                    signal('@a:x', 10, true),
                    signal('@mod:x', 20, false, { subject: '@a:x', senderIsModerator: true }),
                    signal('@a:x', 30, true),
                ],
                noSpeakers
            )
        ).toEqual(['@a:x']);
    });

    it('current speakers never queue', () => {
        expect(collectRaisedHands([signal('@a:x', 10, true)], new Set(['@a:x']))).toEqual([]);
    });
});

describe('stageHandSignalFromEvent', () => {
    const fakeEvent = (type: string, sender: string | null, content: unknown, ts = 100) =>
        ({
            getType: () => type,
            getSender: () => sender,
            getContent: () => content,
            getTs: () => ts,
        } as unknown as MatrixEvent);

    const notModerator = () => false;

    it('extracts sender, ts, raised, and the moderator subject', () => {
        const event = fakeEvent(
            STAGE_HAND_EVENT_TYPE,
            '@mod:x',
            buildStageHandContent(false, '@a:x'),
            42
        );
        expect(stageHandSignalFromEvent(event, (id) => id === '@mod:x')).toEqual({
            sender: '@mod:x',
            ts: 42,
            raised: false,
            subject: '@a:x',
            senderIsModerator: true,
        });
    });

    it('returns null for other event types, missing senders, and malformed content', () => {
        expect(
            stageHandSignalFromEvent(
                fakeEvent('m.room.message', '@a:x', { raised: true }),
                notModerator
            )
        ).toBeNull();
        expect(
            stageHandSignalFromEvent(
                fakeEvent(STAGE_HAND_EVENT_TYPE, null, { raised: true }),
                notModerator
            )
        ).toBeNull();
        expect(
            stageHandSignalFromEvent(
                fakeEvent(STAGE_HAND_EVENT_TYPE, '@a:x', { raised: 'yes' }),
                notModerator
            )
        ).toBeNull();
    });
});

describe('buildStageHandContent', () => {
    it('omits `for` unless a subject is given', () => {
        expect(buildStageHandContent(true)).toEqual({ raised: true });
        expect(buildStageHandContent(false, '@a:x')).toEqual({ raised: false, for: '@a:x' });
    });
});
