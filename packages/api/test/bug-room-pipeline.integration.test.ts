import test from 'node:test';
import assert from 'node:assert/strict';
import {
  postWidgetReportToBugRoom,
  readBugRoomConfig,
  __test__,
  type WidgetReportInput,
  type BugRoomConfig,
  type MatrixPoster,
  type WidgetGithubForwarder,
} from '../src/services/bugRoomPipeline';

// Default GitHub forwarder for tests: a successful issue. Individual tests
// override it to exercise the dual-sink / double-failure behavior. Injecting it
// keeps these unit tests hermetic (no ambient env / network through the real
// `submitBugReport`).
const githubOk: WidgetGithubForwarder = async () => ({
  issueUrl: 'https://github.test/blackout/issues/1',
  issueError: null,
});
const githubFail: WidgetGithubForwarder = async () => ({
  issueUrl: null,
  issueError: 'github unavailable',
});

const baseInput: WidgetReportInput = {
  description: 'The compose box freezes when I paste an image',
  steps: '1. open a room\n2. paste a screenshot',
  suggestions: 'maybe debounce the paste handler',
  metadata: {
    clientVersion: '4.10.5',
    userAgent: 'Mozilla/5.0',
    platform: 'Linux x86_64',
    screenWidth: 1920,
    screenHeight: 1080,
    currentPath: '/communities/abc/dens/xyz',
    buildChannel: 'production',
  },
};

const baseConfig: BugRoomConfig = {
  roomId: '!bugs:example.org',
  roomAlias: '#bugs:example.org',
  hashSalt: 'test-salt',
  maxAttachmentBytes: 8 * 1024 * 1024,
};

interface Call {
  roomId: string;
  content: Record<string, unknown>;
  eventType?: string;
}

class MatrixHarness {
  readonly calls: Call[] = [];
  readonly created: { aliasLocalpart?: string; name?: string; topic?: string }[] = [];
  readonly joins: { roomId: string; userId: string }[] = [];
  uploads = 0;
  readonly mx: MatrixPoster;

  constructor(overrides: Partial<MatrixPoster> = {}) {
    this.mx = {
      resolveRoomAlias: async (alias: string) => ({ ok: true, roomId: `!resolved-${alias}` }),
      uploadContent: async () => {
        this.uploads += 1;
        return { ok: true, contentUri: 'mxc://example.org/abc123' };
      },
      sendEvent: async (roomId, content, options) => {
        this.calls.push({ roomId, content, eventType: options?.eventType });
        return { ok: true, status: 200, eventId: `$evt${this.calls.length}` };
      },
      botUserId: async () => '@bot:example.org',
      createRoom: async (input) => {
        this.created.push(input);
        return { ok: true, roomId: '!created:example.org' };
      },
      adminJoinUserToRoom: async (roomId, userId) => {
        this.joins.push({ roomId, userId });
        return { ok: true, status: 200 };
      },
      ...overrides,
    };
  }
}

const makeMatrix = (overrides: Partial<MatrixPoster> = {}): MatrixHarness => new MatrixHarness(overrides);

// Run the pipeline with the harness' poster + a default-success GitHub leg.
const run = (
  input: WidgetReportInput,
  harness: MatrixHarness,
  opts: { config?: BugRoomConfig; forwardToGithub?: WidgetGithubForwarder } = {},
) =>
  postWidgetReportToBugRoom(input, {
    config: opts.config ?? baseConfig,
    matrix: harness.mx,
    forwardToGithub: opts.forwardToGithub ?? githubOk,
  });

test('happy path: posts report, seeds triage thread + status reaction, returns link', async () => {
  const harness = makeMatrix();
  const out = await run(baseInput, harness);

  assert.equal(out.ok, true);
  assert.equal(out.roomId, '!bugs:example.org');
  assert.equal(out.eventId, '$evt1');
  assert.ok(out.messageLink?.includes('matrix.to'));
  assert.equal(out.threadSeeded, true);
  assert.equal(out.reactionSeeded, true);
  assert.equal(out.devNoop, false);
  assert.equal(out.issueUrl, 'https://github.test/blackout/issues/1');

  // 3 sendEvent calls: report message, triage thread reply, reaction.
  assert.equal(harness.calls.length, 3);
  const [report, thread, reaction] = harness.calls;
  assert.equal(report.content.msgtype, 'm.text');
  assert.equal((thread.content['m.relates_to'] as { rel_type: string }).rel_type, 'm.thread');
  assert.equal(reaction.eventType, 'm.reaction');
  assert.equal(
    (reaction.content['m.relates_to'] as { key: string; event_id: string }).event_id,
    '$evt1',
  );
});

