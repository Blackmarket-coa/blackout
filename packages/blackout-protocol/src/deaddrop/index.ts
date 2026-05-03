/**
 * Public surface of the deaddrop module.
 *
 * Low-level crypto primitives (`seal`, `open`, `pad`, etc.) are kept
 * inside `./crypto` and re-exported only from there to avoid polluting
 * the protocol package's root namespace with very-generic names.
 * High-level operations (`encryptDeadDrop`, `decryptDeadDrop`, quorum
 * `split`/`combine`, `generateDecoy`) are re-exported here because they
 * are scoped enough to be safe at the root.
 */

export * from './events';
export * from './entitlements';
export {
    encryptDeadDrop,
    decryptDeadDrop,
    isOpaqueEnvelope,
    generateRecipientKeyPair,
    generateDecoy,
    deriveClue,
    BUCKETS as DEAD_DROP_PADDING_BUCKETS,
    ABSOLUTE_MAX as DEAD_DROP_ABSOLUTE_MAX_BYTES,
    ENVELOPE_VERSION as DEAD_DROP_ENVELOPE_VERSION,
    SUPPORTED_SUITES as DEAD_DROP_SUPPORTED_SUITES,
    type DeadDropKeyPair,
    type DeadDropEnvelopeV1,
    type EncryptInput as EncryptDeadDropInput,
    type DecryptInput as DecryptDeadDropInput,
    type EnvelopeSuite as DeadDropEnvelopeSuite,
    type PaddingStrategy as DeadDropPaddingStrategy,
    type DecoyParams as DeadDropDecoyParams,
    type QuorumShare as DeadDropQuorumShare,
    split as splitDeadDropSecret,
    combine as combineDeadDropShares,
} from './crypto';
