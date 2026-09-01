import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const [{ default: app }, { featureModules }] = await Promise.all([
    import('../src/index'),
    import('../src/modules/index'),
]);

async function issueToken(): Promise<{ token: string; username: string }> {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const username = `module-user-${suffix}`;
    const response = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            username,
            email: `${username}@example.com`,
            password: 'test-password',
        }),
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as { token: string };
    return { token: body.token, username };
}

test('feature module registry contains canonical frontend domains', () => {
    assert.deepEqual(
        featureModules.map((module) => module.id),
        [
            'governance',
            'channels',
            'forum',
            'deaddrop',
            'deadman',
            'moderation',
            'moderation/mjolnir',
            'streaming',
            'discovery',
            'profile',
            'stego',
            'topics',
            'growth',
            'search',
            'feed',
        ]
    );
});

test('feature module routes bootstrap under /v1', async () => {
    const { token, username } = await issueToken();
    // streaming/events is admin-only (the log spans every creator), so this
    // bootstrap user must be on the admin allowlist for that route to mount-check.
    const previousAdmins = process.env.BLACKOUT_ADMIN_USERS;
    process.env.BLACKOUT_ADMIN_USERS = username;
    try {
        const headers = {
            authorization: `Bearer ${token}`,
            'x-blackout-capabilities':
                'governance.read,forum.read,deaddrop.read,deadman.read,moderation.read,streaming.read,streaming.write,discovery.read',
        };

        const checks = await Promise.all([
            app.request('/v1/governance/events', { headers }),
            app.request('/v1/forum/events', { headers }),
            app.request('/v1/deaddrop/events', { headers }),
            app.request('/v1/deadman/events', { headers }),
            app.request('/v1/moderation/events', { headers }),
            app.request('/v1/streaming/events', { headers }),
            app.request('/v1/discovery/events', { headers }),
        ]);

        for (const response of checks) {
            assert.notEqual(response.status, 404);
            assert.equal(response.status, 200);
        }
    } finally {
        if (previousAdmins === undefined) delete process.env.BLACKOUT_ADMIN_USERS;
        else process.env.BLACKOUT_ADMIN_USERS = previousAdmins;
    }
});
