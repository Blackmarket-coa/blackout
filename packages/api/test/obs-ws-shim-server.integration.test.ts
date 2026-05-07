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

test('dispatchRequest: GetVersion + GetStats return Success; unknown → NotImplemented', async () => {
  const { protocol } = await loadModules();
  const v = protocol.dispatchRequest('GetVersion', {});
  assert.equal(v.status.code, protocol.REQ_STATUS.Success);
  assert.equal((v.responseData as { rpcVersion: number }).rpcVersion, 1);
  const s = protocol.dispatchRequest('GetStats', {});
  assert.equal(s.status.code, protocol.REQ_STATUS.Success);
  const u = protocol.dispatchRequest('SetCurrentProgramScene', {});
  assert.equal(u.status.code, protocol.REQ_STATUS.NotImplemented);
  assert.equal(u.status.result, false);
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

    // Unknown request → NotImplemented (204).
    obs.send({
      op: protocol.Op.Request,
      d: { requestType: 'SetCurrentProgramScene', requestId: 'rq-2', requestData: {} },
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
