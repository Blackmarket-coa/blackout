import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

import {
  createActivation,
  deleteActivation,
  listActivationsForUser,
  setMode,
} from '../src/services/discordBridgeActivation';
import type {
  BridgeProvisioner,
  ProvisionResult,
} from '../src/integrations/discord/mautrixProvisioning';

const makeProvisioner = (result: ProvisionResult = { ok: true }) => {
  const calls: Array<{ op: 'bridge' | 'unbridge'; channelId: string; mode?: string }> = [];
  const provisioner: BridgeProvisioner = {
    async bridgeRoom(input) {
      calls.push({ op: 'bridge', channelId: input.discordChannelId, mode: input.mode });
      return result;
    },
    async unbridgeRoom(input) {
      calls.push({ op: 'unbridge', channelId: input.discordChannelId });
      return result;
    },
  };
  return { provisioner, calls };
};

const GUILD = '111111111111111111';
// Unique ids per test: the in-memory db is a process-wide singleton shared by
// every integration test file, so fixed room/channel ids would collide.
let seq = 0;
const uniqRoom = () => `!den-${Date.now()}-${seq++}:test`;
// 18-digit snowflake-shaped string; adding seq keeps it 18 digits and unique.
const uniqChannel = () => String(100_000_000_000_000_000n + BigInt(seq++));

test('createActivation: provisions the bridge and persists an active record', async () => {
  const userId = randomUUID();
  const ROOM = uniqRoom();
  const CHANNEL = uniqChannel();
  const { provisioner, calls } = makeProvisioner();
  const out = await createActivation(
    { blackoutUserId: userId, matrixRoomId: ROOM, discordGuildId: GUILD, discordChannelId: CHANNEL, mode: 'two-way' },
    { provisioner },
  );
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;
  assert.equal(out.record.status, 'active');
  assert.equal(out.record.mode, 'two-way');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, 'bridge');
  assert.equal(listActivationsForUser(userId).length, 1);
});

test('createActivation: rejects a bad matrix room id', async () => {
  const { provisioner } = makeProvisioner();
  const out = await createActivation(
    { blackoutUserId: randomUUID(), matrixRoomId: 'not-a-room', discordGuildId: GUILD, discordChannelId: uniqChannel(), mode: 'two-way' },
    { provisioner },
  );
  assert.equal(out.kind, 'invalid_input');
});

test('createActivation: surfaces bridge_unavailable when provisioning is not configured', async () => {
  const { provisioner } = makeProvisioner({ ok: false, reason: 'not_configured' });
  const out = await createActivation(
    { blackoutUserId: randomUUID(), matrixRoomId: uniqRoom(), discordGuildId: GUILD, discordChannelId: uniqChannel(), mode: 'two-way' },
    { provisioner },
  );
  assert.equal(out.kind, 'bridge_unavailable');
});

test('createActivation: duplicate active link returns already_bridged', async () => {
  const userId = randomUUID();
  const room = uniqRoom();
  const channel = uniqChannel();
  const { provisioner } = makeProvisioner();
  const first = await createActivation(
    { blackoutUserId: userId, matrixRoomId: room, discordGuildId: GUILD, discordChannelId: channel, mode: 'two-way' },
    { provisioner },
  );
  assert.equal(first.kind, 'ok');
  const second = await createActivation(
    { blackoutUserId: userId, matrixRoomId: room, discordGuildId: GUILD, discordChannelId: channel, mode: 'two-way' },
    { provisioner },
  );
  assert.equal(second.kind, 'already_bridged');
});

test('setMode: changes direction and re-provisions; rejects a stranger', async () => {
  const owner = randomUUID();
  const stranger = randomUUID();
  const room = uniqRoom();
  const channel = uniqChannel();
  const { provisioner, calls } = makeProvisioner();
  const created = await createActivation(
    { blackoutUserId: owner, matrixRoomId: room, discordGuildId: GUILD, discordChannelId: channel, mode: 'two-way' },
    { provisioner },
  );
  assert.equal(created.kind, 'ok');
  if (created.kind !== 'ok') return;

  const forbidden = await setMode(stranger, created.record.id, 'read-only', { provisioner });
  assert.equal(forbidden.kind, 'forbidden');

  const changed = await setMode(owner, created.record.id, 'read-only', { provisioner });
  assert.equal(changed.kind, 'ok');
  if (changed.kind !== 'ok') return;
  assert.equal(changed.record.mode, 'read-only');
  assert.equal(calls.at(-1)?.mode, 'read-only');
});

test('deleteActivation: unbridges and removes the record', async () => {
  const userId = randomUUID();
  const room = uniqRoom();
  const channel = uniqChannel();
  const { provisioner, calls } = makeProvisioner();
  const created = await createActivation(
    { blackoutUserId: userId, matrixRoomId: room, discordGuildId: GUILD, discordChannelId: channel, mode: 'one-way' },
    { provisioner },
  );
  assert.equal(created.kind, 'ok');
  if (created.kind !== 'ok') return;

  const del = await deleteActivation(userId, created.record.id, { provisioner });
  assert.equal(del.kind, 'ok');
  if (del.kind !== 'ok') return;
  assert.equal(del.unbridged, true);
  assert.equal(calls.at(-1)?.op, 'unbridge');
  assert.equal(listActivationsForUser(userId).length, 0);
});
