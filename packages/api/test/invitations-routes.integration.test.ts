import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { matrixClient } = await import('../src/integrations/matrix-client');

type AnyFn = (...args: unknown[]) => unknown;

/**
 * Temporarily swap methods on the shared `matrixClient` singleton (the
 * invitations service imports the same object). Mirrors the monkeypatch
 * pattern in matrix-token-exchange.integration.test.ts; restores originals.
 */
async function withMatrix(
    overrides: Record<string, AnyFn>,
    run: () => Promise<void>,
): Promise<void> {
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

function makeUser(username: string): { id: string; token: string } {
    const id = randomUUID();
    db.createUser({
        id,
        username,
        email: `${username}@test.local`,
        passwordHash: 'x',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: '',
    });
    return { id, token: signJwt(id, username, 600) };
}

const mintOk: AnyFn = async () => ({ ok: true as const, status: 200, token: 'syn_reg_tok', expiresAtMs: null });
const mintNotConfigured: AnyFn = async () => ({ ok: false as const, reason: 'matrix_not_configured' as const });

/** Stubs that make a room-scoped create + redeem fully "succeed" against Matrix. */
const matrixHappyPath: Record<string, AnyFn> = {
    mintRegistrationToken: mintOk,
    botUserId: async () => '@blackout:test.local',
    getRoomParentSpace: async () => ({ ok: true as const, canopyId: '!canopy:test.local' }),
    adminJoinUserToRoom: async () => ({ ok: true as const, status: 200 }),
    inviteToRoom: async () => ({ ok: true as const, status: 200 }),
    revokeRegistrationToken: async () => ({ ok: true as const, status: 200 }),
};

test('POST /v1/invitations rejects unauthenticated callers', async () => {
    const res = await app.request('/v1/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'crew' }),
    });
    assert.equal(res.status, 401);
});

test('POST /v1/invitations mints a room-scoped invite and returns the token + URL fragment', async () => {
    const inviter = makeUser(`inviter_${randomUUID().slice(0, 8)}`);
    await withMatrix(matrixHappyPath, async () => {
        const res = await app.request('/v1/invitations', {
            method: 'POST',
            headers: { authorization: `Bearer ${inviter.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ matrixRoomId: '!den:test.local', label: 'crew' }),
        });
        assert.equal(res.status, 201);
        const body = (await res.json()) as {
            invitation: { matrixRoomId?: string; label?: string };
            token: string;
            synapseRegistrationToken: string;
            url: string;
        };
        assert.equal(body.invitation.matrixRoomId, '!den:test.local');
        assert.ok(body.token.length > 0);
        assert.equal(body.synapseRegistrationToken, 'syn_reg_tok');
        // Registration token rides in the URL fragment so it never reaches the server.
        assert.ok(body.url.includes('#registrationToken=syn_reg_tok'), body.url);
    });
});

test('POST /v1/invitations returns 503 matrix_mint_failed when Synapse is unconfigured', async () => {
    const inviter = makeUser(`inviter_${randomUUID().slice(0, 8)}`);
    await withMatrix({ mintRegistrationToken: mintNotConfigured }, async () => {
        const res = await app.request('/v1/invitations', {
            method: 'POST',
            headers: { authorization: `Bearer ${inviter.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'crew' }),
        });
        assert.equal(res.status, 503);
        const body = (await res.json()) as { code: string; reason: string };
        assert.equal(body.code, 'matrix_mint_failed');
        assert.equal(body.reason, 'matrix_not_configured');
    });
});

test('POST /v1/invitations/redeem admits the redeemer and resolves the canopy', async () => {
    const inviter = makeUser(`inviter_${randomUUID().slice(0, 8)}`);
    const redeemer = makeUser(`redeemer_${randomUUID().slice(0, 8)}`);

    await withMatrix(matrixHappyPath, async () => {
        const createRes = await app.request('/v1/invitations', {
            method: 'POST',
            headers: { authorization: `Bearer ${inviter.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ matrixRoomId: '!den:test.local', label: 'crew' }),
        });
        const { token } = (await createRes.json()) as { token: string };

        const redeemRes = await app.request('/v1/invitations/redeem', {
            method: 'POST',
            headers: { authorization: `Bearer ${redeemer.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ token }),
        });
        assert.equal(redeemRes.status, 200);
        const body = (await redeemRes.json()) as {
            ok: boolean;
            matrixRoomId?: string;
            matrixInvite?: { ok: boolean };
            canopyId?: string;
        };
        assert.equal(body.ok, true);
        assert.equal(body.matrixRoomId, '!den:test.local');
        assert.equal(body.canopyId, '!canopy:test.local');
        assert.equal(body.matrixInvite?.ok, true);
    });
});

