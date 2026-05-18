import { MatrixError } from 'matrix-js-sdk';

const ERRCODE_COPY: Record<string, string> = {
    M_FORBIDDEN: "You don't have permission to do that.",
    M_LIMIT_EXCEEDED: 'Too many requests — please wait a moment and try again.',
    M_UNKNOWN_TOKEN: 'Your session has expired. Please sign in again.',
    M_MISSING_TOKEN: 'Your session has expired. Please sign in again.',
    M_NOT_FOUND: "That doesn't exist anymore.",
    M_USER_DEACTIVATED: 'This account has been deactivated.',
};

const NETWORK_HINTS = ['fetch', 'network', 'networkerror'];

export function formatMatrixError(err: unknown, fallback: string): string {
    if (err instanceof MatrixError) {
        const code = err.errcode;
        if (code && ERRCODE_COPY[code]) return ERRCODE_COPY[code];
        const serverMessage = (err.data as { error?: unknown } | undefined)?.error;
        if (typeof serverMessage === 'string' && serverMessage.length > 0) return serverMessage;
        return fallback;
    }

    if (err instanceof TypeError) {
        const message = err.message.toLowerCase();
        if (NETWORK_HINTS.some((hint) => message.includes(hint))) {
            return 'Network error. Check your connection and try again.';
        }
    }

    return fallback;
}
