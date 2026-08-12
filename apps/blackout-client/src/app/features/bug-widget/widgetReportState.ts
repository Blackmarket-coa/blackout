// State + payload helpers for the global bug-report widget. Drafts persist
// within a tab session only (cleared on tab close and on successful submit),
// mirroring the settings-page report form in `../settings/bugReportState.ts`.

import { collectDiagnostics } from '../../lib/diagnostics/collect';

export interface WidgetReportMetadata {
    clientVersion: string;
    userAgent: string;
    platform: string;
    screenWidth: number;
    screenHeight: number;
    currentPath?: string;
    currentRoomId?: string;
    buildChannel?: string;
    /**
     * Suppressed matrix-js-sdk log counts — see `CollectedDiagnostics` in
     * `lib/diagnostics/collect.ts`. Carried here as well as on the settings-page
     * report because this widget is the surface a user reaches from inside a room
     * they cannot read, which is precisely the BO-1 symptom.
     */
    undecryptableEvents?: number;
    keyBackupProbes?: number;
}

export interface WidgetReportAttachment {
    filename: string;
    contentType: string;
    base64: string;
}

export interface WidgetReportDraft {
    description: string;
    steps: string;
    suggestions: string;
}

export interface WidgetReportPayload {
    description: string;
    steps?: string;
    suggestions?: string;
    reporterMatrixId?: string;
    includeReporterHash?: boolean;
    metadata: WidgetReportMetadata;
    attachment?: WidgetReportAttachment;
}

export const emptyWidgetDraft = (): WidgetReportDraft => ({
    description: '',
    steps: '',
    suggestions: '',
});

// `/communities/:canopyId/dens/:denId` — capture the den segment as the room
// the reporter was looking at. Path-only, no query/fragment (collectDiagnostics
// already strips those).
const roomIdFromPath = (path: string): string | undefined => {
    const match = /\/dens\/([^/?#]+)/.exec(path);
    return match?.[1];
};

const safeScreen = (): { width: number; height: number } => {
    try {
        if (typeof window !== 'undefined') {
            return { width: window.innerWidth || 0, height: window.innerHeight || 0 };
        }
    } catch {
        /* ignore */
    }
    return { width: 0, height: 0 };
};

export const collectWidgetMetadata = (): WidgetReportMetadata => {
    const d = collectDiagnostics();
    const screen = safeScreen();
    const meta: WidgetReportMetadata = {
        clientVersion: d.clientVersion,
        userAgent: d.userAgent,
        platform: d.platform,
        screenWidth: screen.width,
        screenHeight: screen.height,
        currentPath: d.currentPath,
        buildChannel: d.buildChannel,
    };
    // Only attach when non-zero: a report from a healthy device should not carry
    // two zeroes that a triager has to read past.
    if (d.suppressedLogCounts.decryptUtd > 0) {
        meta.undecryptableEvents = d.suppressedLogCounts.decryptUtd;
    }
    if (d.suppressedLogCounts.keyBackupProbe > 0) {
        meta.keyBackupProbes = d.suppressedLogCounts.keyBackupProbe;
    }
    const roomId = roomIdFromPath(d.currentPath);
    if (roomId) meta.currentRoomId = roomId;
    return meta;
};

export interface BuildWidgetPayloadInput {
    draft: WidgetReportDraft;
    metadata: WidgetReportMetadata;
    attachment?: WidgetReportAttachment | null;
    matrixId?: string | null;
    includeReporterHash?: boolean;
}

export const buildWidgetPayload = ({
    draft,
    metadata,
    attachment,
    matrixId,
    includeReporterHash,
}: BuildWidgetPayloadInput): WidgetReportPayload => {
    const payload: WidgetReportPayload = {
        description: draft.description.trim(),
        metadata,
    };
    if (draft.steps.trim()) payload.steps = draft.steps.trim();
    if (draft.suggestions.trim()) payload.suggestions = draft.suggestions.trim();
    if (includeReporterHash && matrixId) {
        payload.reporterMatrixId = matrixId;
        payload.includeReporterHash = true;
    }
    if (attachment) payload.attachment = attachment;
    return payload;
};

export const isWidgetDraftSubmittable = (draft: WidgetReportDraft): boolean =>
    draft.description.trim().length >= 10 && draft.description.trim().length <= 8_000;

// --- sessionStorage draft persistence (text only) ---

const DRAFT_STORAGE_KEY = 'co.bmc.bugwidget.draft.v1';

export const readWidgetDraftFromSession = (): WidgetReportDraft | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<WidgetReportDraft>;
        return {
            description:
                typeof parsed.description === 'string' ? parsed.description.slice(0, 8_000) : '',
            steps: typeof parsed.steps === 'string' ? parsed.steps.slice(0, 4_000) : '',
            suggestions:
                typeof parsed.suggestions === 'string' ? parsed.suggestions.slice(0, 4_000) : '',
        };
    } catch {
        return null;
    }
};

export const writeWidgetDraftToSession = (draft: WidgetReportDraft): void => {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
        /* quota / denied — drop silently */
    }
};

export const clearWidgetDraftFromSession = (): void => {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
        /* ignore */
    }
};
