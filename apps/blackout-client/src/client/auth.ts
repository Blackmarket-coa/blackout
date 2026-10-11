import {
    createClient,
    type AuthDict,
    type IAuthData,
    type MatrixClient,
    type MatrixError,
} from 'matrix-js-sdk';
import { createStore } from 'jotai/vanilla';
import { authStateAtom, matrixClientAtom, userIdAtom } from '../app/state/auth';
import {
    clearClientStores,
    clearPanelSessionTimer,
    initMatrixFromStoredSession,
    MatrixInitError,
    stopMatrixClient,
} from './initMatrix';
import { clearSession, getSessionForUser, saveSession, type StoredSession } from './sessionManager';
import { clearBlackoutApiToken, revokeBlackoutApiToken } from './blackoutApiSession';
import {
    bindSessionLength,
    isTimedSessionLength,
    SESSION_LENGTH_MS,
    signOutDeviceByToken,
    type PanelSessionChoice,
} from './sessionLength';

type AtomStore = ReturnType<typeof createStore>;

export type PasswordLoginIdentifier =
    | { type: 'm.id.user'; user: string }
    | { type: 'm.id.thirdparty'; medium: 'email'; address: string };

export interface PasswordLoginInput {
    baseUrl: string;
    /**
     * Plain username (used when identifier is not provided). Kept for
     * backwards compatibility with callers that pass a bare user id.
     */
    userId?: string;
    /** Full Matrix login identifier; takes precedence over userId. */
    identifier?: PasswordLoginIdentifier;
    password: string;
}

export interface TokenLoginInput {
    baseUrl: string;
    token: string;
}

export interface RegistrationInput {
    baseUrl: string;
    username: string;
    password: string;
    /** Optional UIA auth dict — supplied by the UIA flow runner per stage. */
    auth?: AuthDict;
    /** Optional initial email (added as a 3PID after registration succeeds). */
    initialEmail?: string;
    /** When the homeserver requires an email 3PID up-front. */
    threepidCreds?: { sid: string; clientSecret: string };
    inhibitLogin?: boolean;
    /** Chat panel sign-up (launch-plan B3): the session length chosen before signing up. */
    sessionChoice?: PanelSessionChoice;
}

/**
 * Successful registration returns a session; otherwise the homeserver returns
 * 401 with auth flow data so the caller can keep walking the UIA stages.
 */
export type RegistrationOutcome =
    | { status: 'success'; client: MatrixClient }
    | { status: 'flow'; authData: IAuthData };

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
                matrixError?.message ?? 'Authentication failed.'
            );
    }
};

const applyLoggedOutAtoms = (store: AtomStore): void => {
    store.set(matrixClientAtom, null);
    store.set(authStateAtom, 'logged_out');
    store.set(userIdAtom, null);
};

type LoginResponseFields = {
    access_token?: string;
    refresh_token?: string;
    user_id?: string;
    device_id?: string;
    expires_in_ms?: number;
};

type PanelSessionFields = Pick<StoredSession, 'sessionLength' | 'sessionEndsAt'>;

