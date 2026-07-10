export interface ClickhouseRuntimeConfig {
    /** Base HTTP URL of the ClickHouse server, e.g. http://clickhouse:8123. Null = analytics disabled. */
    url: string | null;
    user: string;
    password: string;
    /** Database holding the raw event landing tables (see infra clickhouse/initdb). */
    database: string;
}

let cached: ClickhouseRuntimeConfig | null = null;

export const clearClickhouseConfigCache = (): void => {
    cached = null;
};

/**
 * ClickHouse is optional everywhere: when CLICKHOUSE_URL is unset the
 * analytics ingest path becomes a no-op rather than an error, so the API can
 * run without the warehouse (dev, small deployments). Unlike Redis/Postgres it
 * is deliberately NOT required in production — losing analytics must never
 * take user-facing traffic down.
 */
export const readClickhouseRuntimeConfig = (): ClickhouseRuntimeConfig => {
    if (cached) return cached;

    const url = process.env.CLICKHOUSE_URL?.trim() || null;
    if (url && !/^https?:\/\//.test(url)) {
        throw new Error('CLICKHOUSE_URL must start with http:// or https://');
    }

    cached = {
        url: url ? url.replace(/\/+$/, '') : null,
        user: process.env.CLICKHOUSE_USER?.trim() || 'default',
        password: process.env.CLICKHOUSE_PASSWORD ?? '',
        database: process.env.CLICKHOUSE_DATABASE?.trim() || 'analytics_raw',
    };
    return cached;
};
