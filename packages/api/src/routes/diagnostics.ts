import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readJsonBody } from '../middleware/validate';
import { getAuthUser } from '../middleware/require-user';
import { redactIssueReport } from '../services/diagnosticsRedaction';
import { log } from '../telemetry/logger';

const diagnostics = new Hono();

const issueReportSchema = z.object({
  description: z.string().min(1).max(8 * 1024),
  url: z.string().max(1024).optional(),
  userAgent: z.string().max(512).optional(),
  appVersion: z.string().max(64).optional(),
  buildChannel: z.string().max(64).optional(),
  lastError: z.string().max(4 * 1024).optional(),
  featureFlags: z.record(z.string(), z.boolean()).optional(),
});

/**
 * POST /v1/diagnostics/issue-report
 *
 * Anonymous-allowed endpoint that accepts a user issue report. The body is
 * redacted server-side as defense-in-depth and emitted via the structured
 * logger so operators can pick it up via their existing log pipeline. We
 * intentionally do not persist reports in the application DB — the log line
 * is the canonical record.
 */
diagnostics.post('/issue-report', async (c) => {
  const parsed = await readJsonBody(c, issueReportSchema);
  if (parsed instanceof Response) return parsed;

  const reportId = randomUUID();
  const redacted = redactIssueReport(parsed);
  const user = getAuthUser(c);

  log.info('issue_report_received', {
    reportId,
    userId: user?.sub ?? null,
    ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    ...redacted,
  });

  return c.json({ ok: true, reportId }, 202);
});

export default diagnostics;
