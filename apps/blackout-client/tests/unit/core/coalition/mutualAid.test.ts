import { describe, expect, it } from 'vitest';
import {
    deriveDisplayStatus,
    isPostExpired,
    URGENCY_RANK,
    AID_POST_URGENCY,
    type AidPost,
    type AidPostStatus,
    type AidPostUrgency,
} from '@blackout/core';

// A fixed clock so expiry assertions are deterministic regardless of wall time.
const NOW = Date.parse('2026-07-01T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

const makePost = (overrides: Partial<AidPost> = {}): AidPost => ({
    id: 'aid-1',
    customerId: 'user-1',
    type: 'need',
    category: 'food',
    title: 'Groceries for a neighbor',
    description: 'A hand carrying groceries up three flights.',
    location: { latitude: 0, longitude: 0 },
    displayRadiusMeters: 1000,
    urgency: 'medium',
    status: 'open',
    ...overrides,
});

describe('isPostExpired', () => {
    it('is never expired when no expiresAt is set', () => {
        expect(isPostExpired(makePost({ expiresAt: undefined }), NOW)).toBe(false);
    });

    it('is not expired when expiresAt is in the future', () => {
        const post = makePost({ expiresAt: new Date(NOW + HOUR).toISOString() });
        expect(isPostExpired(post, NOW)).toBe(false);
    });

    it('is expired when expiresAt is in the past', () => {
        const post = makePost({ expiresAt: new Date(NOW - HOUR).toISOString() });
        expect(isPostExpired(post, NOW)).toBe(true);
    });

    it('treats an expiry exactly at now as expired (boundary is inclusive)', () => {
        const post = makePost({ expiresAt: new Date(NOW).toISOString() });
        expect(isPostExpired(post, NOW)).toBe(true);
    });

    it('is not expired when expiresAt is unparseable (guards against NaN)', () => {
        const post = makePost({ expiresAt: 'not-a-timestamp' });
        expect(isPostExpired(post, NOW)).toBe(false);
    });

    it('defaults to Date.now() when no clock is supplied', () => {
        const alreadyPast = makePost({ expiresAt: new Date(Date.now() - HOUR).toISOString() });
        const farFuture = makePost({ expiresAt: new Date(Date.now() + 100 * HOUR).toISOString() });
        expect(isPostExpired(alreadyPast)).toBe(true);
        expect(isPostExpired(farFuture)).toBe(false);
    });
});

describe('deriveDisplayStatus', () => {
    const future = new Date(NOW + HOUR).toISOString();
    const past = new Date(NOW - HOUR).toISOString();

    it('passes through open when not expired', () => {
        expect(deriveDisplayStatus(makePost({ status: 'open', expiresAt: future }), NOW)).toBe(
            'open'
        );
    });

    it('passes through in_progress when not expired', () => {
        expect(
            deriveDisplayStatus(makePost({ status: 'in_progress', expiresAt: future }), NOW)
        ).toBe('in_progress');
    });

    it('reports open → expired once the deadline passes', () => {
        expect(deriveDisplayStatus(makePost({ status: 'open', expiresAt: past }), NOW)).toBe(
            'expired'
        );
    });

    it('reports in_progress → expired once the deadline passes', () => {
        expect(deriveDisplayStatus(makePost({ status: 'in_progress', expiresAt: past }), NOW)).toBe(
            'expired'
        );
    });

    it('keeps a fulfilled post fulfilled even after its deadline', () => {
        // Terminal states win over expiry: a completed hand-off should not
        // silently flip to "expired" just because the window elapsed.
        expect(deriveDisplayStatus(makePost({ status: 'fulfilled', expiresAt: past }), NOW)).toBe(
            'fulfilled'
        );
    });

    it('keeps a cancelled post cancelled even after its deadline', () => {
        expect(deriveDisplayStatus(makePost({ status: 'cancelled', expiresAt: past }), NOW)).toBe(
            'cancelled'
        );
    });

    it('reports the persisted expired status verbatim', () => {
        expect(deriveDisplayStatus(makePost({ status: 'expired' }), NOW)).toBe('expired');
    });

    it('passes through non-terminal statuses unchanged when no expiry is set', () => {
        const statuses: AidPostStatus[] = ['open', 'in_progress'];
        for (const status of statuses) {
            expect(deriveDisplayStatus(makePost({ status, expiresAt: undefined }), NOW)).toBe(
                status
            );
        }
    });

    it('is independent of urgency — display status is driven by lifecycle, not urgency', () => {
        for (const urgency of AID_POST_URGENCY) {
            expect(
                deriveDisplayStatus(makePost({ status: 'open', urgency, expiresAt: past }), NOW)
            ).toBe('expired');
            expect(
                deriveDisplayStatus(makePost({ status: 'open', urgency, expiresAt: future }), NOW)
            ).toBe('open');
        }
    });
});

describe('URGENCY_RANK', () => {
    it('ranks urgency levels in strictly ascending order low < medium < high < critical', () => {
        expect(URGENCY_RANK.low).toBeLessThan(URGENCY_RANK.medium);
        expect(URGENCY_RANK.medium).toBeLessThan(URGENCY_RANK.high);
        expect(URGENCY_RANK.high).toBeLessThan(URGENCY_RANK.critical);
    });

    it('assigns a rank to every declared urgency level within (0, 1]', () => {
        for (const urgency of AID_POST_URGENCY as readonly AidPostUrgency[]) {
            expect(URGENCY_RANK[urgency]).toBeGreaterThan(0);
            expect(URGENCY_RANK[urgency]).toBeLessThanOrEqual(1);
        }
    });
});
