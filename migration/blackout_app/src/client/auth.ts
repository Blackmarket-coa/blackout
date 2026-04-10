import { createClient, type MatrixClient, type MatrixError } from 'matrix-js-sdk';
import { createStore } from 'jotai/vanilla';
import { authStateAtom, matrixClientAtom, userIdAtom } from '../app/state/auth';
import { initMatrixFromStoredSession, MatrixInitError, stopMatrixClient } from './initMatrix';
import { clearSession, getSessionForUser, saveSession, type StoredSession } from './sessionManager';

type AtomStore = ReturnType<typeof createStore>;

export interface PasswordLoginInput {
    baseUrl: string;
    userId: string;
    password: string;
}

export interface RegistrationInput {
    baseUrl: string;
    username: string;
    password: string;
    displayName?: string;
}

const normalizeAuthError = (error: unknown): MatrixInitError => {
    const matrixError = error as Partial<MatrixError> & { errcode?: string; message?: string };

    switch (matrixError?.errcode) {
        case 'M_FORBIDDEN':
            return new MatrixInitError('invalid_credentials', 'Invalid username or password.');
        case 'M_LIMIT_EXCEEDED':
            return new MatrixInitError('rate_limited', 'Too many requests. Try again later.');
        case 'M_CAPTCHA_NEEDED':
            return new MatrixInitError('captcha_required', 'CAPTCHA required by homeserver.');
        default:
            if (error instanceof MatrixInitError) return error;
            return new MatrixInitError(
                'network_failure',
                matrixError?.message ?? 'Authentication failed.',
            );
    }
};

const applyLoggedOutAtoms = (store: AtomStore): void => {
    store.set(matrixClientAtom, null);
    store.set(authStateAtom, 'logged_out');
    store.set(userIdAtom, null);
};

const saveFromLoginResponse = (
    baseUrl: string,
    response: {
        access_token?: string;
        refresh_token?: string;
        user_id?: string;
        device_id?: string;
        expires_in_ms?: number;
    },
): StoredSession => {
    if (!response.access_token || !response.user_id || !response.device_id) {
        throw new MatrixInitError(
            'invalid_credentials',
            'Login response did not include required session fields.',
        );
    }

    const expiresAt = response.expires_in_ms ? Date.now() + response.expires_in_ms : undefined;

    const session: StoredSession = {
        baseUrl,
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        userId: response.user_id,
        deviceId: response.device_id,
        expiresAt,
    };

    saveSession(session);
    return session;
};

export const loginWithPassword = async (
    store: AtomStore,
    input: PasswordLoginInput,
): Promise<MatrixClient> => {
    store.set(authStateAtom, 'loading');

    try {
        const client = createClient({ baseUrl: input.baseUrl });
        const result = await client.login('m.login.password', {
            identifier: {
                type: 'm.id.user',
                user: input.userId,
            },
            password: input.password,
            initial_device_display_name: 'Blackout Web',
            refresh_token: true,
        });

        saveFromLoginResponse(input.baseUrl, result);
        const initializedClient = await initMatrixFromStoredSession(store);

        if (!initializedClient) {
            throw new MatrixInitError(
                'invalid_credentials',
                'Unable to restore session after login.',
            );
        }

        return initializedClient;
    } catch (error) {
        applyLoggedOutAtoms(store);
        throw normalizeAuthError(error);
    }
};

export const beginSsoRedirect = (baseUrl: string, redirectUrl: string): string => {
    const client = createClient({ baseUrl });
    return client.getSsoLoginUrl(redirectUrl, 'sso');
};

export const registerUser = async (
    store: AtomStore,
    input: RegistrationInput,
): Promise<MatrixClient> => {
    store.set(authStateAtom, 'loading');

    try {
        const client = createClient({ baseUrl: input.baseUrl });
        const response = await client.registerRequest({
            auth: { type: 'm.login.dummy' },
            username: input.username,
            password: input.password,
            initial_device_display_name: 'Blackout Web',
            inhibit_login: false,
        });

        saveFromLoginResponse(input.baseUrl, {
            access_token: response.access_token,
            user_id: response.user_id,
            device_id: response.device_id,
        });

        const initializedClient = await initMatrixFromStoredSession(store);
        if (!initializedClient) {
            throw new MatrixInitError(
                'invalid_credentials',
                'Unable to restore session after registration.',
            );
        }

        return initializedClient;
    } catch (error) {
        applyLoggedOutAtoms(store);
        throw normalizeAuthError(error);
    }
};

export const logout = async (store: AtomStore): Promise<void> => {
    const client = store.get(matrixClientAtom);
    const userId = store.get(userIdAtom);

    stopMatrixClient(client);

    if (client) {
        try {
            await client.logout();
        } catch {
            // ignore server-side logout failures; local cleanup still required
        }

        await client.clearStores();
    }

    if (userId) {
        clearSession(userId);
    } else {
        clearSession();
    }

    applyLoggedOutAtoms(store);
};

export const refreshSessionToken = async (store: AtomStore): Promise<StoredSession> => {
    const userId = store.get(userIdAtom);
    if (!userId) {
        throw new MatrixInitError('invalid_credentials', 'No active user to refresh token for.');
    }

    const session = getSessionForUser(userId);
    if (!session?.refreshToken) {
        throw new MatrixInitError(
            'invalid_credentials',
            'No refresh token available for active session.',
        );
    }

    const refreshUrl = new URL('/_matrix/client/v3/refresh', session.baseUrl);
    const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
    });

    if (!response.ok) {
        if (response.status === 429)
            throw new MatrixInitError('rate_limited', 'Token refresh is rate-limited.');
        throw new MatrixInitError('network_failure', `Token refresh failed (${response.status}).`);
    }

    const data = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in_ms?: number;
    };

    if (!data.access_token) {
        throw new MatrixInitError('invalid_credentials', 'Refresh response missing access token.');
    }

    const updatedSession: StoredSession = {
        ...session,
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? session.refreshToken,
        expiresAt: data.expires_in_ms ? Date.now() + data.expires_in_ms : session.expiresAt,
    };

    saveSession(updatedSession);
    return updatedSession;
};
