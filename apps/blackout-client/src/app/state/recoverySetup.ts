const SKIP_STORAGE_KEY = 'co.bmc.recoverySetup.skipUntil.v1';
const SKIP_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export const getRecoverySkipUntil = (): number | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(SKIP_STORAGE_KEY);
        if (!raw) return null;
        const value = Number.parseInt(raw, 10);
        return Number.isFinite(value) ? value : null;
    } catch {
        return null;
    }
};

export const isRecoverySkipActive = (): boolean => {
    const until = getRecoverySkipUntil();
    return until !== null && until > Date.now();
};

export const skipRecoverySetup = (): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(SKIP_STORAGE_KEY, String(Date.now() + SKIP_DURATION_MS));
    } catch {
        // Storage unavailable; the gate will re-prompt next load, which is acceptable.
    }
};

export const clearRecoverySkip = (): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(SKIP_STORAGE_KEY);
    } catch {
        // ignore
    }
};
