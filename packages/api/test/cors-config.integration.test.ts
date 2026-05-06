import test from 'node:test';
import assert from 'node:assert/strict';

const loadCors = async () => import('../src/config/cors');

const resetEnv = () => {
  delete process.env.CORS_ALLOWED_ORIGINS;
  delete process.env.CORS_ALLOW_CREDENTIALS;
  delete process.env.CORS_ALLOWED_METHODS;
  delete process.env.CORS_ALLOWED_HEADERS;
  delete process.env.CORS_EXPOSE_HEADERS;
  delete process.env.CORS_MAX_AGE;
  delete process.env.NODE_ENV;
};

test('rejects missing CORS_ALLOWED_ORIGINS in production', async () => {
  resetEnv();
  const cors = await loadCors();
  cors.clearCorsConfigCache();
  process.env.NODE_ENV = 'production';
  assert.throws(() => cors.readCorsRuntimeConfig(), /required in production/);
});

test('rejects wildcard "*" in production', async () => {
  resetEnv();
  const cors = await loadCors();
  cors.clearCorsConfigCache();
  process.env.NODE_ENV = 'production';
  process.env.CORS_ALLOWED_ORIGINS = '*';
  assert.throws(() => cors.readCorsRuntimeConfig(), /not allowed in production/);
});

test('rejects credentials with wildcard', async () => {
  resetEnv();
  const cors = await loadCors();
  cors.clearCorsConfigCache();
  process.env.CORS_ALLOWED_ORIGINS = '*';
  process.env.CORS_ALLOW_CREDENTIALS = 'true';
  assert.throws(() => cors.readCorsRuntimeConfig(), /incompatible/);
});

test('rejects malformed origins', async () => {
  resetEnv();
  const cors = await loadCors();
  cors.clearCorsConfigCache();
  process.env.CORS_ALLOWED_ORIGINS = 'http://valid.example.com,not-a-url,ftp://bad.example.com';
  assert.throws(() => cors.readCorsRuntimeConfig(), /invalid origins/);
});

test('parses a valid allowlist and matches origins exactly', async () => {
  resetEnv();
  const cors = await loadCors();
  cors.clearCorsConfigCache();
  process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com, https://staging.example.com';
  process.env.CORS_ALLOW_CREDENTIALS = 'true';
  const cfg = cors.readCorsRuntimeConfig();
  assert.deepEqual(cfg.origins, ['https://app.example.com', 'https://staging.example.com']);
  assert.equal(cfg.credentials, true);
  assert.equal(cors.isOriginAllowed('https://app.example.com', cfg), true);
  assert.equal(cors.isOriginAllowed('https://evil.example.com', cfg), false);
  assert.equal(cors.isOriginAllowed(undefined, cfg), false);
});

test('dev mode with no allowlist returns an empty deny-all config', async () => {
  resetEnv();
  const cors = await loadCors();
  cors.clearCorsConfigCache();
  const cfg = cors.readCorsRuntimeConfig();
  assert.deepEqual(cfg.origins, []);
  assert.equal(cors.isOriginAllowed('http://localhost:5173', cfg), false);
});

test('rejects negative CORS_MAX_AGE', async () => {
  resetEnv();
  const cors = await loadCors();
  cors.clearCorsConfigCache();
  process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';
  process.env.CORS_MAX_AGE = '-1';
  assert.throws(() => cors.readCorsRuntimeConfig(), /non-negative/);
});
