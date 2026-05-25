import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColiseumLiveSession, PinnedEvidence } from '@blackout/core';
import {
    endColiseumLiveSession,
    fetchColiseumLiveSession,
    grantColiseumSpeak,
    pinColiseumEvidence,
    requestColiseumSpeak,
    revokeColiseumSpeak,
    startColiseumLiveSession,
} from '../coliseumClient';

export interface UseColiseumLiveResult {
    session: ColiseumLiveSession | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
    start: (roomId: string) => Promise<void>;
    requestSpeak: () => Promise<void>;
    grantSpeak: (userId: string) => Promise<void>;
    revokeSpeak: (userId: string) => Promise<void>;
    pin: (evidence: PinnedEvidence) => Promise<void>;
    end: () => Promise<void>;
}

/**
 * Loads the active live session for a topic and exposes the moderator/audience
 * actions. Each mutating action refetches so the queue and pinned evidence stay
 * in sync (the in-memory backend is fire-and-forget; refetch reconciles).
 */
export function useColiseumLive(topicId: string | null): UseColiseumLiveResult {
    const [session, setSession] = useState<ColiseumLiveSession | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const requestId = useRef(0);
    const sessionRef = useRef<ColiseumLiveSession | null>(null);
    sessionRef.current = session;

    useEffect(() => {
        if (!topicId) {
            setSession(null);
            setError(null);
            setLoading(false);
            return;
        }
        const id = ++requestId.current;
        setLoading(true);
        setError(null);
        fetchColiseumLiveSession(topicId)
            .then((res) => {
                if (id !== requestId.current) return;
                setSession(res.session);
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (id !== requestId.current) return;
                setError(err instanceof Error ? err.message : 'Failed to load live session');
                setLoading(false);
            });
    }, [topicId, tick]);

    const refetch = useCallback(() => setTick((value) => value + 1), []);

    const start = useCallback(
        async (roomId: string) => {
            if (!topicId) return;
            const res = await startColiseumLiveSession({ topicId, roomId });
            setSession(res.session);
        },
        [topicId]
    );

    const withSession = useCallback(
        async (action: (sessionId: string) => Promise<{ session: ColiseumLiveSession }>) => {
            const current = sessionRef.current;
            if (!current) return;
            const res = await action(current.id);
            setSession(res.session);
        },
        []
    );

    const requestSpeak = useCallback(
        () => withSession((id) => requestColiseumSpeak(id)),
        [withSession]
    );
    const grantSpeak = useCallback(
        (userId: string) => withSession((id) => grantColiseumSpeak(id, userId)),
        [withSession]
    );
    const revokeSpeak = useCallback(
        (userId: string) => withSession((id) => revokeColiseumSpeak(id, userId)),
        [withSession]
    );
    const pin = useCallback(
        (evidence: PinnedEvidence) => withSession((id) => pinColiseumEvidence(id, evidence)),
        [withSession]
    );
    const end = useCallback(() => withSession((id) => endColiseumLiveSession(id)), [withSession]);

    return {
        session,
        loading,
        error,
        refetch,
        start,
        requestSpeak,
        grantSpeak,
        revokeSpeak,
        pin,
        end,
    };
}
