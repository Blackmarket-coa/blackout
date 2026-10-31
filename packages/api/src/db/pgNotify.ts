// Cross-replica cache invalidation for the PostgresBackedDb mirror.
//
// Each replica keeps its own in-memory read mirror, so a write on replica A is
// invisible to replica B until B is told to refresh. After every committed
// write we publish a small change notification; every replica subscribes and
// refreshes the affected table/key from Postgres into its mirror. This makes
// reads eventually consistent across replicas (read-your-writes stays strong on
// the writing replica, since its mutator updates the mirror synchronously).
//
// The transport is abstracted so the Postgres LISTEN/NOTIFY implementation can
// be swapped for an in-process one in tests (two stores sharing one database).

import { log } from '../telemetry/logger';

export interface StoreChangePayload {
    /** Originating instance id — used to skip self-notifications. */
    src: string;
    /** Store map name (e.g. 'linkedAccounts'). */
    m: string;
    /**
     * 'u' = one record was upserted; 'k' = these keys changed; 'r' = the whole
     * table may have changed (sent only by the release before targeted writes;
     * still received, as a table reload, for one more release). A receiver
     * re-reads every key named by 'u' or 'k': a row it finds is put into its
     * mirror, and a key with no row is removed.
     */
    op: 'u' | 'k' | 'r';
    /** Conflict-column values identifying the changed row (op 'u' only). */
    kv?: string[];
    /** Conflict-column values of each changed row, in conflict-column order (op 'k' only). */
    kvs?: unknown[][];
}

