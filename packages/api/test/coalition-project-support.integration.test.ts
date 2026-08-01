import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { captureTip } = await import('../src/services/tips');

const LEAD_ID = 'proj-lead-1';
const SUPPORTER_ID = 'proj-supporter-1';
const CANOPY = '!canopy-project-support-test:blackout';

function ensureUser(id: string, username: string): void {
    if (db.getUserById(id)) return;
    db.createUser({
        id,
        username,
        email: `${username}@blackout.test`,
        passwordHash: 'test-hash',
        reputationScore: 100,
        reputationTier: 'member',
        pubkeyEd25519: `${id}-pubkey`,
    });
}

function headers(userId: string, username: string): Record<string, string> {
    ensureUser(userId, username);
    return {
        authorization: `Bearer ${signJwt(userId, username, 600)}`,
        'content-type': 'application/json',
    };
}

test('coalition project support: tip capture advances progress, crosses milestones, is idempotent', async () => {
    // Lead launches a project with a goal and two milestones.
    const created = await app.request('/v1/coalition/projects', {
        method: 'POST',
        headers: headers(LEAD_ID, 'lead'),
        body: JSON.stringify({
            canopyId: CANOPY,
            title: 'Neighborhood greenhouse',
            category: 'community_garden',
            fundingGoalCents: 10000,
            currency: 'USD',
            useOfFunds: 'Polycarbonate panels and seedlings',
            milestones: [
                { label: 'Seeded', thresholdCents: 2000 },
                { label: 'Funded', thresholdCents: 10000 },
            ],
        }),
    });
    assert.equal(created.status, 201);
    const { project } = (await created.json()) as { project: { id: string; raisedCents: number } };
    assert.equal(project.raisedCents, 0);

    // A supporter contributes $50. Creating a support records a pending tip.
    const supported = await app.request(`/v1/coalition/projects/${project.id}/support`, {
        method: 'POST',
        headers: headers(SUPPORTER_ID, 'supporter'),
        body: JSON.stringify({ grossCents: 5000, currency: 'USD' }),
    });
    assert.equal(supported.status, 201);
    const { tip } = (await supported.json()) as { tip: { id: string; status: string } };
    assert.equal(tip.status, 'pending');

    // Progress only advances when the money is confirmed (capture).
    let view = await (
        await app.request(`/v1/coalition/projects/${project.id}`, {
            headers: headers(LEAD_ID, 'lead'),
        })
    ).json();
    assert.equal(view.project.raisedCents, 0);

    captureTip(tip.id);

    view = await (
        await app.request(`/v1/coalition/projects/${project.id}`, {
            headers: headers(LEAD_ID, 'lead'),
        })
    ).json();
    // Project nets the tip after the 3% platform fee.
    assert.ok(view.project.raisedCents > 0 && view.project.raisedCents <= 5000);
    assert.equal(view.project.supporterCount, 1);
    // The "Seeded" milestone (2000) is crossed; "Funded" (10000) is not.
    const seeded = view.project.milestones.find((m: { label: string }) => m.label === 'Seeded');
    const funded = view.project.milestones.find((m: { label: string }) => m.label === 'Funded');
    assert.ok(seeded.reachedAt);
    assert.equal(funded.reachedAt, undefined);
    assert.ok(view.progress > 0 && view.progress < 1);
    assert.equal(view.recentSupporters.length, 1);
    assert.equal(view.recentSupporters[0].supporterUserId, SUPPORTER_ID);

    const raisedAfterFirst = view.project.raisedCents;

    // Replaying capture must not double-count.
    captureTip(tip.id);
    view = await (
        await app.request(`/v1/coalition/projects/${project.id}`, {
            headers: headers(LEAD_ID, 'lead'),
        })
    ).json();
    assert.equal(view.project.raisedCents, raisedAfterFirst);
    assert.equal(view.project.supporterCount, 1);
});

