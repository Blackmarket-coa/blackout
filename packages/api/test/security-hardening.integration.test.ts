import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.BLACKOUT_DB_MODE = 'memory';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { isBlockedHost } = await import('../src/services/outboundEventWebhooks');
const { db } = await import('../src/db/store');

function headersFor(userId: string, capabilities: string[]) {
    return {
        authorization: `Bearer ${signJwt(userId, userId, 600)}`,
        'content-type': 'application/json',
        'x-blackout-capabilities': capabilities.join(','),
    };
}

// ---------------------------------------------------------------------------
// SEC-1 — the request header may not self-grant admin.* / cross-domain wildcards
// ---------------------------------------------------------------------------

test('SEC-1: x-blackout-capabilities: admin.* does NOT grant a domain write', async () => {
    const res = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: headersFor('attacker-admin', ['admin.*']),
        body: JSON.stringify({ communityId: 'community-1', title: 'Should be denied' }),
    });
    assert.equal(res.status, 403, 'admin.* asserted via header must not confer governance.write');
});

test('SEC-1: a concrete per-domain header capability still works', async () => {
    const res = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: headersFor('legit-proposer', ['governance.write']),
        body: JSON.stringify({ communityId: 'community-1', title: 'Allowed' }),
    });
    assert.equal(res.status, 201);
});

// ---------------------------------------------------------------------------
// SEC-2 — governance identity is bound to the authenticated session
// ---------------------------------------------------------------------------

test('SEC-2: proposer is bound to the authenticated subject, not the body', async () => {
    const res = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: headersFor('real-proposer', ['governance.write']),
        body: JSON.stringify({
            communityId: 'community-1',
            proposerId: 'victim-impersonated',
            title: 'Identity binding',
        }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { proposerId: string };
    assert.equal(body.proposerId, 'real-proposer', 'body proposerId must be ignored');
});

test('SEC-2/3: votes are keyed to the subject; a second vote (any body userId) is rejected', async () => {
    const proposer = headersFor('vote-proposer', ['governance.write']);
    const created = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: proposer,
        body: JSON.stringify({ communityId: 'community-1', title: 'Vote binding' }),
    });
    const { id: voteId } = (await created.json()) as { id: string };

    const voter = headersFor('single-voter', ['governance.write']);
    const first = await app.request('/v1/governance/votes', {
        method: 'POST',
        headers: voter,
        body: JSON.stringify({ voteId, userId: 'spoofed-a', choice: 'yes' }),
    });
    assert.equal(first.status, 200);

    // Same authenticated voter, different spoofed body userId — still one ballot.
    const second = await app.request('/v1/governance/votes', {
        method: 'POST',
        headers: voter,
        body: JSON.stringify({ voteId, userId: 'spoofed-b', choice: 'no' }),
    });
    assert.equal(
        second.status,
        400,
        'the vote is keyed to the session subject, not the body userId'
    );
});

// ---------------------------------------------------------------------------
// A-1 / SEC-3 — proposal resolution is idempotent and closes the proposal
// ---------------------------------------------------------------------------

test('A-1: resolving a proposal is idempotent and closes it; late votes are rejected', async () => {
    const proposer = headersFor('resolve-proposer', ['governance.write', 'governance.read']);
    const created = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: proposer,
        body: JSON.stringify({ communityId: 'community-1', title: 'Resolve once' }),
    });
    const { id: voteId } = (await created.json()) as { id: string };

    await app.request('/v1/governance/votes', {
        method: 'POST',
        headers: headersFor('voter-1', ['governance.write']),
        body: JSON.stringify({ voteId, choice: 'yes' }),
    });

    const r1 = await app.request(`/v1/governance/proposals/${voteId}/resolve`, {
        method: 'POST',
        headers: proposer,
    });
    assert.equal(r1.status, 200);
    const res1 = (await r1.json()) as { resolvedAt: string; result: string | null };

    const r2 = await app.request(`/v1/governance/proposals/${voteId}/resolve`, {
        method: 'POST',
        headers: proposer,
    });
    assert.equal(r2.status, 200);
    const res2 = (await r2.json()) as { resolvedAt: string; result: string | null };
    assert.equal(res2.resolvedAt, res1.resolvedAt, 're-resolving must return the same resolution');

    const proposal = await app.request(`/v1/governance/proposals/${voteId}`, { headers: proposer });
    assert.equal(((await proposal.json()) as { status: string }).status, 'closed');

    const lateVote = await app.request('/v1/governance/votes', {
        method: 'POST',
        headers: headersFor('late-voter', ['governance.write']),
        body: JSON.stringify({ voteId, choice: 'no' }),
    });
    assert.equal(lateVote.status, 409, 'voting after resolution must be rejected');
});

