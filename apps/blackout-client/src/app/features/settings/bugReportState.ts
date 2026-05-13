// Pure helpers for the Report-a-bug form. Drafts live as local component
// state — never persisted to localStorage — so they don't survive a tab
// close. That's a privacy property; "I started typing a bug report in
// public" shouldn't leak across sessions.

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