test('coalition project support: only the lead can edit funding config', async () => {
    const created = await app.request('/v1/coalition/projects', {
        method: 'POST',
        headers: headers(LEAD_ID, 'lead'),
        body: JSON.stringify({ canopyId: CANOPY, title: 'Tool library', category: 'tool_library' }),
    });
    const { project } = (await created.json()) as { project: { id: string } };

    const forbidden = await app.request(`/v1/coalition/projects/${project.id}`, {
        method: 'PATCH',
        headers: headers(SUPPORTER_ID, 'supporter'),
        body: JSON.stringify({ fundingGoalCents: 50000, currency: 'USD' }),
    });
    assert.equal(forbidden.status, 403);

    const ok = await app.request(`/v1/coalition/projects/${project.id}`, {
        method: 'PATCH',
        headers: headers(LEAD_ID, 'lead'),
        body: JSON.stringify({ fundingGoalCents: 50000, currency: 'USD' }),
    });
    assert.equal(ok.status, 200);
    const { project: updated } = (await ok.json()) as {
        project: { fundingGoalCents: number };
    };
    assert.equal(updated.fundingGoalCents, 50000);
});

test('coalition project support: unknown project is 404', async () => {
    const res = await app.request('/v1/coalition/projects/proj_missing/support', {
        method: 'POST',
        headers: headers(SUPPORTER_ID, 'supporter'),
        body: JSON.stringify({ grossCents: 1000, currency: 'USD' }),
    });
    assert.equal(res.status, 404);
});

test('coalition project support: crossing a milestone posts exactly one feed item, never duplicated', async () => {
    // A project with a single low milestone so one contribution crosses it.
    const created = await app.request('/v1/coalition/projects', {
        method: 'POST',
        headers: headers(LEAD_ID, 'lead'),
        body: JSON.stringify({
            canopyId: CANOPY,
            title: 'Tool library expansion',
            category: 'tool_library',
            fundingGoalCents: 100000,
            currency: 'USD',
            milestones: [{ label: 'Kickoff', thresholdCents: 2000 }],
        }),
    });
    assert.equal(created.status, 201);
    const { project } = (await created.json()) as { project: { id: string } };

    // Only this project's milestone feed items (other tests seed their own).
    const milestoneItems = () =>
        db
            .listCoalitionFeedItems({ kind: 'milestone' })
            .filter((item) => item.projectId === project.id);

    assert.equal(milestoneItems().length, 0, 'no feed item before any milestone is crossed');

    // First contribution: captured, it crosses the 2000 milestone.
    const first = await app.request(`/v1/coalition/projects/${project.id}/support`, {
        method: 'POST',
        headers: headers(SUPPORTER_ID, 'supporter'),
        body: JSON.stringify({ grossCents: 5000, currency: 'USD' }),
    });
    const { tip: tip1 } = (await first.json()) as { tip: { id: string } };
    captureTip(tip1.id);

    const afterFirst = milestoneItems();
    assert.equal(afterFirst.length, 1, 'the crossed milestone yields one feed item');
    assert.equal(afterFirst[0].kind, 'milestone');
    assert.ok(afterFirst[0].milestoneId, 'the feed item is stamped with the milestone id');
    assert.equal(afterFirst[0].projectId, project.id);
    assert.match(afterFirst[0].title, /milestone/i);

    // A second contribution pushes further past the SAME milestone (no new one).
    const second = await app.request(`/v1/coalition/projects/${project.id}/support`, {
        method: 'POST',
        headers: headers(SUPPORTER_ID, 'supporter'),
        body: JSON.stringify({ grossCents: 3000, currency: 'USD' }),
    });
    const { tip: tip2 } = (await second.json()) as { tip: { id: string } };
    captureTip(tip2.id);

    assert.equal(
        milestoneItems().length,
        1,
        'contributing past an already-reached milestone does not duplicate the feed item'
    );
});
