import { Hono } from 'hono';
import { db } from '../db/store';

const channels = new Hono();

channels.get('/', (c) => c.json(db.listChannels()));

channels.post('/', async (c) => {
  const payload = await c.req.json();
  const channel = db.createChannel({
    id: crypto.randomUUID(),
    communityId: payload.communityId,
    name: payload.name,
    description: payload.description,
    channelType: payload.channelType ?? 'text',
    isPrivate: Boolean(payload.isPrivate),
    matrixRoomId: payload.matrixRoomId,
  });

  return c.json(channel, 201);
});

export default channels;
