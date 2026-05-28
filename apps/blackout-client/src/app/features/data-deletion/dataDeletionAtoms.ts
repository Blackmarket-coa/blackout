import { atomWithStorage } from 'jotai/utils';
import type { RequesterIdentity, RequestKind } from '@blackout/core';

/**
 * Local-only state for the data-broker deletion feature. The user's identifiers
 * and per-broker request status live in localStorage and never touch the
 * server — Blackout only helps generate the request text the user sends.
 */
export type RequestStatus = 'pending' | 'sent' | 'confirmed' | 'skipped';

export interface BrokerRequestState {
    kind: RequestKind;
    status: RequestStatus;
    updatedAt: string;
}

export interface DataDeletionState {
    identity: RequesterIdentity;
    /** Keyed by broker id. */
    requests: Record<string, BrokerRequestState>;
}

export const EMPTY_IDENTITY: RequesterIdentity = { fullName: '', email: '' };

export const dataDeletionAtom = atomWithStorage<DataDeletionState>(
    'blackout.settings.data-deletion.v1',
    { identity: EMPTY_IDENTITY, requests: {} }
);

export const isIdentityComplete = (identity: RequesterIdentity): boolean =>
    identity.fullName.trim().length > 0 && /.+@.+\..+/.test(identity.email.trim());
