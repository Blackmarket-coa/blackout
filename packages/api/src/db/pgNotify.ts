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
  release?(): void;
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

  constructor(private readonly pool: NotifyPool) {}

  publish(payload: StoreChangePayload): void {
    // Separate short-lived connection; the row is already committed by the time
    // the write-behind queue calls this, so peers will see it on refresh.
    void (async () => {
      try {
        const client = await this.pool.connect();
        try {
          await client.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(payload)]);
        } finally {
          client.release?.();
        }
      } catch (err) {
        log.warn('pg_notify_publish_failed', { error: err instanceof Error ? err.message : String(err) });
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
        log.warn('pg_notify_parse_failed', { error: err instanceof Error ? err.message : String(err) });
      }
    });
    client.on('error', (err: unknown) => {
      log.warn('pg_notify_listen_error', { error: err instanceof Error ? err.message : String(err) });
      this.scheduleReconnect();
    });
    await client.query(`LISTEN ${CHANNEL}`);
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.listenClient = null;
    setTimeout(() => {
      void (async () => {
        try {
          await this.openListenConnection();
          // We may have missed notifications while disconnected — force a full refresh.
          this.reconnectHandler?.();
          log.info('pg_notify_listen_reconnected');
        } catch (err) {
          log.warn('pg_notify_reconnect_failed', { error: err instanceof Error ? err.message : String(err) });
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
