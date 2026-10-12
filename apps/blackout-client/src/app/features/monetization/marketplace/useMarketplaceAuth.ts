import { storageNamespace } from '../../../../client/storageNamespace';

export function readBlackoutApiToken(): string | null {
    try {
        const namespace = storageNamespace();
        // The chat panel with B3's client switch on reads only its own token:
        // never the full app's (which has no session length) and never the
        // legacy key. With the switch off the panel reads the full app's keys.
        if (namespace.embed) return window.localStorage.getItem(namespace.apiTokenKey);
        return (
            window.localStorage.getItem('blackout.api.token') ??
            window.localStorage.getItem('blackoutApiToken') ??
            null
        );
    } catch {
        return null;
    }
}
