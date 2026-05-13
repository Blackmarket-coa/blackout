import { useCallback, useMemo } from 'react';
import { createFetchApiClient } from '@blackout/sdk';
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
  message: string;
  kind: 'retryable' | 'fatal';
}

export type UseBugReportSubmission = [
  AsyncState<BugReportResponse, SubmitError>,
  (payload: BugReportPayload) => Promise<BugReportResponse>,
];

const synthesizeFailureResponse = (message: string): BugReportResponse => ({
  rageshakeId: null,
  rageshakeError: message,
  issueUrl: null,
  issueError: message,
  partial: false,
});

export const useBugReportSubmission = (): UseBugReportSubmission => {
  const config = useClientConfig();
  const client = useMemo(
    () => createFetchApiClient({ baseUrl: config.blackoutApiBaseUrl }),
    [config.blackoutApiBaseUrl],
  );

  const submit = useCallback(
    async (payload: BugReportPayload): Promise<BugReportResponse> => {
      try {
        return await client<BugReportResponse>({
          method: 'POST',
          path: '/bug-report',
          body: payload,
        });
      } catch (err) {
        // The SDK throws on non-2xx. The server returns 502 only when BOTH
        // forwarding legs failed, so surface that as a synthesized "both
        // failed" response and let the success view render the partial copy.
        // Other HTTP failures (4xx) we still want the user to see.
        const e = err as { message?: string; kind?: 'retryable' | 'fatal' };
        const message = e?.message ?? 'request failed';
        if (message.includes('(502)')) return synthesizeFailureResponse(message);
        const submitError: SubmitError = { message, kind: e?.kind ?? 'fatal' };
        throw submitError;
      }
    },
    [client],
  );

  return useAsyncCallback<BugReportResponse, SubmitError, [BugReportPayload]>(submit);
};
