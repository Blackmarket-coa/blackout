// Pure helpers for the Report-a-bug form. Drafts persist within a tab session
// only — cleared on tab close and on successful submission. Consent toggles
// (`includeDiagnostics`, `includeMatrixIdHash`) are never persisted; they
// default off each session to force re-consent. The original property —
// "I started typing a bug report in public" shouldn't leak across sessions —
// holds because sessionStorage is partitioned per tab and wiped on close.

import type { CollectedDiagnostics } from '../../lib/diagnostics/collect';

export type BugReportCategory = 'ui' | 'voice' | 'matrix' | 'marketplace' | 'other';
export type BugReportSeverity = 'low' | 'medium' | 'high';

export interface BugReportDraft {
  title: string;
  description: string;
  category: BugReportCategory;
  severity: BugReportSeverity;
  includeDiagnostics: boolean;
  includeMatrixIdHash: boolean;
}

export const emptyDraft = (): BugReportDraft => ({
  title: '',
  description: '',
  category: 'other',
  severity: 'medium',
  includeDiagnostics: false,
  includeMatrixIdHash: false,
});

export interface BuildPayloadInput {
  readonly draft: BugReportDraft;
  readonly matrixId?: string | null;
  readonly diagnostics?: CollectedDiagnostics | null;
}

export interface BugReportPayload {
  title: string;
  description: string;
  category: BugReportCategory;
  severity: BugReportSeverity;
  includeDiagnostics: boolean;
  includeMatrixIdHash: boolean;
  matrixId?: string;
  diagnostics?: CollectedDiagnostics;
}

export const buildBugReportPayload = ({
  draft,
  matrixId,
  diagnostics,
}: BuildPayloadInput): BugReportPayload => {
  const out: BugReportPayload = {
    title: draft.title.trim(),
    description: draft.description.trim(),
    category: draft.category,
    severity: draft.severity,
    includeDiagnostics: draft.includeDiagnostics,
    includeMatrixIdHash: draft.includeMatrixIdHash,
  };
  if (draft.includeMatrixIdHash && matrixId) out.matrixId = matrixId;
  if (draft.includeDiagnostics && diagnostics) out.diagnostics = diagnostics;
  return out;
};

export const isPayloadSubmittable = (payload: BugReportPayload): boolean =>
  payload.title.length >= 3 &&
  payload.title.length <= 140 &&
  payload.description.length >= 10 &&
  payload.description.length <= 8_000;

// --- sessionStorage draft persistence ---

const DRAFT_STORAGE_KEY = 'co.bmc.bugreport.draft.v1';

// Only the text + category + severity persist. Consent toggles
// (includeDiagnostics, includeMatrixIdHash) are intentionally NOT persisted;
// they re-default to off each session so the user re-consents to attaching
// diagnostic data on every report.
interface PersistedDraft {
  title: string;
  description: string;
  category: BugReportCategory;
  severity: BugReportSeverity;
}

const VALID_CATEGORIES: ReadonlySet<BugReportCategory> = new Set([
  'ui',
  'voice',
  'matrix',
  'marketplace',
  'other',
]);
const VALID_SEVERITIES: ReadonlySet<BugReportSeverity> = new Set(['low', 'medium', 'high']);

export const readDraftFromSession = (): BugReportDraft | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedDraft>;
    const category = VALID_CATEGORIES.has(parsed.category as BugReportCategory)
      ? (parsed.category as BugReportCategory)
      : 'other';
    const severity = VALID_SEVERITIES.has(parsed.severity as BugReportSeverity)
      ? (parsed.severity as BugReportSeverity)
      : 'medium';
    return {
      ...emptyDraft(),
      title: typeof parsed.title === 'string' ? parsed.title.slice(0, 140) : '',
      description: typeof parsed.description === 'string' ? parsed.description.slice(0, 8_000) : '',
      category,
      severity,
    };
  } catch {
    return null;
  }
};

export const writeDraftToSession = (draft: BugReportDraft): void => {
  if (typeof window === 'undefined') return;
  const persisted: PersistedDraft = {
    title: draft.title,
    description: draft.description,
    category: draft.category,
    severity: draft.severity,
  };
  try {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Quota or denied access — drop silently.
  }
};

export const clearDraftFromSession = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
};
