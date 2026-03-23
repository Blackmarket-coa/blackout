import { Hono } from 'hono';

const channels = new Hono();

channels.get('/', (c) => c.json([]));
channels.post('/', async (c) => {
  const payload = await c.req.json();
  return c.json({ id: crypto.randomUUID(), ...payload }, 201);
});

export default channels;
