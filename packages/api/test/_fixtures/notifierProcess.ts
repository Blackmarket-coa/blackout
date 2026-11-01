/**
 * A second API process for the Postgres notices tests, in a worker thread of
 * the test's process: its own module graph, so its own Postgres-backed store
 * and mirror, its own notifier (slot, in-flight set, claim tokens) and its own
 * Matrix client, as a second container has, on the parent's database and
 * stand-in homeserver, which it reaches through messages (the parent holds
 * the PGlite and the stub; `startSecondProcess` in the notices test answers
 * them). Commands: `tick` runs the real notifier once, then waits for its
 * queued writes, and answers the tick's result; `rehydrate` reloads its
 * mirror from Postgres, as a process booting now would have it.
 */
import { parentPort } from 'node:worker_threads';

type Waiter = { resolve: (value: unknown) => void; reject: (err: Error) => void };
type Answer = { status: number; headers: Record<string, string>; body: string };

const port = parentPort;
if (!port) throw new Error('notifierProcess runs in a worker thread');
const waiting = new Map<number, Waiter>();
let seq = 0;

const ask = (message: Record<string, unknown>): Promise<unknown> =>
    new Promise((resolve, reject) => {
        seq += 1;
        waiting.set(seq, { resolve, reject });
        port.postMessage({ ...message, id: seq });
    });

const urlOf = (input: RequestInfo | URL): string =>
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal ?? undefined;
    const answer = ask({
        type: 'fetch',
        url: urlOf(input),
        method: init?.method ?? 'GET',
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: typeof init?.body === 'string' ? init.body : null,
    }) as Promise<Answer>;
    const aborted = signal
        ? new Promise<never>((_, reject) => {
              signal.addEventListener(
                  'abort',
                  () => reject(new DOMException('aborted', 'AbortError')),
                  { once: true }
              );
          })
        : undefined;
    const r = await (aborted ? Promise.race([answer, aborted]) : answer);
    return new Response(r.body, { status: r.status, headers: r.headers });
}) as typeof fetch;

const client = {
    query: async (sql: string, params?: unknown[]) =>
        (await ask({ type: 'query', sql, params: params ?? [] })) as { rows: unknown[] },
    release: () => {},
};
const pool = { connect: async () => client, end: async () => {} };

type Loaded = {
    db: { drain(): Promise<void>; rehydrateAll(): Promise<void> };
    tick: (options: { now: Date; callTimeoutMs?: number }) => Promise<unknown>;
};
// Set once, below, after the listener is in place.
const state: { loaded?: Promise<Loaded> } = {};

// Listening before anything is loaded: the store's boot reads Postgres
// through `ask`, whose answers arrive as messages.
port.on('message', (message: Record<string, unknown>) => {
    const id = message.id as number;
    if (message.type === 'answer') {
        const waiter = waiting.get(id);
        waiting.delete(id);
        if (typeof message.error === 'string') waiter?.reject(new Error(message.error));
        else waiter?.resolve(message.value);
        return;
    }
    void (async () => {
        try {
            if (!state.loaded) throw new Error('not loaded yet');
            const { db, tick } = await state.loaded;
            let value: unknown;
            if (message.type === 'tick') {
                value = await tick({
                    now: new Date(message.now as string),
                    ...(typeof message.callTimeoutMs === 'number'
                        ? { callTimeoutMs: message.callTimeoutMs }
                        : {}),
                });
                await db.drain();
            } else if (message.type === 'rehydrate') {
                await db.rehydrateAll();
            } else {
                throw new Error(`unknown command ${String(message.type)}`);
            }
            port.postMessage({ type: 'done', id, value });
        } catch (err) {
            port.postMessage({ type: 'done', id, error: String(err) });
        }
    })();
});

state.loaded = (async (): Promise<Loaded> => {
    // The test runner's TypeScript loader is not registered in a worker
    // thread (Node strips this file's types itself); register it here, before
    // the API's modules are imported, so their extensionless imports resolve.
    const { register } = await import('tsx/esm/api');
    register();
    const store = await import('../../src/db/store');
    const notifier = await import('../../src/services/deadmanReleaseNotifier');
    const db = store.db;
    if (!(db instanceof store.PostgresBackedDb)) {
        throw new Error('the second process needs postgres mode');
    }
    await db.init(pool as never);
    return {
        db: db as unknown as Loaded['db'],
        tick: (options) => notifier.runDeadmanReleaseNotifier(options),
    };
})();
state.loaded.then(
    () => port.postMessage({ type: 'ready' }),
    (err: unknown) => port.postMessage({ type: 'failed', error: String(err) })
);
