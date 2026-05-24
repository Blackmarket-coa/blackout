import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const BASE = '/v1/admin';

export interface ServerStats {
    totalUsers: number;
    totalRooms: number;
}

export interface AdminUser {
    userId: string;
    displayName: string | null;
    deactivated: boolean;
    admin: boolean;
}

export interface ListUsersResponse {
    users: AdminUser[];
    total: number;
}

const token = () => readBlackoutApiToken();

export function getServerStats(): Promise<ServerStats> {
    return createAuthorizedApiClient(token())({ method: 'GET', path: `${BASE}/stats` }) as Promise<ServerStats>;
}

export function listUsers(search?: string, limit = 50): Promise<ListUsersResponse> {
    const params = new URLSearchParams();
    if (search?.trim()) params.set('search', search.trim());
    params.set('limit', String(limit));
    return createAuthorizedApiClient(token())({
        method: 'GET',
        path: `${BASE}/users?${params.toString()}`,
    }) as Promise<ListUsersResponse>;
}

export function deactivateUser(userId: string, erase = false): Promise<{ ok: boolean }> {
    return createAuthorizedApiClient(token())({
        method: 'POST',
        path: `${BASE}/users/${encodeURIComponent(userId)}/deactivate`,
        body: { erase },
    }) as Promise<{ ok: boolean }>;
}

export function purgeRoom(
    roomId: string,
    opts: { block?: boolean; purge?: boolean } = {}
): Promise<{ ok: boolean; deleteId?: string }> {
    return createAuthorizedApiClient(token())({
        method: 'POST',
        path: `${BASE}/rooms/${encodeURIComponent(roomId)}/purge`,
        body: { block: opts.block ?? false, purge: opts.purge ?? true },
    }) as Promise<{ ok: boolean; deleteId?: string }>;
}
