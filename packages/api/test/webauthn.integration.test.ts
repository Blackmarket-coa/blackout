import test from 'node:test';
import assert from 'node:assert/strict';
import {
    issueChallenge,
    consumeChallenge,
    purgeExpiredChallenges,
    parseClientData,
    validateClientData,
    rpIdHash,
    storeCredential,
    findCredential,
    listCredentialsByUser,
    verifyAttestation,
    verifyAssertion,
    readWebAuthnConfig,
    __test__,
} from '../src/services/webauthn';

const encodeClientData = (obj: object) =>
    Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');

test('issueChallenge produces unique base64url tokens', () => {
    const a = issueChallenge('u1', 'register');
    const b = issueChallenge('u1', 'register');
    assert.notEqual(a.challenge, b.challenge);
    assert.match(a.challenge, /^[A-Za-z0-9_-]+$/);
});

test('consumeChallenge enforces single-use semantics', () => {
    const c = issueChallenge('u-single', 'login');
    const first = consumeChallenge(c.challenge, { userId: 'u-single', purpose: 'login' });
    const second = consumeChallenge(c.challenge, { userId: 'u-single', purpose: 'login' });
    assert.ok(first);
    assert.equal(second, null);
});

test('consumeChallenge rejects user / purpose mismatches', () => {
    const c = issueChallenge('u-a', 'register');
    const wrongUser = consumeChallenge(c.challenge, { userId: 'u-b', purpose: 'register' });
    assert.equal(wrongUser, null);

    const c2 = issueChallenge('u-c', 'register');
    const wrongPurpose = consumeChallenge(c2.challenge, { userId: 'u-c', purpose: 'login' });
    assert.equal(wrongPurpose, null);
});

test('consumeChallenge enforces 5-minute TTL', () => {
    const now = Date.now();
    const c = issueChallenge('u-t', 'login', now);
    const tooLate = consumeChallenge(c.challenge, { userId: 'u-t', purpose: 'login' }, now + 6 * 60_000);
    assert.equal(tooLate, null);
});

test('purgeExpiredChallenges drops only expired entries', () => {
    const now = Date.now();
    const fresh = issueChallenge('u-keep', 'login', now);
    const stale = issueChallenge('u-drop', 'login', now - 10 * 60_000);
    purgeExpiredChallenges(now);
    assert.ok(__test__.challenges.has(fresh.challenge));
    assert.ok(!__test__.challenges.has(stale.challenge));
});

test('parseClientData decodes base64url JSON', () => {
    const raw = encodeClientData({
        type: 'webauthn.create',
        challenge: 'abc',
        origin: 'https://example.com',
    });
    const parsed = parseClientData(raw);
    assert.deepEqual(parsed, {
        type: 'webauthn.create',
        challenge: 'abc',
        origin: 'https://example.com',
    });
});

test('parseClientData returns null on malformed input', () => {
    assert.equal(parseClientData('not-base64-json'), null);
    assert.equal(parseClientData(Buffer.from('{}', 'utf8').toString('base64url')), null);
});

test('validateClientData enforces type, origin, challenge, cross-origin', () => {
    const ok = validateClientData(
        { type: 'webauthn.get', challenge: 'c1', origin: 'https://app.example.com' },
        { type: 'webauthn.get', challenge: 'c1', origins: ['https://app.example.com'] },
    );
    assert.equal(ok.ok, true);

    const wrongType = validateClientData(
        { type: 'webauthn.create', challenge: 'c1', origin: 'https://app.example.com' },
        { type: 'webauthn.get', challenge: 'c1', origins: ['https://app.example.com'] },
    );
    assert.deepEqual(wrongType, { ok: false, code: 'wrong_type', detail: 'webauthn.create' });

    const wrongChallenge = validateClientData(
        { type: 'webauthn.get', challenge: 'c1', origin: 'https://app.example.com' },
        { type: 'webauthn.get', challenge: 'c2', origins: ['https://app.example.com'] },
    );
    assert.equal(wrongChallenge.ok, false);
    assert.equal((wrongChallenge as { code: string }).code, 'challenge_mismatch');

    const wrongOrigin = validateClientData(
        { type: 'webauthn.get', challenge: 'c1', origin: 'https://evil.example.com' },
        { type: 'webauthn.get', challenge: 'c1', origins: ['https://app.example.com'] },
    );
    assert.equal((wrongOrigin as { code: string }).code, 'origin_not_allowed');

    const cross = validateClientData(
        { type: 'webauthn.get', challenge: 'c1', origin: 'https://app.example.com', crossOrigin: true },
        { type: 'webauthn.get', challenge: 'c1', origins: ['https://app.example.com'] },
    );
    assert.equal((cross as { code: string }).code, 'cross_origin_disallowed');
});

