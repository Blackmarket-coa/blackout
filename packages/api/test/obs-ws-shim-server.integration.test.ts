import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ws has no bundled types
import WebSocket from 'ws';
import { generateTestJwtSecret } from './_fixtures/secrets';

const KEY_V1 = randomBytes(32).toString('base64');

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${KEY_V1}`;

const loadModules = async () => {
  const secretBox = await import('../src/services/secretBox');
  secretBox.clearSecretBoxConfigCache();
  const passwords = await import('../src/services/obsWsPasswords');
  const protocol = await import('../src/integrations/obs-ws-compat/protocol');
  const server = await import('../src/integrations/obs-ws-compat/server');
  const store = await import('../src/db/store');
  store.db.obsWsPasswords.clear();
  return { passwords, protocol, server, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `obs-${id.slice(0, 4)}`,
    email: `obs-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

interface Harness {
  port: number;
  server: HttpServer;
  dispose: () => Promise<void>;
}

const buildHarness = async (
  shimServer: Awaited<ReturnType<typeof loadModules>>['server'],
): Promise<Harness> => {
  const httpServer = createServer((_, res) => {
    res.statusCode = 404;
    res.end();
  });
  const detach = shimServer.attachObsWsShim(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const port = (httpServer.address() as any).port as number;
  return {
    port,
    server: httpServer,
    dispose: async () => {
      detach();
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
};

interface ObsClient {
  send(frame: { op: number; d: unknown }): void;
  close(): void;
  awaitFrame<T = unknown>(
    predicate: (f: { op: number; d: unknown }) => boolean,
    timeoutMs?: number,
  ): Promise<{ op: number; d: T }>;
  awaitClose(timeoutMs?: number): Promise<{ code: number; reason: string }>;
}

const connectObs = async (url: string): Promise<ObsClient> => {
  const ws = new WebSocket(url);
  const received: Array<{ op: number; d: unknown }> = [];
  const waiters: Array<{
    predicate: (f: { op: number; d: unknown }) => boolean;
    resolve: (f: { op: number; d: unknown }) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  let closeInfo: { code: number; reason: string } | null = null;
  const closeWaiters: Array<{
    resolve: (info: { code: number; reason: string }) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  ws.on('message', (data: Buffer) => {
    try {
      const f = JSON.parse(data.toString('utf8')) as { op: number; d: unknown };
      received.push(f);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(f)) {
          clearTimeout(waiters[i].timer);
          waiters[i].resolve(f);
          waiters.splice(i, 1);
        }
      }
    } catch {
      // ignore non-JSON frames
    }
  });
  ws.on('close', (code: number, reason: Buffer) => {
    closeInfo = { code, reason: reason.toString('utf8') };
    for (const w of closeWaiters.splice(0)) {
      clearTimeout(w.timer);
      w.resolve(closeInfo);
    }
  });
  await once(ws, 'open');

  return {
    send: (frame) => ws.send(JSON.stringify(frame)),
    close: () => ws.close(),
    awaitFrame: (predicate, timeoutMs = 1500) =>
      new Promise((resolve, reject) => {
        for (const r of received) {
          if (predicate(r)) return resolve(r as never);
        }
        const timer = setTimeout(() => {
          const idx = waiters.findIndex((w) => w.timer === timer);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(new Error(`Timed out. Received: ${JSON.stringify(received)}`));
        }, timeoutMs);
        waiters.push({
          predicate,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resolve: resolve as any,
          reject,
          timer,
        });
      }),
    awaitClose: (timeoutMs = 1500) =>
      new Promise((resolve, reject) => {
        if (closeInfo) return resolve(closeInfo);
        const timer = setTimeout(
          () => reject(new Error('Timed out waiting for close')),
          timeoutMs,
        );
        closeWaiters.push({ resolve, reject, timer });
      }),
  };
};

// --------------------------- protocol layer tests --------------------------

test('computeClientAuth: round-trips between server expected and client computed', async () => {
  const { protocol } = await loadModules();
  const password = 'hunter2';
  const salt = protocol.randomBase64(16);
  const challenge = protocol.randomBase64(16);
  const clientResp = protocol.computeClientAuth(password, salt, challenge);
  assert.equal(clientResp, protocol.expectedAuthResponse(password, salt, challenge));
  // Different challenge → different response.
  assert.notEqual(
    clientResp,
    protocol.computeClientAuth(password, salt, protocol.randomBase64(16)),
  );
});

/** Build a minimal in-memory StreamCommands for protocol-layer unit tests. */
const buildFakeCommands = (initial: { active?: boolean; hasStream?: boolean } = {}) => {
  let active = !!initial.active;
  const hasStream = initial.hasStream ?? true;
  let startedAtMs = active ? Date.now() : 0;
  const calls: Array<{ kind: string; userId: string }> = [];
  const commands = {
    getStreamStatus: (userId: string) => {
      calls.push({ kind: 'getStreamStatus', userId });
      return {
        outputActive: active,
        outputDuration: active ? Date.now() - startedAtMs : 0,
        sessionId: active ? 'fake-session' : undefined,
        streamId: hasStream ? 'fake-stream' : undefined,
      };
    },
    startStream: (userId: string) => {
      calls.push({ kind: 'startStream', userId });
      if (!hasStream) return { ok: false as const, reason: 'No stream record yet' };
      if (!active) {
        active = true;
        startedAtMs = Date.now();
      }
      return { ok: true as const, sessionId: 'fake-session' };
    },
    stopStream: (userId: string) => {
      calls.push({ kind: 'stopStream', userId });
      const ended = active;
      active = false;
      return { ok: true as const, ended };
    },
  };
  return { commands, calls, isActive: () => active };
};

test('dispatchRequest: protocol-layer matrix covers GetVersion/GetStats and unknown', async () => {
  const { protocol } = await loadModules();
  const { commands } = buildFakeCommands();
  const ctx = { blackoutUserId: 'u', commands };
  const v = protocol.dispatchRequest('GetVersion', {}, ctx);
  assert.equal(v.status.code, protocol.REQ_STATUS.Success);
  assert.equal((v.responseData as { rpcVersion: number }).rpcVersion, 1);
  const s = protocol.dispatchRequest('GetStats', {}, ctx);
  assert.equal(s.status.code, protocol.REQ_STATUS.Success);
  const u = protocol.dispatchRequest('SetInputMute', {}, ctx);
  assert.equal(u.status.code, protocol.REQ_STATUS.NotImplemented);
  assert.equal(u.status.result, false);
});

test('dispatchRequest: stream control idempotency + status round-trip', async () => {
  const { protocol } = await loadModules();
  const fake = buildFakeCommands({ active: false });
  const ctx = { blackoutUserId: 'u', commands: fake.commands };

  // GetStreamStatus on fresh creator: outputActive=false.
  const before = protocol.dispatchRequest('GetStreamStatus', {}, ctx);
  assert.equal(before.status.code, protocol.REQ_STATUS.Success);
  assert.equal((before.responseData as { outputActive: boolean }).outputActive, false);

  // StartStream → ok; idempotent on second call.
  const first = protocol.dispatchRequest('StartStream', {}, ctx);
  assert.equal(first.status.code, protocol.REQ_STATUS.Success);
  assert.equal(fake.isActive(), true);
  const second = protocol.dispatchRequest('StartStream', {}, ctx);
  assert.equal(second.status.code, protocol.REQ_STATUS.Success);

  // GetStreamStatus reflects the active session.
  const mid = protocol.dispatchRequest('GetStreamStatus', {}, ctx);
  assert.equal((mid.responseData as { outputActive: boolean }).outputActive, true);

  // ToggleStream while live → stops.
  const toggled = protocol.dispatchRequest('ToggleStream', {}, ctx);
  assert.equal((toggled.responseData as { outputActive: boolean }).outputActive, false);

  // ToggleStream while offline → starts.
  const toggled2 = protocol.dispatchRequest('ToggleStream', {}, ctx);
  assert.equal((toggled2.responseData as { outputActive: boolean }).outputActive, true);

  // StopStream → offline.
  protocol.dispatchRequest('StopStream', {}, ctx);
  assert.equal(fake.isActive(), false);
});

test('dispatchRequest: StartStream returns NotReady when the creator has no stream record', async () => {
  const { protocol } = await loadModules();
  const fake = buildFakeCommands({ hasStream: false });
  const ctx = { blackoutUserId: 'u', commands: fake.commands };
  const out = protocol.dispatchRequest('StartStream', {}, ctx);
  assert.equal(out.status.result, false);
  assert.equal(out.status.code, protocol.REQ_STATUS.NotReady);
  assert.match(out.status.comment ?? '', /no stream record/i);
});

test('dispatchRequest: SetCurrentProgramScene Live↔Offline maps to Start/Stop; bad name → 400', async () => {
  const { protocol } = await loadModules();
  const fake = buildFakeCommands({ active: false });
  const ctx = { blackoutUserId: 'u', commands: fake.commands };

  const goLive = protocol.dispatchRequest(
    'SetCurrentProgramScene',
    { sceneName: 'Live' },
    ctx,
  );
  assert.equal(goLive.status.code, protocol.REQ_STATUS.Success);
  assert.equal(fake.isActive(), true);

  const goOffline = protocol.dispatchRequest(
    'SetCurrentProgramScene',
    { sceneName: 'Offline' },
    ctx,
  );
  assert.equal(goOffline.status.code, protocol.REQ_STATUS.Success);
  assert.equal(fake.isActive(), false);

  const bad = protocol.dispatchRequest(
    'SetCurrentProgramScene',
    { sceneName: 'GreenRoom' },
    ctx,
  );
  assert.equal(bad.status.result, false);
  assert.equal(bad.status.code, protocol.REQ_STATUS.InvalidRequestField);
});

test('dispatchRequest: GetSceneList + GetCurrentProgramScene reflect Live/Offline state', async () => {
  const { protocol } = await loadModules();
  const fake = buildFakeCommands({ active: false });
  const ctx = { blackoutUserId: 'u', commands: fake.commands };

  const list = protocol.dispatchRequest('GetSceneList', {}, ctx);
  assert.equal(list.status.code, protocol.REQ_STATUS.Success);
  const listData = list.responseData as {
    currentProgramSceneName: string;
    scenes: Array<{ sceneName: string }>;
  };
  assert.equal(listData.currentProgramSceneName, 'Offline');
  assert.deepEqual(
    listData.scenes.map((s) => s.sceneName).sort(),
    ['Live', 'Offline'],
  );

  fake.commands.startStream('u');
  const cur = protocol.dispatchRequest('GetCurrentProgramScene', {}, ctx);
  assert.equal(
    (cur.responseData as { currentProgramSceneName: string }).currentProgramSceneName,
    'Live',
  );
});

test('dispatchRequest: BroadcastCustomEvent accepts an object payload, rejects non-object', async () => {
  const { protocol } = await loadModules();
  const ctx = { blackoutUserId: 'u', commands: buildFakeCommands().commands };
  const ok = protocol.dispatchRequest(
    'BroadcastCustomEvent',
    { eventData: { theme: 'dark' } },
    ctx,
  );
  assert.equal(ok.status.code, protocol.REQ_STATUS.Success);
  // Omitted eventData is also fine.
  const ok2 = protocol.dispatchRequest('BroadcastCustomEvent', {}, ctx);
  assert.equal(ok2.status.code, protocol.REQ_STATUS.Success);
  // eventData must be an object when present.
  const bad = protocol.dispatchRequest(
    'BroadcastCustomEvent',
    { eventData: 'a string' },
    ctx,
  );
  assert.equal(bad.status.result, false);
  assert.equal(bad.status.code, protocol.REQ_STATUS.InvalidRequestField);
});

// --------------------------- service tests ---------------------------------

test('mint: returns plaintext password once; persists AES-GCM ciphertext; AAD binds the row', async () => {
  const { passwords, db } = await loadModules();
  const secretBox = await import('../src/services/secretBox');
  const user = await seedUser(db);
  const a = passwords.mint({ blackoutUserId: user.id, label: 'Stream Deck' });
  const b = passwords.mint({ blackoutUserId: user.id, label: 'Touch Portal' });
  if (a.kind !== 'ok' || b.kind !== 'ok') return assert.fail();
  assert.notEqual(a.password, b.password);
  // Encrypted-at-rest, key-id surfaced on the row.
  assert.match(a.record.passwordCiphertext, /^v1:/);
  assert.equal(a.record.encryptionKeyId, 'v1');
  // AAD-bound: A's envelope does not decrypt with B's AAD.
  assert.throws(() =>
    secretBox.decryptSecret(a.record.passwordCiphertext, {
      aad: passwords.__test__.aadFor(b.record.id),
    }),
  );
  // The decrypt helper round-trips with the matching record.
  assert.equal(passwords.decryptPasswordFor(a.record), a.password);
});

// --------------------------- end-to-end shim tests --------------------------

test('OBS-WS shim: bad password id returns HTTP 404 on upgrade (Companion-friendly)', async () => {
  const { server: shim } = await loadModules();
  const h = await buildHarness(shim);
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${h.port}/obs-ws/${randomUUID()}`);
    const errorOrClose = await new Promise<{ kind: 'error' | 'close'; payload: unknown }>(
      (resolve) => {
        ws.on('error', (err) => resolve({ kind: 'error', payload: err }));
        ws.on('close', (code: number) => resolve({ kind: 'close', payload: code }));
      },
    );
    // Either an upgrade-failed error or an immediate close — both are
    // acceptable (the OS / ws library report 404 differently).
    assert.ok(['error', 'close'].includes(errorOrClose.kind));
  } finally {
    await h.dispose();
  }
});

test('OBS-WS shim: end-to-end Hello → Identify with correct auth → Identified', async () => {
  const { passwords, protocol, server: shim, db } = await loadModules();
  const user = await seedUser(db);
  const minted = passwords.mint({ blackoutUserId: user.id });
  if (minted.kind !== 'ok') return assert.fail();
  const h = await buildHarness(shim);
  try {
    const obs = await connectObs(`ws://127.0.0.1:${h.port}/obs-ws/${minted.record.id}`);
    const hello = await obs.awaitFrame<{
      obsWebSocketVersion: string;
      authentication?: { challenge: string; salt: string };
    }>((f) => f.op === protocol.Op.Hello);
    assert.equal(hello.d.obsWebSocketVersion, protocol.OBS_WS_VERSION);
    assert.ok(hello.d.authentication);
    const challenge = hello.d.authentication!.challenge;
    const salt = hello.d.authentication!.salt;
    const authResponse = protocol.computeClientAuth(minted.password, salt, challenge);
    obs.send({
      op: protocol.Op.Identify,
      d: { rpcVersion: 1, authentication: authResponse, eventSubscriptions: 0 },
    });
    const identified = await obs.awaitFrame<{ negotiatedRpcVersion: number }>(
      (f) => f.op === protocol.Op.Identified,
    );
    assert.equal(identified.d.negotiatedRpcVersion, 1);
    obs.close();
  } finally {
    await h.dispose();
  }
});

test('OBS-WS shim: wrong auth → close 4009; pre-Identify Request → close 4002', async () => {
  const { passwords, protocol, server: shim, db } = await loadModules();
  const user = await seedUser(db);
  const minted = passwords.mint({ blackoutUserId: user.id });
  if (minted.kind !== 'ok') return assert.fail();
  const h = await buildHarness(shim);
  try {
    // wrong auth path
    const obs = await connectObs(`ws://127.0.0.1:${h.port}/obs-ws/${minted.record.id}`);
    await obs.awaitFrame((f) => f.op === protocol.Op.Hello);
    obs.send({
      op: protocol.Op.Identify,
      d: { rpcVersion: 1, authentication: 'definitely-not-the-right-response' },
    });
    const close = await obs.awaitClose();
    assert.equal(close.code, 4009);

    // pre-identify Request → close 4002
    const obs2 = await connectObs(`ws://127.0.0.1:${h.port}/obs-ws/${minted.record.id}`);
    await obs2.awaitFrame((f) => f.op === protocol.Op.Hello);
    obs2.send({
      op: protocol.Op.Request,
      d: { requestType: 'GetVersion', requestId: 'r1', requestData: {} },
    });
    const close2 = await obs2.awaitClose();
    assert.equal(close2.code, 4002);
  } finally {
    await h.dispose();
  }
});

test('OBS-WS shim: identified client gets RequestResponse for GetVersion; NotImplemented for unknown', async () => {
  const { passwords, protocol, server: shim, db } = await loadModules();
  const user = await seedUser(db);
  const minted = passwords.mint({ blackoutUserId: user.id });
  if (minted.kind !== 'ok') return assert.fail();
  const h = await buildHarness(shim);
  try {
    const obs = await connectObs(`ws://127.0.0.1:${h.port}/obs-ws/${minted.record.id}`);
    const hello = await obs.awaitFrame<{
      authentication?: { challenge: string; salt: string };
    }>((f) => f.op === protocol.Op.Hello);
    obs.send({
      op: protocol.Op.Identify,
      d: {
        rpcVersion: 1,
        authentication: protocol.computeClientAuth(
          minted.password,
          hello.d.authentication!.salt,
          hello.d.authentication!.challenge,
        ),
        eventSubscriptions: 0,
      },
    });
    await obs.awaitFrame((f) => f.op === protocol.Op.Identified);

    // GetVersion → Success.
    obs.send({
      op: protocol.Op.Request,
      d: { requestType: 'GetVersion', requestId: 'rq-1', requestData: {} },
    });
    const v = await obs.awaitFrame<{
      requestType: string;
      requestId: string;
      requestStatus: { result: boolean; code: number };
      responseData: { rpcVersion: number; obsWebSocketVersion: string };
    }>((f) => f.op === protocol.Op.RequestResponse && (f.d as { requestId: string }).requestId === 'rq-1');
    assert.equal(v.d.requestStatus.result, true);
    assert.equal(v.d.requestStatus.code, protocol.REQ_STATUS.Success);
    assert.equal(v.d.responseData.rpcVersion, 1);

    // Unimplemented request → NotImplemented (204). SetInputMute isn't
    // wired yet — surfaces seeing this gracefully grey out the button.
    obs.send({
      op: protocol.Op.Request,
      d: { requestType: 'SetInputMute', requestId: 'rq-2', requestData: {} },
    });
    const u = await obs.awaitFrame<{
      requestType: string;
      requestId: string;
      requestStatus: { result: boolean; code: number };
    }>((f) => f.op === protocol.Op.RequestResponse && (f.d as { requestId: string }).requestId === 'rq-2');
    assert.equal(u.d.requestStatus.result, false);
    assert.equal(u.d.requestStatus.code, protocol.REQ_STATUS.NotImplemented);
    obs.close();
  } finally {
    await h.dispose();
  }
});

test('OBS-WS shim end-to-end: StartStream creates a session, GetStreamStatus reflects it, StopStream ends it', async () => {
  const { passwords, protocol, server: shim, db } = await loadModules();
  const user = await seedUser(db);
  // Seed a stream record for the creator so StartStream isn't NotReady.
  const streamId = randomUUID();
  db.upsertStream({
    id: streamId,
    creatorId: user.id,
    state: 'offline',
    title: 'Test stream',
    tags: [],
    visibility: 'public',
    allowedSubscriberIds: [],
    latencyProfile: 'normal',
  });
  const minted = passwords.mint({ blackoutUserId: user.id });
  if (minted.kind !== 'ok') return assert.fail();
  const h = await buildHarness(shim);

  const sendRequest = async (
    obs: Awaited<ReturnType<typeof connectObs>>,
    requestType: string,
    requestData: Record<string, unknown> = {},
  ) => {
    const requestId = randomUUID();
    obs.send({ op: protocol.Op.Request, d: { requestType, requestId, requestData } });
    const resp = await obs.awaitFrame<{
      requestType: string;
      requestId: string;
      requestStatus: { result: boolean; code: number; comment?: string };
      responseData?: unknown;
    }>(
      (f) =>
        f.op === protocol.Op.RequestResponse &&
        (f.d as { requestId: string }).requestId === requestId,
    );
    return resp.d;
  };

  try {
    const obs = await connectObs(`ws://127.0.0.1:${h.port}/obs-ws/${minted.record.id}`);
    const hello = await obs.awaitFrame<{
      authentication?: { challenge: string; salt: string };
    }>((f) => f.op === protocol.Op.Hello);
    obs.send({
      op: protocol.Op.Identify,
      d: {
        rpcVersion: 1,
        authentication: protocol.computeClientAuth(
          minted.password,
          hello.d.authentication!.salt,
          hello.d.authentication!.challenge,
        ),
      },
    });
    await obs.awaitFrame((f) => f.op === protocol.Op.Identified);

    // GetStreamStatus on a fresh creator with a stream record but no
    // sessions: outputActive=false.
    let status = await sendRequest(obs, 'GetStreamStatus');
    assert.equal(status.requestStatus.result, true);
    assert.equal((status.responseData as { outputActive: boolean }).outputActive, false);
    assert.equal(db.listStreamSessions(streamId).length, 0);

    // StartStream → creates a session.
    const start = await sendRequest(obs, 'StartStream');
    assert.equal(start.requestStatus.result, true);
    assert.equal(db.listStreamSessions(streamId).length, 1);
    assert.equal(db.listStreamSessions(streamId)[0].endedAt, undefined);

    // Idempotent: a second StartStream does NOT create a duplicate session.
    const start2 = await sendRequest(obs, 'StartStream');
    assert.equal(start2.requestStatus.result, true);
    assert.equal(db.listStreamSessions(streamId).length, 1);

    // GetStreamStatus reflects the live session.
    status = await sendRequest(obs, 'GetStreamStatus');
    assert.equal((status.responseData as { outputActive: boolean }).outputActive, true);

    // SetCurrentProgramScene: 'Offline' → ends the session.
    const goOffline = await sendRequest(obs, 'SetCurrentProgramScene', {
      sceneName: 'Offline',
    });
    assert.equal(goOffline.requestStatus.result, true);
    assert.ok(db.listStreamSessions(streamId)[0].endedAt);

    // GetSceneList reflects the new state (Offline).
    const list = await sendRequest(obs, 'GetSceneList');
    assert.equal(
      (list.responseData as { currentProgramSceneName: string }).currentProgramSceneName,
      'Offline',
    );
    obs.close();
  } finally {
    await h.dispose();
  }
});

test('OBS-WS shim end-to-end: StartStream returns NotReady when creator has no stream record', async () => {
  const { passwords, protocol, server: shim, db } = await loadModules();
  const user = await seedUser(db);
  const minted = passwords.mint({ blackoutUserId: user.id });
  if (minted.kind !== 'ok') return assert.fail();
  const h = await buildHarness(shim);
  try {
    const obs = await connectObs(`ws://127.0.0.1:${h.port}/obs-ws/${minted.record.id}`);
    const hello = await obs.awaitFrame<{
      authentication?: { challenge: string; salt: string };
    }>((f) => f.op === protocol.Op.Hello);
    obs.send({
      op: protocol.Op.Identify,
      d: {
        rpcVersion: 1,
        authentication: protocol.computeClientAuth(
          minted.password,
          hello.d.authentication!.salt,
          hello.d.authentication!.challenge,
        ),
      },
    });
    await obs.awaitFrame((f) => f.op === protocol.Op.Identified);
    obs.send({
      op: protocol.Op.Request,
      d: { requestType: 'StartStream', requestId: 's1', requestData: {} },
    });
    const resp = await obs.awaitFrame<{
      requestStatus: { result: boolean; code: number; comment?: string };
    }>(
      (f) =>
        f.op === protocol.Op.RequestResponse &&
        (f.d as { requestId: string }).requestId === 's1',
    );
    assert.equal(resp.d.requestStatus.result, false);
    assert.equal(resp.d.requestStatus.code, protocol.REQ_STATUS.NotReady);
    assert.match(resp.d.requestStatus.comment ?? '', /no stream record/i);
    obs.close();
  } finally {
    await h.dispose();
  }
});

test('OBS-WS shim: revoking a password while connected does not crash, and prevents new connections', async () => {
  const { passwords, protocol, server: shim, db } = await loadModules();
  const user = await seedUser(db);
  const minted = passwords.mint({ blackoutUserId: user.id });
  if (minted.kind !== 'ok') return assert.fail();
  const h = await buildHarness(shim);
  try {
    const obs = await connectObs(`ws://127.0.0.1:${h.port}/obs-ws/${minted.record.id}`);
    const hello = await obs.awaitFrame<{
      authentication?: { challenge: string; salt: string };
    }>((f) => f.op === protocol.Op.Hello);
    obs.send({
      op: protocol.Op.Identify,
      d: {
        rpcVersion: 1,
        authentication: protocol.computeClientAuth(
          minted.password,
          hello.d.authentication!.salt,
          hello.d.authentication!.challenge,
        ),
      },
    });
    await obs.awaitFrame((f) => f.op === protocol.Op.Identified);

    // Revoke. Existing session keeps working (it's already authed and
    // we don't poll mid-session), but a fresh connect is rejected at
    // upgrade with 404.
    passwords.revoke(user.id, minted.record.id);
    obs.close();

    const ws = new WebSocket(`ws://127.0.0.1:${h.port}/obs-ws/${minted.record.id}`);
    const result = await new Promise<{ ok: boolean }>((resolve) => {
      ws.on('error', () => resolve({ ok: false }));
      ws.on('close', () => resolve({ ok: false }));
      ws.on('open', () => resolve({ ok: true }));
    });
    assert.equal(result.ok, false);
  } finally {
    await h.dispose();
  }
});

test('notifyStreamStarted/Ended: pushes StreamStateChanged Event (op 5) to identified sessions for the user', async () => {
  const { passwords, protocol, server: shim, db } = await loadModules();
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const aPw = passwords.mint({ blackoutUserId: alice.id, label: 'Stream Deck' });
  const bPw = passwords.mint({ blackoutUserId: bob.id, label: 'Companion' });
  if (aPw.kind !== 'ok' || bPw.kind !== 'ok') return assert.fail();

  const h = await buildHarness(shim);
  try {
    // alice fully identifies.
    const aliceObs = await connectObs(`ws://127.0.0.1:${h.port}/obs-ws/${aPw.record.id}`);
    const aHello = await aliceObs.awaitFrame<{
      authentication?: { challenge: string; salt: string };
    }>((f) => f.op === protocol.Op.Hello);
    aliceObs.send({
      op: protocol.Op.Identify,
      d: {
        rpcVersion: 1,
        authentication: protocol.computeClientAuth(
          aPw.password,
          aHello.d.authentication!.salt,
          aHello.d.authentication!.challenge,
        ),
      },
    });
    await aliceObs.awaitFrame((f) => f.op === protocol.Op.Identified);

    // bob fully identifies on a separate user.
    const bobObs = await connectObs(`ws://127.0.0.1:${h.port}/obs-ws/${bPw.record.id}`);
    const bHello = await bobObs.awaitFrame<{
      authentication?: { challenge: string; salt: string };
    }>((f) => f.op === protocol.Op.Hello);
    bobObs.send({
      op: protocol.Op.Identify,
      d: {
        rpcVersion: 1,
        authentication: protocol.computeClientAuth(
          bPw.password,
          bHello.d.authentication!.salt,
          bHello.d.authentication!.challenge,
        ),
      },
    });
    await bobObs.awaitFrame((f) => f.op === protocol.Op.Identified);

    // Pre-Identify session: connects to alice's URL but never sends Identify.
    // It must NOT receive the Event because OBS-WS clients ignore mid-handshake
    // pushes and we shouldn't leak state to unauthenticated peers.
    const preIdentObs = await connectObs(`ws://127.0.0.1:${h.port}/obs-ws/${aPw.record.id}`);
    await preIdentObs.awaitFrame((f) => f.op === protocol.Op.Hello);

    // Fire the StreamStateChanged push for alice.
    shim.notifyStreamStarted(alice.id);

    const aliceEvent = await aliceObs.awaitFrame<{
      eventType: string;
      eventIntent: number;
      eventData: { outputActive: boolean; outputState: string };
    }>((f) => f.op === protocol.Op.Event);
    assert.equal(aliceEvent.d.eventType, 'StreamStateChanged');
    assert.equal(aliceEvent.d.eventData.outputActive, true);
    assert.equal(aliceEvent.d.eventData.outputState, 'OBS_WEBSOCKET_OUTPUT_STARTED');

    // Now the Ended event.
    shim.notifyStreamEnded(alice.id);
    const aliceEnded = await aliceObs.awaitFrame<{
      eventType: string;
      eventData: { outputActive: boolean; outputState: string };
    }>(
      (f) =>
        f.op === protocol.Op.Event &&
        (f.d as { eventData: { outputState: string } }).eventData.outputState ===
          'OBS_WEBSOCKET_OUTPUT_STOPPED',
    );
    assert.equal(aliceEnded.d.eventData.outputActive, false);

    // bob (different user) must NOT have received either event. Wait
    // briefly and assert no Event op shows up on bob's stream.
    await new Promise((r) => setTimeout(r, 50));
    let bobReceivedAnyEvent = false;
    try {
      await bobObs.awaitFrame((f) => f.op === protocol.Op.Event, 100);
      bobReceivedAnyEvent = true;
    } catch {
      // expected — timeout means no Event arrived
    }
    assert.equal(bobReceivedAnyEvent, false, 'cross-user push isolation');

    aliceObs.close();
    bobObs.close();
    preIdentObs.close();
  } finally {
    await h.dispose();
  }
});

test('listSessionsForUser: scopes to caller; only includes identified sessions; matches the password row', async () => {
  const { passwords, protocol, server: shim, db } = await loadModules();
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const aPw = passwords.mint({ blackoutUserId: alice.id, label: 'Stream Deck' });
  const bPw = passwords.mint({ blackoutUserId: bob.id, label: 'Companion' });
  if (aPw.kind !== 'ok' || bPw.kind !== 'ok') return assert.fail();

  const h = await buildHarness(shim);
  try {
    // alice's surface fully completes Hello/Identify.
    const aliceObs = await connectObs(`ws://127.0.0.1:${h.port}/obs-ws/${aPw.record.id}`);
    const aHello = await aliceObs.awaitFrame<{
      authentication?: { challenge: string; salt: string };
    }>((f) => f.op === protocol.Op.Hello);
    aliceObs.send({
      op: protocol.Op.Identify,
      d: {
        rpcVersion: 1,
        authentication: protocol.computeClientAuth(
          aPw.password,
          aHello.d.authentication!.salt,
          aHello.d.authentication!.challenge,
        ),
      },
    });
    await aliceObs.awaitFrame((f) => f.op === protocol.Op.Identified);

    // bob's surface ALSO identifies (separate user).
    const bobObs = await connectObs(`ws://127.0.0.1:${h.port}/obs-ws/${bPw.record.id}`);
    const bHello = await bobObs.awaitFrame<{
      authentication?: { challenge: string; salt: string };
    }>((f) => f.op === protocol.Op.Hello);
    bobObs.send({
      op: protocol.Op.Identify,
      d: {
        rpcVersion: 1,
        authentication: protocol.computeClientAuth(
          bPw.password,
          bHello.d.authentication!.salt,
          bHello.d.authentication!.challenge,
        ),
      },
    });
    await bobObs.awaitFrame((f) => f.op === protocol.Op.Identified);

    // pre-Identify session: connect to alice's URL but never send Identify.
    await connectObs(`ws://127.0.0.1:${h.port}/obs-ws/${aPw.record.id}`);

    // alice sees ONE session — her identified one — keyed by her password id.
    const aliceSnaps = shim.listSessionsForUser(alice.id);
    assert.equal(aliceSnaps.length, 1);
    assert.equal(aliceSnaps[0].passwordId, aPw.record.id);
    assert.ok(aliceSnaps[0].connectedAt > 0);
    assert.ok(aliceSnaps[0].identifiedAt >= aliceSnaps[0].connectedAt);

    // bob sees only his own.
    const bobSnaps = shim.listSessionsForUser(bob.id);
    assert.equal(bobSnaps.length, 1);
    assert.equal(bobSnaps[0].passwordId, bPw.record.id);

    aliceObs.close();
    bobObs.close();
  } finally {
    await h.dispose();
  }
});
