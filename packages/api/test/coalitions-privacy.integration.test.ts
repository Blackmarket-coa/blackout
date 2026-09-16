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
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { upsertProfile, isPubliclyListed } = await import('../src/services/profileStore');

function auth(user: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(user, user, 600)}`,
        'content-type': 'application/json',
    };
}

function ensureUser(id: string): void {
    if (db.getUserById(id)) return;
    db.createUser({
        id,
        username: id,
        email: `${id}@example.test`,
        passwordHash: 'hash',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: `pk-${id}`,
    });
}

const LEAD = 'priv-lead';
const OPEN_MEMBER = 'priv-open';
const QUIET = 'priv-quiet';
const STRANGER = 'priv-stranger';
for (const id of [LEAD, OPEN_MEMBER, QUIET, STRANGER]) ensureUser(id);

/** Opt a member out of public listing, the way the settings switch does. */
function hide(userId: string): void {
    upsertProfile(userId, { profile: { hideFromPublicRosters: true } });
}

async function foundWithMembers(name: string) {
    const res = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name, mission: 'Be findable' }),
    });
    const text = await res.text();
    assert.equal(res.status, 201, text);
    const coalition = (JSON.parse(text) as { coalition: { id: string } }).coalition;
    for (const member of [OPEN_MEMBER, QUIET]) {
        const joined = await app.request(`/v1/coalitions/${coalition.id}/join`, {
            method: 'POST',
            headers: auth(member),
        });
        assert.equal(joined.status, 200, await joined.text());
    }
    return coalition;
}

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    db.resetMemberProfilesForTest?.();
});

test('a member is listed by default — the coalition is a growth surface', () => {
    assert.equal(isPubliclyListed('someone-who-never-opened-settings'), true);
});

test('an anonymous reader sees the coalition, but not the member who opted out', async () => {
    const coalition = await foundWithMembers('Findable');
    hide(QUIET);

    const res = await app.request(`/v1/coalitions/${coalition.id}`);
    assert.equal(res.status, 200, 'the coalition itself stays public');
    const view = (await res.json()) as {
        memberCount: number;
        hiddenMemberCount: number;
        members: Array<{ userId: string }>;
        stats: { memberCount: number };
    };

    const listed = view.members.map((m) => m.userId);
    assert.ok(listed.includes(LEAD));
    assert.ok(listed.includes(OPEN_MEMBER));
    assert.ok(!listed.includes(QUIET), 'the private member is withheld');

    // The count stays true and the gap is reported, rather than a roster that
    // silently disagrees with its own total.
    assert.equal(view.memberCount, 3);
    assert.equal(view.stats.memberCount, 3);
    assert.equal(view.hiddenMemberCount, 1);
});

test('fellow members still see the whole roster', async () => {
    const coalition = await foundWithMembers('Inside');
    hide(QUIET);

    const res = await app.request(`/v1/coalitions/${coalition.id}`, { headers: auth(OPEN_MEMBER) });
    const view = (await res.json()) as {
        members: Array<{ userId: string }>;
        hiddenMemberCount: number;
    };
    assert.ok(view.members.map((m) => m.userId).includes(QUIET));
    assert.equal(view.hiddenMemberCount, 0);
});

test('a private member’s coalitions are not enumerable, and the answer is not an oracle', async () => {
    const coalition = await foundWithMembers('Enumerable');
    hide(QUIET);

    const hidden = (await (await app.request(`/v1/coalitions/users/${QUIET}`)).json()) as {
        coalitions: unknown[];
    };
    // Empty, not 403 — indistinguishable from someone in no coalitions, so the
    // response cannot be used to detect that the flag is set.
    assert.deepEqual(hidden.coalitions, []);

    const open = (await (await app.request(`/v1/coalitions/users/${OPEN_MEMBER}`)).json()) as {
        coalitions: unknown[];
    };
    assert.equal(open.coalitions.length, 1);

    // The member always sees their own.
    const own = (await (
        await app.request(`/v1/coalitions/users/${QUIET}`, { headers: auth(QUIET) })
    ).json()) as { coalitions: unknown[] };
    assert.equal(own.coalitions.length, 1);

    // The ?memberId= filter is the same lookup by another door.
    const viaFilter = (await (await app.request(`/v1/coalitions?memberId=${QUIET}`)).json()) as {
        coalitions: unknown[];
    };
    assert.deepEqual(viaFilter.coalitions, []);
    assert.ok(coalition.id);
});

test('who raised a neighbour’s aid request is not public', async () => {
    const coalition = await foundWithMembers('Amplifier');
    const aidPostId = 'aid-post-1';
    db.upsertCoalitionAidPostByOrigin({
        id: aidPostId,
        customerId: STRANGER,
        type: 'request',
        category: 'transport',
        title: 'Need a ride to dialysis',
        description: 'Tuesdays and Thursdays',
        displayRadiusMeters: 1000,
        urgency: 'soon',
        status: 'open',
        source: 'test',
        externalId: aidPostId,
    } as never);

    const raised = await app.request(`/v1/coalitions/${coalition.id}/raise-aid`, {
        method: 'POST',
        headers: auth(OPEN_MEMBER),
        body: JSON.stringify({ aidPostId }),
    });
    assert.equal(raised.status, 201, await raised.text());

    const anon = (await (await app.request(`/v1/coalitions/${coalition.id}/amplified`)).json()) as {
        amplified: Array<{ campaign: { createdBy?: string } }>;
    };
    assert.equal(anon.amplified.length, 1);
    assert.equal(
        anon.amplified[0]!.campaign.createdBy,
        undefined,
        'a public reader cannot see who raised it'
    );

    const insider = (await (
        await app.request(`/v1/coalitions/${coalition.id}/amplified`, { headers: auth(LEAD) })
    ).json()) as { amplified: Array<{ campaign: { createdBy?: string } }> };
    assert.equal(insider.amplified[0]!.campaign.createdBy, OPEN_MEMBER);
});

test('campaign member ids are withheld from public readers but kept for the money path', async () => {
    const coalition = await foundWithMembers('Campaigns');
    const created = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ type: 'drive', title: 'Coats', goalCents: 5_000 }),
    });
    const campaign = ((await created.json()) as { campaign: { id: string } }).campaign;

    const anon = (await (await app.request(`/v1/coalitions/${coalition.id}`)).json()) as {
        campaigns: Array<{ createdBy?: string; approvedBy?: string }>;
    };
    assert.equal(anon.campaigns[0]!.createdBy, undefined);
    assert.equal(anon.campaigns[0]!.approvedBy, undefined);

    const insider = (await (
        await app.request(`/v1/coalitions/${coalition.id}`, { headers: auth(LEAD) })
    ).json()) as { campaigns: Array<{ createdBy?: string }> };
    assert.equal(insider.campaigns[0]!.createdBy, LEAD);

    // The record the money path reads is untouched — `createdBy` is the tip's
    // fallback beneficiary, so redacting it there would misroute funds.
    assert.equal(db.getCoalitionCampaign(campaign.id)?.createdBy, LEAD);
});

test('the coalition Space is never published to the federated room directory', async () => {
    const calls: Array<Record<string, unknown>> = [];
    __setCoalitionMatrixForTests({
        createRoom: async (input: Record<string, unknown>) => {
            calls.push(input);
            return { ok: true as const, status: 200, roomId: '!space:test' };
        },
        inviteToRoom: async () => ({ ok: true as const, status: 200 }),
        adminJoinUserToRoom: async () => ({ ok: true as const, status: 200 }),
        getStateEvent: async () => ({ ok: true as const, status: 200, content: {} }),
        sendStateEvent: async () => ({ ok: true as const, status: 200, eventId: '$e' }),
    } as never);

    await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name: 'Open Doors', mission: 'anyone may join', joinMode: 'open' }),
    });

    assert.equal(calls.length, 1);
    // An open coalition is open on the platform, not on federation: a public
    // join rule would let any homeserver's user join and keep the roster.
    assert.equal(calls[0]!.visibility, 'private');
    assert.equal(calls[0]!.preset, 'private_chat');
    const initial = calls[0]!.initialState as Array<{
        type: string;
        content: Record<string, string>;
    }>;
    const joinRules = initial.find((e) => e.type === 'm.room.join_rules');
    assert.equal(joinRules?.content.join_rule, 'invite');
});

// --- boosting is open, and publicizes ---------------------------------------

test('anyone signed in can boost, and the boost carries it into their feed', async () => {
    const coalition = await foundWithMembers('Amplify');
    const created = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ type: 'drive', title: 'Winter coats', goalCents: 5_000 }),
    });
    const campaign = ((await created.json()) as { campaign: { id: string } }).campaign;

    // STRANGER is not a member of this coalition.
    const boosted = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/boost`,
        { method: 'POST', headers: auth(STRANGER) }
    );
    assert.equal(boosted.status, 200, await boosted.text());

    // And it is now relayable from their Circle — the same edge the feed's own
    // Boost button mints, so many boosters collapse into one card.
    const edges = db.listRelayEdgesByRelayers([STRANGER]);
    const edge = edges.find((e) => e.subjectId === campaign.id);
    assert.ok(edge, 'boosting publicizes it');
    assert.equal(edge.subjectSource, 'coalition_campaign');
});

test('the daily boost budget is per person, not per coalition', async () => {
    const first = await foundWithMembers('Budget One');
    const second = await foundWithMembers('Budget Two');
    const campaignIn = async (coalitionId: string, title: string) => {
        const res = await app.request(`/v1/coalitions/${coalitionId}/campaigns`, {
            method: 'POST',
            headers: auth(LEAD),
            body: JSON.stringify({ type: 'drive', title }),
        });
        return ((await res.json()) as { campaign: { id: string } }).campaign.id;
    };
    const boost = (coalitionId: string, campaignId: string) =>
        app.request(`/v1/coalitions/${coalitionId}/campaigns/${campaignId}/boost`, {
            method: 'POST',
            headers: auth(STRANGER),
        });

    // Default allowance is 3. Spend it all in the first coalition...
    for (let i = 0; i < 3; i += 1) {
        const id = await campaignIn(first.id, `drive ${i}`);
        assert.equal((await boost(first.id, id)).status, 200);
    }
    // ...and the budget is gone in the second one too. Keyed per coalition it
    // would not bound an outsider at all.
    const elsewhere = await campaignIn(second.id, 'another');
    const refused = await boost(second.id, elsewhere);
    assert.equal(refused.status, 429, await refused.text());
});
