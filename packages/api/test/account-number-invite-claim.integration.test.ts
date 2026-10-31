/**
 * Account-number sign-up spends an invitation's use when it mints the Matrix
 * account, before any Blackout account exists; the account's first
 * `POST /v1/invitations/redeem` then claims that admission instead of spending
 * a second use. Without the claim, the redeem the web client makes after
 * sign-in spent the invitation again: a single-use one failed as `exhausted`
 * for the person it had just admitted, the inviter saw no redemption and got
 * no follower, and a multi-use one was counted twice (D3 in
 * docs/security/api-findings-triage-2026-10-25.md).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';
// The account-number path creates the Blackout row on the first exchange,
// which needs this assertion about the homeserver (see auth.ts).
process.env.BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS = '1';
delete process.env.REQUIRE_INVITE_TOKEN;
delete process.env.BLACKOUT_SESSION_LENGTHS;

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');
const { matrixClient } = await import('../src/integrations/matrix-client');
const { signJwt } = await import('../src/services/auth');
const { isFollowing } = await import('../src/services/follows');
const { redeemInvitationForMatrixUser } = await import('../src/services/invitations');
const { confirmAccountDeletion, requestAccountDeletion } = await import(
    '../src/services/accountLifecycle'
);
const { accountNumberToLocalpart, normalizeAccountNumber } = await import('@blackout/core');

const ROOM = '!den:test.local';
const CANOPY = '!canopy:test.local';
const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');

// Synapse doubles. Every join is recorded so a test can tell whether a redeem
// admitted anyone; the canopy lookup can be held open so two redeems overlap.
type AnyFn = (...args: unknown[]) => unknown;
const synapse = matrixClient as unknown as Record<string, AnyFn>;
const joins: Array<[string, string]> = [];
let lookupDelayMs = 0;
let lookupsInFlight = 0;
let maxLookupsInFlight = 0;
let whoamiUserId = '';
synapse.registerUser = async () => ({ ok: true as const, status: 201 });
synapse.whoami = async () => ({
    ok: true as const,
    status: 200,
    userId: whoamiUserId,
    deviceId: 'DEVICE',
});
synapse.getRoomParentSpace = async () => {
    lookupsInFlight += 1;
    maxLookupsInFlight = Math.max(maxLookupsInFlight, lookupsInFlight);
    try {
        if (lookupDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, lookupDelayMs));
        return { ok: true as const, canopyId: CANOPY };
    } finally {
        lookupsInFlight -= 1;
    }
};
synapse.adminJoinUserToRoom = async (roomId: unknown, userId: unknown) => {
    joins.push([String(roomId), String(userId)]);
    return { ok: true as const };
};
synapse.inviteToRoom = async () => ({ ok: true as const });

const withGate = async (run: () => Promise<void>) => {
    process.env.REQUIRE_INVITE_TOKEN = '1';
    try {
        await run();
    } finally {
        delete process.env.REQUIRE_INVITE_TOKEN;
    }
};

const inviterId = randomUUID();
const inviter = db.createUser({
    id: inviterId,
    username: `inviter-${inviterId.slice(0, 8)}`,
    email: `inviter-${inviterId.slice(0, 8)}@example.com`,
    passwordHash: 'unused',
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
});

const mintInvite = (maxUses: number, matrixRoomId?: string) => {
    const token = `inv-${randomUUID()}`;
    const record = db.createInvitationToken({
        id: randomUUID(),
        createdBy: inviter.id,
        tokenHash: sha256(token),
        maxUses,
        matrixRoomId,
    });
    return { token, record };
};

const signUp = (inviteToken?: string) =>
    app.request('/v1/auth/account-number', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(inviteToken ? { inviteToken } : {}),
    });

interface Account {
    userId: string;
    matrixUserId: string;
    jwt: string;
    signUp: { accountNumber: string; invite?: { ok: boolean; matrixInvite?: { ok: boolean } } };
}

/** The first sign-in: trade the Matrix session for a Blackout one, creating the account. */
const exchange = async (matrixUserId: string) => {
    whoamiUserId = matrixUserId;
    const res = await app.request('/v1/auth/matrix/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-matrix-access-token': 'mx_session' },
        body: '{}',
    });
    assert.equal(res.status, 200);
    return (await res.json()) as { token: string; userId: string };
};

