import { useSyncExternalStore } from 'react';

/**
 * Recovery keys of key-backup setups and resets whose window went away after
 * the attempt's first write, waiting for `RecoveryKeyHandoffHost` to show
 * them (S9, `docs/security/key-backup-nudge-2026-11-02.md`, eighth review).
 *
 * The setup and reset windows live inside whatever opened them: the nudge's
 * banner in `ClientLayout` (a route element), the undecryptable-message chip
 * in the message-search panel (the only place the shipped app shows it). A
 * browser's Back, the search results shifting under the chip, or the chip's
 * message becoming readable takes the window away while the attempt is still
 * writing (the panel's own close is under the chip's overlay while it is up),
 * and the attempt's recovery key, which then opens the account's secret
 * storage, had nowhere to be shown. The attempt now runs on until it settles
 * (at its end, at a step that fails, or at an account confirmation that has
 * not gone through) and, when its form is gone, puts its key here; the host,
 * mounted beside the router rather than under it, shows it.
 *
 * Kept in memory only, like the key itself: a reload loses both.
 */
export type HandedOffRecoveryKey = {
    id: number;
    /** The account the attempt changed: the host shows only its own user's keys. */
    userId: string | null;
    recoveryKey: string;
    /** What the attempt did, above the key; the finished screen's text when unset. */
    lead?: string;
};

let handedOff: readonly HandedOffRecoveryKey[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const emit = () => {
    listeners.forEach((listener) => listener());
};

export const handOffRecoveryKey = (entry: Omit<HandedOffRecoveryKey, 'id'>): void => {
    handedOff = [...handedOff, { ...entry, id: nextId }];
    nextId += 1;
    emit();
};

export const dismissHandedOffRecoveryKey = (id: number): void => {
    handedOff = handedOff.filter((entry) => entry.id !== id);
    emit();
};

/** Drops every waiting key (the host going away with its session). */
export const clearHandedOffRecoveryKeys = (): void => {
    if (handedOff.length === 0) return;
    handedOff = [];
    emit();
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const snapshot = () => handedOff;

export const useHandedOffRecoveryKeys = (): readonly HandedOffRecoveryKey[] =>
    useSyncExternalStore(subscribe, snapshot, snapshot);