test('POST /v1/invitations/redeem rejects self-redemption', async () => {
    const inviter = makeUser(`inviter_${randomUUID().slice(0, 8)}`);
    await withMatrix(matrixHappyPath, async () => {
        const createRes = await app.request('/v1/invitations', {
            method: 'POST',
            headers: { authorization: `Bearer ${inviter.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'crew' }),
        });
        const { token } = (await createRes.json()) as { token: string };

        const redeemRes = await app.request('/v1/invitations/redeem', {
            method: 'POST',
            headers: { authorization: `Bearer ${inviter.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ token }),
        });
        assert.equal(redeemRes.status, 400);
        const body = (await redeemRes.json()) as { ok: boolean; reason: string };
        assert.equal(body.reason, 'self_redeem');
    });
});

test('POST /v1/invitations/redeem returns 404 for an unknown token', async () => {
    const redeemer = makeUser(`redeemer_${randomUUID().slice(0, 8)}`);
    const res = await app.request('/v1/invitations/redeem', {
        method: 'POST',
        headers: { authorization: `Bearer ${redeemer.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'not-a-real-token' }),
    });
    assert.equal(res.status, 404);
    const body = (await res.json()) as { ok: boolean; reason: string };
    assert.equal(body.reason, 'invalid');
});

test('POST /v1/invitations/redeem returns 410 for a revoked token', async () => {
    const inviter = makeUser(`inviter_${randomUUID().slice(0, 8)}`);
    const redeemer = makeUser(`redeemer_${randomUUID().slice(0, 8)}`);
    await withMatrix(matrixHappyPath, async () => {
        const createRes = await app.request('/v1/invitations', {
            method: 'POST',
            headers: { authorization: `Bearer ${inviter.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'crew' }),
        });
        const { invitation, token } = (await createRes.json()) as {
            invitation: { id: string };
            token: string;
        };

        const delRes = await app.request(`/v1/invitations/${invitation.id}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${inviter.token}` },
        });
        assert.equal(delRes.status, 200);

        const redeemRes = await app.request('/v1/invitations/redeem', {
            method: 'POST',
            headers: { authorization: `Bearer ${redeemer.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ token }),
        });
        assert.equal(redeemRes.status, 410);
        const body = (await redeemRes.json()) as { reason: string };
        assert.equal(body.reason, 'revoked');
    });
});

test('GET /v1/invitations/preview/:token reports validity and inviter', async () => {
    const inviter = makeUser(`inviter_${randomUUID().slice(0, 8)}`);
    await withMatrix(matrixHappyPath, async () => {
        const createRes = await app.request('/v1/invitations', {
            method: 'POST',
            headers: { authorization: `Bearer ${inviter.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ matrixRoomId: '!den:test.local', label: 'crew' }),
        });
        const { token } = (await createRes.json()) as { token: string };

        const ok = await app.request(`/v1/invitations/preview/${encodeURIComponent(token)}`);
        assert.equal(ok.status, 200);
        const okBody = (await ok.json()) as {
            valid: boolean;
            invitation: { inviter: { id: string }; matrixRoomId?: string };
        };
        assert.equal(okBody.valid, true);
        assert.equal(okBody.invitation.inviter.id, inviter.id);
        assert.equal(okBody.invitation.matrixRoomId, '!den:test.local');

        const bad = await app.request('/v1/invitations/preview/nope');
        assert.equal(bad.status, 404);
        const badBody = (await bad.json()) as { valid: boolean; reason: string };
        assert.equal(badBody.valid, false);
        assert.equal(badBody.reason, 'invalid');
    });
});

test('GET /v1/invitations lists the inviter rows with redemptions', async () => {
    const inviter = makeUser(`inviter_${randomUUID().slice(0, 8)}`);
    const redeemer = makeUser(`redeemer_${randomUUID().slice(0, 8)}`);
    await withMatrix(matrixHappyPath, async () => {
        const createRes = await app.request('/v1/invitations', {
            method: 'POST',
            headers: { authorization: `Bearer ${inviter.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ matrixRoomId: '!den:test.local', label: 'crew', maxUses: 5 }),
        });
        const { invitation, token } = (await createRes.json()) as {
            invitation: { id: string };
            token: string;
        };

        await app.request('/v1/invitations/redeem', {
            method: 'POST',
            headers: { authorization: `Bearer ${redeemer.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ token }),
        });

        const listRes = await app.request('/v1/invitations', {
            headers: { authorization: `Bearer ${inviter.token}` },
        });
        assert.equal(listRes.status, 200);
        const body = (await listRes.json()) as {
            invitations: Array<{ id: string; redemptions: Array<{ userId: string }> }>;
        };
        const row = body.invitations.find((r) => r.id === invitation.id);
        assert.ok(row, 'created invitation should appear in the list');
        assert.equal(row!.redemptions.length, 1);
        assert.equal(row!.redemptions[0]!.userId, redeemer.id);
    });
});
