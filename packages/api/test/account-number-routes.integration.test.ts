import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { matrixClient } = await import('../src/integrations/matrix-client');
const { accountNumberToLocalpart, normalizeAccountNumber, isValidAccountNumber } = await import(
    '@blackout/core'
);

type AnyFn = (...args: unknown[]) => unknown;

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

test('POST /v1/auth/account-number mints a no-PII account and provisions the derived localpart', async () => {
    let registeredLocalpart: string | undefined;
    let registeredPassword: string | undefined;
    await withMatrix(
        {
            registerUser: (async (username: unknown, password: unknown) => {
                registeredLocalpart = String(username);
                registeredPassword = String(password);
                return { ok: true as const, status: 201 };
            }) as AnyFn,
        },
        async () => {
            const res = await app.request('/v1/auth/account-number', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}',
            });
            assert.equal(res.status, 201);
            const body = (await res.json()) as { accountNumber: string };
            assert.ok(isValidAccountNumber(body.accountNumber));

            // The provisioned localpart is the one-way derivation of the number,
            // and the password is the normalized number itself.
            const normalized = normalizeAccountNumber(body.accountNumber);
            assert.equal(registeredPassword, normalized);
            assert.equal(registeredLocalpart, await accountNumberToLocalpart(normalized));
        },
    );
});

test('POST /v1/auth/account-number succeeds in dev when Matrix is not configured', async () => {
    await withMatrix(
        {
            registerUser: (async () => ({ ok: false as const, reason: 'matrix_not_configured' as const })) as AnyFn,
        },
        async () => {
            const res = await app.request('/v1/auth/account-number', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}',
            });
            assert.equal(res.status, 201);
        },
    );
});

test('POST /v1/auth/account-number surfaces a hard Matrix failure as 502', async () => {
    await withMatrix(
        {
            registerUser: (async () => ({ ok: false as const, status: 500 })) as AnyFn,
        },
        async () => {
            const res = await app.request('/v1/auth/account-number', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}',
            });
            assert.equal(res.status, 502);
        },
    );
});
