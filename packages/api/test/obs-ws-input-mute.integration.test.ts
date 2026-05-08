import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
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

/**
 * Integration test for the OBS-WS shim's SetInputMute / GetInputMute /
 * ToggleInputMute → LiveKit admin path. We boot a real ws server,
 * inject a stub MuteCommands implementation, drive the OBS-WS
 * Hello/Identify/Request flow with a real client, and assert the stub
 * received the right calls. No actual livekit-server-sdk network
 * traffic happens.
 */

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

interface StubCalls {
  setInput: Array<{ userId: string; inputName: string; muted: boolean }>;
  getInput: Array<{ userId: string; inputName: string }>;
  toggleInput: Array<{ userId: string; inputName: string }>;
}

const buildStubMute = (initialMuted = false): {
  commands: import('../src/integrations/obs-ws-compat/protocol').MuteCommands;
  calls: StubCalls;
  state: { muted: boolean };
} => {
  const calls: StubCalls = { setInput: [], getInput: [], toggleInput: [] };
  const state = { muted: initialMuted };
  const MIC_NAMES = new Set(['Mic', 'Microphone', 'Desktop Audio']);
  const commands: import('../src/integrations/obs-ws-compat/protocol').MuteCommands = {
    async setInputMute(userId, inputName, muted) {
      calls.setInput.push({ userId, inputName, muted });
      if (!MIC_NAMES.has(inputName)) return { kind: 'unknown_input' };
      state.muted = muted;
      return { kind: 'ok', muted };
    },
    async getInputMute(userId, inputName) {
      calls.getInput.push({ userId, inputName });
      if (!MIC_NAMES.has(inputName)) return { kind: 'unknown_input' };
      return { kind: 'ok', muted: state.muted };
    },
    async toggleInputMute(userId, inputName) {
      calls.toggleInput.push({ userId, inputName });
      if (!MIC_NAMES.has(inputName)) return { kind: 'unknown_input' };
      state.muted = !state.muted;
      return { kind: 'ok', muted: state.muted };
    },
  };
  return { commands, calls, state };
};

interface Harness {
  port: number;
  server: HttpServer;
  dispose: () => Promise<void>;
}

const buildHarness = async (
  shimServer: Awaited<ReturnType<typeof loadModules>>['server'],
  muteCommands: import('../src/integrations/obs-ws-compat/protocol').MuteCommands,
  streamCommands?: import('../src/integrations/obs-ws-compat/protocol').StreamCommands,
): Promise<Harness> => {
  const httpServer = createServer((_, res) => {
    res.statusCode = 404;
    res.end();
  });
  const detach = shimServer.attachObsWsShim(httpServer, {
    streamCommands:
      streamCommands ??
      ({
        getStreamStatus: () => ({ outputActive: false, outputDuration: 0 }),
        startStream: () => ({ ok: false, reason: 'no streams' }),
        stopStream: () => ({ ok: true, ended: false }),
      } as import('../src/integrations/obs-ws-compat/protocol').StreamCommands),
    muteCommands,
  });
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
}

const buildObsClient = async (
  url: string,
  password: string,
  protocolMod: Awaited<ReturnType<typeof loadModules>>['protocol'],
): Promise<ObsClient> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ws: any = new WebSocket(url);

  const inbox: Array<{ op: number; d: unknown }> = [];
  const waiters: Array<{
    predicate: (f: { op: number; d: unknown }) => boolean;
    resolve: (f: { op: number; d: unknown }) => void;
    timer: NodeJS.Timeout;
  }> = [];
  // Attach the message handler BEFORE awaiting open — Hello arrives
  // immediately on connection so any later listener attachment misses
  // it.
  ws.on('message', (data: Buffer | string) => {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    try {
      const frame = JSON.parse(text) as { op: number; d: unknown };
      inbox.push(frame);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(frame)) {
          clearTimeout(waiters[i].timer);
          waiters[i].resolve(frame);
          waiters.splice(i, 1);
        }
      }
    } catch {
      // ignore
    }
  });

  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  const send = (frame: { op: number; d: unknown }) =>
    ws.send(JSON.stringify(frame));

  const awaitFrame = <T = unknown>(
    predicate: (f: { op: number; d: unknown }) => boolean,
    timeoutMs = 1500,
  ): Promise<{ op: number; d: T }> =>
    new Promise<{ op: number; d: T }>((resolve, reject) => {
      for (const f of inbox) {
        if (predicate(f)) return resolve(f as { op: number; d: T });
      }
      const timer = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.timer === timer);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(new Error(`timeout awaiting frame; received: ${JSON.stringify(inbox)}`));
      }, timeoutMs);
      waiters.push({
        predicate,
        resolve: resolve as (f: { op: number; d: unknown }) => void,
        timer,
      });
    });

  // OBS-WS Hello/Identify dance.
  const hello = await awaitFrame<{ authentication: { challenge: string; salt: string } }>(
    (f) => f.op === protocolMod.Op.Hello,
  );
  const auth = protocolMod.computeClientAuth(
    password,
    hello.d.authentication.salt,
    hello.d.authentication.challenge,
  );
  send({
    op: protocolMod.Op.Identify,
    d: {
      rpcVersion: protocolMod.RPC_VERSION,
      authentication: auth,
    },
  });
  await awaitFrame((f) => f.op === protocolMod.Op.Identified);

  return {
    send,
    close: () => ws.close(),
    awaitFrame,
  };
};

