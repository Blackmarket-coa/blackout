import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DEN_CLASSIFICATION_STATE_EVENT_TYPE } from '@blackout/core';
import {
  provisionContributorRooms,
  type ProvisioningClient,
} from '../src/scripts/provisionContributorRooms';

const DOMAIN = 'example.org';
const BOT = `@blackoutbot:${DOMAIN}`;
const key = (type: string, stateKey: string) => `${type}|${stateKey}`;

interface SentEvent {
  roomId: string;
  type: string;
  stateKey: string;
  content: Record<string, unknown>;
}

/** In-memory Synapse stand-in implementing the slice the script uses. */
class FakeHomeserver {
  readonly aliases = new Map<string, string>();
  readonly rooms = new Map<string, { state: Map<string, Record<string, unknown>>; creationContent?: Record<string, unknown> }>();
  readonly created: Array<{ aliasLocalpart?: string; creationContent?: Record<string, unknown> }> = [];
  readonly sent: SentEvent[] = [];
  botId: string | undefined = BOT;
  /** When > 0, the next createRoom calls return HTTP 429 (decrementing). */
  create429Remaining = 0;
  private seq = 0;

  /** Pre-create a room (with a default power-levels event unless suppressed). */
  seedRoom(localpart: string, opts: { withPowerLevels?: boolean } = {}): string {
    const roomId = `!seed-${localpart}:${DOMAIN}`;
    const state = new Map<string, Record<string, unknown>>();
    if (opts.withPowerLevels !== false) {
      state.set(key('m.room.power_levels', ''), { users: { [BOT]: 100 }, users_default: 0 });
    }
    this.rooms.set(roomId, { state });
    this.aliases.set(`#${localpart}:${DOMAIN}`, roomId);
    return roomId;
  }

  readonly client: ProvisioningClient = {
    botUserId: async () => this.botId,
    resolveRoomAlias: async (alias) => {
      const roomId = this.aliases.get(alias);
      return roomId ? { ok: true, roomId } : { ok: false, reason: 'alias_not_found' };
    },
    createRoom: async (input) => {
      if (this.create429Remaining > 0) {
        this.create429Remaining -= 1;
        return { ok: false, status: 429 };
      }
      this.created.push({ aliasLocalpart: input.aliasLocalpart, creationContent: input.creationContent });
      const roomId = `!room${(this.seq += 1)}:${DOMAIN}`;
      const state = new Map<string, Record<string, unknown>>();
      // Synapse stamps a power-levels event with the creator at PL100.
      state.set(key('m.room.power_levels', ''), { users: { [BOT]: 100 }, users_default: 0 });
      this.rooms.set(roomId, { state, creationContent: input.creationContent });
      if (input.aliasLocalpart) this.aliases.set(`#${input.aliasLocalpart}:${DOMAIN}`, roomId);
      return { ok: true, roomId };
    },
    getStateEvent: async (roomId, type, stateKey = '') => {
      const content = this.rooms.get(roomId)?.state.get(key(type, stateKey));
      return content ? { ok: true, content } : { ok: false, status: 404 };
    },
    sendStateEvent: async (roomId, type, content, stateKey = '') => {
      const room = this.rooms.get(roomId);
      if (!room) return { ok: false, status: 404 };
      room.state.set(key(type, stateKey), content);
      this.sent.push({ roomId, type, stateKey, content });
      return { ok: true, status: 200, eventId: `$e${(this.seq += 1)}` };
    },
  };

  roomState(roomId: string, type: string, stateKey = ''): Record<string, unknown> | undefined {
    return this.rooms.get(roomId)?.state.get(key(type, stateKey));
  }
}

afterEach(() => {
  delete process.env.CONTRIBUTOR_ROOMS;
  delete process.env.MATRIX_HOMESERVER_DOMAIN;
});

test('fresh homeserver: creates the canopy space + the den, classifies, links, opens invites', async () => {
  process.env.CONTRIBUTOR_ROOMS = 'bugs';
  const hs = new FakeHomeserver();

  const failures = await provisionContributorRooms(hs.client);
  assert.equal(failures, 0);

  // Canopy is a Matrix space.
  const canopyId = hs.aliases.get(`#contributors:${DOMAIN}`);
  assert.ok(canopyId, 'canopy alias should be created');
  assert.deepEqual(hs.rooms.get(canopyId!)?.creationContent, { type: 'm.space' });

  const bugsId = hs.aliases.get(`#bugs:${DOMAIN}`);
  assert.ok(bugsId);

  // Den classification stamped on the room.
  assert.deepEqual(hs.roomState(bugsId!, DEN_CLASSIFICATION_STATE_EVENT_TYPE), { denType: 'public' });

  // Space parent on the den (keyed by canopy id) + child on the canopy (keyed by den id).
  const parent = hs.roomState(bugsId!, 'm.space.parent', canopyId!);
  assert.equal(parent?.canonical, true);
  const child = hs.roomState(canopyId!, 'm.space.child', bugsId!);
  assert.ok(child);

  // Invites opened to all members, creator admin preserved.
  const pl = hs.roomState(bugsId!, 'm.room.power_levels') as { invite?: number; users?: Record<string, number> };
  assert.equal(pl.invite, 0);
  assert.equal(pl.users?.[BOT], 100);
});

