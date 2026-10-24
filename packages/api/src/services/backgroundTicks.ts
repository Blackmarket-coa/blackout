/**
 * Background ticks that are still running, so a shutdown can let them finish.
 *
 * Stopping a loop clears its interval, which stops NEW ticks. A tick that is
 * already waiting on the homeserver or a third-party API keeps going, and
 * exiting under it can leave half its work unrecorded: a message posted but
 * not marked delivered, a room purged but not marked purged. The loops whose
 * tick is asynchronous register it here, and the worker's shutdown
 * (src/backgroundWorker.ts) waits for this set to empty, with a bound, before
 * it flushes the store and lets go of the leader lock. A synchronous tick needs
 * no entry: no signal handler can run while one is executing.
 */

const inFlight = new Set<Promise<unknown>>();

/** Record a running tick until it settles. Returns the same promise. */
export function trackBackgroundTick<T>(tick: Promise<T>): Promise<T> {
    inFlight.add(tick);
    const settled = (): void => {
        inFlight.delete(tick);
    };
    tick.then(settled, settled);
    return tick;
}

/** How many tracked ticks have not settled yet. */
export const backgroundTicksInFlight = (): number => inFlight.size;

/**
 * Wait until every tracked tick has settled, or until `timeoutMs` has passed.
 * Resolves true when nothing is left in flight.
 */
export async function waitForBackgroundTicks(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (inFlight.size > 0) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const expired = new Promise<void>((resolve) => {
            timer = setTimeout(resolve, remaining);
        });
        await Promise.race([Promise.allSettled([...inFlight]), expired]);
        clearTimeout(timer);
    }
    return true;
}