// ---------------------------------------------------------------------------
// SEC-18 — outbound webhook SSRF host filter covers private/link-local space
// ---------------------------------------------------------------------------

test('SEC-18: isBlockedHost rejects private / link-local / metadata targets', () => {
    const blocked = [
        'localhost',
        'foo.internal',
        'bar.local',
        '127.0.0.1',
        '0.0.0.0',
        '10.1.2.3',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.1.1',
        '169.254.169.254', // cloud metadata
        '100.64.0.1', // CGNAT
        '::1',
        '[::1]',
        'fe80::1',
        'fd00::1234',
        '::ffff:10.0.0.1', // IPv4-mapped private
    ];
    for (const host of blocked) {
        assert.equal(isBlockedHost(host), true, `expected blocked: ${host}`);
    }

    const allowed = [
        '203.0.113.9',
        '8.8.8.8',
        'example.com',
        '172.32.0.1',
        '100.128.0.1',
        '2606:4700::1',
    ];
    for (const host of allowed) {
        assert.equal(isBlockedHost(host), false, `expected allowed: ${host}`);
    }
});

// ---------------------------------------------------------------------------
// FEED — process-wide domain event feeds read with a default session token
// ---------------------------------------------------------------------------

// What every signed-in account holds: the minted read scopes, no header.
const defaultToken = (userId: string) => ({
    authorization: `Bearer ${signJwt(userId, userId, 600)}`,
});

type DomainEventRow = { type: string; payload: Record<string, unknown> };

test('FEED-1: the governance feed shows a ballot only to the member who cast it', async () => {
    const stamp = Date.now();
    const voterId = `feed-voter-${stamp}`;
    const strangerId = `feed-stranger-${stamp}`;
    const created = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers: headersFor(`feed-proposer-${stamp}`, ['governance.write']),
        body: JSON.stringify({ communityId: `feed-community-${stamp}`, title: 'Ballot privacy' }),
    });
    assert.equal(created.status, 201);
    const { id: voteId } = (await created.json()) as { id: string };

    const cast = await app.request('/v1/governance/votes', {
        method: 'POST',
        headers: headersFor(voterId, ['governance.write']),
        body: JSON.stringify({ voteId, choice: 'no' }),
    });
    assert.equal(cast.status, 200);

    const strangerFeed = await app.request('/v1/governance/events', {
        headers: defaultToken(strangerId),
    });
    assert.equal(strangerFeed.status, 200);
    const strangerEvents = (await strangerFeed.json()) as DomainEventRow[];
    // The legacy mobile governance tab builds its proposal list from this feed.
    assert.ok(
        strangerEvents.some(
            (event) =>
                event.type === 'governance.proposal.created' && event.payload.proposalId === voteId
        ),
        'proposal events stay visible'
    );
    assert.ok(
        !strangerEvents.some(
            (event) => event.type === 'governance.vote.cast' && event.payload.voteId === voteId
        ),
        'another member must not see the ballot'
    );
    assert.ok(!JSON.stringify(strangerEvents).includes(voterId));

    // The proposal read returns counts only, so the feed was the one place a
    // choice was tied to a voter.
    const proposal = await app.request(`/v1/governance/proposals/${voteId}`, {
        headers: defaultToken(strangerId),
    });
    assert.equal(proposal.status, 200);
    assert.ok(!(await proposal.text()).includes(voterId));

    const voterFeed = await app.request('/v1/governance/events', {
        headers: defaultToken(voterId),
    });
    const voterEvents = (await voterFeed.json()) as DomainEventRow[];
    assert.ok(
        voterEvents.some(
            (event) =>
                event.type === 'governance.vote.cast' &&
                event.payload.voteId === voteId &&
                event.payload.userId === voterId &&
                event.payload.choice === 'no'
        ),
        'the voter still sees their own ballot'
    );
});

test('FEED-2: governance meeting events carry only what GET /meetings already returns', async () => {
    const stamp = Date.now();
    const meetingId = `feed-meeting-${stamp}`;
    const scheduled = await app.request(`/v1/governance/meetings/${meetingId}`, {
        method: 'PUT',
        headers: headersFor(`feed-convener-${stamp}`, ['governance.write']),
        body: JSON.stringify({
            meetingId,
            title: 'Open meeting',
            startsAt: '2026-11-01T18:00:00.000Z',
            endsAt: '2026-11-01T19:00:00.000Z',
            attendees: [{ id: `feed-attendee-${stamp}`, label: 'Attendee' }],
        }),
    });
    assert.equal(scheduled.status, 200);

    const stranger = defaultToken(`feed-stranger-${stamp}`);
    const feed = (await (
        await app.request('/v1/governance/events', { headers: stranger })
    ).json()) as DomainEventRow[];
    const event = feed.find(
        (row) => row.type === 'governance.meeting.scheduled' && row.payload.meetingId === meetingId
    );
    assert.ok(event, 'the meeting event is in the feed');

    const listed = await app.request('/v1/governance/meetings', { headers: stranger });
    assert.equal(listed.status, 200);
    const { items } = (await listed.json()) as { items: Record<string, unknown>[] };
    const meeting = items.find((item) => item.meetingId === meetingId);
    assert.deepEqual(event.payload, meeting, 'the feed adds nothing to the open meeting list');
});

