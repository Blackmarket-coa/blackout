import { Hono } from 'hono';
import { parseGlobalSearchTypes } from '@blackout/core';
import { globalSearch, globalTrending, recommend } from '../services/globalSearch';
import type { FeatureModule } from './types';

const parseLimit = (raw: string | undefined): number | undefined => {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const parseCsv = (raw: string | undefined): string[] | undefined => {
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return parts.length > 0 ? parts : undefined;
};

export const createSearchRouter = (): Hono => {
  const search = new Hono();

  // Global cross-entity search across coalitions, creators, bounties, and
  // projects. Read-only and public (mirrors discovery browse); `types=` filters
  // the entity set, `q=` is the free-text query.
  search.get('/', (c) => {
    const query = c.req.query('q');
    const types = parseGlobalSearchTypes(c.req.query('types'));
    const region = c.req.query('region');
    const limit = parseLimit(c.req.query('limit'));
    return c.json({ results: globalSearch({ query, types, region, limit }) });
  });

  // Cross-entity trending: active creators/coalitions + recent open bounties +
  // active projects, one ranked list.
  search.get('/trending', (c) => {
    const region = c.req.query('region');
    const limit = parseLimit(c.req.query('limit'));
    return c.json({ results: globalTrending({ region, limit }) });
  });

  // Personalized recommendations: communities/creators/projects/knowledge the
  // viewer doesn't already engage with. `tags=` are interest tags to boost,
  // `exclude=` are ids already followed/joined/owned.
  search.get('/recommended', (c) => {
    const interestTags = parseCsv(c.req.query('tags'));
    const excludeIds = parseCsv(c.req.query('exclude'));
    const region = c.req.query('region');
    const limit = parseLimit(c.req.query('limit'));
    return c.json({ results: recommend({ interestTags, excludeIds, region, limit }) });
  });

  return search;
};

export const searchModule: FeatureModule = {
  id: 'search',
  mountPath: '/search',
  registerRoutes: createSearchRouter,
};
