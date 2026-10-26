/**
 * `POST /v1/auth/account-number` honours the invite gate. Until 2026-10-25 it
 * minted a Matrix account with no invite check while `/register` refused
 * without a token under `REQUIRE_INVITE_TOKEN=1`, so the invite-only setting
 * applied to every sign-up but this one (D3 in
 * docs/black-mask-account-link-design.md §7;
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
delete process.env.REQUIRE_INVITE_TOKEN;

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');
const { matrixClient } = await import('../src/integrations/matrix-client');
const { accountNumberToLocalpart, normalizeAccountNumber } = await import('@blackout/core');

type AnyFn = (...args: unknown[]) => unknown;
const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');

async function withMatrix(overrides: Record<string, AnyFn>, run: () => Promise<void>) {
    const client = matrixClient as unknown as Record<string, AnyFn>;
    const originals: Record<string, AnyFn> = {};
    for (const [k, v] of Object.entries(overrides)) {
        originals[k] = client[k];
        client[k] = v;
    }
    try {
        await run();
    } finally {
        for (const [k, v] of Object.entries(originals)) client[k] = v;
    }
}

const withGate = async (run: () => Promise<void>) => {
    process.env.REQUIRE_INVITE_TOKEN = '1';
    try {
        await run();
    } finally {
        delete process.env.REQUIRE_INVITE_TOKEN;
    }
};

const inviterId = randomUUID();
db.createUser({
    id: inviterId,
    username: `inviter-${inviterId.slice(0, 8)}`,
    email: 'inviter@example.com',
    passwordHash: 'unused',
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
});

const mintInvite = (
    overrides: Partial<{
        maxUses: number;
        useCount: number;
        matrixRoomId: string;
        expiresAt: string;
        revokedAt: string;
    }> = {}
) => {
    const token = `inv-${randomUUID()}`;
    const record = db.createInvitationToken({
        id: randomUUID(),
        createdBy: inviterId,
        tokenHash: sha256(token),
        maxUses: overrides.maxUses ?? 1,
        useCount: overrides.useCount,
        matrixRoomId: overrides.matrixRoomId,
        expiresAt: overrides.expiresAt,
        revokedAt: overrides.revokedAt,
    });
    return { token, record };
};

const useCountOf = (id: string) => db.getInvitationTokenById(id)!.useCount;

/** A registerUser double that records every localpart it was asked to mint. */
const registrar = () => {
    const minted: string[] = [];
    const registerUser: AnyFn = async (username: unknown) => {
        minted.push(String(username));
        return { ok: true as const, status: 201 };
    };
    return { minted, registerUser };
};

const post = (body?: string) =>
    app.request('/v1/auth/account-number', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body }),
    });

type ErrorBody = { code: string; reason?: string };

test('with the gate on, no token means no account: 403 invite_required, nothing minted', async () => {
    const { minted, registerUser } = registrar();
    await withGate(() =>
        withMatrix({ registerUser }, async () => {
            for (const body of ['{}', undefined]) {
                const res = await post(body);
                assert.equal(res.status, 403, `body ${JSON.stringify(body)}`);
                assert.equal(((await res.json()) as ErrorBody).code, 'invite_required');
            }
            assert.deepEqual(minted, []);
        })
    );
});

test('with the gate on, an unusable token is refused before anything is minted', async () => {
    const { minted, registerUser } = registrar();
    const past = new Date(Date.now() - 60_000).toISOString();
    const cases: Array<[string, string]> = [
        ['invalid', 'not-a-token'],
        ['exhausted', mintInvite({ maxUses: 1, useCount: 1 }).token],
        ['expired', mintInvite({ expiresAt: past }).token],
        ['revoked', mintInvite({ revokedAt: past }).token],
    ];
    await withGate(() =>
        withMatrix({ registerUser }, async () => {
            for (const [reason, inviteToken] of cases) {
                const res = await post(JSON.stringify({ inviteToken }));
                assert.equal(res.status, 400, reason);
                const body = (await res.json()) as ErrorBody;
                assert.equal(body.code, 'invite_token_invalid');
                assert.equal(body.reason, reason);
            }
            assert.deepEqual(minted, [], 'no Matrix account for a refused token');
        })
    );
});