test('attachment is uploaded and posted as a thread reply', async () => {
  const harness = makeMatrix();
  const input: WidgetReportInput = {
    ...baseInput,
    attachment: {
      filename: 'shot.png',
      contentType: 'image/png',
      base64: Buffer.from('hello world').toString('base64'),
    },
  };
  const out = await run(input, harness);
  assert.equal(out.attachmentPosted, true);
  assert.equal(harness.uploads, 1);

  const attachmentCall = harness.calls.find((c) => c.content.msgtype === 'm.image');
  assert.ok(attachmentCall);
  assert.equal(attachmentCall?.content.url, 'mxc://example.org/abc123');
  assert.equal(
    (attachmentCall?.content['m.relates_to'] as { rel_type: string }).rel_type,
    'm.thread',
  );
});

test('oversized attachment is skipped without failing the report', async () => {
  const harness = makeMatrix();
  const tiny: BugRoomConfig = { ...baseConfig, maxAttachmentBytes: 4 };
  const input: WidgetReportInput = {
    ...baseInput,
    attachment: {
      filename: 'big.png',
      contentType: 'image/png',
      base64: Buffer.from('way too many bytes here').toString('base64'),
    },
  };
  const out = await run(input, harness, { config: tiny });
  assert.equal(out.ok, true);
  assert.equal(out.attachmentPosted, false);
  assert.equal(harness.uploads, 0);
});

test('dev no-op: matrix not configured → ok with devNoop, no Matrix posts or room creation', async () => {
  const harness = makeMatrix({
    resolveRoomAlias: async () => ({ ok: false, reason: 'matrix_not_configured' }),
  });
  const noRoomConfig: BugRoomConfig = { ...baseConfig, roomId: null };
  const out = await run(baseInput, harness, { config: noRoomConfig });
  assert.equal(out.ok, true);
  assert.equal(out.devNoop, true);
  assert.equal(out.eventId, null);
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.created.length, 0);
});

test('resolves the #bugs alias when no room id is configured', async () => {
  const harness = makeMatrix();
  const aliasConfig: BugRoomConfig = { ...baseConfig, roomId: null };
  const out = await run(baseInput, harness, { config: aliasConfig });
  assert.equal(out.roomId, '!resolved-#bugs:example.org');
  assert.equal(harness.created.length, 0);
});

test('derives the #bugs domain from the bot MXID when only the blackout.local default is set', async () => {
  const harness = makeMatrix({ botUserId: async () => '@bot:real.example' });
  // This is the config readBugRoomConfig produces when MATRIX_HOMESERVER_DOMAIN
  // is unset — the alias would otherwise never resolve against the real server.
  const cfg: BugRoomConfig = { ...baseConfig, roomId: null, roomAlias: '#bugs:blackout.local' };
  const out = await run(baseInput, harness, { config: cfg });
  assert.equal(out.roomId, '!resolved-#bugs:real.example');
});

test('keeps an explicitly-configured alias domain (no MXID override)', async () => {
  const harness = makeMatrix({ botUserId: async () => '@bot:real.example' });
  const cfg: BugRoomConfig = { ...baseConfig, roomId: null, roomAlias: '#bugs:configured.example' };
  const out = await run(baseInput, harness, { config: cfg });
  assert.equal(out.roomId, '!resolved-#bugs:configured.example');
});

test('self-heal: creates #bugs when the alias cannot be resolved, then posts there', async () => {
  const harness = makeMatrix({
    resolveRoomAlias: async () => ({ ok: false, status: 404, reason: 'alias_not_found' }),
  });
  const aliasConfig: BugRoomConfig = { ...baseConfig, roomId: null };
  const out = await run(baseInput, harness, { config: aliasConfig });

  assert.equal(out.ok, true);
  assert.equal(harness.created.length, 1);
  assert.equal(harness.created[0]?.aliasLocalpart, 'bugs');
  assert.equal(out.roomId, '!created:example.org');
  assert.equal(out.eventId, '$evt1');
});

