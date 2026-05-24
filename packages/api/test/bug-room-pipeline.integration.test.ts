import test from 'node:test';
import assert from 'node:assert/strict';
import {
  postWidgetReportToBugRoom,
  readBugRoomConfig,
  __test__,
  type WidgetReportInput,
  type BugRoomConfig,
  type MatrixPoster,
} from '../src/services/bugRoomPipeline';

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
      ...overrides,
    };
  }
}

const makeMatrix = (overrides: Partial<MatrixPoster> = {}): MatrixHarness => new MatrixHarness(overrides);

test('happy path: posts report, seeds triage thread + status reaction, returns link', async () => {
  const harness = makeMatrix();
  const out = await postWidgetReportToBugRoom(baseInput, { config: baseConfig, matrix: harness.mx });

  assert.equal(out.ok, true);
  assert.equal(out.roomId, '!bugs:example.org');
  assert.equal(out.eventId, '$evt1');
  assert.ok(out.messageLink?.includes('matrix.to'));
  assert.equal(out.threadSeeded, true);
  assert.equal(out.reactionSeeded, true);
  assert.equal(out.devNoop, false);

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
  const out = await postWidgetReportToBugRoom(input, { config: baseConfig, matrix: harness.mx });
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
  const out = await postWidgetReportToBugRoom(input, { config: tiny, matrix: harness.mx });
  assert.equal(out.ok, true);
  assert.equal(out.attachmentPosted, false);
  assert.equal(harness.uploads, 0);
});

test('dev no-op: matrix not configured → ok with devNoop, no posts', async () => {
  const harness = makeMatrix({
    resolveRoomAlias: async () => ({ ok: false, reason: 'matrix_not_configured' }),
  });
  const noRoomConfig: BugRoomConfig = { ...baseConfig, roomId: null };
  const out = await postWidgetReportToBugRoom(baseInput, { config: noRoomConfig, matrix: harness.mx });
  assert.equal(out.ok, true);
  assert.equal(out.devNoop, true);
  assert.equal(out.eventId, null);
  assert.equal(harness.calls.length, 0);
});

test('resolves the #bugs alias when no room id is configured', async () => {
  const harness = makeMatrix();
  const aliasConfig: BugRoomConfig = { ...baseConfig, roomId: null };
  const out = await postWidgetReportToBugRoom(baseInput, { config: aliasConfig, matrix: harness.mx });
  assert.equal(out.roomId, '!resolved-#bugs:example.org');
});

test('report post failure surfaces as not-ok', async () => {
  const harness = makeMatrix({
    sendEvent: async () => ({ ok: false, status: 502 }),
  });
  const out = await postWidgetReportToBugRoom(baseInput, { config: baseConfig, matrix: harness.mx });
  assert.equal(out.ok, false);
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