const seedPasswordRow = async (
  passwordsMod: Awaited<ReturnType<typeof loadModules>>['passwords'],
  userId: string,
) => {
  const minted = passwordsMod.mint({
    blackoutUserId: userId,
    label: 'mute-test',
  });
  if (minted.kind !== 'ok') {
    throw new Error(`mint failed: ${minted.kind}`);
  }
  return { record: minted.record, password: minted.password };
};

const seedVoiceRoom = (
  db: Awaited<ReturnType<typeof loadModules>>['db'],
  userId: string,
): string => {
  const canopyId = randomUUID();
  const channelId = randomUUID();
  const livekitRoomName = `canopy-${canopyId}-channel-${channelId}`;
  db.createOrUpdateVoiceRoom({
    canopyId,
    channelId,
    createdBy: userId,
    livekitRoomName,
  });
  return livekitRoomName;
};

const setupSession = async () => {
  const mod = await loadModules();
  const user = await seedUser(mod.db);
  const created = await seedPasswordRow(mod.passwords, user.id);
  const stub = buildStubMute();
  seedVoiceRoom(mod.db, user.id);
  const harness = await buildHarness(mod.server, stub.commands);
  const client = await buildObsClient(
    `ws://127.0.0.1:${harness.port}/obs-ws/${created.record.id}`,
    created.password,
    mod.protocol,
  );
  return { mod, user, harness, client, stub };
};

test('SetInputMute(Mic, true) routes through to MuteCommands.setInputMute', async () => {
  const { harness, client, stub } = await setupSession();
  try {
    client.send({
      op: 6,
      d: {
        requestType: 'SetInputMute',
        requestId: 'r1',
        requestData: { inputName: 'Mic', inputMuted: true },
      },
    });
    const resp = await client.awaitFrame<{
      requestId: string;
      requestStatus: { result: boolean; code: number };
      responseData?: { inputMuted: boolean };
    }>((f) => f.op === 7 && (f.d as { requestId?: string }).requestId === 'r1');
    assert.equal(resp.d.requestStatus.result, true);
    assert.equal(resp.d.requestStatus.code, 100);
    assert.equal(resp.d.responseData?.inputMuted, true);
    assert.equal(stub.calls.setInput.length, 1);
    assert.equal(stub.calls.setInput[0]!.inputName, 'Mic');
    assert.equal(stub.calls.setInput[0]!.muted, true);
    client.close();
  } finally {
    await harness.dispose();
  }
});

test('SetInputMute(Microphone, true) routes through identically', async () => {
  const { harness, client, stub } = await setupSession();
  try {
    client.send({
      op: 6,
      d: {
        requestType: 'SetInputMute',
        requestId: 'r2',
        requestData: { inputName: 'Microphone', inputMuted: true },
      },
    });
    const resp = await client.awaitFrame<{
      requestStatus: { result: boolean };
      responseData?: { inputMuted: boolean };
    }>((f) => (f.d as { requestId?: string }).requestId === 'r2');
    assert.equal(resp.d.requestStatus.result, true);
    assert.equal(stub.calls.setInput[0]!.inputName, 'Microphone');
    client.close();
  } finally {
    await harness.dispose();
  }
});

