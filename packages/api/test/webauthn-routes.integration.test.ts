/**
 * The passkey routes under `/v1/auth/webauthn`, end to end, with a software
 * authenticator: real `none` attestations and P-256 assertions that
 * `@simplewebauthn/server` verifies.
 *
 * Until 2026-10-26 `register/begin` and `register/finish` took any `userId`
 * and no session, so anyone could register their own authenticator under
 * another account (F7 in docs/security/api-findings-triage-2026-10-25.md).
 * Registration now needs the caller's session and is stored under their
 * Blackout id; a known credential id cannot be registered again; sign-in
 * looks credentials up under the Blackout id, given that id or a local Matrix
 * id. Every route stays behind `WEBAUTHN_ENABLED`, which this process sets
 * only for itself, as `webauthn.integration.test.ts` does.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
    createHash,
    generateKeyPairSync,
    randomBytes,
    randomUUID,
    sign,
    type KeyObject,
} from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import { generateTestJwtSecret } from './_fixtures/secrets';

const RP_ID = 'app.test.local';
const ORIGIN = 'https://app.test.local';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';
const savedWebAuthnEnv = {
    WEBAUTHN_ENABLED: process.env.WEBAUTHN_ENABLED,
    WEBAUTHN_RP_ID: process.env.WEBAUTHN_RP_ID,
    WEBAUTHN_ORIGINS: process.env.WEBAUTHN_ORIGINS,
};
process.env.WEBAUTHN_RP_ID = RP_ID;
process.env.WEBAUTHN_ORIGINS = ORIGIN;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { findCredential, listCredentialsByUser, __test__ } = await import(
    '../src/services/webauthn'
);

after(() => {
    for (const [name, value] of Object.entries(savedWebAuthnEnv)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

const enabled = async <T>(fn: () => Promise<T>): Promise<T> => {
    process.env.WEBAUTHN_ENABLED = '1';
    try {
        return await fn();
    } finally {
        delete process.env.WEBAUTHN_ENABLED;
    }
};

const seedUser = () => {
    const id = randomUUID();
    const username = `pk-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return { id, username, mxid: `@${username}:test.local` };
};

type Caller = { id: string; username: string } | null;

/** A passkey that answers registration and sign-in like a platform authenticator. */
class SoftAuthenticator {
    private readonly publicKey: KeyObject;
    private readonly privateKey: KeyObject;
    private counter = 0;
    readonly credentialId: Buffer;

    constructor(credentialId: Buffer = randomBytes(16)) {
        const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
        this.publicKey = pair.publicKey;
        this.privateKey = pair.privateKey;
        this.credentialId = credentialId;
    }

    get id(): string {
        return this.credentialId.toString('base64url');
    }

    private clientData(type: string, challenge: string): Buffer {
        return Buffer.from(JSON.stringify({ type, challenge, origin: ORIGIN, crossOrigin: false }));
    }

    private rpIdHash(): Buffer {
        return createHash('sha256').update(RP_ID).digest();
    }

    attestation(challenge: string) {
        const jwk = this.publicKey.export({ format: 'jwk' });
        const coseKey = isoCBOR.encode(
            new Map<number, number | Uint8Array>([
                [1, 2], // kty: EC2
                [3, -7], // alg: ES256
                [-1, 1], // crv: P-256
                [-2, new Uint8Array(Buffer.from(jwk.x!, 'base64url'))],
                [-3, new Uint8Array(Buffer.from(jwk.y!, 'base64url'))],
            ])
        );
        const idLength = Buffer.alloc(2);
        idLength.writeUInt16BE(this.credentialId.length);
        const authData = Buffer.concat([
            this.rpIdHash(),
            Buffer.from([0x41]), // user present, attested credential data
            Buffer.alloc(4), // sign count 0
            Buffer.alloc(16), // AAGUID
            idLength,
            this.credentialId,
            Buffer.from(coseKey),
        ]);
        const attestationObject = isoCBOR.encode(
            new Map<string, string | Uint8Array | Map<string, never>>([
                ['fmt', 'none'],
                ['attStmt', new Map()],
                ['authData', new Uint8Array(authData)],
            ])
        );
        return {
            id: this.id,
            rawId: this.id,
            type: 'public-key',
            response: {
                clientDataJSON: this.clientData('webauthn.create', challenge).toString('base64url'),
                attestationObject: Buffer.from(attestationObject).toString('base64url'),
            },
        };
    }

