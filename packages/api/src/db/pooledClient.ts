// Checking a client out of a pg pool, and giving it back.

/** A client as pg-pool hands one out. */
export interface ReleasableClient {
    /** With an error, pg-pool destroys the connection instead of pooling it. */
    release?(err?: Error): void;
}

const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

/**
 * Run `fn` on a client checked out of `pool`, then give the client back: with
 * the error `fn` failed with, if it failed, so that pg-pool destroys the
 * connection instead of pooling it.
 *
 * A plain release() can pool a dead connection. When the server ends a backend
 * while a query is in flight (pg_terminate_backend, a restart, a failover), pg
 * (8.20.0) hands the server's FATAL to that query and marks the client unusable
 * only when the socket closes, a moment later. A plain release() in between
 * puts the client back in the idle list, and the next connect() can hand that
 * same client out; the write-behind queue's immediate retry got it, failed
 * with "Connection terminated unexpectedly", and dropped a write that Postgres
 * was up to take. Destroying the client on any error costs one new connection
 * after an error that left the connection usable (a constraint violation).
 */
export async function withPooledClient<C extends ReleasableClient, T>(
    pool: { connect(): Promise<C> },
    fn: (client: C) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    let failure: Error | undefined;
    try {
        return await fn(client);
    } catch (err) {
        failure = asError(err);
        throw err;
    } finally {
        client.release?.(failure);
    }
}
