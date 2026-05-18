/**
 * Bug-report dual-forward pipeline.
 *
 * 1. Always attempt rageshake first (it owns the durable raw logs).
 * 2. Then attempt GitHub with a *scrubbed* markdown body. Drop matrix IDs,
 *    pseudonymize room IDs, redact secret-shaped strings.
 * 3. If exactly one succeeds, return `partial: true` with the surviving
 *    ID. If both fail, the caller maps that to 502.
 *
 * Dev no-op: when no GitHub auth is configured, `createIssue` short-circuits
 * to a synthetic URL so end-to-end UI flow works without external services.
 */

import { redactString, redactObject } from '@blackout/core/redaction';
import { createHash } from 'node:crypto';
import { createIssue, GithubIssueError } from '../integrations/github/issues';
import { readGithubAuthConfig } from '../integrations/github/installationToken';
import { forwardToRageshake, RageshakeForwardError } from './rageshakeForward';
import { log } from '../telemetry/logger';

export type BugReportCategory = 'ui' | 'voice' | 'matrix' | 'marketplace' | 'other';
export type BugReportSeverity = 'low' | 'medium' | 'high';

export interface BugReportDiagnostics {
  readonly clientVersion: string;
  readonly userAgent: string;
  readonly platform: string;
  readonly consoleTail: readonly string[];
  readonly currentPath?: string;
  readonly buildChannel?: string;
  readonly lastError?: string | null;
  readonly featureFlagsFingerprint?: string;
}

export interface BugReportInput {
  readonly title: string;
  readonly description: string;
  readonly category: BugReportCategory;
  readonly severity: BugReportSeverity;
  readonly includeDiagnostics: boolean;
  readonly includeMatrixIdHash: boolean;
  readonly matrixId?: string;
  readonly diagnostics?: BugReportDiagnostics;
  readonly screenshotBase64?: string;
}

export interface BugReportOutcome {
  readonly rageshakeId: string | null;
  readonly rageshakeError: string | null;
  readonly issueUrl: string | null;
  readonly issueError: string | null;
  readonly partial: boolean;
}

export interface BugReportPipelineConfig {
  readonly rageshakeEndpoint: string | null;
  readonly githubOwner: string;
  readonly githubRepo: string;
  readonly githubLabels: readonly string[];
  readonly clientVersion: string;
  readonly hashSalt: string;
}

export const readBugReportConfig = (env: NodeJS.ProcessEnv = process.env): BugReportPipelineConfig => ({
  rageshakeEndpoint: env.RAGESHAKE_ENDPOINT_URL?.trim() || null,
  githubOwner: env.GITHUB_BUG_REPORT_OWNER?.trim() || 'Blackmarket-coa',
  githubRepo: env.GITHUB_BUG_REPORT_REPO?.trim() || 'blackout',
  githubLabels: (env.GITHUB_BUG_REPORT_LABELS ?? 'bug,user-reported')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  clientVersion: env.npm_package_version ?? 'unknown',
  hashSalt: env.LOG_HASH_SALT ?? 'blackout-log-salt',
});

const hashWithSalt = (salt: string) => (value: string): string =>
  `h:${createHash('sha256').update(salt).update(value).digest('base64url').slice(0, 16)}`;

const buildGithubBody = (
  input: BugReportInput,
  cfg: BugReportPipelineConfig,
  rageshakeId: string | null,
): string => {
  const hash = hashWithSalt(cfg.hashSalt);
  const scrub = (s: string) => redactString(s, { pseudonymize: true, hash });

  const lines: string[] = [];
  lines.push(`**Category:** ${input.category}`);
  lines.push(`**Severity:** ${input.severity}`);
  if (input.includeMatrixIdHash && input.matrixId) {
    lines.push(`**Reporter:** ${hash(input.matrixId)}`);
  }
  lines.push('');
  lines.push('## Description');
  lines.push(scrub(input.description));

  if (input.includeDiagnostics && input.diagnostics) {
    const d = redactObject(input.diagnostics, { pseudonymize: true, hash });
    lines.push('');
    lines.push('## Diagnostics');
    lines.push(`- Client version: \`${d.clientVersion}\``);
    lines.push(`- Platform: \`${d.platform}\``);
    lines.push(`- User-Agent: \`${d.userAgent}\``);
    if (typeof d.currentPath === 'string') lines.push(`- Path: \`${d.currentPath}\``);
    if (typeof d.buildChannel === 'string') lines.push(`- Build channel: \`${d.buildChannel}\``);
    if (typeof d.featureFlagsFingerprint === 'string') {
      lines.push(`- Feature flags: \`${d.featureFlagsFingerprint}\``);
    }
    if (typeof d.lastError === 'string' && d.lastError.length > 0) {
      lines.push(`- Last captured error: \`${d.lastError.slice(0, 500)}\``);
    }
    if (d.consoleTail.length > 0) {
      lines.push('');
      lines.push('<details><summary>Console tail (last 50)</summary>');
      lines.push('');
      lines.push('```');
      for (const line of d.consoleTail) lines.push(line);
      lines.push('```');
      lines.push('</details>');
    }
  }

  if (rageshakeId) {
    lines.push('');
    lines.push(`> Linked log bundle: \`${rageshakeId}\``);
  }
  return lines.join('\n');
};

