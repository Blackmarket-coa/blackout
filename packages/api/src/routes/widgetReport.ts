import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { createRateLimit } from '../middleware/rate-limit';
import { postWidgetReportToBugRoom } from '../services/bugRoomPipeline';

// ~8 MB of base64 ≈ 6 MB of bytes; the pipeline enforces the real byte cap.
const MAX_ATTACHMENT_B64 = 11_500_000;

const widgetReportSchema = z.object({
  description: z.string().min(10).max(8_000),
  steps: z.string().max(4_000).optional(),
  suggestions: z.string().max(4_000).optional(),
  reporterMatrixId: z.string().max(255).optional(),
  includeReporterHash: z.boolean().optional(),
  metadata: z.object({
    clientVersion: z.string().max(64),
    userAgent: z.string().max(512),
    platform: z.string().max(64),
    screenWidth: z.number().int().nonnegative().max(100_000),
    screenHeight: z.number().int().nonnegative().max(100_000),
    currentPath: z.string().max(512).optional(),
    currentRoomId: z.string().max(255).optional(),
    buildChannel: z.string().max(32).optional(),
  }),
  attachment: z
    .object({
      filename: z.string().min(1).max(255),
      contentType: z.string().regex(/^(image|video|audio)\/[A-Za-z0-9.+-]+$/),
      base64: z.string().min(1).max(MAX_ATTACHMENT_B64),
    })
    .optional(),
});

const parseLimit = (raw: string | undefined, fallback: number): number => {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const widgetReport = new Hono();

// Soft limit: 5 reports/hour/IP. On exceed the middleware returns 429 with
// Retry-After; the client surfaces a friendly "slow down" message and keeps
// the form usable rather than blocking it.
widgetReport.use(
  '*',
  createRateLimit({
    bucket: 'bug-report-widget',
    windowMs: 60 * 60 * 1000,
    maxRequests: parseLimit(process.env.BUG_REPORT_RATE_LIMIT_MAX, 5),
  }),
);

widgetReport.post('/', async (c) => {
  const parsed = await readJsonBody(c, widgetReportSchema);
  if (parsed instanceof Response) return parsed;
  const outcome = await postWidgetReportToBugRoom(parsed);
  return c.json(outcome, outcome.ok ? 200 : 502);
});

export default widgetReport;
