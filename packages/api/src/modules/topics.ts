import { Hono } from 'hono';
import { requireDomainCapability } from './authz';
import { discoveryService } from '../services/discovery';
import type { FeatureModule } from './types';

const TOPICS_DEFAULT_LIMIT = 50;
const TOPICS_MAX_LIMIT = 200;

const parseLimit = (raw: string | undefined): number => {
  if (!raw) return TOPICS_DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return TOPICS_DEFAULT_LIMIT;
  return Math.min(parsed, TOPICS_MAX_LIMIT);
};

const parseRegion = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
};

function createTopicsRouter() {
  const topics = new Hono();

  // GET /v1/topics — frequency-sorted list of distinct tags from the
  // discovery index. Wraps `discoveryService.listTopics`. Gates on
  // `discovery.read` because topics are derivative of the discovery
  // index — the same authorization grants suffice.
  topics.get('/', (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'read');
    if (denied) return denied;
    const limit = parseLimit(c.req.query('limit'));
    const region = parseRegion(c.req.query('region'));
    const items = discoveryService.listTopics({ limit, region });
    return c.json({ items });
  });

  // GET /v1/topics/:tag/canopies — canopies tagged with `:tag`,
  // ordered by activity. Returns a stripped-down DTO instead of the
  // full DiscoveryEntity so private fields (regionAllowlist, etc.)
  // never reach the client by accident.
  topics.get('/:tag/canopies', (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'read');
    if (denied) return denied;
    const rawTag = c.req.param('tag');
    if (!rawTag) {
      return c.json({ error: 'missing_tag' }, 400);
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawTag);
    } catch {
      return c.json({ error: 'invalid_tag' }, 400);
    }

    const limit = parseLimit(c.req.query('limit'));
    const region = parseRegion(c.req.query('region'));
    const entities = discoveryService.listCanopiesByTag(decoded, { limit, region });
    return c.json({
      tag: decoded.trim().toLowerCase(),
      items: entities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        bio: entity.bio || undefined,
        tags: entity.tags,
        activityScore: entity.activityScore,
      })),
    });
  });

  return topics;
}

export const topicsModule: FeatureModule = {
  id: 'topics',
  mountPath: '/topics',
  registerRoutes: createTopicsRouter,
};
