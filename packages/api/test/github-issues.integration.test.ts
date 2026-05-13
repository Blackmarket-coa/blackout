import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createPublicKey, createVerify } from 'node:crypto';
import {
  getGithubAuthToken,
  readGithubAuthConfig,
  __test__,
} from '../src/integrations/github/installationToken';
import { createIssue, GithubIssueError } from '../src/integrations/github/issues';

const generateRsaKeyPair = () =>
  generateKeyPairSync('rsa', { modulusLength: 2048 });

test('readGithubAuthConfig prefers App config when all three vars are present', () => {
  const env = {
    GITHUB_APP_ID: '12345',
    GITHUB_APP_INSTALLATION_ID: '67890',
    GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nfoo\\n-----END PRIVATE KEY-----\\n',
    GITHUB_BUG_REPORT_PAT: 'ghp_should_be_ignored',
  } as NodeJS.ProcessEnv;
  const cfg = readGithubAuthConfig(env);
  assert.ok(cfg);
  assert.equal(cfg.mode, 'app');
  if (cfg.mode === 'app') {
    // literal \n escapes are normalized to real newlines
    assert.ok(cfg.privateKey.includes('\n'));
    assert.ok(!cfg.privateKey.includes('\\n'));
  }
});

test('readGithubAuthConfig falls back to PAT when App vars are unset', () => {
  const cfg = readGithubAuthConfig({ GITHUB_BUG_REPORT_PAT: 'ghp_x' } as NodeJS.ProcessEnv);
  assert.deepEqual(cfg, { mode: 'pat', token: 'ghp_x' });
});

test('readGithubAuthConfig returns null when nothing is configured', () => {
  assert.equal(readGithubAuthConfig({} as NodeJS.ProcessEnv), null);
});

test('getGithubAuthToken returns the PAT directly without minting', async () => {
  __test__.resetCache();
  const out = await getGithubAuthToken({ mode: 'pat', token: 'ghp_x' });
  assert.deepEqual(out, { mode: 'pat', token: 'ghp_x', expiresAt: null });
});

test('App JWT is RS256-signed and verifiable against the public key', () => {
  const { privateKey, publicKey } = generateRsaKeyPair();
  const jwt = __test__.signAppJwt({
    mode: 'app',
    appId: '42',
    installationId: '99',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  });
  const [header, payload, signature] = jwt.split('.');
  const pub = createPublicKey(publicKey.export({ type: 'spki', format: 'pem' }));
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${header}.${payload}`);
  verifier.end();
  assert.ok(verifier.verify(pub, Buffer.from(signature, 'base64url')));
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(decoded.iss, '42');
});

test('getGithubAuthToken caches the installation token and refreshes near expiry', async () => {
  __test__.resetCache();
  // Pre-load the cache with a not-yet-expired token so the function returns it
  // without making any HTTP call.
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
  __test__.setCache({ mode: 'app', token: 'cached', expiresAt: fiveMinutesFromNow });
  const cachedHit = await getGithubAuthToken({
    mode: 'app',
    appId: '1',
    installationId: '1',
    privateKey: 'unused-because-cache-hits',
  });
  assert.equal(cachedHit.token, 'cached');

  // Set the cache to a token that's about to expire (within the 60 s refresh
  // window) and confirm a refresh would be attempted — we don't run the real
  // exchange here, but resetting the cache to a near-expiry value and calling
  // again with a bogus private key should throw, proving the path goes back
  // to the network.
  __test__.setCache({ mode: 'app', token: 'stale', expiresAt: Date.now() + 1000 });
  await assert.rejects(
    getGithubAuthToken({
      mode: 'app',
      appId: '1',
      installationId: '1',
      privateKey: 'not-a-real-pem',
    }),
  );
  __test__.resetCache();
});

test('createIssue posts to the issues endpoint and returns html_url + number', async () => {
  let captured: { url: string; init: RequestInit } | null = null;
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    captured = { url: String(url), init: init ?? {} };
    return new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/o/r/issues/42' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const out = await createIssue(
    { owner: 'o', repo: 'r', title: 't', body: 'b', labels: ['bug', 'user-reported'] },
    { config: { mode: 'pat', token: 'ghp_x' }, fetchFn: fakeFetch },
  );
  assert.equal(out.issueUrl, 'https://github.com/o/r/issues/42');
  assert.equal(out.issueNumber, 42);
  assert.ok(captured);
  assert.equal(captured!.url, 'https://api.github.com/repos/o/r/issues');
  const headers = captured!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer ghp_x');
  const body = JSON.parse(String(captured!.init.body));
  assert.equal(body.title, 't');
  assert.deepEqual(body.labels, ['bug', 'user-reported']);
});

test('createIssue surfaces non-2xx as GithubIssueError(status)', async () => {
  const fakeFetch = (async () =>
    new Response('forbidden', { status: 403, statusText: 'Forbidden' })) as typeof fetch;
  await assert.rejects(
    () =>
      createIssue(
        { owner: 'o', repo: 'r', title: 't', body: 'b' },
        { config: { mode: 'pat', token: 'ghp_x' }, fetchFn: fakeFetch },
      ),
    (err: unknown) => err instanceof GithubIssueError && err.status === 403,
  );
});

test('createIssue throws GithubIssueError(0) when no auth is configured', async () => {
  await assert.rejects(
    () => createIssue({ owner: 'o', repo: 'r', title: 't', body: 'b' }, { config: null }),
    (err: unknown) => err instanceof GithubIssueError && err.status === 0,
  );
});