/** The part of a connection publishWithin needs: the open transaction's own client. */
export interface TransactionClient {
    query(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface StoreChangeTransport {
    /** Fire-and-forget publish of a change to peers. */
    publish(payload: StoreChangePayload): void;
    /**
     * Publish as part of the caller's open transaction on `client`: Postgres
     * delivers it when the transaction commits, never before, and drops it if
     * the transaction rolls back. A transport without it (the in-process test
     * hub) is published to after the commit instead.
     */
    publishWithin?(client: TransactionClient, payload: StoreChangePayload): Promise<void>;
    /** Begin delivering peer changes to `handler`. */
    subscribe(handler: (payload: StoreChangePayload) => void): Promise<void>;
    /** Invoked when the subscription reconnects after a drop (peers may have been
     * missed, so the store should re-hydrate fully). */
    onReconnect(handler: () => void): void;
    close(): Promise<void>;
}

const CHANNEL = 'blackout_store_change';

/**
 * Upper bound for one 'k' payload, in UTF-8 bytes. Postgres refuses a NOTIFY
 * payload of 8000 bytes or more ("payload string too long"), which inside the
 * write's transaction would roll the write back.
 */
export const MAX_KEY_PAYLOAD_BYTES = 7000;

/**
 * The 'k' notifications for one map's changed keys, split so that each
 * serialized payload stays within `maxBytes`. Keys keep their order. A single
 * key too large for any payload still gets one of its own.
 */
export function keyChangePayloads(
    src: string,
    m: string,
    kvs: readonly unknown[][],
    maxBytes = MAX_KEY_PAYLOAD_BYTES
): StoreChangePayload[] {
    const base = Buffer.byteLength(JSON.stringify({ src, m, op: 'k', kvs: [] }));
    const out: StoreChangePayload[] = [];
    let chunk: unknown[][] = [];
    let size = base;
    for (const kv of kvs) {
        const len = Buffer.byteLength(JSON.stringify(kv));
        if (chunk.length > 0 && size + 1 + len > maxBytes) {
            out.push({ src, m, op: 'k', kvs: chunk });
            chunk = [];
            size = base;
        }
        // A comma separates every element after the first.
        size += len + (chunk.length > 0 ? 1 : 0);
        chunk.push(kv);
    }
    if (chunk.length > 0) out.push({ src, m, op: 'k', kvs: chunk });
    return out;
}

interface NotifyClient {
    query(sql: string, params?: unknown[]): Promise<unknown>;
    on(event: string, cb: (arg: unknown) => void): void;
    /** pg's PoolClient: an argument destroys the connection instead of returning it to the pool. */
    release?(destroy?: Error | boolean): void;
}
interface NotifyPool {
    connect(): Promise<NotifyClient>;
}

/** Postgres LISTEN/NOTIFY transport. Holds one dedicated connection for LISTEN. */
export class PgNotifyTransport implements StoreChangeTransport {
    private listenClient: NotifyClient | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectHandler: (() => void) | null = null;
    private changeHandler: ((payload: StoreChangePayload) => void) | null = null;
    private closed = false;

    constructor(private readonly pool: NotifyPool) {}

    publish(payload: StoreChangePayload): void {
        // Separate short-lived connection; the row is already committed by the time
        // the write-behind queue calls this, so peers will see it on refresh.
        void (async () => {
            try {
                const client = await this.pool.connect();
                try {
                    await client.query('SELECT pg_notify($1, $2)', [
                        CHANNEL,
                        JSON.stringify(payload),
                    ]);
                } finally {
                    client.release?.();
                }
            } catch (err) {
                log.warn('pg_notify_publish_failed', {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        })();
    }

    async publishWithin(client: TransactionClient, payload: StoreChangePayload): Promise<void> {
        // On the write's own connection, inside its transaction: delivered on
        // COMMIT, discarded on ROLLBACK, and a failure here fails the write.
        await client.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(payload)]);
    }

    async subscribe(handler: (payload: StoreChangePayload) => void): Promise<void> {
        this.changeHandler = handler;
        await this.openListenConnection();
    }

    onReconnect(handler: () => void): void {
        this.reconnectHandler = handler;
    }

    /**
     * Open the listening connection. Only the current one counts: a
     * connection already given up on delivers nothing, and its later errors
     * are ignored. A dropped connection can raise 'error' more than once (the
     * server's termination, then the socket closing), and each used to
     * schedule its own reconnect, which left two listening connections, every
     * notification delivered twice, two rehydrates, and a connection close()
     * never released.
     */
    private async openListenConnection(): Promise<void> {
        if (this.closed) return;
        const client = await this.pool.connect();
        if (this.closed) {
            client.release?.();
            return;
        }
        this.listenClient = client;
        const giveUp = (err: unknown): boolean => {
            if (this.listenClient !== client) return false;
            this.listenClient = null;
            client.release?.(err instanceof Error ? err : true);
            return true;
        };
        client.on('notification', (arg: unknown) => {
            if (this.listenClient !== client) return;
            const msg = arg as { payload?: string };
            if (!msg.payload || !this.changeHandler) return;
            try {
                this.changeHandler(JSON.parse(msg.payload) as StoreChangePayload);
            } catch (err) {
                log.warn('pg_notify_parse_failed', {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        });
        client.on('error', (err: unknown) => {
            if (!giveUp(err)) return;
            log.warn('pg_notify_listen_error', {
                error: err instanceof Error ? err.message : String(err),
            });
            this.scheduleReconnect();
        });
        try {
            await client.query(`LISTEN ${CHANNEL}`);
        } catch (err) {
            giveUp(err);
            throw err;
        }
    }

    /** At most one reconnect is pending at a time. */
    private scheduleReconnect(): void {
        if (this.closed || this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void (async () => {
                try {
                    await this.openListenConnection();
                    // Closed meanwhile, or this connection already dropped again
                    // (that drop scheduled the next attempt, which refreshes).
                    if (!this.listenClient) return;
                    // We may have missed notifications while disconnected — force a full refresh.
                    this.reconnectHandler?.();
                    log.info('pg_notify_listen_reconnected');
                } catch (err) {
                    log.warn('pg_notify_reconnect_failed', {
                        error: err instanceof Error ? err.message : String(err),
                    });
                    this.scheduleReconnect();
                }
            })();
        }, 2000);
    }

    async close(): Promise<void> {
        this.closed = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        try {
            await this.listenClient?.query(`UNLISTEN ${CHANNEL}`);
        } catch {
            // best effort
        }
        this.listenClient?.release?.();
        this.listenClient = null;
    }
}

/**
 * In-process transport for tests: every transport sharing the same `Hub`
 * delivers published changes to all OTHER subscribers synchronously, simulating
 * N replicas on one database.
 */
export class InMemoryStoreChangeHub {
    private readonly handlers = new Set<(payload: StoreChangePayload) => void>();
    add(handler: (payload: StoreChangePayload) => void): void {
        this.handlers.add(handler);
    }
    remove(handler: (payload: StoreChangePayload) => void): void {
        this.handlers.delete(handler);
    }
    emit(payload: StoreChangePayload): void {
        for (const h of [...this.handlers]) h(payload);
    }
}

export class InMemoryStoreChangeTransport implements StoreChangeTransport {
    private handler: ((payload: StoreChangePayload) => void) | null = null;
    constructor(private readonly hub: InMemoryStoreChangeHub) {}
    publish(payload: StoreChangePayload): void {
        this.hub.emit(payload);
    }
    async subscribe(handler: (payload: StoreChangePayload) => void): Promise<void> {
        this.handler = handler;
        this.hub.add(handler);
    }
    onReconnect(): void {
        // never reconnects in-process
    }
    async close(): Promise<void> {
        if (this.handler) this.hub.remove(this.handler);
    }
}
