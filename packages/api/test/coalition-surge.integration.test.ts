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
const { assessAndUpdateSurges } = await import('../src/services/coalitionSurge');

// A plain (non-room) canopy id keeps announceToCoalitionRoom from attempting a
// Matrix post, so the flow stays hermetic.
const CANOPY = 'canopy-surge-test';
const LEAD_ID = 'surge-lead-1';

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

async function createProject(goalCents: number, milestoneCents: number): Promise<string> {
    const res = await app.request('/v1/coalition/projects', {
        method: 'POST',
        headers: headers(LEAD_ID, 'lead'),
        body: JSON.stringify({
            canopyId: CANOPY,
            title: 'Surge greenhouse',
            category: 'community_garden',
            fundingGoalCents: goalCents,
            currency: 'USD',
            milestones: [{ label: 'Seeded', thresholdCents: milestoneCents }],
        }),
    });
    const { project } = (await res.json()) as { project: { id: string } };
    return project.id;
}

async function supportAndCapture(projectId: string, supporterId: string): Promise<void> {
    const res = await app.request(`/v1/coalition/projects/${projectId}/support`, {
        method: 'POST',
        headers: headers(supporterId, supporterId),
        body: JSON.stringify({ grossCents: 5000, currency: 'USD' }),
    });
    const { tip } = (await res.json()) as { tip: { id: string } };
    captureTip(tip.id);
}

test('milestone broadcast: crossing a milestone notifies every contributor exactly once', async () => {
    const projectId = await createProject(100000, 2000);
    await supportAndCapture(projectId, 'surge-supporter-a');

    // The supporter gets a milestone notification.
    const list = await (
        await app.request('/v1/coalition/notifications', {
            headers: headers('surge-supporter-a', 'surge-supporter-a'),
        })
    ).json();
    const milestoneNotes = list.notifications.filter(
        (n: { kind: string; projectId: string }) =>
            n.kind === 'milestone' && n.projectId === projectId
    );
    assert.equal(milestoneNotes.length, 1);

    // Re-capturing the same tip does not produce a second milestone notification.
    const tip = db
        .listCoalitionProjectSupports({ projectId })
        .find((s) => s.supporterUserId === 'surge-supporter-a');
    captureTip(tip!.tipId);
    const list2 = await (
        await app.request('/v1/coalition/notifications', {
            headers: headers('surge-supporter-a', 'surge-supporter-a'),
        })
    ).json();
    assert.equal(
        list2.notifications.filter(
            (n: { kind: string; projectId: string }) =>
                n.kind === 'milestone' && n.projectId === projectId
        ).length,
        1
    );
});

test('surge lifecycle: a spike opens a surge + notifies, then expires after its window', async () => {
    const projectId = await createProject(1000000, 2000);
    // Three distinct supporters within 24h, none before → strong acceleration.
    await supportAndCapture(projectId, 'surge-supporter-1');
    await supportAndCapture(projectId, 'surge-supporter-2');
    await supportAndCapture(projectId, 'surge-supporter-3');

    const now = Date.now();
    const opened = assessAndUpdateSurges(now);
    assert.ok(opened.opened >= 1);

    // The project view now carries an active surge.
    const view = await (
        await app.request(`/v1/coalition/projects/${projectId}`, {
            headers: headers(LEAD_ID, 'lead'),
        })
    ).json();
    assert.ok(view.activeSurge);
    assert.equal(view.activeSurge.status, 'open');

    // It appears on the open-surges rail.
    const surges = await (await app.request('/v1/coalition/surges')).json();
    assert.ok(surges.surges.some((s: { projectId: string }) => s.projectId === projectId));

    // A contributor was notified of the surge.
    const notes = await (
        await app.request('/v1/coalition/notifications?unreadOnly=true', {
            headers: headers('surge-supporter-1', 'surge-supporter-1'),
        })
    ).json();
    assert.ok(
        notes.notifications.some(
            (n: { kind: string; projectId: string }) =>
                n.kind === 'surge' && n.projectId === projectId
        )
    );

    // Re-running the sweep immediately opens nothing new (one open surge per project).
    assert.equal(assessAndUpdateSurges(now).opened, 0);

    // Past the window, the surge expires.
    const later = now + 48 * 60 * 60 * 1000;
    const swept = assessAndUpdateSurges(later);
    assert.ok(swept.expired >= 1);
    const afterView = await (
        await app.request(`/v1/coalition/projects/${projectId}`, {
            headers: headers(LEAD_ID, 'lead'),
        })
    ).json();
    assert.equal(afterView.activeSurge, null);
});

test('milestone video: lead can post a project-linked video; non-leads cannot', async () => {
    const projectId = await createProject(100000, 2000);
    await supportAndCapture(projectId, 'mv-supporter-1');
    const milestoneId = db.getCoalitionProject(projectId)!.milestones[0].id;

    const forbidden = await app.request('/v1/coalition/feed', {
        method: 'POST',
        headers: headers('mv-supporter-1', 'mv-supporter-1'),
        body: JSON.stringify({
            kind: 'video',
            title: 'sneaky update',
            projectId,
            milestoneId,
        }),
    });
    assert.equal(forbidden.status, 403);

    const ok = await app.request('/v1/coalition/feed', {
        method: 'POST',
        headers: headers(LEAD_ID, 'lead'),
        body: JSON.stringify({
            kind: 'video',
            title: 'We did it!',
            projectId,
            milestoneId,
            mediaUrl: 'mxc://media.example/win',
        }),
    });
    assert.equal(ok.status, 201);
    const { feedItem } = (await ok.json()) as {
        feedItem: { projectId: string; milestoneId: string };
    };
    assert.equal(feedItem.projectId, projectId);
    assert.equal(feedItem.milestoneId, milestoneId);

    // The contributor is notified that the milestone video is up.
    const notes = await (
        await app.request('/v1/coalition/notifications', {
            headers: headers('mv-supporter-1', 'mv-supporter-1'),
        })
    ).json();
    assert.ok(
        notes.notifications.some(
            (n: { kind: string; projectId: string }) =>
                n.kind === 'milestone_video' && n.projectId === projectId
        )
    );
});

test('notification read: marking read is scoped to the recipient', async () => {
    const projectId = await createProject(100000, 2000);
    await supportAndCapture(projectId, 'read-supporter-1');
    const list = await (
        await app.request('/v1/coalition/notifications', {
            headers: headers('read-supporter-1', 'read-supporter-1'),
        })
    ).json();
    const id = list.notifications[0].id;

    // A different user cannot mark it read.
    const wrong = await app.request(`/v1/coalition/notifications/${id}/read`, {
        method: 'POST',
        headers: headers('read-supporter-2', 'read-supporter-2'),
    });
    assert.equal(wrong.status, 404);

    const ok = await app.request(`/v1/coalition/notifications/${id}/read`, {
        method: 'POST',
        headers: headers('read-supporter-1', 'read-supporter-1'),
    });
    assert.equal(ok.status, 200);
    const { notification } = (await ok.json()) as { notification: { readAt?: string } };
    assert.ok(notification.readAt);
});
