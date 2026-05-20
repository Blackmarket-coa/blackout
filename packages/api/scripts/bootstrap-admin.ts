import { randomUUID } from 'node:crypto';

import { db } from '../src/db/store';
import { hashPassword, signJwt } from '../src/services/auth';

const u = process.env.BU ?? '';
const e = process.env.BE ?? '';
const p = process.env.BP ?? '';

if (u === '' || e === '' || p === '') {
  console.error('BU (username), BE (email), and BP (password) env vars are required');
  process.exit(1);
}

const existing = db.findUserByUsername(u);
let user;
if (existing === undefined) {
  user = db.createUser({
    id: randomUUID(),
    username: u,
    email: e,
    passwordHash: hashPassword(p),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  console.log('CREATED user id:', user.id);
} else {
  user = existing;
  console.log('EXISTING user id:', user.id);
}

console.log('---');
console.log('JWT (30 days):');
console.log(signJwt(user.id, user.username, 30 * 86400));
