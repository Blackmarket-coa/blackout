import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { createRateLimit } from '../middleware/rate-limit';
import { submitBugReport } from '../services/bugReportPipeline';

const bugReportSchema = z.object({
  title: z.string().min(3).max(140),
  description: z.string().min(10).max(8_000),
  category: z.enum(['ui', 'voice', 'matrix', 'marketplace', 'other']),
  severity: z.enum(['low', 'medium', 'high']),
  includeDiagnostics: z.boolean(),
  includeMatrixIdHash: z.boolean(),
  matrixId: z.string().max(255).optional(),
  diagnostics: z
    .object({
      clientVersion: z.string().max(64),
      userAgent: z.string().max(512),
      platform: z.string().max(64),
      consoleTail: z.array(z.string().max(2_000)).max(50),
    })
    .optional(),
  screenshotBase64: z.string().max(1_400_000).optional(),
});

const parseLimit = (raw: string | undefined, fallback: number): number => {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const bugReport = new Hono();

bugReport.use(
  '*',
  createRateLimit({
    bucket: 'bug-report',
    windowMs: 60 * 60 * 1000,
    maxRequests: parseLimit(process.env.BUG_REPORT_RATE_LIMIT_MAX, 5),
  }),
);

bugReport.post('/', async (c) => {
  const parsed = await readJsonBody(c, bugReportSchema);
  if (parsed instanceof Response) return parsed;
  const outcome = await submitBugReport(parsed);
  const anySuccess = outcome.rageshakeId !== null || outcome.issueUrl !== null;
  return c.json(outcome, anySuccess ? 200 : 502);
});

export default bugReport;
