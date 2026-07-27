import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTestJwtSecret } from './_fixtures/secrets';

const load = async () => import('../src/config/env');
const clearCaches = async () => {
    (await import('../src/services/auth')).clearAuthRuntimeConfigCache();
    (await import('../src/config/cors')).clearCorsConfigCache();
    (await import('../src/config/redis')).clearRedisConfigCache();
};

const CRITICAL = [
    'NODE_ENV',
    'JWT_SECRET_PRIMARY',
    'JWT_SECRET',
    'JWT_SECRET_ROLLOVER',
    'CORS_ALLOWED_ORIGINS',
    'CORS_ALLOW_CREDENTIALS',
    'REDIS_URL',
    'REDIS_KEY_PREFIX',
    'BLACKOUT_DB_MODE',
    'DATABASE_URL',
    'LOG_HASH_SALT',
    'INTERNAL_METRICS_TOKEN',
    'PORT',
    'STEGO_KEY',
    'LINKED_ACCOUNT_ENCRYPTION_KEYS',
    'BLACKOUT_API_SKIP_LISTEN',
    'AUTH_TOKEN_TRANSPORT',
];
const reset = async () => {
    for (const k of CRITICAL) delete process.env[k];
    await clearCaches();
};

const setValidProd = () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';
    process.env.REDIS_URL = 'redis://cache:6379';
    process.env.BLACKOUT_DB_MODE = 'postgres';
    process.env.DATABASE_URL = 'postgres://u:p@db:5432/blackout';
    process.env.LOG_HASH_SALT = 'a-non-default-salt';
    process.env.INTERNAL_METRICS_TOKEN = `metrics-${generateTestJwtSecret()}`;
    process.env.STEGO_KEY = 'a-real-stego-key';
    process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `k1:${Buffer.alloc(32, 7).toString('base64')}`;
};

test('valid production config has no fatal problems', async () => {
    await reset();
    const env = await load();
    setValidProd();
    await clearCaches();
    const r = env.validateEnv();
    assert.equal(r.ok, true, JSON.stringify(r.fatal));
    assert.equal(r.fatal.length, 0);
});

test('production missing JWT secret is fatal', async () => {
    await reset();
    const env = await load();
    setValidProd();
    delete process.env.JWT_SECRET_PRIMARY;
    await clearCaches();
    const r = env.validateEnv();
    assert.equal(r.ok, false);
    assert.ok(r.fatal.some((f) => /JWT/i.test(f)));
});

test('production BLACKOUT_DB_MODE=file is fatal', async () => {
    await reset();
    const env = await load();
    setValidProd();
    process.env.BLACKOUT_DB_MODE = 'file';
    await clearCaches();
    const r = env.validateEnv();
    assert.ok(r.fatal.some((f) => /BLACKOUT_DB_MODE/.test(f)));
});

test('production missing LOG_HASH_SALT is fatal', async () => {
    await reset();
    const env = await load();
    setValidProd();
    delete process.env.LOG_HASH_SALT;
    await clearCaches();
    const r = env.validateEnv();
    assert.ok(r.fatal.some((f) => /LOG_HASH_SALT/.test(f)));
});

test('production missing CORS allowlist is fatal', async () => {
    await reset();
    const env = await load();
    setValidProd();
    delete process.env.CORS_ALLOWED_ORIGINS;
    await clearCaches();
    const r = env.validateEnv();
    assert.ok(r.fatal.some((f) => /CORS/.test(f)));
});

test('production missing REDIS_URL is fatal', async () => {
    await reset();
    const env = await load();
    setValidProd();
    delete process.env.REDIS_URL;
    await clearCaches();
    const r = env.validateEnv();
    assert.ok(r.fatal.some((f) => /REDIS_URL|Redis/i.test(f)));
});

test('invalid REDIS_URL scheme is fatal', async () => {
    await reset();
    const env = await load();
    setValidProd();
    process.env.REDIS_URL = 'http://cache:6379';
    await clearCaches();
    const r = env.validateEnv();
    assert.ok(r.fatal.some((f) => /redis/i.test(f)));
});

test('non-numeric PORT is fatal', async () => {
    await reset();
    const env = await load();
    setValidProd();
    process.env.PORT = 'not-a-port';
    await clearCaches();
    const r = env.validateEnv();
    assert.ok(r.fatal.some((f) => /PORT/i.test(f)));
});

test('default STEGO_KEY in production warns but is not fatal', async () => {
    await reset();
    const env = await load();
    setValidProd();
    delete process.env.STEGO_KEY;
    await clearCaches();
    const r = env.validateEnv();
    assert.equal(r.ok, true, JSON.stringify(r.fatal));
    assert.ok(r.warnings.some((w) => /STEGO_KEY/.test(w)));
});

test('development with JWT only is ok (no prod-only fatals)', async () => {
    await reset();
    const env = await load();
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
    await clearCaches();
    const r = env.validateEnv();
    assert.equal(r.ok, true, JSON.stringify(r.fatal));
});

test('assertEnvAtBoot throws in a real production boot when fatal', async () => {
    await reset();
    const env = await load();
    process.env.NODE_ENV = 'production'; // BLACKOUT_API_SKIP_LISTEN unset => failFast
    await clearCaches();
    assert.throws(() => env.assertEnvAtBoot(), /Environment validation failed/);
});

test('assertEnvAtBoot does not throw under skip-listen even in production', async () => {
    await reset();
    const env = await load();
    process.env.NODE_ENV = 'production';
    process.env.BLACKOUT_API_SKIP_LISTEN = '1';
    setValidProd();
    process.env.BLACKOUT_API_SKIP_LISTEN = '1';
    await clearCaches();
    assert.doesNotThrow(() => env.assertEnvAtBoot());
});
