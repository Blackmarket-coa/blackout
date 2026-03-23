import { Hono } from 'hono';

const auth = new Hono();

auth.post('/register', async (c) => {
  const body = await c.req.json();
  return c.json({
    token: `stub-token-${body.username ?? 'user'}`,
    userId: crypto.randomUUID(),
  }, 201);
});

auth.post('/login', async (c) => {
  const body = await c.req.json();
  return c.json({
    token: `stub-token-${body.email ?? 'user@example.com'}`,
    userId: crypto.randomUUID(),
  });
});

export default auth;
