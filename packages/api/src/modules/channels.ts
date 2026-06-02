import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { requireDomainCapability } from './authz';
import type { ChannelRecord } from '../db/types';
import type { FeatureModule } from './types';

const createChannelSchema = z.object({
  communityId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  channelType: z.string().optional(),
  isPrivate: z.boolean().optional(),
  matrixRoomId: z.string().optional(),
});

// Project the stored record onto the generated `Channel` contract model,
// dropping storage-only fields (createdAt) so responses match the client SDK.
function toChannelDto(record: ChannelRecord) {
  return {
    id: record.id,
    communityId: record.communityId,
    name: record.name,
    description: record.description,
    channelType: record.channelType,
    isPrivate: record.isPrivate,
    matrixRoomId: record.matrixRoomId,
  };
}

function createChannelsRouter() {
  const channels = new Hono();

  // GET /v1/channels — list channels, optionally scoped to a community via the
  // `communityId` query parameter. Mirrors `ChannelsService.listChannels`.
  channels.get('/', (c) => {
    const denied = requireDomainCapability(c, 'channels', 'read');
    if (denied) return denied;

    const communityId = c.req.query('communityId') || undefined;
    return c.json(db.listChannels(communityId).map(toChannelDto));
  });

  // POST /v1/channels — create a channel within a community. Mirrors
  // `ChannelsService.createChannel`. `channelType` and `isPrivate` are optional
  // in the request and fall back to a public text channel.
  channels.post('/', async (c) => {
    const denied = requireDomainCapability(c, 'channels', 'write');
    if (denied) return denied;

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

    return c.json(toChannelDto(channel), 201);
  });

  return channels;
}

export const channelsModule: FeatureModule = {
  id: 'channels',
  mountPath: '/channels',
  registerRoutes: createChannelsRouter,
};