test('FEED-3: the forum feed names no author; its post is readable by any account anyway', async () => {
    const stamp = Date.now();
    const authorId = `feed-author-${stamp}`;
    const communityId = `feed-forum-${stamp}`;
    const posted = await app.request('/v1/forum/posts', {
        method: 'POST',
        headers: headersFor(authorId, ['forum.write']),
        body: JSON.stringify({ communityId, title: 'Hello', body: 'First post' }),
    });
    assert.equal(posted.status, 201);
    const { id: postId } = (await posted.json()) as { id: string };

    const stranger = defaultToken(`feed-stranger-${stamp}`);
    const feed = await app.request('/v1/forum/events', { headers: stranger });
    assert.equal(feed.status, 200);
    const events = (await feed.json()) as DomainEventRow[];
    const event = events.find((row) => row.payload.postId === postId);
    assert.ok(event, 'the post event is in the feed');
    assert.deepEqual(Object.keys(event.payload).sort(), ['communityId', 'postId']);
    assert.ok(!JSON.stringify(events).includes(authorId));

    // The same token reads the whole post, author included, through /posts.
    const posts = await app.request(`/v1/forum/posts?communityId=${communityId}`, {
        headers: stranger,
    });
    assert.equal(posts.status, 200);
    const listed = (await posts.json()) as { id: string; authorId: string }[];
    assert.ok(listed.some((post) => post.id === postId && post.authorId === authorId));
});

test('FEED-4: the dead-drop feed carries drop ids only, never sender, recipient or payload', async () => {
    const stamp = Date.now();
    const senderId = `feed-sender-${stamp}`;
    const recipientId = `feed-recipient-${stamp}`;
    const strangerId = `feed-stranger-${stamp}`;
    const channelId = `feed-channel-${stamp}`;
    const sealed = `feed-ciphertext-${stamp}`;

    const dropped = await app.request('/v1/deaddrop', {
        method: 'POST',
        headers: headersFor(senderId, ['deaddrop.write']),
        body: JSON.stringify({ channelId, recipientId, payload: sealed }),
    });
    assert.equal(dropped.status, 201);
    const { id: dropId } = (await dropped.json()) as { id: string };

    const opened = await app.request('/v1/deaddrop/open', {
        method: 'POST',
        headers: headersFor(recipientId, ['deaddrop.write']),
        body: JSON.stringify({ deaddropId: dropId }),
    });
    assert.equal(opened.status, 200);

    const feed = await app.request('/v1/deaddrop/events', { headers: defaultToken(strangerId) });
    assert.equal(feed.status, 200);
    const events = (await feed.json()) as DomainEventRow[];
    const mine = events.filter((row) => row.payload.dropId === dropId);
    assert.deepEqual(
        mine.map((row) => row.type),
        ['deaddrop.created', 'deaddrop.opened']
    );
    for (const row of mine) assert.deepEqual(Object.keys(row.payload), ['dropId']);
    const text = JSON.stringify(events);
    for (const secret of [senderId, recipientId, channelId, sealed]) {
        assert.ok(!text.includes(secret), `the feed must not contain ${secret}`);
    }

    // Knowing the id from the feed does not let anyone else open the drop.
    const stolen = await app.request('/v1/deaddrop/open', {
        method: 'POST',
        headers: headersFor(strangerId, ['deaddrop.write']),
        body: JSON.stringify({ deaddropId: dropId }),
    });
    assert.equal(stolen.status, 404);
});