/** Account-number sign-up (with the invitation when given), then the first sign-in. */
const newAccount = async (inviteToken?: string): Promise<Account> => {
    const res = await signUp(inviteToken);
    assert.equal(res.status, 201);
    const body = (await res.json()) as Account['signUp'];
    const localpart = await accountNumberToLocalpart(normalizeAccountNumber(body.accountNumber));
    const matrixUserId = `@${localpart}:test.local`;
    const session = await exchange(matrixUserId);
    return { userId: session.userId, matrixUserId, jwt: session.token, signUp: body };
};

const redeem = (jwt: string, token: string) =>
    app.request('/v1/invitations/redeem', {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
    });

type RedeemBody = {
    ok: boolean;
    reason?: string;
    matrixRoomId?: string;
    canopyId?: string;
    matrixInvite?: { ok: boolean };
};

const useCountOf = (id: string) => db.getInvitationTokenById(id)!.useCount;
const redeemersOf = (id: string) =>
    db.listInvitationRedemptionsByToken(id).map((r) => r.redeemedByUserId);
const admissionOf = (tokenId: string, matrixUserId: string) =>
    db.findInvitationAdmission(tokenId, matrixUserId);

test('with the gate on, account-number sign-up without a token is still refused and records nothing', async () => {
    const admissionsBefore = db.invitationAdmissions.size;
    await withGate(async () => {
        const res = await signUp();
        assert.equal(res.status, 403);
        assert.equal(((await res.json()) as { code: string }).code, 'invite_required');
    });
    assert.equal(db.invitationAdmissions.size, admissionsBefore);
});

test('a single-use invitation: sign-up spends the use, the first redeem claims it; one use, one redemption, the follow, ok from both', async () => {
    const { token, record } = mintInvite(1, ROOM);
    await withGate(async () => {
        joins.length = 0;
        const account = await newAccount(token);
        assert.deepEqual(account.signUp.invite, { ok: true, matrixInvite: { ok: true } });
        assert.deepEqual(joins, [
            [CANOPY, account.matrixUserId],
            [ROOM, account.matrixUserId],
        ]);
        assert.equal(useCountOf(record.id), 1);
        const admission = admissionOf(record.id, account.matrixUserId);
        assert.ok(admission, 'the sign-up recorded its use against the new Matrix id');
        assert.equal(admission.claimedByUserId, undefined);
        assert.equal(admission.matrixInviteOk, true);
        assert.deepEqual(redeemersOf(record.id), []);

        const res = await redeem(account.jwt, token);
        assert.equal(res.status, 200);
        assert.deepEqual((await res.json()) as RedeemBody, {
            ok: true,
            matrixRoomId: ROOM,
            matrixInvite: { ok: true },
            canopyId: CANOPY,
        });
        assert.equal(useCountOf(record.id), 1, 'no second use');
        assert.deepEqual(redeemersOf(record.id), [account.userId]);
        assert.equal(db.listInvitationRedemptionsByToken(record.id)[0]?.matrixInviteOk, true);
        assert.equal(isFollowing(account.userId, inviter.id), true);
        assert.equal(admissionOf(record.id, account.matrixUserId)?.claimedByUserId, account.userId);
        assert.equal(joins.length, 2, 'the claim admitted nobody again');

        // A repeat (a second tab, a retry) is answered the same and spends nothing.
        const again = await redeem(account.jwt, token);
        assert.equal(again.status, 200);
        assert.equal(((await again.json()) as RedeemBody).ok, true);
        assert.equal(useCountOf(record.id), 1);
        assert.deepEqual(redeemersOf(record.id), [account.userId]);
    });
});

test('a multi-use invitation is counted once per account', async () => {
    const { token, record } = mintInvite(3);
    await withGate(async () => {
        const first = await newAccount(token);
        const second = await newAccount(token);
        assert.equal(useCountOf(record.id), 2);
        for (const account of [first, second]) {
            const res = await redeem(account.jwt, token);
            assert.equal(res.status, 200);
            assert.equal(((await res.json()) as RedeemBody).ok, true);
        }
        assert.equal(useCountOf(record.id), 2);
        assert.deepEqual(redeemersOf(record.id).sort(), [first.userId, second.userId].sort());
        assert.equal(isFollowing(first.userId, inviter.id), true);
        assert.equal(isFollowing(second.userId, inviter.id), true);
    });
});

