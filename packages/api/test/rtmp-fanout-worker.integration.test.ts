import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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
  const destinations = await import('../src/services/simulcastDestinations');
  const worker = await import('../src/services/rtmpFanoutWorker');
  const store = await import('../src/db/store');
  worker.__test__.reset();
  store.db.simulcastDestinations.clear();
  return { destinations, worker, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `f-${id.slice(0, 4)}`,
    email: `f-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

interface FakeChild {
  args: { input: string; target: string };
  killCalls: NodeJS.Signals[];
  exitListeners: Array<(code: number | null, signal: NodeJS.Signals | null) => void>;
  errorListeners: Array<(err: Error) => void>;
  stderrListeners: Array<(chunk: Buffer | string) => void>;
  emitStderr(line: string): void;
  emitExit(code: number | null, signal?: NodeJS.Signals | null): void;
  emitError(err: Error): void;
}

const buildFakeFactory = () => {
  const spawned: FakeChild[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const factory = ((args: any) => {
    const exitListeners: FakeChild['exitListeners'] = [];
    const errorListeners: FakeChild['errorListeners'] = [];
    const stderrListeners: FakeChild['stderrListeners'] = [];
    const killCalls: NodeJS.Signals[] = [];
    const child: FakeChild = {
      args,
      killCalls,
      exitListeners,
      errorListeners,
      stderrListeners,
      emitStderr: (line) => {
        for (const l of stderrListeners) l(line);
      },
      emitExit: (code, signal = null) => {
        for (const l of exitListeners) l(code, signal);
      },
      emitError: (err) => {
        for (const l of errorListeners) l(err);
      },
    };
    spawned.push(child);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle: any = {
      kill: (signal: NodeJS.Signals = 'SIGTERM') => killCalls.push(signal),
      on: (event: string, listener: (...args: unknown[]) => void) => {
        if (event === 'exit') exitListeners.push(listener as never);
        else if (event === 'error') errorListeners.push(listener as never);
      },
      stderr: {
        on: (_event: string, listener: (chunk: Buffer | string) => void) => {
          stderrListeners.push(listener);
        },
      },
    };
    return handle;
  }) as never;
  return { factory, spawned };
};

const seedDestination = async (
  destinations: Awaited<ReturnType<typeof loadModules>>['destinations'],
  blackoutUserId: string,
  overrides: { isEnabled?: boolean; provider?: string } = {},
) => {
  const out = destinations.createDestination({
    blackoutUserId,
    provider: overrides.provider ?? 'twitch',
    label: `dest-${randomUUID().slice(0, 4)}`,
    ingestUrl: 'rtmp://live.twitch.tv/app',
    streamKey: `live_${randomUUID()}`,
  });
  if (out.kind !== 'ok') throw new Error('seed failed: ' + JSON.stringify(out));
  if (overrides.isEnabled === false) {
    destinations.setEnabled(blackoutUserId, out.record.id, false);
  }
  return out.record;
};

// --------------------------- spawn args ---------------------------------

test('startFanout: spawns ffmpeg with -re -i <input> -c copy -f flv <ingest>/<key>', async () => {
  const { destinations, worker, db } = await loadModules();
  const { factory, spawned } = buildFakeFactory();
  worker.attachRtmpFanoutWorker({ factory, inputUrl: 'http://owncast/hls/stream.m3u8' });
  const user = await seedUser(db);
  const dest = await seedDestination(destinations, user.id);

  const out = worker.startFanout(user.id, dest.id);
  assert.equal(out.kind, 'ok');
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].args.input, 'http://owncast/hls/stream.m3u8');
  // Target appends key onto ingest with a single slash.
  assert.match(spawned[0].args.target, /^rtmp:\/\/live\.twitch\.tv\/app\/live_/);

  // Start transitions: starting → running once stderr emits.
  let snap = worker.getStatus(dest.id);
  assert.equal(snap?.status, 'starting');
  spawned[0].emitStderr('ffmpeg version 6.1.1 ...\n');
  snap = worker.getStatus(dest.id);
  assert.equal(snap?.status, 'running');
});

test('startFanout: forbids cross-user; not_found unknown id; disabled when destination is off', async () => {
  const { destinations, worker, db } = await loadModules();
  worker.attachRtmpFanoutWorker({ factory: buildFakeFactory().factory });
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const dest = await seedDestination(destinations, alice.id);

  assert.equal(worker.startFanout(bob.id, dest.id).kind, 'forbidden');
  assert.equal(worker.startFanout(alice.id, randomUUID()).kind, 'not_found');

  destinations.setEnabled(alice.id, dest.id, false);
  assert.equal(worker.startFanout(alice.id, dest.id).kind, 'disabled');
});

// --------------------------- stop --------------------------------------

test('stopFanout: SIGTERMs the child and parks the state at "stopped"', async () => {
  const { destinations, worker, db } = await loadModules();
  const { factory, spawned } = buildFakeFactory();
  worker.attachRtmpFanoutWorker({ factory });
  const user = await seedUser(db);
  const dest = await seedDestination(destinations, user.id);
  worker.startFanout(user.id, dest.id);
  spawned[0].emitStderr('frame=1');
  assert.equal(worker.getStatus(dest.id)?.status, 'running');

  const stop = worker.stopFanout(user.id, dest.id);
  assert.equal(stop.kind, 'ok');
  assert.deepEqual(spawned[0].killCalls, ['SIGTERM']);
  // Process emits exit; expectingExit was set, so we land at 'stopped'.
  spawned[0].emitExit(0);
  assert.equal(worker.getStatus(dest.id)?.status, 'stopped');
});

test('stopFanout: cross-user forbidden; not_running when no live process', async () => {
  const { destinations, worker, db } = await loadModules();
  worker.attachRtmpFanoutWorker({ factory: buildFakeFactory().factory });
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const dest = await seedDestination(destinations, alice.id);

  assert.equal(worker.stopFanout(alice.id, dest.id).kind, 'not_running');
  worker.startFanout(alice.id, dest.id);
  assert.equal(worker.stopFanout(bob.id, dest.id).kind, 'forbidden');
});

// --------------------------- restart -----------------------------------

test('unclean exit auto-restarts with backoff; clean stop cancels pending restart', async () => {
  const { destinations, worker, db } = await loadModules();
  const { factory, spawned } = buildFakeFactory();
  worker.attachRtmpFanoutWorker({ factory, restartBaseMs: 5, maxRestarts: 3 });
  const user = await seedUser(db);
  const dest = await seedDestination(destinations, user.id);
  worker.startFanout(user.id, dest.id);

  // Unclean exit (code != 0, expectingExit=false) → status restarting
  // → after backoff, a new spawn happens.
  spawned[0].emitExit(1);
  assert.equal(worker.getStatus(dest.id)?.status, 'restarting');
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(spawned.length, 2, 'auto-restart spawned a fresh child');
  assert.equal(worker.getStatus(dest.id)?.restartCount, 1);

  // Stop → cancels any pending restart and SIGTERMs the live process.
  spawned[1].emitStderr('frame=1');
  worker.stopFanout(user.id, dest.id);
  spawned[1].emitExit(0);
  assert.equal(worker.getStatus(dest.id)?.status, 'stopped');
  // No further spawns after stop.
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(spawned.length, 2);
});

test('after maxRestarts consecutive unclean exits, status latches at "failed"', async () => {
  const { destinations, worker, db } = await loadModules();
  const { factory, spawned } = buildFakeFactory();
  worker.attachRtmpFanoutWorker({ factory, restartBaseMs: 1, maxRestarts: 2 });
  const user = await seedUser(db);
  const dest = await seedDestination(destinations, user.id);
  worker.startFanout(user.id, dest.id);

  // Cycle: emit exit, wait for backoff, emit exit, wait, emit exit.
  for (let i = 0; i < 3; i++) {
    spawned[i].emitExit(1);
    await new Promise((r) => setTimeout(r, 10));
  }
  const snap = worker.getStatus(dest.id);
  assert.equal(snap?.status, 'failed');
  assert.equal(snap?.restartCount, 2);
});

// --------------------------- list / status ------------------------------

test('listForUser returns snapshots scoped to the caller; lastError captured from stderr', async () => {
  const { destinations, worker, db } = await loadModules();
  const { factory, spawned } = buildFakeFactory();
  worker.attachRtmpFanoutWorker({ factory });
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const aDest = await seedDestination(destinations, alice.id);
  const bDest = await seedDestination(destinations, bob.id);
  worker.startFanout(alice.id, aDest.id);
  worker.startFanout(bob.id, bDest.id);
  spawned[0].emitStderr('Stream mapping: ok\n');
  spawned[0].emitStderr('frame= 27 fps= 30 q=-1.0 size= 1KB time=00:00:01 bitrate=...\n');
  spawned[1].emitStderr('Connection refused\n');

  const aliceList = worker.listForUser(alice.id);
  assert.equal(aliceList.length, 1);
  assert.equal(aliceList[0].destinationId, aDest.id);
  // lastError tracks the most recent stderr line for diagnostics.
  assert.match(aliceList[0].lastError ?? '', /frame=/);

  const bobList = worker.listForUser(bob.id);
  assert.equal(bobList.length, 1);
  assert.match(bobList[0].lastError ?? '', /Connection refused/);
});

// --------------------------- bulk per-user -----------------------------

test('startAllForUser / stopAllForUser: only fanouts for enabled destinations the user owns', async () => {
  const { destinations, worker, db } = await loadModules();
  const { factory, spawned } = buildFakeFactory();
  worker.attachRtmpFanoutWorker({ factory });
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const a1 = await seedDestination(destinations, alice.id);
  const a2 = await seedDestination(destinations, alice.id);
  const aDisabled = await seedDestination(destinations, alice.id, { isEnabled: false });
  await seedDestination(destinations, bob.id);

  const out = worker.startAllForUser(alice.id);
  assert.equal(out.attempted, 2, 'disabled is skipped');
  assert.equal(out.started, 2);
  assert.equal(spawned.length, 2);
  // Bob's destination is untouched.
  assert.equal(worker.listForUser(bob.id).length, 0);

  // Idempotent: starting again does NOT spawn duplicate children for
  // already-running destinations.
  spawned[0].emitStderr('frame=1');
  spawned[1].emitStderr('frame=1');
  const second = worker.startAllForUser(alice.id);
  assert.equal(second.started, 2);
  assert.equal(spawned.length, 2, 'no extra spawns for already-running');

  // stopAll for alice tears down both.
  const stopped = worker.stopAllForUser(alice.id);
  assert.equal(stopped.stopped, 2);
  assert.deepEqual(spawned[0].killCalls, ['SIGTERM']);
  assert.deepEqual(spawned[1].killCalls, ['SIGTERM']);
  // Disabled destination is also untouched.
  assert.equal(worker.getStatus(aDisabled.id), undefined);
  // Bob unaffected.
  void a1;
  void a2;
});

// --------------------------- target URL --------------------------------

test('subscribeStatusForUser: receives a snapshot per state transition; scoped per user', async () => {
  const { destinations, worker, db } = await loadModules();
  const { factory, spawned } = buildFakeFactory();
  worker.attachRtmpFanoutWorker({ factory, restartBaseMs: 5, maxRestarts: 2 });
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const aDest = await seedDestination(destinations, alice.id);
  await seedDestination(destinations, bob.id);

  const aliceSnaps: Array<{ status: string; restartCount: number }> = [];
  const bobSnaps: Array<{ status: string; restartCount: number }> = [];
  const offA = worker.subscribeStatusForUser(alice.id, (s) =>
    aliceSnaps.push({ status: s.status, restartCount: s.restartCount }),
  );
  const offB = worker.subscribeStatusForUser(bob.id, (s) =>
    bobSnaps.push({ status: s.status, restartCount: s.restartCount }),
  );

  // Start alice's destination → 'starting' event fires.
  worker.startFanout(alice.id, aDest.id);
  // First stderr byte → 'running' event.
  spawned[0].emitStderr('frame=1');
  // Unclean exit → 'restarting' event (auto-restart kicks off after backoff).
  spawned[0].emitExit(1);
  await new Promise((r) => setTimeout(r, 25));
  // The auto-restart spawned a fresh child: status flips back to
  // 'starting' → 'running' on its first stderr.
  spawned[1].emitStderr('frame=1');
  // Clean stop → 'stopped' event.
  worker.stopFanout(alice.id, aDest.id);
  spawned[1].emitExit(0);

  // Alice saw: starting → running → restarting → starting → running → stopped → stopped
  // (the second 'stopped' is the exit handler firing on the expected exit
  // after the explicit stopFanout already wrote 'stopped'.)
  const aliceStatuses = aliceSnaps.map((s) => s.status);
  assert.ok(aliceStatuses.includes('starting'));
  assert.ok(aliceStatuses.includes('running'));
  assert.ok(aliceStatuses.includes('restarting'));
  assert.ok(aliceStatuses.includes('stopped'));

  // Bob received nothing — the bus is per-user.
  assert.equal(bobSnaps.length, 0);

  offA();
  offB();
});

test('subscribeStatusForUser: disposer stops further deliveries; multiple subscribers are independent', async () => {
  const { destinations, worker, db } = await loadModules();
  const { factory, spawned } = buildFakeFactory();
  worker.attachRtmpFanoutWorker({ factory });
  const user = await seedUser(db);
  const dest = await seedDestination(destinations, user.id);

  const a: string[] = [];
  const b: string[] = [];
  const offA = worker.subscribeStatusForUser(user.id, (s) => a.push(s.status));
  const offB = worker.subscribeStatusForUser(user.id, (s) => b.push(s.status));

  worker.startFanout(user.id, dest.id);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);

  // Disposing A leaves B subscribed.
  offA();
  spawned[0].emitStderr('frame=1');
  assert.equal(a.length, 1, 'no further delivery after A disposed');
  assert.ok(b.includes('running'));
  offB();
});

test('buildTarget: appends streamKey onto ingestUrl with exactly one slash', async () => {
  const { worker } = await loadModules();
  // No trailing slash on ingest.
  assert.equal(
    worker.__test__.buildTarget('rtmp://live.twitch.tv/app', 'live_xyz'),
    'rtmp://live.twitch.tv/app/live_xyz',
  );
  // Trailing slash trimmed.
  assert.equal(
    worker.__test__.buildTarget('rtmp://live.twitch.tv/app/', 'live_xyz'),
    'rtmp://live.twitch.tv/app/live_xyz',
  );
  // Multiple trailing slashes trimmed.
  assert.equal(
    worker.__test__.buildTarget('rtmp://live.twitch.tv/app///', 'live_xyz'),
    'rtmp://live.twitch.tv/app/live_xyz',
  );
});
