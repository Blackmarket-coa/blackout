import { randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { SimulcastDestinationRecord } from '../db/types';
import { encryptSecret, envelopeKeyId, decryptSecret } from './secretBox';

/**
 * Per-creator RTMP simulcast destinations. Phase 1 / Track A: this is
 * the schema + key-management half of the headline "stream once, fan
 * out to Twitch + YouTube + Kick" capability. The fan-out worker that
 * actually does the ffmpeg restream lives outside the API process and
 * reads this table on every ingest.
 *
 * Stream keys are AES-256-GCM-encrypted with the existing secretBox
 * key set; AAD binds each ciphertext to its (user, destination) pair
 * so a leaked key envelope can't be re-played against a different
 * destination row.
 */

const aadFor = (blackoutUserId: string, destinationId: string): string =>
  `simulcast_destination:${blackoutUserId}:${destinationId}`;

/** Public summary shape — never includes the key ciphertext or plaintext. */
export interface SimulcastDestinationSummary {
  id: string;
  provider: string;
  label?: string;
  ingestUrl: string;
  isEnabled: boolean;
  lastUsedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export const toSummary = (record: SimulcastDestinationRecord): SimulcastDestinationSummary => ({
  id: record.id,
  provider: record.provider,
  label: record.label,
  ingestUrl: record.ingestUrl,
  isEnabled: record.isEnabled,
  lastUsedAt: record.lastUsedAt,
  lastError: record.lastError,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

const RTMP_URL_RE = /^(rtmp|rtmps):\/\/[a-zA-Z0-9][-a-zA-Z0-9.]*[a-zA-Z0-9](:[0-9]{1,5})?(\/[^\s]{0,1024})?$/i;
const PROVIDER_RE = /^[a-z][a-z0-9_-]{0,31}$/;

export interface CreateInput {
  blackoutUserId: string;
  provider: string;
  label?: string;
  ingestUrl: string;
  /** Plaintext stream key. Encrypted at rest immediately; never logged. */
  streamKey: string;
}

export type CreateOutcome =
  | { kind: 'ok'; record: SimulcastDestinationRecord }
  | { kind: 'invalid_input'; reason: string };

export const createDestination = (input: CreateInput): CreateOutcome => {
  if (!input.blackoutUserId) return { kind: 'invalid_input', reason: 'blackoutUserId is required' };
  if (!PROVIDER_RE.test((input.provider ?? '').trim().toLowerCase())) {
    return {
      kind: 'invalid_input',
      reason:
        'provider must be 1-32 lower-case ASCII chars (letters, digits, _ or -); start with a letter',
    };
  }
  const ingest = (input.ingestUrl ?? '').trim();
  if (!RTMP_URL_RE.test(ingest)) {
    return { kind: 'invalid_input', reason: 'ingestUrl must start with rtmp:// or rtmps://' };
  }
  if (typeof input.streamKey !== 'string' || input.streamKey.trim().length === 0) {
    return { kind: 'invalid_input', reason: 'streamKey is required' };
  }

  const id = randomUUID();
  const ciphertext = encryptSecret(input.streamKey, {
    aad: aadFor(input.blackoutUserId, id),
  });
  const record = db.createSimulcastDestination({
    id,
    blackoutUserId: input.blackoutUserId,
    provider: input.provider.trim().toLowerCase(),
    label: input.label?.trim() || undefined,
    ingestUrl: ingest,
    streamKeyCiphertext: ciphertext,
    encryptionKeyId: envelopeKeyId(ciphertext),
    isEnabled: true,
  });
  return { kind: 'ok', record };
};

export const listForUser = (blackoutUserId: string): SimulcastDestinationSummary[] =>
  db.listSimulcastDestinationsForUser(blackoutUserId).map(toSummary);

export type DeleteOutcome = { kind: 'ok' } | { kind: 'not_found' } | { kind: 'forbidden' };

export const deleteDestination = (
  blackoutUserId: string,
  destinationId: string,
): DeleteOutcome => {
  const existing = db.getSimulcastDestination(destinationId);
  if (!existing) return { kind: 'not_found' };
  if (existing.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };
  db.deleteSimulcastDestination(destinationId);
  return { kind: 'ok' };
};

export type SetEnabledOutcome =
  | { kind: 'ok'; record: SimulcastDestinationRecord }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export const setEnabled = (
  blackoutUserId: string,
  destinationId: string,
  isEnabled: boolean,
): SetEnabledOutcome => {
  const existing = db.getSimulcastDestination(destinationId);
  if (!existing) return { kind: 'not_found' };
  if (existing.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };
  const updated = db.updateSimulcastDestination(destinationId, { isEnabled });
  return updated ? { kind: 'ok', record: updated } : { kind: 'not_found' };
};

/**
 * SERVER-INTERNAL accessor used by the fan-out worker. Returns the
 * plaintext stream key. NEVER expose this in an API response — it's
 * meant to be called only by the in-process restream pipeline.
 */
export interface DecryptedDestination {
  record: SimulcastDestinationRecord;
  streamKey: string;
}

export const decryptDestination = (destinationId: string): DecryptedDestination | null => {
  const existing = db.getSimulcastDestination(destinationId);
  if (!existing) return null;
  const streamKey = decryptSecret(existing.streamKeyCiphertext, {
    aad: aadFor(existing.blackoutUserId, existing.id),
  });
  return { record: existing, streamKey };
};
