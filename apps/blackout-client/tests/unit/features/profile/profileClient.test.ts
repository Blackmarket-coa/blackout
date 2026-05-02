import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callApi = vi.fn();

vi.mock('../../../../src/app/sdk/client', () => ({
    createAuthorizedApiClient: () => callApi,
}));

vi.mock('../../../../src/app/features/monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'test-token',
}));

import {
    fetchProfile,
    fetchWall,
    postWall,
    saveProfile,
} from '../../../../src/app/features/profile/profileClient';

describe('profileClient', () => {
    beforeEach(() => {
        callApi.mockReset();
    });

    afterEach(() => {
        callApi.mockReset();
    });

    it('fetchProfile GETs /v1/profile/:userId', async () => {
        callApi.mockResolvedValueOnce({ userId: '@you:example.org' });
        await fetchProfile('@you:example.org');
        expect(callApi).toHaveBeenCalledWith({
            method: 'GET',
            path: '/v1/profile/%40you%3Aexample.org',
        });
    });

    it('saveProfile PUTs the upsert payload', async () => {
        callApi.mockResolvedValueOnce({ userId: '@me:example.org' });
        await saveProfile('@me:example.org', {
            displayName: 'Me',
            profile: { bio: 'hi' },
        });
        expect(callApi).toHaveBeenCalledWith({
            method: 'PUT',
            path: '/v1/profile/%40me%3Aexample.org',
            body: { displayName: 'Me', profile: { bio: 'hi' } },
        });
    });

    it('fetchWall GETs the wall sub-path', async () => {
        callApi.mockResolvedValueOnce({ userId: '@you:example.org', posts: [] });
        await fetchWall('@you:example.org');
        expect(callApi).toHaveBeenCalledWith({
            method: 'GET',
            path: '/v1/profile/%40you%3Aexample.org/wall',
        });
    });

    it('postWall POSTs the wall body', async () => {
        callApi.mockResolvedValueOnce({});
        await postWall('@you:example.org', 'hello');
        expect(callApi).toHaveBeenCalledWith({
            method: 'POST',
            path: '/v1/profile/%40you%3Aexample.org/wall',
            body: { body: 'hello' },
        });
    });
});