test('with the gate on, a usable token mints the account, consumes one use and admits it to the bound room', async () => {
    const { minted, registerUser } = registrar();
    const admitted: Array<[string, string]> = [];
    const { token, record } = mintInvite({ maxUses: 3, matrixRoomId: '!den:test.local' });
    const redemptionsBefore = db.invitationRedemptions.size;
    await withGate(() =>
        withMatrix(
            {
                registerUser,
                getRoomParentSpace: (async () => ({ ok: false as const, status: 404 })) as AnyFn,
                adminJoinUserToRoom: (async (roomId: unknown, userId: unknown) => {
                    admitted.push([String(roomId), String(userId)]);
                    return { ok: true as const };
                }) as AnyFn,
            },
            async () => {
                const res = await post(JSON.stringify({ inviteToken: token }));
                assert.equal(res.status, 201);
                const body = (await res.json()) as {
                    accountNumber: string;
                    invite?: { ok: boolean; matrixInvite?: { ok: boolean } };
                };
                const localpart = await accountNumberToLocalpart(
                    normalizeAccountNumber(body.accountNumber)
                );
                assert.deepEqual(minted, [localpart]);
                assert.equal(useCountOf(record.id), 1);
                assert.deepEqual(admitted, [['!den:test.local', `@${localpart}:test.local`]]);
                assert.deepEqual(body.invite, { ok: true, matrixInvite: { ok: true } });
                // There is no Blackout account yet to record a redemption for.
                assert.equal(db.invitationRedemptions.size, redemptionsBefore);
            }
        )
    );
});

test('with the gate off, a presented token is still consumed and a missing one still allowed', async () => {
    const { minted, registerUser } = registrar();
    const { token, record } = mintInvite({ maxUses: 2 });
    await withMatrix({ registerUser }, async () => {
        const withToken = await post(JSON.stringify({ inviteToken: token }));
        assert.equal(withToken.status, 201);
        assert.equal(useCountOf(record.id), 1);

        const without = await post('{}');
        assert.equal(without.status, 201);
        assert.equal(
            'invite' in ((await without.json()) as Record<string, unknown>),
            false,
            'no invite field when no token was presented'
        );
        assert.equal(minted.length, 2);
    });
});

test('a token whose last use goes elsewhere during provisioning: 400, and the number is never handed out', async () => {
    const { token, record } = mintInvite({ maxUses: 1 });
    let mintedDuringRace = 0;
    await withGate(() =>
        withMatrix(
            {
                registerUser: (async () => {
                    // Another sign-up wins the last use while this one is at Synapse.
                    db.incrementInvitationTokenUseCount(record.id);
                    mintedDuringRace += 1;
                    return { ok: true as const, status: 201 };
                }) as AnyFn,
            },
            async () => {
                const res = await post(JSON.stringify({ inviteToken: token }));
                assert.equal(res.status, 400);
                const body = (await res.json()) as ErrorBody & { accountNumber?: string };
                assert.equal(body.code, 'invite_token_invalid');
                assert.equal(body.reason, 'exhausted');
                assert.equal(body.accountNumber, undefined);
                assert.equal(mintedDuringRace, 1);
                assert.equal(useCountOf(record.id), 1, 'the loser did not take a use');
            }
        )
    );
});

test('a malformed body is refused without minting', async () => {
    const { minted, registerUser } = registrar();
    await withMatrix({ registerUser }, async () => {
        for (const body of [
            'not json',
            JSON.stringify({ inviteToken: 5 }),
            JSON.stringify({ inviteToken: '' }),
        ]) {
            const res = await post(body);
            assert.equal(res.status, 400, body);
            assert.equal(((await res.json()) as ErrorBody).code, 'invalid_request');
        }
        assert.deepEqual(minted, []);
    });
});
