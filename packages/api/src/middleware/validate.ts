import type { Context } from 'hono';
import type { ZodType } from 'zod';

type ZodIssue = { path: ReadonlyArray<PropertyKey>; message: string; code: string };

const formatIssues = (issues: ReadonlyArray<ZodIssue>) =>
  issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
    code: issue.code,
  }));

export async function readJsonBody<T>(
  c: Context,
  schema: ZodType<T>,
): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ code: 'invalid_request', message: 'Request body must be valid JSON' }, 400);
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return c.json(
      {
        code: 'invalid_request',
        message: 'Request body failed validation',
        details: { issues: formatIssues(result.error.issues) },
      },
      400,
    );
  }

  return result.data;
}

export function readQuery<T>(c: Context, schema: ZodType<T>): T | Response {
  const result = schema.safeParse(c.req.query());
  if (!result.success) {
    return c.json(
      {
        code: 'invalid_request',
        message: 'Query parameters failed validation',
        details: { issues: formatIssues(result.error.issues) },
      },
      400,
    );
  }
  return result.data;
}
