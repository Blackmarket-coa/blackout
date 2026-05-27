import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const VAULT_BASE = '/v1/vault';

export interface VaultItemView {
    id: string;
    label: string;
    ciphertext: string;
    iv: string;
    algo: string;
    createdAt: string;
    updatedAt: string;
}

export interface VaultItemInput {
    label: string;
    ciphertext: string;
    iv: string;
    algo?: string;
}

const call = <T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: unknown,
    token: string | null
): Promise<T> => createAuthorizedApiClient(token)({ method, path, body }) as Promise<T>;

export const fetchVaultItems = (
    token: string | null = readBlackoutApiToken()
): Promise<{ items: VaultItemView[] }> => call('GET', `${VAULT_BASE}/items`, undefined, token);

export const createVaultItem = (
    input: VaultItemInput,
    token: string | null = readBlackoutApiToken()
): Promise<{ item: VaultItemView }> => call('POST', `${VAULT_BASE}/items`, input, token);

export const updateVaultItem = (
    id: string,
    input: Partial<VaultItemInput>,
    token: string | null = readBlackoutApiToken()
): Promise<{ item: VaultItemView | null }> =>
    call('PUT', `${VAULT_BASE}/items/${encodeURIComponent(id)}`, input, token);

export const deleteVaultItem = (
    id: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: true }> =>
    call('DELETE', `${VAULT_BASE}/items/${encodeURIComponent(id)}`, undefined, token);
