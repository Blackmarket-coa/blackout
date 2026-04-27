import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';

const channels = new Hono();

const createChannelSchema = z.object({
  communityId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  channelType: z.enum(['text', 'voice', 'broadcast', 'governance']).optional(),
  isPrivate: z.boolean().optional(),
  matrixRoomId: z.string().optional(),
});

channels.get('/', (c) => c.json(db.listChannels()));

channels.post('/', async (c) => {
  const parsed = await readJsonBody(c, createChannelSchema);
  if (parsed instanceof Response) return parsed;

  const channel = db.createChannel({
    id: crypto.randomUUID(),
    communityId: parsed.communityId,
    name: parsed.name,
    description: parsed.description,
    channelType: parsed.channelType ?? 'text',
    isPrivate: parsed.isPrivate ?? false,
    matrixRoomId: parsed.matrixRoomId,
  });

  return c.json(channel, 201);
});

export default channels;