test('two concurrent redeems from one account make one claim and spend nothing', async () => {
    // Uses to spare: a redeem that fell through to a normal one would spend one.
    const { token, record } = mintInvite(3, ROOM);
    const account = await newAccount(token);
    assert.equal(useCountOf(record.id), 1);

    lookupDelayMs = 25;
    maxLookupsInFlight = 0;
    let results: Response[];
    try {
        results = await Promise.all([redeem(account.jwt, token), redeem(account.jwt, token)]);
    } finally {
        lookupDelayMs = 0;
    }
    assert.equal(maxLookupsInFlight, 2, 'both redeems were in flight at once');
    for (const res of results) {
        assert.equal(res.status, 200);
        const body = (await res.json()) as RedeemBody;
        assert.equal(body.ok, true);
        assert.equal(body.canopyId, CANOPY);
    }
    assert.equal(useCountOf(record.id), 1);
    assert.deepEqual(redeemersOf(record.id), [account.userId]);
});

test("another account cannot claim someone else's admission; its redeem is a normal one", async () => {
    const { token, record } = mintInvite(3);
    const admitted = await newAccount(token);
    // Signed up without the invitation, so it holds no admission for it.
    const other = await newAccount();
    assert.equal(useCountOf(record.id), 1);

    const res = await redeem(other.jwt, token);
    assert.equal(res.status, 200);
    assert.equal(useCountOf(record.id), 2, 'the other account spent a use of its own');
    assert.deepEqual(redeemersOf(record.id), [other.userId]);
    assert.equal(admissionOf(record.id, admitted.matrixUserId)?.claimedByUserId, undefined);

    const own = await redeem(admitted.jwt, token);
    assert.equal(own.status, 200);
    assert.equal(useCountOf(record.id), 2);
    assert.equal(admissionOf(record.id, admitted.matrixUserId)?.claimedByUserId, admitted.userId);
});

test('an admission for a Matrix id on another homeserver is never claimed by the local account of that name', async () => {
    const { token, record } = mintInvite(2);
    const localpart = `b${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const foreign = `@${localpart}:elsewhere.example`;
    assert.equal((await redeemInvitationForMatrixUser(token, foreign)).kind, 'ok');
    assert.equal(useCountOf(record.id), 1);

    const local = await exchange(`@${localpart}:test.local`);
    const res = await redeem(local.token, token);
    assert.equal(res.status, 200);
    assert.equal(useCountOf(record.id), 2, 'a normal redeem, not a claim');
    assert.deepEqual(redeemersOf(record.id), [local.userId]);
    assert.equal(admissionOf(record.id, foreign)?.claimedByUserId, undefined);
});

test('the inviter cannot claim an admission on their own invitation', async () => {
    const { token, record } = mintInvite(2);
    const own = `@${inviter.username}:test.local`;
    assert.equal((await redeemInvitationForMatrixUser(token, own)).kind, 'ok');

    const res = await redeem(signJwt(inviter.id, inviter.username, 600), token);
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as RedeemBody).reason, 'self_redeem');
    assert.equal(useCountOf(record.id), 1, 'the use spent at sign-up stays spent');
    assert.deepEqual(redeemersOf(record.id), []);
    assert.equal(admissionOf(record.id, own)?.claimedByUserId, undefined);
    assert.equal(isFollowing(inviter.id, inviter.id), false);
});

test('a claim completes a use spent before the invitation was revoked; a new redeem is still refused', async () => {
    const { token, record } = mintInvite(2);
    const admitted = await newAccount(token);
    db.revokeInvitationToken(record.id, 'revoked_by_creator');

    const res = await redeem(admitted.jwt, token);
    assert.equal(res.status, 200);
    assert.deepEqual(redeemersOf(record.id), [admitted.userId]);

    const other = await newAccount();
    const refused = await redeem(other.jwt, token);
    assert.equal(refused.status, 410);
    assert.equal(((await refused.json()) as RedeemBody).reason, 'revoked');
    assert.equal(useCountOf(record.id), 1);
});

test('deleting the account removes its admission, claimed or not; the redemption row stays', async () => {
    const { token, record } = mintInvite(3);
    const claimed = await newAccount(token);
    assert.equal((await redeem(claimed.jwt, token)).status, 200);
    // Signed in, but the redeem never ran (the tab that held the token closed).
    const unclaimed = await newAccount(token);

    for (const account of [claimed, unclaimed]) {
        assert.ok(admissionOf(record.id, account.matrixUserId));
        const issued = requestAccountDeletion({ userId: account.userId });
        assert.ok(issued);
        assert.equal(confirmAccountDeletion(issued.token, account.userId).kind, 'ok');
        assert.equal(admissionOf(record.id, account.matrixUserId), undefined);
    }
    assert.deepEqual(redeemersOf(record.id), [claimed.userId]);
    assert.equal(useCountOf(record.id), 2);
});
