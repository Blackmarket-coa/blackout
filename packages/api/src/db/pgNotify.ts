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
import { withPooledClient } from './pooledClient';

export interface StoreChangePayload {
    /** Originating instance id — used to skip self-notifications. */
    src: string;
    /** Store map name (e.g. 'linkedAccounts'). */
    m: string;
    /** 'u' = a record was upserted; 'r' = the whole table was resynced. */
    op: 'u' | 'r';
    /** Conflict-column values identifying the changed row (op 'u' only). */
    kv?: string[];
}

export interface StoreChangeTransport {
    /** Fire-and-forget publish of a change to peers. */
    publish(payload: StoreChangePayload): void;
    /** Begin delivering peer changes to `handler`. */
    subscribe(handler: (payload: StoreChangePayload) => void): Promise<void>;
    /** Invoked when the subscription reconnects after a drop (peers may have been
     * missed, so the store should re-hydrate fully). */
    onReconnect(handler: () => void): void;
    close(): Promise<void>;
}

const CHANNEL = 'blackout_store_change';

interface NotifyClient {
    query(sql: string, params?: unknown[]): Promise<unknown>;
    on(event: string, cb: (arg: unknown) => void): void;
    /** With an error, the pool destroys the connection instead of reusing it. */
    release?(err?: Error): void;
}
interface NotifyPool {
    connect(): Promise<NotifyClient>;
}

/** Postgres LISTEN/NOTIFY transport. Holds one dedicated connection for LISTEN. */
export class PgNotifyTransport implements StoreChangeTransport {
    private listenClient: NotifyClient | null = null;
    private reconnectHandler: (() => void) | null = null;
    private changeHandler: ((payload: StoreChangePayload) => void) | null = null;
    private closed = false;
    private reconnectPending = false;
    /** LISTEN clients already given back to the pool; pg-pool throws on a second release. */
    private readonly released = new WeakSet<NotifyClient>();

    constructor(private readonly pool: NotifyPool) {}

    publish(payload: StoreChangePayload): void {
        // Separate short-lived connection; the row is already committed by the time
        // the write-behind queue calls this, so peers will see it on refresh.
        void (async () => {
            try {
                await withPooledClient(this.pool, (client) =>
                    client.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(payload)])
                );
            } catch (err) {
                log.warn('pg_notify_publish_failed', {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        })();
    }

    async subscribe(handler: (payload: StoreChangePayload) => void): Promise<void> {
        this.changeHandler = handler;
        await this.openListenConnection();
    }

    onReconnect(handler: () => void): void {
        this.reconnectHandler = handler;
    }

    private async openListenConnection(): Promise<void> {
        if (this.closed) return;
        const client = await this.pool.connect();
        this.listenClient = client;
        client.on('notification', (arg: unknown) => {
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
        // pg can report one dropped connection twice, and in either order: a
        // socket reset emits 'error' and then rejects the query in flight, while
        // a backend terminated under LISTEN rejects LISTEN with the server's FATAL
        // and emits 'error' only when the socket closes. Whichever comes first
        // gives the dead client back to the pool to be destroyed, once, and one
        // reconnect follows: each extra reconnect left one more LISTEN session,
        // and a dead client never released kept its pool slot for good.
        client.on('error', (err: unknown) => {
            if (this.released.has(client)) return;
            log.warn('pg_notify_listen_error', {
                error: err instanceof Error ? err.message : String(err),
            });
            this.release(client, err instanceof Error ? err : new Error(String(err)));
            if (this.listenClient === client) this.scheduleReconnect();
        });
        try {
            await client.query(`LISTEN ${CHANNEL}`);
        } catch (err) {
            this.release(client, err instanceof Error ? err : new Error(String(err)));
            if (this.listenClient === client) this.listenClient = null;
            throw err;
        }
    }

    /** Give a LISTEN client back to the pool once; with an error, the pool destroys it. */
    private release(client: NotifyClient, err?: Error): void {
        if (this.released.has(client)) return;
        this.released.add(client);
        client.release?.(err);
    }

    private scheduleReconnect(): void {
        // One reconnect at a time: a reconnect whose LISTEN fails on a dropped
        // connection is reported by both its error event and its catch below.
        if (this.closed || this.reconnectPending) return;
        this.reconnectPending = true;
        this.listenClient = null;
        setTimeout(() => {
            this.reconnectPending = false;
            void (async () => {
                try {
                    await this.openListenConnection();
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
        try {
            await this.listenClient?.query(`UNLISTEN ${CHANNEL}`);
        } catch {
            // best effort
        }
        if (this.listenClient) this.release(this.listenClient);
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
