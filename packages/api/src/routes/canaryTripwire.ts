import { Hono } from 'hono';
import { tripCanary } from '../services/activeDefense';

/**
 * Public canary tripwire (OSS-manifest group G5). Mounted OUTSIDE the
 * authenticated `/v1` surface so an unauthorized party who opens a honeypot
 * artifact (where the operator embedded the token) actually fires the canary —
 * that access is the signal. Always responds with a 1x1 transparent GIF and
 * never reveals whether the token was valid, so probing can't enumerate live
 * canaries; a real trip is recorded only when the token matches.
 */
const canaryTripwire = new Hono();

// 1x1 transparent GIF — lets a canary embed as an <img> beacon in a document.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

canaryTripwire.get('/:token', (c) => {
  const token = c.req.param('token');
  // Best-effort attribution; never trusted, only surfaced to the owner.
  const userAgent = c.req.header('user-agent') ?? null;
  // Fire-and-forget: record the trip if the token is real, but always return
  // the same pixel so an attacker can't distinguish valid from invalid tokens.
  tripCanary(token, { userAgent });
  c.header('Content-Type', 'image/gif');
  c.header('Cache-Control', 'no-store, max-age=0');
  return c.body(PIXEL);
});

export default canaryTripwire;
