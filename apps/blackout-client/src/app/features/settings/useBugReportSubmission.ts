import { useCallback } from 'react';
import { useAsyncCallback, type AsyncState } from '../../hooks/useAsyncCallback';
import { useClientConfig } from '../../hooks/useClientConfig';
import type { BugReportPayload } from './bugReportState';

export interface BugReportResponse {
  rageshakeId: string | null;
  rageshakeError: string | null;
  issueUrl: string | null;
  issueError: string | null;
  partial: boolean;
}

export interface SubmitError {
  status: number;
  message: string;
  details?: unknown;
}

const resolveEndpoint = (baseUrl: string | undefined): string => {
  const trimmed = (baseUrl ?? '').replace(/\/+$/, '');
  return `${trimmed}/bug-report`;
};

export type UseBugReportSubmission = [
  AsyncState<BugReportResponse, SubmitError>,
  (payload: BugReportPayload) => Promise<BugReportResponse>,
];

export const useBugReportSubmission = (): UseBugReportSubmission => {
  const config = useClientConfig();
  const endpoint = resolveEndpoint(config.blackoutApiBaseUrl);

  const submit = useCallback(
    async (payload: BugReportPayload): Promise<BugReportResponse> => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok && res.status !== 502) {
        const err: SubmitError = {
          status: res.status,
          message:
            (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
              ? body.message
              : null) ?? res.statusText,
          details: body && typeof body === 'object' && 'details' in body ? body.details : undefined,
        };
        throw err;
      }
      // 502 returns the same body shape as 200 (with both errors populated);
      // we surface it as a "success" of the submission attempt and let the
      // UI render the dual-failure copy.
      return body as BugReportResponse;
    },
    [endpoint],
  );

  return useAsyncCallback<BugReportResponse, SubmitError, [BugReportPayload]>(submit);
};
