import { useCallback, useMemo } from 'react';
import {
    PLAYBOOK_CATALOG,
    type DenPlaybookPayload,
    type PlaybookId,
} from '@blackout/protocol';
import {
    TRIAL_FALLBACK_PLAYBOOK,
    computeTrialStatus,
    type TrialStatus,
} from '../../../lib/bmc-core';
import { createPlaybookPayload } from '../../../lib/bmc-core/playbook';
import { useDenPlaybook, useSetPlaybook } from './usePlaybook';

export interface PlaybookTrialState extends TrialStatus {
    /** The current playbook payload, or null if none. */
    playbook: DenPlaybookPayload | null;
    /** Commit the current playbook (transition `mode` → 'committed'). */
    commit: () => Promise<void>;
    /** Switch to a different playbook (re-seeds defaults; mode stays 'trial'). */
    switchPlaybook: (next: PlaybookId) => Promise<void>;
    /** Revert to the Hearth fallback and immediately commit. */
    revertToHearth: () => Promise<void>;
}

/**
 * J1 hook: drive the trial banner. Composes the playbook state event with
 * the pure trial-math helper and exposes the three actions the banner CTA
 * needs — Commit, Switch playbook, Revert to Hearth. Backed by
 * `useSetPlaybook` so transitions land as plain `co.bmc.den.playbook`
 * replacements; the existing audit history (state-event replacements)
 * captures the lineage.
 */
export function usePlaybookTrial(roomId: string | null | undefined): PlaybookTrialState {
    const playbook = useDenPlaybook(roomId);
    const setPlaybook = useSetPlaybook(roomId);

    const status = useMemo(
        () => computeTrialStatus(playbook ?? { mode: 'committed' as const, trialStartedAt: undefined }),
        [playbook],
    );

    const commit = useCallback(async () => {
        if (!playbook) return;
        await setPlaybook({
            ...playbook,
            mode: 'committed',
            updatedAt: new Date().toISOString(),
        });
    }, [playbook, setPlaybook]);

    const switchPlaybook = useCallback(
        async (next: PlaybookId) => {
            if (!playbook) return;
            const fresh = createPlaybookPayload(next, new Date(), {
                // Carry the user-edited name + domain forward across a
                // playbook switch — they often outlive the underlying
                // governance shape.
                name: playbook.name,
                domain: playbook.domain,
                accent: PLAYBOOK_CATALOG[next].accent,
            });
            await setPlaybook(fresh);
        },
        [playbook, setPlaybook],
    );

    const revertToHearth = useCallback(async () => {
        if (!playbook) return;
        const hearth = createPlaybookPayload(TRIAL_FALLBACK_PLAYBOOK, new Date(), {
            name: playbook.name,
            domain: playbook.domain,
            mode: 'committed',
        });
        await setPlaybook(hearth);
    }, [playbook, setPlaybook]);

    return {
        ...status,
        playbook,
        commit,
        switchPlaybook,
        revertToHearth,
    };
}
