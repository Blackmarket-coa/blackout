// Background sweeper that purges expired ephemeral flash-mob spatial pins (AOG
// §6 / §8.3: location data never outlives the operational window). Mirrors the
// other bridge dispatchers: single-process, `.unref()`'d interval, idempotent
// start. A multi-replica deployment would need a Postgres advisory lock.

import { runFlashSalePinSweep } from './flashMob';
import { logEvent } from '../marketplaceObservability';

export const DEFAULT_FLASH_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let timer: ReturnType<typeof setInterval> | null = null;

export function startFlashMobPinSweeper(
    intervalMs: number = DEFAULT_FLASH_SWEEP_INTERVAL_MS
): { stop: () => void } {
    if (timer) return { stop: stopFlashMobPinSweeper };
    timer = setInterval(() => {
        try {
            runFlashSalePinSweep();
        } catch (err) {
            logEvent('marketplace.fbm_bridge.flash_sweep_threw', {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return { stop: stopFlashMobPinSweeper };
}

export function stopFlashMobPinSweeper(): void {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

export const isFlashMobPinSweeperRunning = (): boolean => timer !== null;
