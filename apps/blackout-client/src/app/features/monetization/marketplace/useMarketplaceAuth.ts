export function readBlackoutApiToken(): string | null {
    try {
        return (
            window.localStorage.getItem('blackout.api.token') ??
            window.localStorage.getItem('blackoutApiToken') ??
            null
        );
    } catch {
        return null;
    }
}
