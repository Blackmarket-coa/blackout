import { Dimensions, Platform } from 'react-native';
import { buildServiceUrl } from './apiConfig';
import { getSession } from './session';

// The widget intake is mounted top-level on the API (`/bug-report/widget`),
// outside the `/api` prefix, so it uses buildServiceUrl rather than buildApiUrl.
const WIDGET_REPORT_PATH = '/bug-report/widget';

export interface NativeWidgetReportInput {
  description: string;
  steps?: string;
  suggestions?: string;
}

export type NativeReportResult =
  | { kind: 'ok'; messageLink: string | null; devNoop: boolean }
  | { kind: 'rate_limited' }
  | { kind: 'error'; message: string };

const buildMetadata = () => {
  const { width, height } = Dimensions.get('window');
  return {
    clientVersion: 'blackout-mobile',
    userAgent: `blackout-native/${Platform.OS}`,
    platform: `${Platform.OS} ${String(Platform.Version)}`,
    screenWidth: Math.round(width),
    screenHeight: Math.round(height),
  };
};

export async function submitWidgetReport(input: NativeWidgetReportInput): Promise<NativeReportResult> {
  const session = getSession();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (session.token) headers.authorization = `Bearer ${session.token}`;

  const body = {
    description: input.description.trim(),
    steps: input.steps?.trim() || undefined,
    suggestions: input.suggestions?.trim() || undefined,
    metadata: buildMetadata(),
  };

  let response: Response;
  try {
    response = await fetch(buildServiceUrl(WIDGET_REPORT_PATH), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { kind: 'error', message: (err as Error).message || 'Network error' };
  }

  if (response.status === 429) return { kind: 'rate_limited' };
  if (!response.ok) {
    return { kind: 'error', message: `Could not send report (${response.status})` };
  }
  const json = (await response.json().catch(() => ({}))) as {
    messageLink?: string | null;
    devNoop?: boolean;
  };
  return { kind: 'ok', messageLink: json.messageLink ?? null, devNoop: json.devNoop ?? false };
}

export const isNativeReportSubmittable = (description: string): boolean =>
  description.trim().length >= 10 && description.trim().length <= 8_000;