test('FEED-5: the moderation event log is admin-only, like the streaming-wide log', async () => {
    const stamp = Date.now();
    const targetId = `feed-target-${stamp}`;
    const creatorId = `feed-creator-${stamp}`;
    const streamId = `feed-stream-${stamp}`;
    const adminId = `feed-admin-${stamp}`;
    const previousAdmins = process.env.BLACKOUT_ADMIN_USERS;
    delete process.env.BLACKOUT_ADMIN_USERS;
    try {
        const taken = await app.request('/v1/moderation/actions', {
            method: 'POST',
            headers: headersFor(`feed-moderator-${stamp}`, ['moderation.write']),
            body: JSON.stringify({
                communityId: `feed-community-${stamp}`,
                targetId,
                action: 'ban',
                reason: 'feed check',
            }),
        });
        assert.equal(taken.status, 201);
        const { id: actionId } = (await taken.json()) as { id: string };

        // A creator updates their own stream's chat moderation, which the
        // stream's owner-only moderation read keeps private.
        const creator = { ...defaultToken(creatorId), 'content-type': 'application/json' };
        const provisioned = await app.request(`/v1/streaming/creators/${creatorId}/stream-key`, {
            method: 'POST',
            headers: creator,
            body: JSON.stringify({ streamId }),
        });
        assert.equal(provisioned.status, 201);
        const chat = await app.request(`/v1/streaming/streams/${streamId}/moderation`, {
            method: 'PUT',
            headers: creator,
            body: JSON.stringify({
                bannedUserIds: ['banned-a', 'banned-b'],
                keywordFilters: ['x'],
            }),
        });
        assert.equal(chat.status, 200);

        // Every default token holds moderation.read.
        const denied = await app.request('/v1/moderation/events', {
            headers: defaultToken(`feed-stranger-${stamp}`),
        });
        assert.equal(denied.status, 403);
        const deniedText = await denied.text();
        assert.ok(!deniedText.includes(targetId), 'a stranger must not learn who was moderated');
        assert.ok(!deniedText.includes(streamId), 'a stranger must not see stream chat settings');

        // An operator on the admin allowlist still reads the whole log.
        process.env.BLACKOUT_ADMIN_USERS = adminId;
        const allowed = await app.request('/v1/moderation/events', {
            headers: defaultToken(adminId),
        });
        assert.equal(allowed.status, 200);
        const events = (await allowed.json()) as DomainEventRow[];
        assert.ok(
            events.some(
                (event) =>
                    event.type === 'moderation.action.taken' &&
                    event.payload.actionId === actionId &&
                    event.payload.targetId === targetId
            )
        );
        assert.ok(
            events.some(
                (event) =>
                    event.type === 'moderation.stream.chat.updated' &&
                    event.payload.streamId === streamId &&
                    event.payload.bannedUserCount === 2
            )
        );
    } finally {
        if (previousAdmins === undefined) delete process.env.BLACKOUT_ADMIN_USERS;
        else process.env.BLACKOUT_ADMIN_USERS = previousAdmins;
    }
});

// ---------------------------------------------------------------------------
// C7 — a stream's goal progress is the revenue figure /revenue protects
// ---------------------------------------------------------------------------

test('C7: GET /streams/:id/goal is owner-only, like /revenue', async () => {
    const stamp = Date.now();
    const ownerId = `goal-owner-${stamp}`;
    const strangerId = `goal-stranger-${stamp}`;
    const streamId = `goal-stream-${stamp}`;

    const provisioned = await app.request(`/v1/streaming/creators/${ownerId}/stream-key`, {
        method: 'POST',
        headers: { ...defaultToken(ownerId), 'content-type': 'application/json' },
        body: JSON.stringify({ streamId }),
    });
    assert.equal(provisioned.status, 201);

    // One captured tip, so the figure a stranger could read is not zero.
    const now = new Date().toISOString();
    db.insertTip({
        id: `goal-tip-${stamp}`,
        senderUserId: strangerId,
        recipientUserId: ownerId,
        contextKind: 'stream',
        contextRef: streamId,
        grossCents: 2500,
        feeCents: 75,
        netCents: 2425,
        feeBps: 300,
        currency: 'USD',
        providerId: 'freeblackmarket',
        fbmOrderId: null,
        status: 'captured',
        note: null,
        giftSku: null,
        createdAt: now,
        capturedAt: now,
        refundedAt: null,
    });

    // The stranger's default token holds streaming.read and streaming.write.
    const denied = await app.request(`/v1/streaming/streams/${streamId}/goal?targetCents=1`, {
        headers: defaultToken(strangerId),
    });
    assert.equal(denied.status, 403);
    assert.equal(((await denied.json()) as Record<string, unknown>).achievedCents, undefined);

    const allowed = await app.request(`/v1/streaming/streams/${streamId}/goal?targetCents=1`, {
        headers: defaultToken(ownerId),
    });
    assert.equal(allowed.status, 200);
    const progress = (await allowed.json()) as {
        streamId: string;
        targetCents: number;
        achievedCents: number;
    };
    assert.equal(progress.streamId, streamId);
    assert.equal(progress.targetCents, 1);
    assert.equal(progress.achievedCents, 2500);
});
