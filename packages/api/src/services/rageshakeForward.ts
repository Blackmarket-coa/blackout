/**
 * Forward a bug report to a matrix-org/rageshake-compatible receiver.
 * Rageshake accepts multipart/form-data with `text`, `app`, `version`,
 * plus arbitrary log files. We forward the raw user text + diagnostics
 * so the durable evidence trail keeps unscrubbed values; the GitHub
 * mirror gets a scrubbed copy.
 *
 * Returns the parsed `report_id` on success (rageshake's response is
 * `{"report_url": "...", "report_id": "..."}` for JSON-aware servers;
 * plain rageshake replies text/plain "OK" with no body, in which case
 * we return null IDs).
 */

export interface RageshakeLogFile {
  readonly id: string;
  readonly lines: string;
}

export interface RageshakeForwardInput {
  readonly app: string;
  readonly version: string;
  readonly userText: string;
  readonly logs: readonly RageshakeLogFile[];
  readonly context?: Readonly<Record<string, string>>;
}

export interface RageshakeForwardResult {
  readonly rageshakeId: string | null;
  readonly reportUrl: string | null;
}

export class RageshakeForwardError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'RageshakeForwardError';
  }
}

export interface RageshakeForwardDeps {
  readonly fetchFn?: typeof fetch;
}

export const forwardToRageshake = async (
  endpoint: string,
  input: RageshakeForwardInput,
  deps: RageshakeForwardDeps = {},
): Promise<RageshakeForwardResult> => {
  const fetchFn = deps.fetchFn ?? fetch;
  const form = new FormData();
  form.set('text', input.userText);
  form.set('app', input.app);
  form.set('version', input.version);
  if (input.context) {
    for (const [k, v] of Object.entries(input.context)) {
      form.set(k, v);
    }
  }
  for (const file of input.logs) {
    form.append('log', new Blob([file.lines], { type: 'text/plain' }), `${file.id}.log`);
  }

  const res = await fetchFn(endpoint, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new RageshakeForwardError(res.status, `rageshake ${res.status}: ${text || res.statusText}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await res.json().catch(() => null)) as
      | { report_id?: string; report_url?: string }
      | null;
    return {
      rageshakeId: body?.report_id ?? null,
      reportUrl: body?.report_url ?? null,
    };
  }
  // Plain rageshake servers reply with "OK\n" — there's no usable ID, but
  // success is still success.
  return { rageshakeId: null, reportUrl: null };
};
