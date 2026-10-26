import { describe, expect, it } from 'vitest';
import { createReleaseIdentityActions, type ApiClient, type ApiRequest } from '@blackout/sdk';
import { ALICE } from '../../../../../packages/blackout-protocol/src/release/testVectors';

const recordingClient = () => {
    const requests: ApiRequest[] = [];
    const client: ApiClient = async <T>(request: ApiRequest) => {
        requests.push(request);
        return {} as T;
    };
    return { client, requests };
};

describe('createReleaseIdentityActions', () => {
    it('reads and publishes the caller’s own entry under /me', async () => {
        const { client, requests } = recordingClient();
        const actions = createReleaseIdentityActions(client);
        await actions.getMine();
        await actions.publishMine(ALICE.identity);
        expect(requests[0]).toEqual({ method: 'GET', path: '/v1/release-identities/me' });
        expect(requests[1]).toEqual({
            method: 'PUT',
            path: '/v1/release-identities/me',
            body: { identity: ALICE.identity },
        });
    });

    it('sends the six public fields only, even when handed private keys', async () => {
        const { client, requests } = recordingClient();
        const leaky = {
            ...ALICE.identity,
            signingPrivateJwk: ALICE.signingPrivateJwk,
            x25519PrivateJwk: ALICE.x25519PrivateJwk,
            mlkem768SecretKey: ALICE.mlkem768SecretKey,
        };
        await createReleaseIdentityActions(client).publishMine(leaky);
        const sent = JSON.stringify(requests[0].body);
        expect(Object.keys((requests[0].body as { identity: object }).identity).sort()).toEqual(
            ['accountId', 'mlkem768Key', 'signature', 'signingKey', 'v', 'x25519Key'].sort()
        );
        expect(sent).not.toContain(ALICE.signingPrivateJwk.d);
        expect(sent).not.toContain(ALICE.x25519PrivateJwk.d);
        expect(sent).not.toContain(ALICE.mlkem768SecretKey.slice(0, 40));
    });

    it('fetches by account id, encoded, and by Matrix id in a POST body, not the URL', async () => {
        const { client, requests } = recordingClient();
        const actions = createReleaseIdentityActions(client);
        await actions.getForAccount('a/b');
        await actions.lookupByMatrixId('@bob:blackout.example');
        expect(requests[0]).toEqual({ method: 'GET', path: '/v1/release-identities/a%2Fb' });
        expect(requests[1]).toEqual({
            method: 'POST',
            path: '/v1/release-identities/lookup',
            body: { matrixId: '@bob:blackout.example' },
        });
        expect(requests[1].path).not.toContain('bob');
    });
});
