import { atomWithStorage } from 'jotai/utils';

/**
 * Per-event view counts for ephemeral drops, kept locally. View-count expiry is
 * enforced per device (there's no server counter), so this is best-effort: it
 * stops *this* device from re-opening an expired drop. Keyed by event id.
 */
export const ephemeralViewsAtom = atomWithStorage<Record<string, number>>(
    'blackout.ephemeral.views.v1',
    {}
);