test('idempotent: existing canopy + room are not recreated, and invite is not re-written when already open', async () => {
  process.env.CONTRIBUTOR_ROOMS = 'bugs';
  const hs = new FakeHomeserver();
  hs.seedRoom('contributors');
  const bugsId = hs.seedRoom('bugs');
  // Pre-open invites so the script should leave power levels untouched.
  hs.rooms.get(bugsId)!.state.set(key('m.room.power_levels', ''), { users: { [BOT]: 100 }, invite: 0 });

  const failures = await provisionContributorRooms(hs.client);
  assert.equal(failures, 0);
  assert.equal(hs.created.length, 0, 'nothing should be created on a re-run');

  const rewrotePower = hs.sent.some((e) => e.type === 'm.room.power_levels');
  assert.equal(rewrotePower, false, 'power levels should not be re-written when invite is already 0');
});

test('upgrades a bare self-healed #bugs in place (no recreation): classify + link + open invites', async () => {
  process.env.CONTRIBUTOR_ROOMS = 'bugs';
  const hs = new FakeHomeserver();
  const bugsId = hs.seedRoom('bugs'); // exists, but bare: no classification, invite undefined

  const failures = await provisionContributorRooms(hs.client);
  assert.equal(failures, 0);

  // Only the canopy was created; the existing #bugs was upgraded, not recreated.
  assert.deepEqual(hs.created.map((c) => c.aliasLocalpart), ['contributors']);

  assert.deepEqual(hs.roomState(bugsId, DEN_CLASSIFICATION_STATE_EVENT_TYPE), { denType: 'public' });
  const pl = hs.roomState(bugsId, 'm.room.power_levels') as { invite?: number; users?: Record<string, number> };
  assert.equal(pl.invite, 0);
  assert.equal(pl.users?.[BOT], 100, 'existing power levels are merged, not clobbered');
});

test('never writes a partial power-levels event when the existing one cannot be read', async () => {
  process.env.CONTRIBUTOR_ROOMS = 'bugs';
  const hs = new FakeHomeserver();
  hs.seedRoom('bugs', { withPowerLevels: false }); // power levels unreadable (404)

  const failures = await provisionContributorRooms(hs.client);

  // The unreadable power-levels room is counted as a failure...
  assert.ok(failures >= 1);
  // ...and crucially we never PUT a power-levels event (which would have wiped creator admin).
  const wrotePower = hs.sent.some((e) => e.type === 'm.room.power_levels');
  assert.equal(wrotePower, false);
});

test('returns failure when the homeserver domain cannot be determined', async () => {
  const hs = new FakeHomeserver();
  hs.botId = undefined; // no bot mxid, and no env override

  const failures = await provisionContributorRooms(hs.client);
  assert.equal(failures, 1);
  assert.equal(hs.created.length, 0);
});

test('retries rate-limited (429) calls with exponential backoff until they succeed', async () => {
  process.env.CONTRIBUTOR_ROOMS = 'bugs';
  const hs = new FakeHomeserver();
  hs.create429Remaining = 2; // canopy create is rejected twice, then succeeds
  const sleeps: number[] = [];

  const failures = await provisionContributorRooms(hs.client, {
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    maxAttempts: 5,
  });

  assert.equal(failures, 0);
  assert.ok(hs.aliases.get(`#contributors:${DOMAIN}`), 'canopy is created after retries');
  assert.deepEqual(sleeps, [500, 1000], 'backoff doubles between the two retries');
});

test('gives up after maxAttempts on persistent 429 without stranding the run', async () => {
  process.env.CONTRIBUTOR_ROOMS = 'bugs';
  const hs = new FakeHomeserver();
  hs.create429Remaining = 99; // canopy create never recovers within the attempt budget

  const failures = await provisionContributorRooms(hs.client, {
    sleep: async () => {},
    maxAttempts: 3,
  });

  assert.ok(failures >= 1);
  assert.equal(hs.aliases.get(`#contributors:${DOMAIN}`), undefined, 'canopy not created');
});

test('default room set provisions all standing contributor rooms', async () => {
  const hs = new FakeHomeserver();
  const failures = await provisionContributorRooms(hs.client);
  assert.equal(failures, 0);
  // canopy + 6 standing rooms.
  assert.equal(hs.created.length, 7);
  for (const localpart of ['welcome', 'blackout-dev', 'bugs', 'governance', 'design', 'coalition-dev']) {
    assert.ok(hs.aliases.get(`#${localpart}:${DOMAIN}`), `expected ${localpart} to be created`);
  }
});
