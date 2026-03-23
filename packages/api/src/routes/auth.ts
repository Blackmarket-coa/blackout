import { Hono } from 'hono';
import { db } from '../db/store';
import { hashPassword, signJwt, verifyPassword } from '../services/auth';
import { matrixClient } from '../integrations/matrix-client';

const auth = new Hono();

auth.post('/register', async (c) => {
  const { username, email, password } = await c.req.json();

  if (!username || !email || !password) {
    return c.json({ error: 'username, email, and password are required' }, 400);
  }

  if (db.findUserByEmail(email) || db.findUserByUsername(username)) {
    return c.json({ error: 'User already exists' }, 409);
  }

  const userId = crypto.randomUUID();
  const passwordHash = hashPassword(password);
  const pubkeyEd25519 = crypto.randomUUID().replace(/-/g, '');

  const user = db.createUser({
    id: userId,
    username,
    email,
    passwordHash,
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519,
  });

  const matrix = await matrixClient.registerUser(username, password);
  const token = signJwt(user.id, user.username);

  return c.json({
    token,
    userId: user.id,
    matrix,
  }, 201);
});

auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  const user = db.findUserByEmail(email);

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = signJwt(user.id, user.username);
  return c.json({ token, userId: user.id });
});

export default auth;
