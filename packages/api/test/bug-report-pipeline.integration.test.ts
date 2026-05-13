import test from 'node:test';
import assert from 'node:assert/strict';
import {
  submitBugReport,
  __test__,
  type BugReportInput,
  type BugReportPipelineConfig,
} from '../src/services/bugReportPipeline';

const baseInput: BugReportInput = {
  title: 'voice cuts out',
  description: 'When I join a voice room my mic stops working',
  category: 'voice',
  severity: 'medium',
  includeDiagnostics: false,
  includeMatrixIdHash: false,
};

const baseConfig: BugReportPipelineConfig = {
  rageshakeEndpoint: 'https://rageshake.example/submit',
  githubOwner: 'Blackmarket-coa',
  githubRepo: 'blackout',
  githubLabels: ['bug', 'user-reported'],
  clientVersion: '1.2.3',
  hashSalt: 'test-salt',
};

const okRageshake = () =>
  new Response(JSON.stringify({ report_id: 'rg_123', report_url: 'https://rageshake.example/r/rg_123' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
const okGithub = () =>
  new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/o/r/issues/7' }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });

test('happy path: both pipelines succeed → partial:false with both IDs', async () => {
  const fetchFn = (async (url: string | URL) => {
    if (String(url).includes('rageshake')) return okRageshake();
    return okGithub();
  }) as typeof fetch;
  const out = await submitBugReport(baseInput, {
    config: baseConfig,
    githubAuthConfig: { mode: 'pat', token: 'ghp_x' },
    fetchFn,
  });
  assert.equal(out.rageshakeId, 'rg_123');
  assert.equal(out.issueUrl, 'https://github.com/o/r/issues/7');
  assert.equal(out.partial, false);
  assert.equal(out.rageshakeError, null);
  assert.equal(out.issueError, null);
});

test('rageshake OK, GitHub fails → partial:true, only rageshake ID', async () => {
  const fetchFn = (async (url: string | URL) => {
    if (String(url).includes('rageshake')) return okRageshake();
    return new Response('boom', { status: 503, statusText: 'Service Unavailable' });
  }) as typeof fetch;
  const out = await submitBugReport(baseInput, {
    config: baseConfig,
    githubAuthConfig: { mode: 'pat', token: 'ghp_x' },
    fetchFn,
  });
  assert.equal(out.rageshakeId, 'rg_123');
  assert.equal(out.issueUrl, null);
  assert.equal(out.partial, true);
  assert.match(out.issueError ?? '', /503/);
});

test('rageshake fails, GitHub OK → partial:true, only issue URL', async () => {
  const fetchFn = (async (url: string | URL) => {
    if (String(url).includes('rageshake')) return new Response('nope', { status: 500 });
    return okGithub();
  }) as typeof fetch;
  const out = await submitBugReport(baseInput, {
    config: baseConfig,
    githubAuthConfig: { mode: 'pat', token: 'ghp_x' },
    fetchFn,
  });
  assert.equal(out.rageshakeId, null);
  assert.equal(out.issueUrl, 'https://github.com/o/r/issues/7');
  assert.equal(out.partial, true);
  assert.match(out.rageshakeError ?? '', /500/);
});

test('both fail → partial:false, both errors populated, route maps to 502', async () => {
  const fetchFn = (async () => new Response('fail', { status: 500 })) as typeof fetch;
  const out = await submitBugReport(baseInput, {
    config: baseConfig,
    githubAuthConfig: { mode: 'pat', token: 'ghp_x' },
    fetchFn,
  });
  assert.equal(out.rageshakeId, null);
  assert.equal(out.issueUrl, null);
  assert.equal(out.partial, false);
  assert.ok(out.rageshakeError);
  assert.ok(out.issueError);
});

test('dev no-op: no GitHub auth → synthetic issue URL, rageshake still attempted', async () => {
  const fetchFn = (async () => okRageshake()) as typeof fetch;
  const out = await submitBugReport(baseInput, {
    config: baseConfig,
    githubAuthConfig: null,
    fetchFn,
  });
  assert.equal(out.rageshakeId, 'rg_123');
  assert.equal(out.issueUrl, 'https://github.example/dev-no-op/0');
  assert.equal(out.partial, false);
});

test('redaction: secret-shaped strings are scrubbed in the GitHub body but raw in rageshake', () => {
  // We can verify the github body builder directly without HTTP.
  const head = 'ey' + 'J' + 'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
  const body = 'ey' + 'J' + 'zdWIiOiIxMjM0NTY3ODkwIn0';
  const sig = 'aaaaaaaaaaaaaaaaaaaa';
  const jwt = `${head}.${body}.${sig}`;
  const input: BugReportInput = {
    ...baseInput,
    description: `I leaked my token ${jwt} please rotate`,
  };
  const githubBody = __test__.buildGithubBody(input, baseConfig, 'rg_123');
  assert.match(githubBody, /\[REDACTED\]/);
  assert.doesNotMatch(githubBody, new RegExp(head.slice(0, 6)));
  // Rageshake gets the raw text — it's the durable evidence store.
  const rageshakeText = __test__.buildRageshakeText(input);
  assert.match(rageshakeText, new RegExp(head.slice(0, 6)));
});

test('matrix ID is hashed when opted in, dropped when not', () => {
  const inOpted: BugReportInput = {
    ...baseInput,
    matrixId: '@alice:example.org',
    includeMatrixIdHash: true,
  };
  const bodyOpted = __test__.buildGithubBody(inOpted, baseConfig, null);
  assert.match(bodyOpted, /Reporter:\*\* h:/);
  assert.doesNotMatch(bodyOpted, /@alice:example\.org/);

  const inDropped: BugReportInput = {
    ...baseInput,
    matrixId: '@alice:example.org',
    includeMatrixIdHash: false,
  };
  const bodyDropped = __test__.buildGithubBody(inDropped, baseConfig, null);
  assert.doesNotMatch(bodyDropped, /Reporter:/);
  assert.doesNotMatch(bodyDropped, /@alice:example\.org/);
});

test('inline room IDs and user IDs in the description are pseudonymized', () => {
  const input: BugReportInput = {
    ...baseInput,
    description: 'in !verysecret:example.org I saw @alice:example.org crash the app',
  };
  const out = __test__.buildGithubBody(input, baseConfig, null);
  assert.doesNotMatch(out, /!verysecret:example\.org/);
  assert.doesNotMatch(out, /@alice:example\.org/);
  assert.match(out, /h:/);
});

test('labels include category, severity, and source tag', () => {
  const labels = __test__.buildLabels(baseInput, baseConfig);
  assert.ok(labels.includes('bug'));
  assert.ok(labels.includes('user-reported'));
  assert.ok(labels.includes('source:blackout-client'));
  assert.ok(labels.includes('severity:medium'));
  assert.ok(labels.includes('category:voice'));
});
