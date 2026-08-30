// Canopy subscription state is now DURABLE: services/subscriptions.ts writes to
// the runtime store (db.*) instead of the former module-level Maps that were
// wiped on every restart. This drives the public service functions and asserts
// the records land in the same imported `db` singleton — subscriptions, the
// audit trail, the webhook de-dupe ledger, and pay-it-forward gifts — and that a
// processed webhook id is deduped through db, not an in-memory Set.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BLACKOUT_DB_MODE = 'memory';

const { db } = await import('../src/db/store');
const {
    applyManualComp,
    applySubscriptionWebhookEvent,
    donateForward,
    getGift,
    getSubscriptionAuditTimeline,
} = await import('../src/services/subscriptions');

test('applyManualComp persists a comped subscription + audit event into db', () => {
    const userId = 'sub-persist-comp';
    assert.equal(db.getCanopySubscription(userId), undefined, 'no record before the comp');

    const snap = applyManualComp(userId, 'admin-1', 'goodwill');
    assert.equal(snap.comped, true);
    assert.equal(snap.status, 'active');

    const stored = db.getCanopySubscription(userId);
    assert.ok(stored, 'subscription is durable in db');
    assert.equal(stored?.comped, true);
    assert.equal(stored?.tier, 'sprout');
    assert.equal(stored?.status, 'active');

    const audit = db.listSubscriptionAuditEventsByUser(userId);
    assert.ok(
        audit.some((e) => e.type === 'admin.manual_comp' && e.actor === 'admin-1'),
        'the comp is recorded in the durable audit trail'
    );
    // The service reads back the same durable trail.
    assert.ok(getSubscriptionAuditTimeline(userId).some((e) => e.type === 'admin.manual_comp'));
});

test('a billing webhook is applied once and its event id is deduped via db', () => {
    const userId = 'sub-persist-webhook';
    const eventId = 'evt-persist-1';
    assert.equal(db.hasProcessedBillingWebhookEvent(eventId), false);

    const first = applySubscriptionWebhookEvent({
        eventId,
        type: 'invoice.paid',
        userId,
        planCode: 'canopy_sprout_monthly',
    });
    assert.equal(first.processed, true);
    assert.equal(first.status, 'active');

    // Persisted: subscription upgraded + event id recorded in the de-dupe ledger.
    assert.equal(db.getCanopySubscription(userId)?.status, 'active');
    assert.equal(db.getCanopySubscription(userId)?.tier, 'sprout');
    assert.equal(db.hasProcessedBillingWebhookEvent(eventId), true);

    // Re-delivery of the same event id is a no-op, deduped through db.
    const second = applySubscriptionWebhookEvent({
        eventId,
        type: 'invoice.paid',
        userId,
        planCode: 'canopy_sprout_monthly',
    });
    assert.equal(second.processed, false, 'a duplicate event id must not re-process');
});

test('donateForward persists a pending gift into db', () => {
    const userId = 'sub-persist-gift';
    // A donor needs an active, non-free entitlement.
    applyManualComp(userId, 'admin-1');

    const gift = donateForward(userId, 'actor-1');
    assert.equal(gift.status, 'pending');
    assert.equal(gift.donorUserId, userId);

    const stored = db.getSubscriptionGift(gift.id);
    assert.ok(stored, 'gift is durable in db');
    assert.equal(stored?.status, 'pending');
    assert.equal(stored?.donorTier, 'sprout');
    assert.ok(
        db.listSubscriptionGifts().some((g) => g.id === gift.id),
        'the gift is listed in the durable gift set'
    );
    // Service getter reads the same durable record.
    assert.equal(getGift(gift.id)?.id, gift.id);
});
