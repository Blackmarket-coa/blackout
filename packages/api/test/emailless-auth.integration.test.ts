/**
 * Auth behavior around emailless accounts (Matrix exchange / account-number
 * signups, stored with NO email — plus legacy rows carrying email: '').
 * Regression coverage for the file→postgres migration bug where '' emails
 * collided on users_email_key: the store must treat '' and unset alike, and
 * every email-driven flow (login, password reset, verification, deletion)
 * must behave sanely when user.email is absent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.BLACKOUT_DB_MODE = 'memory';

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');
const { signJwt } = await import('../src/services/auth');
const { issuePasswordResetToken } = await import('../src/services/passwordReset');
const mailerModule = await import('../src/services/mailer');

class InMemoryMailer {
    outbox: Array<{ to: string; subject: string; text: string; kind?: string }> = [];
    async send(message: { to: string; subject: string; text: string; kind?: string }) {
        this.outbox.push(message);
    }
}
const mailer = new InMemoryMailer();
mailerModule.setMailer(mailer);

const PASSWORD = 'A-Strong-Pass-9876!';

let seq = 0;
/** New-style emailless account: the email field is entirely absent. */
const createEmaillessUser = () =>
    db.createUser({
        id: crypto.randomUUID(),
        username: `emailless-${seq++}`,
        passwordHash: '',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: crypto.randomUUID().replace(/-/g, ''),
    });

const postJson = (path: string, body: unknown, token?: string) =>
    app.request(path, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });

// Seed BEFORE any real registration so the linear email scans walk past the
// emailless rows first — the old `user.email.toLowerCase()` would throw here.
const emailless = [createEmaillessUser(), createEmaillessUser(), createEmaillessUser()];
// Legacy shape: a pre-migration record that still carries ''.
const legacyEmptyEmail = db.createUser({
    id: crypto.randomUUID(),
    username: 'legacy-empty-email',
    email: '',
    passwordHash: '',
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'legacy-pk',
});

test('many emailless users coexist and are never reachable by email lookup', () => {
    for (const u of emailless) {
        assert.equal(db.getUserById(u.id)?.username, u.username);
        assert.equal(db.getUserById(u.id)?.email, undefined);
    }
    assert.equal(db.getUserById(legacyEmptyEmail.id)?.username, 'legacy-empty-email');
    assert.equal(db.findUserByEmail(''), undefined, "'' must not resolve any account");
});

test('register + login by email still work while emailless users exist', async () => {
    const email = 'coexist@example.test';
    const registered = await postJson('/v1/auth/register', {
        username: 'coexist',
        email,
        password: PASSWORD,
    });
    assert.equal(registered.status, 201, await registered.clone().text());

    const login = await postJson('/v1/auth/login', { email, password: PASSWORD });
    assert.equal(login.status, 200, await login.clone().text());
    const body = (await login.json()) as { userId: string };
    assert.equal(db.getUserById(body.userId)?.email, email);
});

test('a real email still enforces uniqueness at registration', async () => {
    const res = await postJson('/v1/auth/register', {
        username: 'coexist-other',
        email: 'coexist@example.test',
        password: PASSWORD,
    });
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { code: string }).code, 'user_exists');
});

test('login with an empty email is rejected by validation, never matched', async () => {
    const res = await postJson('/v1/auth/login', { email: '', password: PASSWORD });
    assert.equal(res.status, 400);
});

test('password reset request stays a uniform 202 with emailless users in the store', async () => {
    mailer.outbox.length = 0;
    const unknown = await postJson('/v1/auth/password/reset/request', {
        email: 'nobody@example.test',
    });
    assert.equal(unknown.status, 202, 'unknown address: 202, not a 500 from the email scan');
    assert.equal(mailer.outbox.length, 0);

    const known = await postJson('/v1/auth/password/reset/request', {
        email: 'coexist@example.test',
    });
    assert.equal(known.status, 202);
    assert.equal(mailer.outbox.length, 1);
    assert.equal(mailer.outbox[0].to, 'coexist@example.test');
});

test('password reset can never be issued against an emailless account', () => {
    // '' is blocked at the HTTP schema; pin the service layer too, since a
    // legacy ''-email row would otherwise be the first match in the scan.
    assert.equal(issuePasswordResetToken({ email: '' }), null);
});

test('email verification request for an emailless account is a clean 400', async () => {
    const u = emailless[0];
    const res = await postJson('/v1/auth/email/verify/request', {}, signJwt(u.id, u.username, 600));
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { code: string }).code, 'no_email_on_file');
});

test('account deletion request for an emailless account is a clean 400', async () => {
    const u = emailless[1];
    mailer.outbox.length = 0;
    const res = await postJson(
        '/v1/auth/account/delete/request',
        {},
        signJwt(u.id, u.username, 600)
    );
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { code: string }).code, 'no_email_on_file');
    assert.equal(mailer.outbox.length, 0, 'nothing to send a deletion token to');
});