    assertion(challenge: string) {
        this.counter += 1;
        const count = Buffer.alloc(4);
        count.writeUInt32BE(this.counter);
        const authData = Buffer.concat([this.rpIdHash(), Buffer.from([0x01]), count]);
        const clientData = this.clientData('webauthn.get', challenge);
        const signature = sign(
            'sha256',
            Buffer.concat([authData, createHash('sha256').update(clientData).digest()]),
            this.privateKey
        );
        return {
            id: this.id,
            rawId: this.id,
            type: 'public-key',
            response: {
                clientDataJSON: clientData.toString('base64url'),
                authenticatorData: authData.toString('base64url'),
                signature: signature.toString('base64url'),
            },
        };
    }
}

const post = (caller: Caller, path: string, body?: unknown) =>
    app.request(`/v1/auth/webauthn${path}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(caller
                ? { authorization: `Bearer ${signJwt(caller.id, caller.username, 600)}` }
                : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

const refusal = async (res: Response) => ({
    status: res.status,
    code: ((await res.json()) as { code?: string }).code,
});

const begin = async (caller: Caller, body?: unknown): Promise<string> => {
    const res = await post(caller, '/register/begin', body);
    assert.equal(res.status, 200);
    return ((await res.json()) as { challenge: string }).challenge;
};

/** Register a fresh passkey for `caller` and return it. */
const register = async (caller: Caller, passkey = new SoftAuthenticator()) => {
    const challenge = await begin(caller, {});
    const res = await post(caller, '/register/finish', {
        label: 'Laptop',
        credential: passkey.attestation(challenge),
    });
    assert.equal(res.status, 200);
    return passkey;
};

const state = () => ({
    challenges: __test__.challenges.size,
    credentials: __test__.credentials.size,
});

test('with WEBAUTHN_ENABLED unset every route answers 503, signed in or not, and nothing is written', async () => {
    delete process.env.WEBAUTHN_ENABLED;
    const alice = seedUser();
    const before = state();
    for (const caller of [null, alice]) {
        for (const path of [
            '/register/begin',
            '/register/finish',
            '/login/begin',
            '/login/finish',
        ]) {
            assert.deepEqual(await refusal(await post(caller, path, {})), {
                status: 503,
                code: 'webauthn_disabled',
            });
        }
    }
    assert.deepEqual(state(), before);
});

test('without a session, register/begin and register/finish are refused 401 and nothing is written', async () => {
    await enabled(async () => {
        const alice = seedUser();
        const passkey = new SoftAuthenticator();
        const before = state();
        assert.deepEqual(await refusal(await post(null, '/register/begin', { userId: alice.id })), {
            status: 401,
            code: 'unauthorized',
        });
        assert.deepEqual(await refusal(await post(null, '/register/begin')), {
            status: 401,
            code: 'unauthorized',
        });

        // Even holding a challenge issued to Alice, an anonymous finish is refused.
        const challenge = await begin(alice);
        const issued = state();
        assert.deepEqual(
            await refusal(
                await post(null, '/register/finish', {
                    userId: alice.id,
                    label: 'Planted',
                    credential: passkey.attestation(challenge),
                })
            ),
            { status: 401, code: 'unauthorized' }
        );
        assert.deepEqual(state(), issued, 'the challenge survives; nothing is stored');
        assert.equal(issued.credentials, before.credentials);
        assert.equal(findCredential(passkey.id), undefined);
    });
});

test('a userId naming another account, by Blackout id or Matrix id, is refused and nothing is written', async () => {
    await enabled(async () => {
        const alice = seedUser();
        const bob = seedUser();
        const before = state();
        for (const userId of [bob.id, bob.mxid, `@${alice.username}:elsewhere.example`]) {
            assert.deepEqual(await refusal(await post(alice, '/register/begin', { userId })), {
                status: 403,
                code: 'user_mismatch',
            });
        }
        assert.deepEqual(state(), before);

        const challenge = await begin(alice);
        const passkey = new SoftAuthenticator();
        assert.deepEqual(
            await refusal(
                await post(alice, '/register/finish', {
                    userId: bob.id,
                    label: 'Planted',
                    credential: passkey.attestation(challenge),
                })
            ),
            { status: 403, code: 'user_mismatch' }
        );
        assert.equal(findCredential(passkey.id), undefined);
        assert.equal(listCredentialsByUser(bob.id).length, 0);
    });
});

test("a challenge issued to one account cannot finish another account's registration", async () => {
    await enabled(async () => {
        const alice = seedUser();
        const mallory = seedUser();
        const challenge = await begin(alice);
        const passkey = new SoftAuthenticator();
        assert.deepEqual(
            await refusal(
                await post(mallory, '/register/finish', {
                    label: 'Planted',
                    credential: passkey.attestation(challenge),
                })
            ),
            { status: 400, code: 'challenge_invalid_or_expired' }
        );
        assert.equal(findCredential(passkey.id), undefined);
        assert.equal(listCredentialsByUser(alice.id).length, 0);
        assert.equal(listCredentialsByUser(mallory.id).length, 0);
    });
});

test('the signed-in caller registers a passkey under their own Blackout id, named or not', async () => {
    await enabled(async () => {
        const alice = seedUser();
        const res = await post(alice, '/register/begin');
        assert.equal(res.status, 200);
        const options = (await res.json()) as { user: { id: string; name: string } };
        assert.deepEqual(options.user, {
            id: alice.id,
            name: alice.username,
            displayName: alice.username,
        });

        const keys: SoftAuthenticator[] = [];
        for (const body of [undefined, {}, { userId: alice.id }, { userId: alice.mxid }]) {
            const challenge = await begin(alice, body);
            const passkey = new SoftAuthenticator();
            const finish = await post(alice, '/register/finish', {
                ...(body ?? {}),
                label: 'Phone',
                credential: passkey.attestation(challenge),
            });
            assert.equal(finish.status, 200);
            assert.equal(
                ((await finish.json()) as { credentialId: string }).credentialId,
                passkey.id
            );
            keys.push(passkey);
        }
        assert.deepEqual(
            listCredentialsByUser(alice.id)
                .map((cred) => cred.credentialId)
                .sort(),
            keys.map((key) => key.id).sort()
        );
        assert.equal(listCredentialsByUser(alice.mxid).length, 0);
    });
});

test("a credential id already registered cannot be registered again, so nobody can take over another's passkey", async () => {
    await enabled(async () => {
        const alice = seedUser();
        const mallory = seedUser();
        const original = await register(alice);
        const before = { ...findCredential(original.id)! };

        // Mallory's own key, presented under Alice's public credential id.
        const impostor = new SoftAuthenticator(original.credentialId);
        const challenge = await begin(mallory);
        assert.deepEqual(
            await refusal(
                await post(mallory, '/register/finish', {
                    label: 'Hijack',
                    credential: impostor.attestation(challenge),
                })
            ),
            { status: 409, code: 'credential_exists' }
        );
        assert.deepEqual(findCredential(original.id), before);
        assert.equal(listCredentialsByUser(mallory.id).length, 0);

        // Alice cannot register the same credential twice either.
        const again = await begin(alice);
        assert.deepEqual(
            await refusal(
                await post(alice, '/register/finish', {
                    label: 'Again',
                    credential: original.attestation(again),
                })
            ),
            { status: 409, code: 'credential_exists' }
        );
        assert.equal(listCredentialsByUser(alice.id).length, 1);
    });
});

test('sign-in finds a registered passkey by Blackout id or local Matrix id, and only for its owner', async () => {
    await enabled(async () => {
        const alice = seedUser();
        const bob = seedUser();
        const passkey = await register(alice);
        const bobsKey = await register(bob);

        for (const userId of [alice.id, alice.mxid]) {
            const start = await post(null, '/login/begin', { userId });
            assert.equal(start.status, 200);
            const { challenge, allowCredentials } = (await start.json()) as {
                challenge: string;
                allowCredentials: Array<{ id: string }>;
            };
            assert.deepEqual(
                allowCredentials.map((cred) => cred.id),
                [passkey.id]
            );
            const finish = await post(null, '/login/finish', {
                userId,
                credential: passkey.assertion(challenge),
            });
            assert.equal(finish.status, 200, `sign-in as ${userId}`);
            assert.equal(((await finish.json()) as { ok: boolean }).ok, true);
        }

        // Bob's passkey does not sign in as Alice.
        const start = await post(null, '/login/begin', { userId: alice.id });
        const { challenge } = (await start.json()) as { challenge: string };
        assert.deepEqual(
            await refusal(
                await post(null, '/login/finish', {
                    userId: alice.id,
                    credential: bobsKey.assertion(challenge),
                })
            ),
            { status: 400, code: 'unknown_credential' }
        );

        // The signature is what signs her in: the same assertion with the
        // signature of another challenge fails verification.
        const again = await post(null, '/login/begin', { userId: alice.id });
        const next = ((await again.json()) as { challenge: string }).challenge;
        const forged = passkey.assertion(next);
        forged.response.signature = passkey.assertion('another challenge').response.signature;
        assert.deepEqual(
            await refusal(
                await post(null, '/login/finish', { userId: alice.id, credential: forged })
            ),
            { status: 400, code: 'verification_failed' }
        );

        // An unknown account looks like one with no passkeys.
        const nobody = await post(null, '/login/begin', { userId: `@ghost:test.local` });
        assert.deepEqual(
            ((await nobody.json()) as { allowCredentials: unknown[] }).allowCredentials,
            []
        );
    });
});
