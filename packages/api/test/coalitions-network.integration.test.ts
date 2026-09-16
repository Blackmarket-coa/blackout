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
process.env.COALITION_BOOST_DAILY_ALLOWANCE = '2';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setTierResolverForTests } = await import('../src/services/coalitionTierGate');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const {
    COALITION_ROLE_PERMISSIONS,
    assignableRolesFor,
    coalitionRoleCan,
    computeBoostMeter,
    summarizeCoalitionImpact,
    tierSatisfies,
} = await import('@blackout/core');

function auth(user: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(user, user, 600)}`,
        'content-type': 'application/json',
    };
}

/** Users must exist for Matrix-id bridging on member listings. */
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

const FOUNDER = 'coa-founder';
const STEWARD = 'coa-steward';
const MEMBER = 'coa-member';
const OUTSIDER = 'coa-outsider';
for (const id of [FOUNDER, STEWARD, MEMBER, OUTSIDER]) ensureUser(id);

async function found(body: Record<string, unknown>, user = FOUNDER) {
    const res = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(user),
        body: JSON.stringify(body),
    });
    const text = await res.text();
    assert.equal(res.status, 201, text);
    return JSON.parse(text) as {
        coalition: { id: string; slug: string; joinMode: string; spaceRoomId?: string };
        membership: { role: string };
        space: { ok: boolean; detail?: string };
    };
}

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setTierResolverForTests(null);
    __setCoalitionMatrixForTests(null);
});

test('core: role permission matrix and assignable roles', () => {
    assert.ok(coalitionRoleCan('founder', 'coalition.archive'));
    assert.ok(coalitionRoleCan('steward', 'members.approve'));
    assert.ok(coalitionRoleCan('steward', 'campaigns.launch'));
    assert.ok(!coalitionRoleCan('steward', 'coalition.archive'));
    assert.ok(coalitionRoleCan('griot', 'campaigns.promote'));
    assert.ok(!coalitionRoleCan('griot', 'campaigns.launch'));
    assert.equal(COALITION_ROLE_PERMISSIONS.member.length, 0);
    assert.deepEqual([...assignableRolesFor('founder')], ['steward', 'griot', 'member']);
    assert.deepEqual([...assignableRolesFor('steward')], ['griot', 'member']);
    assert.deepEqual([...assignableRolesFor('member')], []);
    assert.ok(tierSatisfies('root', 'sprout'));
    assert.ok(!tierSatisfies('seedling', 'sprout'));
    assert.ok(tierSatisfies('seedling', undefined));
});

test('found a coalition: founder auto-membership, unique slug, no space without Matrix', async () => {
    const first = await found({ name: 'River Keepers', mission: 'Keep the river clean' });
    assert.equal(first.membership.role, 'founder');
    assert.equal(first.coalition.slug, 'river-keepers');
    assert.equal(first.coalition.joinMode, 'open');
    assert.equal(first.space.ok, false, 'matrix is not configured in tests');
    assert.equal(first.coalition.spaceRoomId, undefined);

    const second = await found({ name: 'River Keepers', mission: 'Another one' }, STEWARD);
    assert.equal(second.coalition.slug, 'river-keepers-2');

    const bySlug = await app.request('/v1/coalitions/river-keepers', { headers: auth(FOUNDER) });
    assert.equal(bySlug.status, 200);
    const view = (await bySlug.json()) as {
        memberCount: number;
        members: Array<{
            userId: string;
            role: string;
            username: string;
            matrixUserId: string | null;
        }>;
        viewer: { permissions: string[] };
        stats: { memberCount: number; fundsRaisedCents: number };
    };
    assert.equal(view.memberCount, 1);
    assert.equal(view.members[0].role, 'founder');
    assert.equal(view.members[0].username, FOUNDER);
    assert.ok(view.viewer.permissions.includes('coalition.archive'));
    assert.equal(view.stats.fundsRaisedCents, 0);
});

test('space mirror: a bot-created Space is recorded and members are admitted with power levels', async () => {
    const calls: string[] = [];
    const powerLevels: Record<string, number> = {};
    __setCoalitionMatrixForTests({
        createRoom: async (input) => {
            calls.push(
                `create:${(input.creationContent as { type: string }).type}:${input.encrypted}`
            );
            return { ok: true as const, status: 200, roomId: '!coalition:blackout' };
        },
        inviteToRoom: async (_room, mxid) => {
            calls.push(`invite:${mxid}`);
            return { ok: true as const, status: 200 };
        },
        adminJoinUserToRoom: async () => ({ ok: true as const, status: 200 }),
        kickFromRoom: async (_room, mxid) => {
            calls.push(`kick:${mxid}`);
            return { ok: true as const, status: 200 };
        },
        getStateEvent: async () => ({
            ok: true as const,
            status: 200,
            content: { users: { ...powerLevels } },
        }),
        sendStateEvent: async (_room, type, content) => {
            if (type === 'm.room.power_levels') {
                Object.assign(powerLevels, (content as { users: Record<string, number> }).users);
            }
            calls.push(`state:${type}`);
            return { ok: true as const, status: 200, eventId: '$e' };
        },
    } as never);

    const { coalition, space } = await found({ name: 'Mesh Builders', mission: 'Build mesh' });
    assert.equal(space.ok, true);
    assert.equal(coalition.spaceRoomId, '!coalition:blackout');
    assert.ok(
        calls.includes('create:m.space:false'),
        'space is created plaintext with type m.space'
    );
    assert.ok(
        calls.some((c) => c.startsWith(`invite:@${FOUNDER}:`)),
        'founder is invited'
    );

    const join = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(MEMBER),
    });
    assert.equal(join.status, 200);
    const memberMxid = Object.keys(powerLevels).find((k) => k.startsWith(`@${MEMBER}:`));
    assert.ok(memberMxid, 'member power level written');
    assert.equal(powerLevels[memberMxid as string], 0);

    const promote = await app.request(`/v1/coalitions/${coalition.id}/members/${MEMBER}`, {
        method: 'PATCH',
        headers: auth(FOUNDER),
        body: JSON.stringify({ role: 'steward' }),
    });
    assert.equal(promote.status, 200);
    assert.equal(powerLevels[memberMxid as string], 50, 'steward mirrors to PL 50');

    const leave = await app.request(`/v1/coalitions/${coalition.id}/leave`, {
        method: 'POST',
        headers: auth(MEMBER),
    });
    assert.equal(leave.status, 200);
    assert.ok(
        calls.some((c) => c.startsWith(`kick:@${MEMBER}:`)),
        'leaving kicks from the space'
    );
});

test('open join mode: join immediately, leave, founder cannot leave', async () => {
    const { coalition } = await found({ name: 'Open Garden', mission: 'Grow', joinMode: 'open' });
    const join = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(MEMBER),
    });
    assert.equal(join.status, 200);
    const { joined, membership } = (await join.json()) as {
        joined: boolean;
        membership: { role: string };
    };
    assert.equal(joined, true);
    assert.equal(membership.role, 'member');

    const again = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(MEMBER),
    });
    assert.equal(again.status, 409);

    const founderLeave = await app.request(`/v1/coalitions/${coalition.id}/leave`, {
        method: 'POST',
        headers: auth(FOUNDER),
    });
    assert.equal(founderLeave.status, 409);

    const leave = await app.request(`/v1/coalitions/${coalition.id}/leave`, {
        method: 'POST',
        headers: auth(MEMBER),
    });
    assert.equal(leave.status, 200);
    const view = (await (await app.request(`/v1/coalitions/${coalition.id}`)).json()) as {
        memberCount: number;
    };
    assert.equal(view.memberCount, 1);
});

test('approval join mode: request queue visible to stewards only; approve admits; decline does not', async () => {
    const { coalition } = await found({
        name: 'Vetted Crew',
        mission: 'Careful',
        joinMode: 'approval',
    });
    const request = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(MEMBER),
        body: JSON.stringify({ message: 'I bring compost' }),
    });
    assert.equal(request.status, 202);
    const { joined } = (await request.json()) as { joined: boolean };
    assert.equal(joined, false);

    const asOutsider = await app.request(`/v1/coalitions/${coalition.id}/requests`, {
        headers: auth(OUTSIDER),
    });
    assert.equal(asOutsider.status, 403);

    const queue = await app.request(`/v1/coalitions/${coalition.id}/requests`, {
        headers: auth(FOUNDER),
    });
    assert.equal(queue.status, 200);
    const { requests } = (await queue.json()) as {
        requests: Array<{ userId: string; message: string; user: { username: string } }>;
    };
    assert.equal(requests.length, 1);
    assert.equal(requests[0].message, 'I bring compost');
    assert.equal(requests[0].user.username, MEMBER);

    // A plain member cannot approve.
    const outsiderRequest = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(OUTSIDER),
    });
    assert.equal(outsiderRequest.status, 202);

    const approve = await app.request(`/v1/coalitions/${coalition.id}/requests/${MEMBER}/approve`, {
        method: 'POST',
        headers: auth(FOUNDER),
    });
    assert.equal(approve.status, 200);
    const memberApproves = await app.request(
        `/v1/coalitions/${coalition.id}/requests/${OUTSIDER}/approve`,
        {
            method: 'POST',
            headers: auth(MEMBER),
        }
    );
    assert.equal(memberApproves.status, 403);

    const decline = await app.request(
        `/v1/coalitions/${coalition.id}/requests/${OUTSIDER}/decline`,
        {
            method: 'POST',
            headers: auth(FOUNDER),
        }
    );
    assert.equal(decline.status, 200);

    const view = (await (
        await app.request(`/v1/coalitions/${coalition.id}`, { headers: auth(FOUNDER) })
    ).json()) as {
        memberCount: number;
        members: Array<{ userId: string }>;
    };
    assert.equal(view.memberCount, 2);
    assert.ok(!view.members.some((m) => m.userId === OUTSIDER));
});

test('changing join mode later never removes existing members', async () => {
    const { coalition } = await found({ name: 'Flexible', mission: 'Adapt', joinMode: 'open' });
    await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(MEMBER),
    });

    const outsiderEdit = await app.request(`/v1/coalitions/${coalition.id}`, {
        method: 'PATCH',
        headers: auth(OUTSIDER),
        body: JSON.stringify({ joinMode: 'approval' }),
    });
    assert.equal(outsiderEdit.status, 403);

    const edit = await app.request(`/v1/coalitions/${coalition.id}`, {
        method: 'PATCH',
        headers: auth(FOUNDER),
        body: JSON.stringify({ joinMode: 'approval', minTierToJoin: 'root' }),
    });
    assert.equal(edit.status, 200);

    const view = (await (await app.request(`/v1/coalitions/${coalition.id}`)).json()) as {
        coalition: { joinMode: string; minTierToJoin: string };
        memberCount: number;
    };
    assert.equal(view.coalition.joinMode, 'approval');
    assert.equal(view.coalition.minTierToJoin, 'root');
    assert.equal(view.memberCount, 2, 'existing member kept');

    // A joiner below the gate is queued for a steward, never refused. The gate
    // resolves a tier from FBM and answers 'seedling' for anyone it cannot
    // place — every non-vendor, and everyone when the integration is
    // unconfigured — so a hard refusal on that answer locked the coalition to
    // nobody. A steward can see what a tier lookup cannot.
    __setTierResolverForTests(async () => 'seedling');
    const gated = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(OUTSIDER),
    });
    assert.equal(gated.status, 202, 'queued for review rather than rejected');

    const queue = (await (
        await app.request(`/v1/coalitions/${coalition.id}/requests`, { headers: auth(FOUNDER) })
    ).json()) as { requests: Array<{ userId: string }> };
    assert.ok(
        queue.requests.some((row) => row.userId === OUTSIDER),
        'a human still gets to decide'
    );

    __setTierResolverForTests(async () => 'canopy');
    const allowed = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(OUTSIDER),
    });
    assert.equal(allowed.status, 202, 'passes the gate, waits for approval');
});

test('invites: a steward invites, the invitee accepts by joining even in approval mode', async () => {
    const { coalition } = await found({ name: 'Invited Only', mission: 'x', joinMode: 'approval' });
    const memberInvite = await app.request(`/v1/coalitions/${coalition.id}/invites`, {
        method: 'POST',
        headers: auth(OUTSIDER),
        body: JSON.stringify({ userId: MEMBER }),
    });
    assert.equal(memberInvite.status, 403);

    const invite = await app.request(`/v1/coalitions/${coalition.id}/invites`, {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({ userId: MEMBER }),
    });
    assert.equal(invite.status, 201);

    const inbox = await app.request('/v1/coalitions/invites/mine', { headers: auth(MEMBER) });
    const { invites } = (await inbox.json()) as { invites: Array<{ coalition: { id: string } }> };
    assert.equal(invites.length, 1);
    assert.equal(invites[0].coalition.id, coalition.id);

    const accept = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(MEMBER),
    });
    assert.equal(accept.status, 200);
    assert.equal(((await accept.json()) as { joined: boolean }).joined, true);
});

test('roles are enforced server-side: rank rules, founder transfer, removal', async () => {
    const { coalition } = await found({ name: 'Ranks', mission: 'x' });
    for (const user of [STEWARD, MEMBER, OUTSIDER]) {
        await app.request(`/v1/coalitions/${coalition.id}/join`, {
            method: 'POST',
            headers: auth(user),
        });
    }
    const setRole = (actor: string, target: string, role: string) =>
        app.request(`/v1/coalitions/${coalition.id}/members/${target}`, {
            method: 'PATCH',
            headers: auth(actor),
            body: JSON.stringify({ role }),
        });

    assert.equal(
        (await setRole(MEMBER, STEWARD, 'steward')).status,
        403,
        'members cannot assign roles'
    );
    assert.equal((await setRole(FOUNDER, STEWARD, 'steward')).status, 200);
    assert.equal((await setRole(STEWARD, MEMBER, 'griot')).status, 200, 'steward may assign griot');
    assert.equal(
        (await setRole(STEWARD, OUTSIDER, 'steward')).status,
        400,
        'steward cannot mint stewards'
    );
    assert.equal(
        (await setRole(STEWARD, FOUNDER, 'member')).status,
        400,
        'founder role is not assignable'
    );
    assert.equal(
        (await setRole(FOUNDER, MEMBER, 'founder')).status,
        400,
        'founder is transferred, not assigned'
    );

    const stewardRemovesSteward = await app.request(
        `/v1/coalitions/${coalition.id}/members/${FOUNDER}`,
        {
            method: 'DELETE',
            headers: auth(STEWARD),
        }
    );
    assert.equal(
        stewardRemovesSteward.status,
        403,
        'cannot remove someone of equal or higher rank'
    );
    const stewardRemovesMember = await app.request(
        `/v1/coalitions/${coalition.id}/members/${OUTSIDER}`,
        {
            method: 'DELETE',
            headers: auth(STEWARD),
        }
    );
    assert.equal(stewardRemovesMember.status, 200);

    const badTransfer = await app.request(`/v1/coalitions/${coalition.id}/transfer`, {
        method: 'POST',
        headers: auth(STEWARD),
        body: JSON.stringify({ userId: MEMBER }),
    });
    assert.equal(badTransfer.status, 403);
    const transfer = await app.request(`/v1/coalitions/${coalition.id}/transfer`, {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({ userId: STEWARD }),
    });
    assert.equal(transfer.status, 200);
    const view = (await (await app.request(`/v1/coalitions/${coalition.id}`)).json()) as {
        members: Array<{ userId: string; role: string }>;
    };
    assert.equal(view.members.find((m) => m.userId === STEWARD)?.role, 'founder');
    assert.equal(view.members.find((m) => m.userId === FOUNDER)?.role, 'steward');

    const archiveAsSteward = await app.request(`/v1/coalitions/${coalition.id}/archive`, {
        method: 'POST',
        headers: auth(FOUNDER),
    });
    assert.equal(archiveAsSteward.status, 403, 'the previous founder is now a steward');
});

test("profile surface: a user's coalitions with their role, by Blackout id or Matrix id", async () => {
    const a = await found({ name: 'Alpha', mission: 'a' });
    const b = await found({ name: 'Beta', mission: 'b' }, STEWARD);
    await app.request(`/v1/coalitions/${b.coalition.id}/join`, {
        method: 'POST',
        headers: auth(FOUNDER),
    });

    const byId = await app.request(`/v1/coalitions/users/${FOUNDER}`);
    const { coalitions } = (await byId.json()) as {
        coalitions: Array<{ coalition: { id: string }; role: string }>;
    };
    assert.equal(coalitions.length, 2);
    assert.equal(coalitions.find((c) => c.coalition.id === a.coalition.id)?.role, 'founder');
    assert.equal(coalitions.find((c) => c.coalition.id === b.coalition.id)?.role, 'member');

    const byMxid = await app.request(
        `/v1/coalitions/users/${encodeURIComponent(`@${FOUNDER}:blackout.local`)}`
    );
    assert.equal(byMxid.status, 200);
    assert.equal(((await byMxid.json()) as { coalitions: unknown[] }).coalitions.length, 2);

    const mine = await app.request('/v1/coalitions?mine=1', { headers: auth(STEWARD) });
    assert.equal(((await mine.json()) as { coalitions: unknown[] }).coalitions.length, 1);
});

test('campaigns: members propose (pending), stewards launch, approval, transitions, visibility', async () => {
    const { coalition } = await found({ name: 'Drive Makers', mission: 'x' });
    await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(MEMBER),
    });

    const proposal = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(MEMBER),
        body: JSON.stringify({ type: 'drive', title: 'Winter coats', goalCents: 50000 }),
    });
    assert.equal(proposal.status, 201);
    const proposed = (
        (await proposal.json()) as {
            campaign: { id: string; status: string; requiresStewardApproval: boolean };
        }
    ).campaign;
    assert.equal(proposed.status, 'pending_approval');
    assert.equal(proposed.requiresStewardApproval, true);

    // Outsiders do not see pending campaigns.
    const publicList = (await (
        await app.request(`/v1/coalitions/${coalition.id}/campaigns`)
    ).json()) as {
        campaigns: unknown[];
    };
    assert.equal(publicList.campaigns.length, 0);

    const memberApprove = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${proposed.id}/approve`,
        { method: 'POST', headers: auth(MEMBER) }
    );
    assert.equal(memberApprove.status, 403);
    const approve = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${proposed.id}/approve`,
        {
            method: 'POST',
            headers: auth(FOUNDER),
        }
    );
    assert.equal(approve.status, 200);

    const launched = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({
            type: 'project',
            title: 'Collab stream',
            description: 'joint drop',
        }),
    });
    const live = ((await launched.json()) as { campaign: { id: string; status: string } }).campaign;
    assert.equal(live.status, 'active', 'stewards launch straight to active');

    const bad = await app.request(`/v1/coalitions/${coalition.id}/campaigns/${live.id}/status`, {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({ status: 'draft' }),
    });
    assert.equal(bad.status, 409, 'active → draft is not a legal transition');
    const done = await app.request(`/v1/coalitions/${coalition.id}/campaigns/${live.id}/status`, {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({ status: 'completed' }),
    });
    assert.equal(done.status, 200);

    const visible = (await (
        await app.request(`/v1/coalitions/${coalition.id}/campaigns`)
    ).json()) as {
        campaigns: Array<{ id: string; boost: { total: number } }>;
    };
    assert.equal(visible.campaigns.length, 2);
    assert.equal(visible.campaigns[0].boost.total, 0);
});

test('boost meter: separate pool, one per member per campaign per day, daily allowance', async () => {
    const { coalition } = await found({ name: 'Boosters', mission: 'x' });
    await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(MEMBER),
    });
    const mk = async (title: string) =>
        (
            (await (
                await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
                    method: 'POST',
                    headers: auth(FOUNDER),
                    body: JSON.stringify({ type: 'boost', title }),
                })
            ).json()) as { campaign: { id: string } }
        ).campaign.id;
    const c1 = await mk('One');
    const c2 = await mk('Two');
    const c3 = await mk('Three');
    const boost = (user: string, id: string) =>
        app.request(`/v1/coalitions/${coalition.id}/campaigns/${id}/boost`, {
            method: 'POST',
            headers: auth(user),
        });

    assert.equal((await boost(OUTSIDER, c1)).status, 403, 'non-members cannot boost');
    const first = await boost(MEMBER, c1);
    assert.equal(first.status, 200);
    const firstBody = (await first.json()) as {
        meter: { total: number; members: number };
        remainingToday: number;
    };
    assert.equal(firstBody.meter.total, 1);
    assert.equal(firstBody.remainingToday, 1);
    assert.equal((await boost(MEMBER, c1)).status, 409, 'same campaign, same day');
    assert.equal((await boost(MEMBER, c2)).status, 200);
    assert.equal((await boost(MEMBER, c3)).status, 429, 'allowance (2/day) exhausted');
    assert.equal((await boost(FOUNDER, c1)).status, 200);

    const detail = (await (
        await app.request(`/v1/coalitions/${coalition.id}/campaigns/${c1}`)
    ).json()) as {
        boost: { total: number; members: number; visibilityMultiplier: number };
    };
    assert.equal(detail.boost.total, 2);
    assert.equal(detail.boost.members, 2);
    assert.ok(detail.boost.visibilityMultiplier > 1, 'a boosted campaign is lifted');
});

test('core: boost meter and impact math', () => {
    const now = '2026-09-14T12:00:00.000Z';
    const meter = computeBoostMeter(
        [
            { userId: 'a', day: '2026-09-14' },
            { userId: 'b', day: '2026-09-14' },
            { userId: 'a', day: '2026-09-13' },
        ],
        now
    );
    assert.equal(meter.total, 3);
    assert.equal(meter.members, 2);
    assert.equal(meter.last24h, 2);
    assert.equal(meter.prev24h, 1);
    assert.ok(meter.surgeFactor > 0.5);

    const stats = summarizeCoalitionImpact(
        [
            { type: 'drive', status: 'completed', raisedCents: 1000 },
            { type: 'drive', status: 'active', raisedCents: 250 },
            { type: 'project', status: 'completed', raisedCents: 0 },
        ],
        4
    );
    assert.deepEqual(stats, {
        fundsRaisedCents: 1250,
        drivesCompleted: 1,
        activeCampaigns: 1,
        memberCount: 4,
    });
});

test('archived coalitions refuse joins and edits', async () => {
    const { coalition } = await found({ name: 'Old Guard', mission: 'x' });
    const archive = await app.request(`/v1/coalitions/${coalition.id}/archive`, {
        method: 'POST',
        headers: auth(FOUNDER),
    });
    assert.equal(archive.status, 200);
    const join = await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(MEMBER),
    });
    assert.equal(join.status, 410);
    const list = (await (await app.request('/v1/coalitions')).json()) as { coalitions: unknown[] };
    assert.equal(list.coalitions.length, 0, 'archived coalitions leave the directory');
});
