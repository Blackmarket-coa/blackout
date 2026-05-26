import { useCallback, useMemo } from 'react';
import { createFetchApiClient } from '@blackout/sdk';
import { useClientConfig } from '../../hooks/useClientConfig';
import type { WidgetReportPayload } from './widgetReportState';

export interface WidgetReportOutcome {
  ok: boolean;
  roomId: string | null;
  eventId: string | null;
  messageLink: string | null;
  attachmentPosted: boolean;
  threadSeeded: boolean;
  reactionSeeded: boolean;
  devNoop: boolean;
  issueUrl?: string | null;
  issueError?: string | null;
  error: string | null;
}

export type WidgetSubmitResult =
  | { kind: 'ok'; outcome: WidgetReportOutcome }
  | { kind: 'rate_limited' }
  | { kind: 'error'; message: string };

interface RateLimitedBody {
  code: 'rate_limited';
  message: string;
}

const isRateLimited = (res: unknown): res is RateLimitedBody =>
  typeof res === 'object' && res !== null && (res as { code?: unknown }).code === 'rate_limited';

export const useWidgetReportSubmission = (): ((payload: WidgetReportPayload) => Promise<WidgetSubmitResult>) => {
  const config = useClientConfig();
  // Resolve 429 to a typed body instead of throwing — the soft rate limit is an
  // expected outcome the form handles inline rather than an error.
  const client = useMemo(
    () => createFetchApiClient({ baseUrl: config.blackoutApiBaseUrl, resolveOnStatuses: [429] }),
    [config.blackoutApiBaseUrl],
  );

  return useCallback(
    async (payload: WidgetReportPayload): Promise<WidgetSubmitResult> => {
      try {
        const res = await client<WidgetReportOutcome | RateLimitedBody>({
          method: 'POST',
          path: '/v1/bug-report/widget',
          body: payload,
        });
        if (isRateLimited(res)) return { kind: 'rate_limited' };
        return { kind: 'ok', outcome: res as WidgetReportOutcome };
      } catch (err) {
        const message = (err as { message?: string })?.message ?? 'Could not submit report';
        return { kind: 'error', message };
      }
    },
    [client],
  );
};
