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

const issueReportRateMap = new Map<string, { count: number; resetAt: number }>();
const ISSUE_REPORT_MAX_PER_WINDOW = 10;
const ISSUE_REPORT_WINDOW_MS = 60_000;

function checkIssueReportRate(ip: string): boolean {
  const now = Date.now();
  const entry = issueReportRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    issueReportRateMap.set(ip, { count: 1, resetAt: now + ISSUE_REPORT_WINDOW_MS });
    return true;
  }
  if (entry.count >= ISSUE_REPORT_MAX_PER_WINDOW) return false;
  entry.count += 1;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of issueReportRateMap) {
    if (now > entry.resetAt) issueReportRateMap.delete(ip);
  }
}, 60_000);

diagnostics.post('/issue-report', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown';
  if (!checkIssueReportRate(ip)) {
    return c.json({ code: 'rate_limited', message: 'Too many issue reports. Please wait before submitting another.' }, 429);
  }

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
