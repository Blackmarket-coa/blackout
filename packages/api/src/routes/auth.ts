import { Hono } from 'hono';
import { db } from '../db/store';
import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  isAcceptablePassword,
  signJwt,
  verifyPasswordConstantTime,
} from '../services/auth';
import { matrixClient } from '../integrations/matrix-client';
import { authRateLimit } from '../middleware/rate-limit';

const auth = new Hono();

auth.use('/login', authRateLimit);
auth.use('/register', authRateLimit);

auth.post('/register', async (c) => {
  const { username, email, password } = await c.req.json();

  if (!username || !email || !password) {
    return c.json({ code: 'invalid_request', message: 'username, email, and password are required' }, 400);
  }

  if (!isAcceptablePassword(password)) {
    return c.json(
      { code: 'weak_password', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      400,
    );
  }

  if (db.findUserByEmail(email) || db.findUserByUsername(username)) {
    return c.json({ code: 'user_exists', message: 'User already exists' }, 409);
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

  let matrix: Awaited<ReturnType<typeof matrixClient.registerUser>>;
  try {
    matrix = await matrixClient.registerUser(username, password);
  } catch (error) {
    db.deleteUser(user.id);
    return c.json(
      { code: 'matrix_provisioning_failed', message: 'Failed to provision Matrix account', detail: (error as Error).message },
      502,
    );
  }

  // matrix_not_configured is expected in local/dev — keep the local user.
  // Any other !ok (HTTP error from Synapse) is a real failure: roll back so
  // the caller can retry with the same email/username.
  if (!matrix.ok && !('reason' in matrix && matrix.reason === 'matrix_not_configured')) {
    db.deleteUser(user.id);
    return c.json({ code: 'matrix_provisioning_failed', message: 'Failed to provision Matrix account', matrix }, 502);
  }

  const token = signJwt(user.id, user.username);

  return c.json({
    token,
    userId: user.id,
    matrix,
  }, 201);
});

auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();

  if (typeof email !== 'string' || typeof password !== 'string') {
    return c.json({ code: 'invalid_request', message: 'email and password are required' }, 400);
  }

  const user = db.findUserByEmail(email);

  // Run scrypt even when the user is missing so the two 401 branches have
  // equivalent timing and cannot be used to enumerate registered emails.
  if (!verifyPasswordConstantTime(password, user?.passwordHash)) {
    return c.json({ code: 'invalid_credentials', message: 'Invalid credentials' }, 401);
  }

  const token = signJwt(user!.id, user!.username);
  return c.json({ token, userId: user!.id });
});

export default auth;