const saveFromLoginResponse = (
    baseUrl: string,
    response: LoginResponseFields,
    panel?: PanelSessionFields
): StoredSession => {
    if (!response.access_token || !response.user_id || !response.device_id) {
        throw new MatrixInitError(
            'invalid_credentials',
            'Login response did not include required session fields.'
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
        ...(panel ?? {}),
    };

    saveSession(session);
    return session;
};

const SESSION_LENGTH_FAILED_MESSAGE =
    'Blackout couldn’t confirm how long this session lasts, so you’re not signed in. Try again.';

/**
 * Chat panel (launch-plan B3): refuse a timed length the servers did not say
 * they enforce, before anything reaches the homeserver.
 */
const assertEnforceable = (choice: PanelSessionChoice | undefined): void => {
    if (choice && !choice.enforcedByServer && isTimedSessionLength(choice.length)) {
        throw new MatrixInitError(
            'session_length_unavailable',
            'This server can’t end panel sessions on a timer, so choose “Until I sign out”.'
        );
    }
};

/**
 * Keep a freshly minted session and start the client — for the chat panel,
 * only once the homeserver has recorded the chosen length against the new
 * device. Until then the tokens exist only in this function: they are never
 * stored or used, and if the length cannot be bound the device is signed out
 * again and nothing is kept.
 */
const establishSession = async (
    store: AtomStore,
    baseUrl: string,
    response: LoginResponseFields,
    choice: PanelSessionChoice | undefined
): Promise<MatrixClient | null> => {
    if (!choice) {
        saveFromLoginResponse(baseUrl, response);
        return initMatrixFromStoredSession(store);
    }
    if (!response.access_token || !response.user_id || !response.device_id) {
        throw new MatrixInitError(
            'invalid_credentials',
            'Login response did not include required session fields.'
        );
    }
    let panel: PanelSessionFields = { sessionLength: choice.length };
    if (choice.enforcedByServer) {
        const startedAt = Date.now();
        try {
            await bindSessionLength(baseUrl, response.access_token, choice.length);
        } catch {
            await signOutDeviceByToken(baseUrl, response.access_token);
            throw new MatrixInitError('session_length_unavailable', SESSION_LENGTH_FAILED_MESSAGE);
        }
        const lengthMs = SESSION_LENGTH_MS[choice.length];
        // Counted from before the bind request on this device's clock, so the
        // panel's own sign-out never comes later than the server's end.
        if (lengthMs !== null) panel = { ...panel, sessionEndsAt: startedAt + lengthMs };
    }
    saveFromLoginResponse(baseUrl, response, panel);
    return initMatrixFromStoredSession(store);
};

export const loginWithPassword = async (
    store: AtomStore,
    input: PasswordLoginInput,
    /** Chat panel only (launch-plan B3): the session length chosen before signing in. */
    choice?: PanelSessionChoice
): Promise<MatrixClient> => {
    assertEnforceable(choice);
    store.set(authStateAtom, 'loading');

    try {
        const identifier: PasswordLoginIdentifier = input.identifier ?? {
            type: 'm.id.user',
            user: input.userId ?? '',
        };
        const client = createClient({ baseUrl: input.baseUrl });
        const result = await client.login('m.login.password', {
            identifier,
            password: input.password,
            initial_device_display_name: 'Blackout Client',
            refresh_token: true,
        });

        const initializedClient = await establishSession(store, input.baseUrl, result, choice);

        if (!initializedClient) {
            throw new MatrixInitError(
                'invalid_credentials',
                'Unable to restore session after login.'
            );
        }

        return initializedClient;
    } catch (error) {
        applyLoggedOutAtoms(store);
        throw normalizeAuthError(error);
    }
};

export const beginSsoRedirect = (
    baseUrl: string,
    redirectUrl: string,
    method: 'sso' | 'cas' = 'sso',
    idpId?: string
): string => {
    const client = createClient({ baseUrl });
    return client.getSsoLoginUrl(redirectUrl, method, idpId);
};

export const loginWithToken = async (
    store: AtomStore,
    input: TokenLoginInput
): Promise<MatrixClient> => {
    store.set(authStateAtom, 'loading');

    try {
        const client = createClient({ baseUrl: input.baseUrl });
        const result = await client.login('m.login.token', {
            token: input.token,
            initial_device_display_name: 'Blackout Client',
            refresh_token: true,
        });

        saveFromLoginResponse(input.baseUrl, result);
        const initializedClient = await initMatrixFromStoredSession(store);

        if (!initializedClient) {
            throw new MatrixInitError(
                'invalid_credentials',
                'Unable to restore session after SSO login.'
            );
        }

        return initializedClient;
    } catch (error) {
        applyLoggedOutAtoms(store);
        throw normalizeAuthError(error);
    }
};

/**
 * registerUser drives one round-trip of the UIA flow.
 *
 * On 401 from the homeserver matrix-js-sdk surfaces the flow descriptor as
 * `data` on the MatrixError. We translate that into a structured return so the
 * caller (the registration UI) can run the appropriate stage UI and re-call us
 * with a populated `auth` dict on the next attempt.
 */
export const registerUser = async (
    store: AtomStore,
    input: RegistrationInput
): Promise<RegistrationOutcome> => {
    assertEnforceable(input.sessionChoice);
    if (!input.auth) {
        store.set(authStateAtom, 'loading');
    }

    const client = createClient({ baseUrl: input.baseUrl });
    let response;
    try {
        response = await client.registerRequest({
            auth: input.auth,
            username: input.username,
            password: input.password,
            initial_device_display_name: 'Blackout Client',
            inhibit_login: input.inhibitLogin ?? false,
        });
    } catch (error) {
        const matrixError = error as MatrixError;
        if (matrixError?.httpStatus === 401 && matrixError.data) {
            // UIA still in progress; surface the flow data, keep auth state intact.
            return { status: 'flow', authData: matrixError.data as IAuthData };
        }
        applyLoggedOutAtoms(store);
        throw normalizeAuthError(error);
    }

    if (!response.access_token || !response.device_id || !response.user_id) {
        // inhibit_login: true returns no session; caller decides what to do.
        applyLoggedOutAtoms(store);
        throw new MatrixInitError(
            'invalid_credentials',
            'Registration completed but no session was returned.'
        );
    }

    let initializedClient: MatrixClient | null;
    try {
        initializedClient = await establishSession(
            store,
            input.baseUrl,
            response,
            input.sessionChoice
        );
    } catch (error) {
        applyLoggedOutAtoms(store);
        throw error;
    }
    if (!initializedClient) {
        applyLoggedOutAtoms(store);
        throw new MatrixInitError(
            'invalid_credentials',
            'Unable to restore session after registration.'
        );
    }

    return { status: 'success', client: initializedClient };
};

export interface RequestPasswordResetEmailInput {
    baseUrl: string;
    email: string;
    clientSecret: string;
    sendAttempt: number;
    nextLink?: string;
}

export const requestPasswordResetEmail = async (
    input: RequestPasswordResetEmailInput
): Promise<{ sid: string }> => {
    const client = createClient({ baseUrl: input.baseUrl });
    const result = await client.requestPasswordEmailToken(
        input.email,
        input.clientSecret,
        input.sendAttempt,
        input.nextLink
    );
    return { sid: result.sid };
};

export interface CompletePasswordResetInput {
    baseUrl: string;
    sid: string;
    clientSecret: string;
    newPassword: string;
    logoutDevices?: boolean;
}

/**
 * Completes the email-token password reset by hitting
 * `POST /_matrix/client/v3/account/password` with a UIA dict containing the
 * sid + client_secret obtained from requestPasswordResetEmail. We call the
 * endpoint directly because matrix-js-sdk's setPassword wrapper requires an
 * authenticated client.
 */
export const completePasswordReset = async (
    input: CompletePasswordResetInput
): Promise<void> => {
    const url = new URL('/_matrix/client/v3/account/password', input.baseUrl);
    const body = {
        new_password: input.newPassword,
        logout_devices: input.logoutDevices ?? false,
        auth: {
            type: 'm.login.email.identity',
            threepid_creds: { sid: input.sid, client_secret: input.clientSecret },
            threepidCreds: { sid: input.sid, client_secret: input.clientSecret },
        },
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        let message = `Password reset failed (${response.status}).`;
        try {
            const data = (await response.json()) as { error?: string; errcode?: string };
            if (data.error) message = data.error;
            if (data.errcode === 'M_THREEPID_AUTH_FAILED') {
                message = 'Email verification not yet confirmed. Click the link in the email first.';
            }
        } catch {
            // ignore
        }
        throw new MatrixInitError('invalid_credentials', message);
    }
};

export const logout = async (store: AtomStore): Promise<void> => {
    const client = store.get(matrixClientAtom);
    const userId = store.get(userIdAtom);

    // A chat panel session's own end timer must not outlive the sign-out.
    clearPanelSessionTimer();
    stopMatrixClient(client);

    if (client) {
        try {
            await client.logout();
        } catch {
            // ignore server-side logout failures; local cleanup still required
        }

        await clearClientStores(client);
    }

    if (userId) {
        clearSession(userId);
    } else {
        clearSession();
    }

    clearBlackoutApiToken();
    applyLoggedOutAtoms(store);
};

/**
 * The chat panel's Sign out (launch-plan B3): end the panel's Blackout API
 * token on the API as well, then sign the device out as `logout` does. The
 * full app keeps calling `logout` alone.
 */
export const signOutPanel = async (store: AtomStore): Promise<void> => {
    await revokeBlackoutApiToken();
    await logout(store);
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
            'No refresh token available for active session.'
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
