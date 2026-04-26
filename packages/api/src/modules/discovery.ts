import { Hono } from 'hono';
import { requireDomainCapability } from './authz';
import { discoveryService } from '../services/discovery';
import type { FeatureModule } from './types';

function createDiscoveryRouter() {
  const discovery = new Hono();

  discovery.post('/index/profiles', async (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'write');
    if (denied) return denied;

    const payload = (await c.req.json()) as {
      id?: string;
      entityType?: 'creator' | 'canopy';
      name?: string;
      bio?: string;
      tags?: string[];
      language?: string;
      isPaid?: boolean;
      moderationStatus?: 'approved' | 'under_review' | 'restricted' | 'banned';
      visibility?: 'public' | 'private' | 'unlisted';
      regionAllowlist?: string[];
      regionBlocklist?: string[];
      legalRestrictedRegions?: string[];
    };

    if (!payload.id || !payload.entityType || !payload.name) {
      return c.json({ code: 'invalid_request', message: 'id, entityType, and name are required' }, 400);
    }

    const entity = discoveryService.upsertProfile({
      id: payload.id,
      entityType: payload.entityType,
      name: payload.name,
      bio: payload.bio,
      tags: payload.tags,
      language: payload.language,
      isPaid: payload.isPaid,
      moderationStatus: payload.moderationStatus,
      visibility: payload.visibility,
      regionAllowlist: payload.regionAllowlist,
      regionBlocklist: payload.regionBlocklist,
      legalRestrictedRegions: payload.legalRestrictedRegions,
    });

    return c.json(entity, 202);
  });

  discovery.post('/index/activity', async (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'write');
    if (denied) return denied;

    const payload = (await c.req.json()) as { id?: string; delta?: number };
    if (!payload.id) return c.json({ code: 'invalid_request', message: 'id is required' }, 400);

    const updated = discoveryService.recordActivity(payload.id, payload.delta ?? 1);
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
        activity: (c.req.query('activity') as 'active' | 'quiet' | 'all' | undefined) ?? 'all',
        sort: (c.req.query('sort') as 'relevance' | 'activity' | 'name' | undefined) ?? 'relevance',
        entityType: (c.req.query('entityType') as 'creator' | 'canopy' | 'all' | undefined) ?? 'all',
        region: c.req.query('region'),
      }),
    );
  });

  discovery.post('/analytics/events', async (c) => {
    const denied = requireDomainCapability(c, 'discovery', 'write');
    if (denied) return denied;

    const payload = (await c.req.json()) as { entityId?: string; stage?: 'impression' | 'click' | 'join' | 'subscribe' };
    if (!payload.entityId || !payload.stage) {
      return c.json({ code: 'invalid_request', message: 'entityId and stage are required' }, 400);
    }

    const analytics = discoveryService.recordFunnelEvent(payload.entityId, payload.stage);
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

  return discovery;
}

export const discoveryModule: FeatureModule = {
  id: 'discovery',
  mountPath: '/discovery',
  registerRoutes: createDiscoveryRouter,
};