const buildLabels = (input: BugReportInput, cfg: BugReportPipelineConfig): string[] => [
  ...cfg.githubLabels,
  'source:blackout-client',
  `severity:${input.severity}`,
  `category:${input.category}`,
];

const buildRageshakeText = (input: BugReportInput): string =>
  // Rageshake receives raw user text + a structured tail of the report so
  // operators can re-paste into a GitHub issue if the parallel post failed.
  [
    `# ${input.title}`,
    `category=${input.category} severity=${input.severity}`,
    '',
    input.description,
  ].join('\n');

const buildRageshakeLogs = (input: BugReportInput): { id: string; lines: string }[] => {
  if (!input.includeDiagnostics || !input.diagnostics) return [];
  return [
    {
      id: 'console-tail',
      lines: input.diagnostics.consoleTail.join('\n'),
    },
  ];
};

export interface BugReportPipelineDeps {
  readonly config?: BugReportPipelineConfig;
  readonly fetchFn?: typeof fetch;
  readonly githubAuthConfig?: ReturnType<typeof readGithubAuthConfig>;
}

const DEV_NOOP_URL = 'https://github.example/dev-no-op/0';

export const submitBugReport = async (
  input: BugReportInput,
  deps: BugReportPipelineDeps = {},
): Promise<BugReportOutcome> => {
  const cfg = deps.config ?? readBugReportConfig();
  const githubAuthConfig = deps.githubAuthConfig ?? readGithubAuthConfig();

  let rageshakeId: string | null = null;
  let rageshakeError: string | null = null;
  if (cfg.rageshakeEndpoint) {
    try {
      const out = await forwardToRageshake(
        cfg.rageshakeEndpoint,
        {
          app: 'blackout-client',
          version: input.diagnostics?.clientVersion ?? cfg.clientVersion,
          userText: buildRageshakeText(input),
          logs: buildRageshakeLogs(input),
          context: {
            category: input.category,
            severity: input.severity,
          },
        },
        { fetchFn: deps.fetchFn },
      );
      rageshakeId = out.rageshakeId;
    } catch (err) {
      rageshakeError = err instanceof RageshakeForwardError ? err.message : String(err);
      log.warn('bug_report.rageshake_failed', { error: rageshakeError });
    }
  } else {
    rageshakeError = 'rageshake endpoint not configured';
  }

  let issueUrl: string | null = null;
  let issueError: string | null = null;

  if (!githubAuthConfig) {
    issueUrl = DEV_NOOP_URL;
    log.info('bug_report.github_noop', { reason: 'no_auth_configured' });
  } else {
    try {
      const result = await createIssue(
        {
          owner: cfg.githubOwner,
          repo: cfg.githubRepo,
          title: input.title,
          body: buildGithubBody(input, cfg, rageshakeId),
          labels: buildLabels(input, cfg),
        },
        { config: githubAuthConfig, fetchFn: deps.fetchFn },
      );
      issueUrl = result.issueUrl;
    } catch (err) {
      issueError = err instanceof GithubIssueError ? err.message : String(err);
      log.warn('bug_report.github_failed', { error: issueError });
    }
  }

  const rageshakeOk = rageshakeId !== null || (cfg.rageshakeEndpoint === null);
  const githubOk = issueUrl !== null;
  const partial = (rageshakeOk && !githubOk) || (!rageshakeOk && githubOk);

  return {
    rageshakeId,
    rageshakeError: rageshakeOk ? null : rageshakeError,
    issueUrl,
    issueError: githubOk ? null : issueError,
    partial,
  };
};

export const __test__ = { buildGithubBody, buildLabels, buildRageshakeText };