test('self-heal: a 403 admin-joins the bot into #bugs and retries the post', async () => {
  let attempts = 0;
  const harness = makeMatrix({
    sendEvent: async () => {
      attempts += 1;
      // First report post is rejected (bot not a member); after the admin-join
      // the retry — and the follow-up thread/reaction posts — succeed.
      if (attempts === 1) return { ok: false, status: 403 };
      return { ok: true, status: 200, eventId: `$evt${attempts}` };
    },
  });
  const out = await run(baseInput, harness);

  assert.equal(out.ok, true);
  assert.equal(harness.joins.length, 1);
  assert.equal(harness.joins[0]?.userId, '@bot:example.org');
  assert.equal(out.eventId, '$evt2');
});

test('matrix post failure still succeeds via the GitHub leg (partial)', async () => {
  const harness = makeMatrix({
    // A non-403 failure is not self-heal-able, so the Matrix leg fails outright.
    sendEvent: async () => ({ ok: false, status: 502 }),
  });
  const out = await run(baseInput, harness, { forwardToGithub: githubOk });
  assert.equal(out.ok, true);
  assert.equal(out.eventId, null);
  assert.equal(out.issueUrl, 'https://github.test/blackout/issues/1');
  assert.match(out.error ?? '', /502/);
});

test('both sinks failing surfaces as not-ok', async () => {
  const harness = makeMatrix({
    sendEvent: async () => ({ ok: false, status: 502 }),
  });
  const out = await run(baseInput, harness, { forwardToGithub: githubFail });
  assert.equal(out.ok, false);
  assert.equal(out.issueUrl, null);
  assert.match(out.error ?? '', /502/);
});

test('redaction: tokens scrubbed, room/user ids pseudonymized in the body', () => {
  const head = 'ey' + 'J' + 'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
  const body = 'ey' + 'J' + 'zdWIiOiIxMjM0NTY3ODkwIn0';
  const sig = 'aaaaaaaaaaaaaaaaaaaa';
  const jwt = `${head}.${body}.${sig}`;
  const input: WidgetReportInput = {
    ...baseInput,
    description: `token ${jwt} leaked in !secret:example.org by @bob:example.org`,
  };
  const msg = __test__.buildReportMessage(input, baseConfig);
  assert.match(msg.body, /\[REDACTED\]/);
  assert.doesNotMatch(msg.body, /!secret:example\.org/);
  assert.doesNotMatch(msg.body, /@bob:example\.org/);
  assert.doesNotMatch(msg.formattedBody, new RegExp(head.slice(0, 6)));
});

test('title derives from the first non-empty description line', () => {
  assert.equal(__test__.buildReportTitle('\n\n  paste freezes  \nmore detail'), 'paste freezes');
  assert.equal(__test__.buildReportTitle(''), 'Bug report');
});

test('reporter hash only included when opted in', () => {
  const opted = __test__.buildReportMessage(
    { ...baseInput, reporterMatrixId: '@alice:example.org', includeReporterHash: true },
    baseConfig,
  );
  assert.match(opted.body, /Reporter: h:/);
  assert.doesNotMatch(opted.body, /@alice:example\.org/);

  const notOpted = __test__.buildReportMessage(
    { ...baseInput, reporterMatrixId: '@alice:example.org', includeReporterHash: false },
    baseConfig,
  );
  assert.doesNotMatch(notOpted.body, /Reporter:/);
});

test('attachment msgtype maps by content type', () => {
  assert.equal(__test__.attachmentMsgType('image/png'), 'm.image');
  assert.equal(__test__.attachmentMsgType('video/mp4'), 'm.video');
  assert.equal(__test__.attachmentMsgType('application/pdf'), 'm.file');
});

test('readBugRoomConfig defaults the alias from the homeserver domain', () => {
  const cfg = readBugRoomConfig({ MATRIX_HOMESERVER_DOMAIN: 'blk.example' } as NodeJS.ProcessEnv);
  assert.equal(cfg.roomAlias, '#bugs:blk.example');
  assert.equal(cfg.roomId, null);
});
