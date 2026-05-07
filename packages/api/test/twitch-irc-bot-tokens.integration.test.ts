import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const loadModules = async () => {
  const service = await import('../src/services/twitchIrcBotTokens');
  const proto = await import('../src/integrations/twitch-compat/ircServerProtocol');
  const store = await import('../src/db/store');
  store.db.twitchIrcBotTokens.clear();
  return { service, proto, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `bot-${id.slice(0, 4)}`,
    email: `bot-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

// --------------------------- token service tests ---------------------------

test('mint: returns plaintext secret only once; persists sha256 hash; verifyBearer round-trips', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  const out = service.mint({ blackoutUserId: user.id, label: 'Nightbot' });
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;
  assert.ok(out.secret.length >= 32);
  const stored = db.getTwitchIrcBotToken(out.record.id);
  assert.ok(stored);
  assert.equal(stored!.secretHash.length, 64);
  assert.equal(stored!.secretHash, service.__test__.sha256Hex(out.secret));
  // verifyBearer matches the plaintext.
  const matched = service.verifyBearer(out.secret);
  assert.ok(matched);
  assert.equal(matched!.id, out.record.id);
  // Wrong / empty / nullish presented bearer.
  assert.equal(service.verifyBearer('wrong'), null);
  assert.equal(service.verifyBearer(''), null);
});

test('revoke: forbidden across users; not_found for unknown; ok then verifyBearer returns null', async () => {
  const { service, db } = await loadModules();
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const a = service.mint({ blackoutUserId: alice.id, label: 'A-bot' });
  if (a.kind !== 'ok') return assert.fail();

  assert.equal(service.revoke(bob.id, a.record.id).kind, 'forbidden');
  assert.equal(service.revoke(alice.id, randomUUID()).kind, 'not_found');
  const ok = service.revoke(alice.id, a.record.id);
  assert.equal(ok.kind, 'ok');
  // After revoke, the token is no longer usable.
  assert.equal(service.verifyBearer(a.secret), null);
});

// --------------------------- protocol tests --------------------------------

test('parseIrcLine: handles plain commands, prefixes, trailing, and IRCv3 tags', async () => {
  const { proto } = await loadModules();
  // Plain command.
  assert.deepEqual(proto.parseIrcLine('PING :tmi.twitch.tv'), {
    tags: {},
    prefix: undefined,
    command: 'PING',
    params: ['tmi.twitch.tv'],
  });
  // Prefix + middle + trailing.
  const p = proto.parseIrcLine(':alice!alice@alice.tmi PRIVMSG #room :hello world');
  assert.equal(p?.command, 'PRIVMSG');
  assert.deepEqual(p?.params, ['#room', 'hello world']);
  assert.equal(p?.prefix, 'alice!alice@alice.tmi');
  // IRCv3 tags incl. escape sequences.
  const t = proto.parseIrcLine('@display-name=Alice\\sB;color=#FF0000 :a PRIVMSG #r :hi');
  assert.equal(t?.tags['display-name'], 'Alice B');
  assert.equal(t?.tags['color'], '#FF0000');
  // Garbage line returns null.
  assert.equal(proto.parseIrcLine(''), null);
  assert.equal(proto.parseIrcLine('   '), null);
});

test('serializeIrcLine: explicit trailing + tag escaping + roundtrip', async () => {
  const { proto } = await loadModules();
  // Explicit trailing emits `:value` regardless of whether the value
  // contains a space (Twitch bots gate on certain numerics having `:`
  // even for single-token values).
  assert.equal(
    proto.serializeIrcLine({
      prefix: 'tmi.twitch.tv',
      command: 'NOTICE',
      params: ['*'],
      trailing: 'You have been unbanned',
    }),
    ':tmi.twitch.tv NOTICE * :You have been unbanned',
  );
  // No trailing field → only middle params.
  assert.equal(
    proto.serializeIrcLine({ command: '353', params: ['nick', '=', '#room', 'nick'] }),
    '353 nick = #room nick',
  );
  // 353 NAMES with explicit trailing for the last token.
  assert.equal(
    proto.serializeIrcLine({
      command: '353',
      params: ['nick', '=', '#room'],
      trailing: 'nick',
    }),
    '353 nick = #room :nick',
  );
  // Tag value escaping.
  const line = proto.serializeIrcLine({
    tags: { 'display-name': 'Alice B', empty: '' },
    command: 'X',
  });
  assert.match(line, /display-name=Alice\\sB/);
  assert.match(line, /;empty/);
  // Round-trip: serialise → parse gets back the same params + trailing
  // (parsed as last entry of `params`).
  const wire = proto.serializeIrcLine({
    prefix: 'a',
    command: 'PRIVMSG',
    params: ['#r'],
    trailing: 'hello world',
  });
  const round = proto.parseIrcLine(wire);
  assert.deepEqual(round?.params, ['#r', 'hello world']);
});

test('handshake state machine: CAP/PASS/NICK → auth_attempt; JOIN before auth → 451', async () => {
  const { proto } = await loadModules();
  const state = proto.initConnectionState();

  // CAP REQ both supported and unsupported.
  const cap = proto.handleInboundLine(
    state,
    'CAP REQ :twitch.tv/tags twitch.tv/commands somethingelse',
  );
  // Two send events expected: ACK + NAK.
  const sent = cap.flatMap((e) => (e.kind === 'send' ? e.lines : []));
  assert.ok(sent.some((l) => /CAP \* ACK :twitch.tv\/tags twitch.tv\/commands/.test(l)));
  assert.ok(sent.some((l) => /CAP \* NAK :somethingelse/.test(l)));

  // JOIN before auth → 451.
  const earlyJoin = proto.handleInboundLine(state, 'JOIN #room');
  const earlyLines = earlyJoin.flatMap((e) => (e.kind === 'send' ? e.lines : []));
  assert.ok(earlyLines.some((l) => /451 \*/.test(l)));

  // PASS + NICK both received → auth_attempt fires once.
  const passEvents = proto.handleInboundLine(state, 'PASS oauth:my-secret-bearer');
  assert.equal(passEvents.length, 0); // no nick yet
  const nickEvents = proto.handleInboundLine(state, 'NICK MyBot');
  const auth = nickEvents.find((e) => e.kind === 'auth_attempt');
  assert.ok(auth);
  if (auth?.kind === 'auth_attempt') {
    assert.equal(auth.presentedBearer, 'my-secret-bearer');
    assert.equal(auth.nick, 'mybot');
  }
});

test('handshake state machine: PRIVMSG without JOIN → 442; PRIVMSG to joined room → privmsg event', async () => {
  const { proto } = await loadModules();
  const state = proto.initConnectionState();
  state.authenticated = true;
  state.nick = 'mybot';

  // PRIVMSG to a channel we're not in.
  const evt1 = proto.handleInboundLine(state, 'PRIVMSG #notin :hi');
  const lines = evt1.flatMap((e) => (e.kind === 'send' ? e.lines : []));
  assert.ok(lines.some((l) => /442 mybot #notin/.test(l)));

  // Now mark joined and resend.
  state.joinedChannels.add('#room');
  const evt2 = proto.handleInboundLine(state, 'PRIVMSG #room :hello!');
  const privmsg = evt2.find((e) => e.kind === 'privmsg');
  assert.ok(privmsg);
  if (privmsg?.kind === 'privmsg') {
    assert.equal(privmsg.channel, '#room');
    assert.equal(privmsg.body, 'hello!');
  }
});

test('PING returns PONG with the same payload echoed back', async () => {
  const { proto } = await loadModules();
  const state = proto.initConnectionState();
  const evts = proto.handleInboundLine(state, 'PING :tmi.twitch.tv');
  const ping = evts.find((e) => e.kind === 'ping');
  assert.ok(ping);
  const lines = evts.flatMap((e) => (e.kind === 'send' ? e.lines : []));
  assert.ok(lines.some((l) => /PONG tmi.twitch.tv :tmi.twitch.tv/.test(l)));
});

test('buildWelcomeBurst + buildJoinBurst: emit Twitch-shape lines bots gate on (376, 366)', async () => {
  const { proto } = await loadModules();
  const w = proto.buildWelcomeBurst('mybot');
  assert.ok(w.some((l) => /^:tmi.twitch.tv 001 mybot/.test(l)));
  assert.ok(w.some((l) => /^:tmi.twitch.tv 376 mybot/.test(l)));

  const j = proto.buildJoinBurst('mybot', '#room');
  assert.ok(j.some((l) => /^:mybot!mybot@mybot.tmi.twitch.tv JOIN #room/.test(l)));
  assert.ok(j.some((l) => /353 mybot = #room :mybot/.test(l)));
  assert.ok(j.some((l) => /366 mybot #room :End of \/NAMES list/.test(l)));
});

test('buildOutgoingPrivmsg: ships a Twitch-shape PRIVMSG with optional IRCv3 tags', async () => {
  const { proto } = await loadModules();
  const line = proto.buildOutgoingPrivmsg({
    channel: '#room',
    authorLogin: 'fan',
    body: 'great stream!',
    tags: { 'display-name': 'Fan One', color: '#1E90FF', id: 'msg-7' },
  });
  assert.match(line, /^@/, 'tags should be the first segment');
  assert.match(line, /:fan!fan@fan.tmi.twitch.tv PRIVMSG #room :great stream!/);
  assert.match(line, /display-name=Fan\\sOne/);
});
