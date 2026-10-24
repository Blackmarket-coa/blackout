/**
 * The production health probes must ask for a path the API answers.
 *
 * The `app` service probed /healthz, which the API does not serve (it answers
 * /health; anything else is the JSON 404), so `app` could not become healthy,
 * and the `worker` and `reverse-proxy` services wait for that
 * (`depends_on: condition: service_healthy`), as the prod-tunnel overlay's
 * `cloudflared` waits for `reverse-proxy`. Caddy's own active health check of
 * app:3000 probed /healthz too: with `app` up, it would mark the only upstream
 * unhealthy and every request would get a 503. These read the compose files
 * and the Caddyfile and ask the real Hono app for the probed path.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();

const { default: app } = await import('../src/index');

const productionDir = new URL('../../../deploy/docker/production/', import.meta.url);

/** The API path a service's healthcheck requests on port 3000. */
const probedPath = (composeFile: string, service: string): string => {
    const compose = parse(readFileSync(new URL(composeFile, productionDir), 'utf8')) as {
        services: Record<string, { healthcheck?: { test?: string[] } }>;
    };
    const probe = (compose.services[service]?.healthcheck?.test ?? []).join(' ');
    const match = probe.match(/http:\/\/127\.0\.0\.1:3000(\/[^\s'"|]*)/);
    assert.ok(match, `${composeFile} ${service} probes the API on port 3000: ${probe}`);
    return match[1];
};

test('the app healthcheck in docker-compose.yml probes a path the API answers 200', async () => {
    const path = probedPath('docker-compose.yml', 'app');
    assert.equal(path, '/health');
    const res = await app.request(path);
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { status: string }).status, 'ok');
});

test('the app_canary healthcheck in docker-compose.canary.yml probes a path the API answers 200', async () => {
    const path = probedPath('docker-compose.canary.yml', 'app_canary');
    const res = await app.request(path);
    assert.equal(res.status, 200);
});

test("Caddy's active health check of app:3000 asks for a path the API answers 200", async () => {
    const caddyfile = readFileSync(new URL('Caddyfile', productionDir), 'utf8');
    const upstream = caddyfile.match(/reverse_proxy app:3000 \{([^}]*)\}/);
    assert.ok(upstream, 'the Caddyfile proxies to app:3000');
    const healthUri = upstream[1].match(/^\s*health_uri\s+(\S+)\s*$/m);
    assert.ok(healthUri, 'the app:3000 upstream has an active health check');
    // Caddy takes any 2xx as healthy unless health_status or health_body
    // asks for more, which this test would then have to check too.
    assert.doesNotMatch(upstream[1], /health_(status|body)/);
    const res = await app.request(healthUri[1]);
    assert.equal(res.status, 200);
});
