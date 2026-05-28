import { useCallback, useState } from 'react';
import { useAtom, useAtomValue, useStore } from 'jotai';
import { userIdAtom } from '../../state/auth';
import {
    burnerPrimaryUserIdAtom,
    burnersAtom,
    isBurnerActiveAtom,
    type BurnerRecord,
} from './burnerAtoms';
import {
    provisionAndEnterBurner,
    purgeBurnerLocal,
    requestBurnDeactivation,
} from '../../../client/burnerSession';
import {
    switchBackToPrimary as switchBackClient,
    switchToSession,
} from '../../../client/sessionSwitch';

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : 'Something went wrong.';

/**
 * Orchestrates the burner lifecycle for the UI: provisioning (which also
 * switches into the new burner), switching between primary and burners, and
 * burning. Holds the jotai store and threads it into the atom-free client
 * session helpers, mirroring how MatrixBootstrapper drives initMatrix.
 */
export const useBurnerIdentities = () => {
    const store = useStore();
    const [burners, setBurners] = useAtom(burnersAtom);
    const [primaryUserId, setPrimaryUserId] = useAtom(burnerPrimaryUserIdAtom);
    const isBurnerActive = useAtomValue(isBurnerActiveAtom);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const rememberPrimary = useCallback(() => {
        const current = store.get(userIdAtom);
        if (current && !burners.some((b) => b.burnerUserId === current)) {
            setPrimaryUserId(current);
        }
    }, [store, burners, setPrimaryUserId]);

    const createBurner = useCallback(
        async (label: string, ttlHours?: number) => {
            setBusy(true);
            setError(null);
            try {
                rememberPrimary();
                const burner = await provisionAndEnterBurner(store, { label, ttlHours });
                const record: BurnerRecord = {
                    id: burner.id,
                    burnerUserId: burner.burnerUserId,
                    label: burner.label,
                    expiresAt: burner.expiresAt,
                    createdAt: burner.createdAt,
                };
                setBurners((prev) => [record, ...prev.filter((b) => b.id !== record.id)]);
            } catch (e) {
                setError(messageOf(e));
                throw e;
            } finally {
                setBusy(false);
            }
        },
        [store, rememberPrimary, setBurners]
    );

    const switchTo = useCallback(
        async (burnerUserId: string) => {
            setBusy(true);
            setError(null);
            try {
                rememberPrimary();
                await switchToSession(store, burnerUserId);
            } catch (e) {
                setError(messageOf(e));
                throw e;
            } finally {
                setBusy(false);
            }
        },
        [store, rememberPrimary]
    );

    const switchBack = useCallback(async () => {
        if (!primaryUserId) return;
        setBusy(true);
        setError(null);
        try {
            await switchBackClient(store, primaryUserId);
            setPrimaryUserId(null);
        } catch (e) {
            setError(messageOf(e));
            throw e;
        } finally {
            setBusy(false);
        }
    }, [store, primaryUserId, setPrimaryUserId]);

    const burn = useCallback(
        async (burnerUserId: string) => {
            setBusy(true);
            setError(null);
            try {
                if (store.get(userIdAtom) === burnerUserId) {
                    if (!primaryUserId) {
                        throw new Error('Cannot determine the primary account to return to.');
                    }
                    await switchBackClient(store, primaryUserId);
                    setPrimaryUserId(null);
                }
                await requestBurnDeactivation(burnerUserId);
                await purgeBurnerLocal(burnerUserId);
                setBurners((prev) => prev.filter((b) => b.burnerUserId !== burnerUserId));
            } catch (e) {
                setError(messageOf(e));
                throw e;
            } finally {
                setBusy(false);
            }
        },
        [store, primaryUserId, setPrimaryUserId, setBurners]
    );

    return { burners, isBurnerActive, busy, error, createBurner, switchTo, switchBack, burn };
};
