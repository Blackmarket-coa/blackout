/**
 * Central boot-time environment validation (audit finding M6).
 *
 * ADDITIVE: this module does NOT replace the ~234 scattered `process.env` reads
 * or the per-domain readers (config/cors.ts, config/redis.ts, services/auth.ts,
 * config/postgres.ts). `assertEnvAtBoot()` runs once near the top of
 * src/index.ts to:
 *   1. format-check a few primitive vars (via zod, already a dependency),
 *   2. eagerly invoke the canonical security-critical readers so their throws
 *      surface at boot AGGREGATED into one report instead of lazily on first
 *      request,
 *   3. emit a redacted structured summary, and
 *   4. fail fast (throw) in a real production boot on any critical
 *      missing/invalid var; warn-only in dev/test.
 *
 * It only ELEVATES to fatal the vars that are already fatal today (JWT always;
 * CORS/Redis/DB-mode/LOG_HASH_SALT in production), so nothing previously
 * optional becomes newly required. The production fatal predicate mirrors the
 * existing index.ts guards: NODE_ENV==='production' && BLACKOUT_API_SKIP_LISTEN!=='1'.
 */
import { z } from 'zod';
import { log } from '../telemetry/logger';
import { readAuthRuntimeConfig } from '../services/auth';
import { readCorsRuntimeConfig } from './cors';
import { readRedisRuntimeConfig } from './redis';
import { readDatabaseUrl } from './postgres';

const PrimitiveEnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(0).optional(),
    BLACKOUT_DB_MODE: z.enum(['file', 'memory', 'postgres']).optional(),
    REDIS_URL: z
        .string()
        .regex(/^rediss?:\/\//, 'must start with redis:// or rediss://')
        .optional(),
    CORS_MAX_AGE: z.coerce.number().int().min(0).optional(),
    AUTH_TOKEN_TRANSPORT: z.enum(['header', 'cookie', 'both']).optional(),
});

export interface EnvValidationResult {
    /** true when there are no fatal problems. */
    ok: boolean;
    /** Must be fixed before a production boot. */
    fatal: string[];
    /** Advisory (insecure defaults / optional-but-recommended). */
    warnings: string[];
    /** Redacted; safe to log (booleans / counts / enums only, never secrets). */
    summary: Record<string, unknown>;
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const isSet = (name: string, env: NodeJS.ProcessEnv): boolean => {
    const v = env[name];
    return typeof v === 'string' && v.trim().length > 0;
};

/**
 * Pure: never throws, never mutates. Aggregates every problem so one boot
 * report lists all misconfigurations at once.
 */
export const validateEnv = (env: NodeJS.ProcessEnv = process.env): EnvValidationResult => {
    const fatal: string[] = [];
    const warnings: string[] = [];

    const nodeEnv = env.NODE_ENV ?? 'development';
    const isProd = nodeEnv === 'production';
    const dbMode = env.BLACKOUT_DB_MODE ?? 'file';

    // 1. Primitive/format checks (zod, aggregated). Unknown env keys are ignored.
    const parsed = PrimitiveEnvSchema.safeParse(env);
    if (!parsed.success) {
        for (const issue of parsed.error.issues) {
            fatal.push(`${issue.path.join('.') || 'env'}: ${issue.message}`);
        }
    }

    // 2. Delegate to the canonical readers; collect their rich throws.
    let auth: ReturnType<typeof readAuthRuntimeConfig> | undefined;
    let cors: ReturnType<typeof readCorsRuntimeConfig> | undefined;
    try {
        auth = readAuthRuntimeConfig();
    } catch (e) {
        fatal.push(`JWT/auth: ${msg(e)}`);
    }
    try {
        cors = readCorsRuntimeConfig();
    } catch (e) {
        fatal.push(`CORS: ${msg(e)}`);
    }
    try {
        readRedisRuntimeConfig();
    } catch (e) {
        fatal.push(`Redis: ${msg(e)}`);
    }

    // 3. Production invariants mirroring the existing index.ts guards.
    if (isProd) {
        if (dbMode !== 'postgres') {
            fatal.push(
                `BLACKOUT_DB_MODE=${dbMode} is not permitted in production; set BLACKOUT_DB_MODE=postgres (with DATABASE_URL).`
            );
        }
        if (!isSet('LOG_HASH_SALT', env)) {
            fatal.push('LOG_HASH_SALT must be set in production (log pseudonymization salt).');
        }
    }
    if (dbMode === 'postgres' && !readDatabaseUrl()) {
        (isProd ? fatal : warnings).push(
            'DATABASE_URL is required when BLACKOUT_DB_MODE=postgres.'
        );
    }

    // 4. Advisory warnings — never fatal (strictly non-breaking).
    if (isProd && !isSet('INTERNAL_METRICS_TOKEN', env)) {
        warnings.push(
            'INTERNAL_METRICS_TOKEN unset: /metrics returns 503 in production until set.'
        );
    }
    if (isProd && (env.STEGO_KEY ?? 'local-stego-key') === 'local-stego-key') {
        warnings.push(
            'STEGO_KEY unset/default in production; tier-3 steganography uses a public key.'
        );
    }
    if (isProd && !isSet('LINKED_ACCOUNT_ENCRYPTION_KEYS', env)) {
        warnings.push(
            'LINKED_ACCOUNT_ENCRYPTION_KEYS unset: linked-account token storage fails on first use.'
        );
    }
    const livekitVars = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];
    const livekitSet = livekitVars.filter((n) => isSet(n, env)).length;
    if (livekitSet > 0 && livekitSet < livekitVars.length) {
        warnings.push(
            'LIVEKIT_* partially configured; voice tokens fail until URL, API_KEY and API_SECRET are all set.'
        );
    }
    // OIDC delegated login (W2, docs/contracts/mas-identity.md): all-or-nothing,
    // advisory only — /v1/auth/oidc/* simply stays 503 while dark.
    const oidcVars = [
        'BLACKOUT_OIDC_ISSUER',
        'BLACKOUT_OIDC_CLIENT_ID',
        'BLACKOUT_OIDC_CLIENT_SECRET',
        'BLACKOUT_OIDC_REDIRECT_ALLOWLIST',
    ];
    const oidcSet = oidcVars.filter((n) => isSet(n, env)).length;
    if (oidcSet > 0 && oidcSet < oidcVars.length) {
        warnings.push(
            'BLACKOUT_OIDC_* partially configured; /v1/auth/oidc/* stays 503 until ISSUER, CLIENT_ID, CLIENT_SECRET and REDIRECT_ALLOWLIST are all set.'
        );
    }
    if (oidcSet === oidcVars.length && !isSet('LINKED_ACCOUNT_ENCRYPTION_KEYS', env)) {
        warnings.push(
            'BLACKOUT_OIDC_* set without LINKED_ACCOUNT_ENCRYPTION_KEYS; /v1/auth/oidc/begin fails at runtime — the PKCE verifier at rest uses the linked-accounts secretBox.'
        );
    }

