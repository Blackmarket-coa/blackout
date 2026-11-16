export interface CallFocusResolution {
    focusUrl: string | null;
    status: 'healthy' | 'degraded' | 'unconfigured';
    reason: string;
}

interface MatrixRtcFocus {
    type?: string;
    livekit_service_url?: string;
    livekit_alias?: string;
}

export const resolveLivekitFocusFromWellKnown = (body: Record<string, unknown>): string | null => {
    const fociRoot = (body['org.matrix.msc4143.rtc_foci'] ?? body.rtc_foci) as unknown;
    if (!Array.isArray(fociRoot) || fociRoot.length === 0) return null;

    const livekitFocus = fociRoot.find((focus): focus is MatrixRtcFocus => {
        if (!focus || typeof focus !== 'object') return false;
        const type = (focus as MatrixRtcFocus).type;
        return type === 'livekit' || type === 'livekit-service';
    });

    if (!livekitFocus) return null;
    return livekitFocus.livekit_service_url ?? livekitFocus.livekit_alias ?? null;
};

/** The reason the call provider gives when the SDK has no call session to start. */
export const MISSING_CALL_SESSION_REASON = 'matrixRTC startRoomSession unavailable';

export const getActionableCallMessage = (
    status: CallFocusResolution['status'],
    reason: string
): string => {
    if (status === 'healthy') return 'LiveKit focus resolved. Calls should connect normally.';
    if (status === 'unconfigured') {
        return `Call provider is not configured (${reason}). You can still open widget fallback mode.`;
    }
    // The SDK the app ships with has no matrixRTC.startRoomSession, so this is
    // not something a retry fixes (trust-claims-2026-11-16.md, T17).
    if (reason === MISSING_CALL_SESSION_REASON) {
        return 'Calls cannot start in this version of the app: the Matrix library it is built with does not have the call session it uses, so retrying will not help.';
    }
    return `Call provider is degraded (${reason}). Retry shortly or continue in widget fallback mode.`;
};
