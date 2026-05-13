/**
 * Thin GitHub Issues client. Uses the auth token from
 * `installationToken.ts` and posts to `/repos/:owner/:repo/issues`.
 * Returns the issue URL + number; throws GithubIssueError on non-2xx.
 */

import {
  GithubAuthError,
  getGithubAuthToken,
  readGithubAuthConfig,
  type GithubAuthConfig,
} from './installationToken';

export interface CreateIssueInput {
  readonly owner: string;
  readonly repo: string;
  readonly title: string;
  readonly body: string;
  readonly labels?: readonly string[];
}

export interface CreateIssueResult {
  readonly issueUrl: string;
  readonly issueNumber: number;
}

export class GithubIssueError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'GithubIssueError';
  }
}

interface IssueResponse {
  number: number;
  html_url: string;
}

export interface CreateIssueDeps {
  readonly config?: GithubAuthConfig | null;
  readonly fetchFn?: typeof fetch;
}

export const createIssue = async (
  input: CreateIssueInput,
  deps: CreateIssueDeps = {},
): Promise<CreateIssueResult> => {
  const config = deps.config ?? readGithubAuthConfig();
  if (!config) {
    throw new GithubIssueError(0, 'github auth not configured');
  }
  const fetchFn = deps.fetchFn ?? fetch;

  let auth;
  try {
    auth = await getGithubAuthToken(config);
  } catch (err) {
    if (err instanceof GithubAuthError) {
      throw new GithubIssueError(err.status, `github auth failed: ${err.message}`);
    }
    throw err;
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/issues`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: auth.mode === 'app' ? `token ${auth.token}` : `Bearer ${auth.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'blackout-api',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      labels: input.labels && input.labels.length > 0 ? [...input.labels] : undefined,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GithubIssueError(res.status, `create_issue ${res.status}: ${text || res.statusText}`);
  }
  const body = (await res.json()) as IssueResponse;
  return { issueUrl: body.html_url, issueNumber: body.number };
};
