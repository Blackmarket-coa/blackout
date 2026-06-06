import { Hono } from 'hono';
import { parseGlobalSearchTypes } from '@blackout/core';
import { globalSearch, globalTrending } from '../services/globalSearch';
import type { FeatureModule } from './types';

const parseLimit = (raw: string | undefined): number | undefined => {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
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

  return search;
};

export const searchModule: FeatureModule = {
  id: 'search',
  mountPath: '/search',
  registerRoutes: createSearchRouter,
};
