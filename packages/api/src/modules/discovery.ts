import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireDomainCapability } from './authz';
import { discoveryService } from '../services/discovery';
import {
    listCanopies,
    upsertCanopy,
    type CanopyFederationTier,
} from '../services/canopyDirectory';
import type { FeatureModule } from './types';

const profileSchema = z.object({
  id: z.string().min(1),
  entityType: z.enum(['creator', 'canopy']),
  name: z.string().min(1),
  bio: z.string().optional(),
  tags: z.array(z.string()).optional(),
  language: z.string().optional(),
  isPaid: z.boolean().optional(),
  moderationStatus: z.enum(['approved', 'under_review', 'restricted', 'banned']).optional(),
  visibility: z.enum(['public', 'private', 'unlisted']).optional(),
  regionAllowlist: z.array(z.string()).optional(),
  regionBlocklist: z.array(z.string()).optional(),
  legalRestrictedRegions: z.array(z.string()).optional(),
});

const activitySchema = z.object({
  id: z.string().min(1),
  delta: z.number().optional(),
});

const funnelEventSchema = z.object({
  entityId: z.string().min(1),
  stage: z.enum(['impression', 'click', 'join', 'subscribe']),
});

const canopyIndexSchema = z.object({
  canopyId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  summary: z.string().max(2000).optional(),
  federationTier: z.enum(['local', 'zone', 'global']).optional(),
});

function createDiscoveryRouter() {
  const discovery = new Hono();

  discovery.post('/index/profiles', async (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'write');
    if (denied) return denied;

    const parsed = await readJsonBody(c, profileSchema);
    if (parsed instanceof Response) return parsed;

    const entity = discoveryService.upsertProfile({
      id: parsed.id,
      entityType: parsed.entityType,
      name: parsed.name,
      bio: parsed.bio,
      tags: parsed.tags,
      language: parsed.language,
      isPaid: parsed.isPaid,
      moderationStatus: parsed.moderationStatus,
      visibility: parsed.visibility,
      regionAllowlist: parsed.regionAllowlist,
      regionBlocklist: parsed.regionBlocklist,
      legalRestrictedRegions: parsed.legalRestrictedRegions,
    });

    return c.json(entity, 202);
  });

  discovery.post('/index/activity', async (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'write');
    if (denied) return denied;

    const parsed = await readJsonBody(c, activitySchema);
    if (parsed instanceof Response) return parsed;

    const updated = discoveryService.recordActivity(parsed.id, parsed.delta ?? 1);
    if (!updated) return c.json({ code: 'entity_not_found', message: 'Entity not found' }, 404);

    return c.json(updated, 202);
  });

  discovery.post('/index/jobs/full', (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'write');
    if (denied) return denied;

    return c.json(discoveryService.runFullIndex());
  });

  discovery.post('/index/jobs/incremental', (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'write');
    if (denied) return denied;

    return c.json(discoveryService.runIncrementalIndex());
  });

  discovery.get('/browse/trending', (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'read');
    if (denied) return denied;

    const region = c.req.query('region');
    const entityType = (c.req.query('entityType') as 'creator' | 'canopy' | 'all' | undefined) ?? 'all';
    return c.json(discoveryService.browse({ surface: 'trending', region, entityType }));
  });

  discovery.get('/browse/categories', (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'read');
    if (denied) return denied;

    return c.json(
      discoveryService.browse({
        surface: 'categories',
        tag: c.req.query('tag'),
        language: c.req.query('language'),
        region: c.req.query('region'),
        paid: (c.req.query('paid') as 'all' | 'paid' | 'free' | undefined) ?? 'all',
      }),
    );
  });

  discovery.get('/browse/recommended', (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'read');
    if (denied) return denied;

    return c.json(
      discoveryService.browse({
        surface: 'recommended',
        language: c.req.query('language'),
        tag: c.req.query('tag'),
        region: c.req.query('region'),
      }),
    );
  });

  discovery.get('/browse/search', (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'read');
    if (denied) return denied;

    return c.json(
      discoveryService.browse({
        surface: 'search',
        query: c.req.query('q'),
        tag: c.req.query('tag'),
        language: c.req.query('language'),
        paid: (c.req.query('paid') as 'paid' | 'free' | 'all' | undefined) ?? 'all',
        activity: ((a) => (a === 'active' || a === 'quiet' ? a : undefined))(c.req.query('activity')),
        sort: (c.req.query('sort') as 'relevance' | 'activity' | 'name' | undefined) ?? 'relevance',
        entityType: (c.req.query('entityType') as 'creator' | 'canopy' | 'all' | undefined) ?? 'all',
        region: c.req.query('region'),
      }),
    );
  });

  discovery.post('/analytics/events', async (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'write');
    if (denied) return denied;

    const parsed = await readJsonBody(c, funnelEventSchema);
    if (parsed instanceof Response) return parsed;

    const analytics = discoveryService.recordFunnelEvent(parsed.entityId, parsed.stage);
    if (!analytics) return c.json({ code: 'entity_not_indexed', message: 'Entity must be indexed before analytics can be recorded' }, 409);

    return c.json(analytics, 202);
  });

  discovery.get('/analytics/funnel', (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'read');
    if (denied) return denied;

    return c.json(discoveryService.getFunnelSummary());
  });

  discovery.get('/events', (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'read');
    if (denied) return denied;

    return c.json({ module: 'discovery', status: 'ok' });
  });

  discovery.post('/index/canopies', async (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'write');
    if (denied) return denied;
    const parsed = await readJsonBody(c, canopyIndexSchema);
    if (parsed instanceof Response) return parsed;
    const entry = upsertCanopy({
      canopyId: parsed.canopyId,
      name: parsed.name,
      summary: parsed.summary,
      federationTier: parsed.federationTier,
    });
    return c.json(entry, 202);
  });

  discovery.get('/canopies', (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'read');
    if (denied) return denied;
    const tier = c.req.query('federationTier') as CanopyFederationTier | undefined;
    const filter = tier && ['local', 'zone', 'global'].includes(tier) ? { federationTier: tier } : {};
    return c.json({ items: listCanopies(filter) });
  });

  return discovery;
}

export const discoveryModule: FeatureModule = {
  id: 'discovery',
  mountPath: '/discovery',
  registerRoutes: createDiscoveryRouter,
};
