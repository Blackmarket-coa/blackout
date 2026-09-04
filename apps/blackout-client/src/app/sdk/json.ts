/**
 * Thin JSON verbs over `createAuthorizedApiClient`.
 *
 * Every feature client had been re-declaring the same three one-line wrappers;
 * these are the shared ones. The token defaults to the stored Blackout API
 * token, so call sites only pass one when they have a specific token in hand.
 */
import { createAuthorizedApiClient } from './client';
import { readBlackoutApiToken } from '../features/monetization/marketplace/useMarketplaceAuth';

export function getJson<T>(
    path: string,
    token: string | null = readBlackoutApiToken()
): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path }) as Promise<T>;
}

export function postJson<T>(
    path: string,
    body: unknown,
    token: string | null = readBlackoutApiToken()
): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body }) as Promise<T>;
}

export function deleteJson<T>(
    path: string,
    token: string | null = readBlackoutApiToken()
): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'DELETE', path }) as Promise<T>;
}