test('rpIdHash returns a 32-byte SHA-256 of the rpId', () => {
    const h = rpIdHash('example.com');
    assert.equal(h.length, 32);
});

test('credential storage is per-user and lookup works', () => {
    storeCredential({
        credentialId: 'cred-1',
        userId: 'u-cs',
        publicKeyCose: '',
        signCount: 0,
        transports: ['usb'],
        createdAt: Date.now(),
        lastUsedAt: null,
        label: 'YubiKey 5',
    });
    storeCredential({
        credentialId: 'cred-2',
        userId: 'u-cs',
        publicKeyCose: '',
        signCount: 0,
        transports: [],
        createdAt: Date.now(),
        lastUsedAt: null,
        label: 'Phone',
    });
    storeCredential({
        credentialId: 'cred-3',
        userId: 'u-other',
        publicKeyCose: '',
        signCount: 0,
        transports: [],
        createdAt: Date.now(),
        lastUsedAt: null,
        label: 'Other user phone',
    });

    assert.equal(findCredential('cred-1')?.label, 'YubiKey 5');
    assert.equal(findCredential('cred-missing'), undefined);
    assert.equal(listCredentialsByUser('u-cs').length, 2);
});

test('verifyAttestation rejects malformed clientData before reaching crypto', () => {
    const result = verifyAttestation({
        clientDataJSON: 'garbage',
        attestationObject: 'unused',
        expectedChallenge: 'c1',
        config: {
            enabled: true,
            rpId: 'example.com',
            rpName: 'X',
            expectedOrigins: ['https://example.com'],
        },
    });
    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, 'malformed_client_data');
});

test('verifyAttestation reports verification_not_implemented after clientData passes', () => {
    const challenge = 'chal-aaa';
    const result = verifyAttestation({
        clientDataJSON: encodeClientData({
            type: 'webauthn.create',
            challenge,
            origin: 'https://example.com',
        }),
        attestationObject: 'placeholder',
        expectedChallenge: challenge,
        config: {
            enabled: true,
            rpId: 'example.com',
            rpName: 'X',
            expectedOrigins: ['https://example.com'],
        },
    });
    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, 'verification_not_implemented');
});

test('verifyAssertion fails fast on unknown credentialId', () => {
    const challenge = 'chal-bbb';
    const result = verifyAssertion({
        clientDataJSON: encodeClientData({
            type: 'webauthn.get',
            challenge,
            origin: 'https://example.com',
        }),
        authenticatorData: '',
        signature: '',
        credentialId: 'does-not-exist',
        expectedChallenge: challenge,
        config: {
            enabled: true,
            rpId: 'example.com',
            rpName: 'X',
            expectedOrigins: ['https://example.com'],
        },
    });
    assert.equal((result as { code: string }).code, 'unknown_credential');
});

test('readWebAuthnConfig reflects env vars', () => {
    const previous = {
        e: process.env.WEBAUTHN_ENABLED,
        r: process.env.WEBAUTHN_RP_ID,
        n: process.env.WEBAUTHN_RP_NAME,
        o: process.env.WEBAUTHN_ORIGINS,
    };
    try {
        process.env.WEBAUTHN_ENABLED = '1';
        process.env.WEBAUTHN_RP_ID = 'app.example.com';
        process.env.WEBAUTHN_RP_NAME = 'Example';
        process.env.WEBAUTHN_ORIGINS = 'https://app.example.com, https://desktop.example.com';
        const cfg = readWebAuthnConfig();
        assert.equal(cfg.enabled, true);
        assert.equal(cfg.rpId, 'app.example.com');
        assert.equal(cfg.rpName, 'Example');
        assert.deepEqual(cfg.expectedOrigins, [
            'https://app.example.com',
            'https://desktop.example.com',
        ]);
    } finally {
        process.env.WEBAUTHN_ENABLED = previous.e;
        process.env.WEBAUTHN_RP_ID = previous.r;
        process.env.WEBAUTHN_RP_NAME = previous.n;
        process.env.WEBAUTHN_ORIGINS = previous.o;
    }
});