test('SetInputMute(Desktop Audio, true) is treated as a mic-equivalent', async () => {
  const { harness, client, stub } = await setupSession();
  try {
    client.send({
      op: 6,
      d: {
        requestType: 'SetInputMute',
        requestId: 'r3',
        requestData: { inputName: 'Desktop Audio', inputMuted: true },
      },
    });
    const resp = await client.awaitFrame<{ requestStatus: { result: boolean } }>((f) =>
      (f.d as { requestId?: string }).requestId === 'r3',
    );
    assert.equal(resp.d.requestStatus.result, true);
    assert.equal(stub.calls.setInput[0]!.inputName, 'Desktop Audio');
    client.close();
  } finally {
    await harness.dispose();
  }
});

test('SetInputMute(NotAMic, true) returns NotImplemented from the stub', async () => {
  const { harness, client, stub } = await setupSession();
  try {
    client.send({
      op: 6,
      d: {
        requestType: 'SetInputMute',
        requestId: 'r4',
        requestData: { inputName: 'Browser Source', inputMuted: true },
      },
    });
    const resp = await client.awaitFrame<{
      requestStatus: { result: boolean; code: number; comment?: string };
    }>((f) => (f.d as { requestId?: string }).requestId === 'r4');
    assert.equal(resp.d.requestStatus.result, false);
    assert.equal(resp.d.requestStatus.code, 204);
    assert.equal(stub.calls.setInput.length, 1);
    client.close();
  } finally {
    await harness.dispose();
  }
});

test('GetInputMute(Mic) returns the stub-tracked muted state', async () => {
  const { harness, client, stub } = await setupSession();
  try {
    // Pre-mute via the stub.
    stub.state.muted = true;
    client.send({
      op: 6,
      d: {
        requestType: 'GetInputMute',
        requestId: 'r5',
        requestData: { inputName: 'Mic' },
      },
    });
    const resp = await client.awaitFrame<{
      requestStatus: { result: boolean; code: number };
      responseData?: { inputMuted: boolean };
    }>((f) => (f.d as { requestId?: string }).requestId === 'r5');
    assert.equal(resp.d.requestStatus.result, true);
    assert.equal(resp.d.responseData?.inputMuted, true);
    client.close();
  } finally {
    await harness.dispose();
  }
});

test('ToggleInputMute(Mic) flips state across two calls', async () => {
  const { harness, client, stub } = await setupSession();
  try {
    client.send({
      op: 6,
      d: {
        requestType: 'ToggleInputMute',
        requestId: 'r6a',
        requestData: { inputName: 'Mic' },
      },
    });
    const r6a = await client.awaitFrame<{ responseData?: { inputMuted: boolean } }>((f) =>
      (f.d as { requestId?: string }).requestId === 'r6a',
    );
    assert.equal(r6a.d.responseData?.inputMuted, true);

    client.send({
      op: 6,
      d: {
        requestType: 'ToggleInputMute',
        requestId: 'r6b',
        requestData: { inputName: 'Mic' },
      },
    });
    const r6b = await client.awaitFrame<{ responseData?: { inputMuted: boolean } }>((f) =>
      (f.d as { requestId?: string }).requestId === 'r6b',
    );
    assert.equal(r6b.d.responseData?.inputMuted, false);

    assert.equal(stub.calls.toggleInput.length, 2);
    client.close();
  } finally {
    await harness.dispose();
  }
});

test('SetInputMute without inputMuted boolean returns MissingRequestField', async () => {
  const { harness, client } = await setupSession();
  try {
    client.send({
      op: 6,
      d: {
        requestType: 'SetInputMute',
        requestId: 'r7',
        requestData: { inputName: 'Mic' },
      },
    });
    const resp = await client.awaitFrame<{
      requestStatus: { result: boolean; code: number };
    }>((f) => (f.d as { requestId?: string }).requestId === 'r7');
    assert.equal(resp.d.requestStatus.result, false);
    assert.equal(resp.d.requestStatus.code, 300);
    client.close();
  } finally {
    await harness.dispose();
  }
});

test('GetVersion advertises the new mute requests in availableRequests', async () => {
  const { harness, client } = await setupSession();
  try {
    client.send({
      op: 6,
      d: { requestType: 'GetVersion', requestId: 'r8', requestData: {} },
    });
    const resp = await client.awaitFrame<{
      responseData?: { availableRequests: string[] };
    }>((f) => (f.d as { requestId?: string }).requestId === 'r8');
    const requests = resp.d.responseData?.availableRequests ?? [];
    for (const id of ['SetInputMute', 'GetInputMute', 'ToggleInputMute']) {
      assert.ok(requests.includes(id), `expected ${id} in availableRequests`);
    }
    client.close();
  } finally {
    await harness.dispose();
  }
});
