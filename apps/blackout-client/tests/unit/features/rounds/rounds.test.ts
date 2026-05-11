import { describe, expect, it } from 'vitest';
import {
    isRoundOpenedPayload,
    phaseFromRoleTerm,
    type RolePayload,
    type RoundOpenedPayload,
} from '@blackout/protocol';
import {
    collectRoundContributions,
    type RoundContribution,
} from '../../../../src/app/features/rounds/useRounds';

/**
 * Lightweight MatrixEvent stand-in. The collector only needs a few methods,
 * so we skip the real matrix-js-sdk type to keep the test pure.
 */
type FakeEvent = {
    isRedacted(): boolean;
    getType(): string;
    getContent<T>(): T;
    getSender(): string | undefined;
    getId(): string | null;
    getTs(): number;
};

const event = (init: {
    type?: string;
    content?: Record<string, unknown>;
    sender?: string;
    id?: string;
    ts?: number;
    redacted?: boolean;
}): FakeEvent => ({
    isRedacted: () => init.redacted === true,
    getType: () => init.type ?? 'm.room.message',
    getContent: <T,>() => (init.content ?? {}) as T,
    getSender: () => init.sender,
    getId: () => init.id ?? null,
    getTs: () => init.ts ?? 0,
});

const replyContent = (eventId: string, extra: Record<string, unknown> = {}) => ({
    'm.relates_to': {
        'm.in_reply_to': { event_id: eventId },
    },
    ...extra,
});

describe('isRoundOpenedPayload', () => {
    it('accepts a minimal open round', () => {
        const payload: RoundOpenedPayload = {
            roundId: 'rid-1',
            prompt: 'How did this week land?',
            allowVoice: true,
            facilitator: '@alice:x',
            status: 'open',
        };
        expect(isRoundOpenedPayload(payload)).toBe(true);
    });

    it('rejects payloads missing the prompt', () => {
        expect(
            isRoundOpenedPayload({
                roundId: 'rid-1',
                allowVoice: true,
                facilitator: '@alice:x',
                status: 'open',
            }),
        ).toBe(false);
    });

    it('rejects payloads with an unknown status', () => {
        expect(
            isRoundOpenedPayload({
                roundId: 'rid-1',
                prompt: 'q',
                allowVoice: true,
                facilitator: '@alice:x',
                status: 'never-heard-of-it',
            }),
        ).toBe(false);
    });
});

describe('collectRoundContributions', () => {
    const ROUND_ID = '$round-1';

    it('returns an empty list when no replies target the round', () => {
        expect(
            collectRoundContributions(
                [
                    // @ts-expect-error fake event suffices for collectors
                    event({ id: 'm1', sender: '@alice:x', content: { body: 'unrelated' } }),
                ],
                ROUND_ID,
            ),
        ).toEqual([]);
    });

    it('collects one entry per contributor (latest wins)', () => {
        const result = collectRoundContributions(
            [
                // @ts-expect-error fake event
                event({
                    id: 'r1',
                    sender: '@alice:x',
                    ts: 1,
                    content: replyContent(ROUND_ID, { body: 'first take' }),
                }),
                // @ts-expect-error fake event
                event({
                    id: 'r2',
                    sender: '@alice:x',
                    ts: 5,
                    content: replyContent(ROUND_ID, { body: 'revised take' }),
                }),
                // @ts-expect-error fake event
                event({
                    id: 'r3',
                    sender: '@bob:x',
                    ts: 3,
                    content: replyContent(ROUND_ID, { body: 'bob speaks' }),
                }),
            ],
            ROUND_ID,
        );
        expect(result.length).toBe(2);
        const alice = result.find((c: RoundContribution) => c.contributorId === '@alice:x');
        expect(alice?.timestamp).toBe(5);
    });

    it('flags voice contributions via msc3245', () => {
        const result = collectRoundContributions(
            [
                // @ts-expect-error fake event
                event({
                    id: 'r1',
                    sender: '@alice:x',
                    ts: 1,
                    content: replyContent(ROUND_ID, {
                        'org.matrix.msc3245.voice': {},
                        body: 'voice take',
                    }),
                }),
            ],
            ROUND_ID,
        );
        expect(result[0]?.isVoice).toBe(true);
    });

    it('round-trips the buildVoiceReplyContent shape', async () => {
        // Belt + suspenders: the builder produces a content object whose
        // m.in_reply_to + msc3245 flag the collector recognizes as a voice
        // contribution. Keeps the producer/consumer pair in lockstep.
        const { buildVoiceReplyContent } = await import(
            '../../../../src/app/features/rounds/useRounds'
        );
        const content = buildVoiceReplyContent({
            url: 'mxc://x/abc',
            fileName: 'voice-note.webm',
            mimeType: 'audio/webm',
            size: 1024,
            roundEventId: ROUND_ID,
        });
        const result = collectRoundContributions(
            [
                // @ts-expect-error fake event
                event({
                    id: 'r-voice',
                    sender: '@me:x',
                    ts: 9,
                    content,
                }),
            ],
            ROUND_ID,
        );
        expect(result.length).toBe(1);
        expect(result[0].contributorId).toBe('@me:x');
        expect(result[0].isVoice).toBe(true);
    });

    it('ignores redacted events', () => {
        const result = collectRoundContributions(
            [
                // @ts-expect-error fake event
                event({
                    id: 'r1',
                    sender: '@alice:x',
                    ts: 1,
                    redacted: true,
                    content: replyContent(ROUND_ID),
                }),
            ],
            ROUND_ID,
        );
        expect(result.length).toBe(0);
    });
});

describe('phaseFromRoleTerm', () => {
    const baseRole = (overrides: Partial<RolePayload> = {}): Omit<RolePayload, 'roleId' | 'name' | 'domain' | 'updatedAt'> & {
        holderId: string;
        termStart: string;
        termEnd: string;
    } => ({
        holderId: '@alice:x',
        termStart: '2026-01-01T00:00:00Z',
        termEnd: '2026-04-01T00:00:00Z',
        ...overrides,
    });

    it('returns winter for vacant roles regardless of term', () => {
        expect(
            phaseFromRoleTerm(baseRole({ holderId: '' }), Date.parse('2026-02-01T00:00:00Z')),
        ).toBe('winter');
    });

    it('returns spring when the term has not started yet', () => {
        expect(
            phaseFromRoleTerm(baseRole(), Date.parse('2025-12-15T00:00:00Z')),
        ).toBe('spring');
    });

    it('returns summer in the early-to-mid term', () => {
        // 2026-01-01 -> 2026-04-01 is 90 days. 30 days in (~33%) is summer.
        expect(
            phaseFromRoleTerm(baseRole(), Date.parse('2026-01-31T00:00:00Z')),
        ).toBe('summer');
    });

    it('returns autumn in the last 40% of the term', () => {
        // 70 days in (~78%) is autumn.
        expect(
            phaseFromRoleTerm(baseRole(), Date.parse('2026-03-12T00:00:00Z')),
        ).toBe('autumn');
    });

    it('returns winter once the term has ended', () => {
        expect(
            phaseFromRoleTerm(baseRole(), Date.parse('2026-04-15T00:00:00Z')),
        ).toBe('winter');
    });
});