    // 5. Redacted summary — booleans/counts/enums only; NEVER secret values.
    const summary: Record<string, unknown> = {
        nodeEnv,
        dbMode,
        port: Number.parseInt(env.PORT ?? '3000', 10),
        jwtSecrets: auth?.verificationSecrets.length ?? 0,
        corsOrigins: cors ? (cors.allowAny ? 'any' : cors.origins.length) : 0,
        redisConfigured: isSet('REDIS_URL', env),
        databaseUrlConfigured: isSet('DATABASE_URL', env),
        logHashSaltConfigured: isSet('LOG_HASH_SALT', env),
        internalMetricsTokenConfigured: isSet('INTERNAL_METRICS_TOKEN', env),
        livekitConfigured: livekitSet === livekitVars.length,
        oidcConfigured: oidcSet === oidcVars.length,
        linkedAccountKeysConfigured: isSet('LINKED_ACCOUNT_ENCRYPTION_KEYS', env),
        fatalCount: fatal.length,
        warningCount: warnings.length,
    };

    return { ok: fatal.length === 0, fatal, warnings, summary };
};

/**
 * Boot entrypoint. Logs the redacted summary + warnings, then in a real
 * production boot throws a single aggregated error so the supervisor restarts
 * rather than serving misconfigured. Dev/test: warns, never throws.
 */
export const assertEnvAtBoot = (): EnvValidationResult => {
    const result = validateEnv();
    const failFast =
        process.env.NODE_ENV === 'production' && process.env.BLACKOUT_API_SKIP_LISTEN !== '1';

    log.info('env_validation_summary', result.summary);
    for (const w of result.warnings) log.warn('env_validation_warning', { detail: w });

    if (failFast && result.fatal.length > 0) {
        throw new Error(
            `Environment validation failed (${result.fatal.length} error(s)):\n - ` +
                result.fatal.join('\n - ')
        );
    }
    if (!failFast && result.fatal.length > 0) {
        for (const f of result.fatal) log.warn('env_validation_error_nonfatal', { detail: f });
    }
    return result;
};
