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
      const callOnce = () =>
        client<BugReportResponse>({
          method: 'POST',
          path: '/v1/bug-report',
          body: payload,
        });

      try {
        return await callOnce();
      } catch (err) {
        // The SDK throws on non-2xx. The server returns 502 only when BOTH
        // forwarding legs failed, so surface that as a synthesized "both
        // failed" response and let the success view render the partial copy.
        // Other HTTP failures (4xx) we still want the user to see.
        const e = err as { message?: string; kind?: 'retryable' | 'fatal' };
        const message = e?.message ?? 'request failed';
        if (message.includes('(502)')) return synthesizeFailureResponse(message);
        const kind: 'retryable' | 'fatal' = e?.kind ?? 'fatal';

        // One auto-retry for retryable errors (transient network / 5xx).
        // Fatal errors (4xx, validation) skip the retry.
        if (kind === 'retryable') {
          await new Promise((resolve) => setTimeout(resolve, 2_000));
          try {
            return await callOnce();
          } catch (retryErr) {
            const r = retryErr as { message?: string; kind?: 'retryable' | 'fatal' };
            const retryMessage = r?.message ?? message;
            if (retryMessage.includes('(502)')) return synthesizeFailureResponse(retryMessage);
            const submitError: SubmitError = { message: retryMessage, kind: r?.kind ?? 'fatal' };
            throw submitError;
          }
        }

        const submitError: SubmitError = { message, kind };
        throw submitError;
      }
    },
    [client],
  );

  return useAsyncCallback<BugReportResponse, SubmitError, [BugReportPayload]>(submit);
};
