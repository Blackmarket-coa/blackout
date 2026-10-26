/**
 * Release identities: the keys a dead-man switch release is sealed to and
 * signed with, their directory contracts, the safety code two people compare,
 * and the recovery file. Review and format:
 * `docs/security/release-identities-2026-10-26.md`.
 *
 * The fixed test vectors (`testVectors.ts`) are not exported here, so they
 * stay out of application bundles; tests import them by path.
 */

export {
    RELEASE_IDENTITY_VERSION,
    RELEASE_IDENTITY_LABEL,
    RELEASE_ACCOUNT_ID_PATTERN,
    RELEASE_FINGERPRINT_BYTES,
    publicReleaseIdentity,
    releaseIdentitySignedBytes,
    releaseIdentityFingerprint,
    formatReleaseFingerprint,
    mlKem768EncapsulationKeyIsWellFormed,
    verifyReleaseIdentity,
    signReleaseIdentity,
    type ReleaseIdentity,
    type UnsignedReleaseIdentity,
    type ReleaseIdentityProblem,
    type ReleaseIdentityCheck,
    type VerifyReleaseIdentityOptions,
} from './identity';
export {
    RELEASE_KEY_CHECK_LABEL,
    createReleaseKeySet,
    checkReleaseKeySet,
    importReleaseSigningKey,
    importReleaseX25519Key,
    type ReleaseKeySet,
    type ReleaseKeySetProblem,
    type ReleaseOkpPrivateJwk,
    type CheckReleaseKeySetOptions,
} from './keySet';
export {
    SAFETY_CODE_LABEL,
    SAFETY_CODE_DIGITS,
    SAFETY_CODE_HALF_DIGITS,
    safetyCodeHalf,
    computeSafetyCode,
    formatSafetyCode,
} from './safetyCode';
export {
    RECOVERY_FILE_FORMAT,
    RECOVERY_FILE_VERSION,
    RECOVERY_FILE_NAME,
    RECOVERY_KDF,
    RECOVERY_PASSPHRASE_MIN_LENGTH,
    RECOVERY_PASSPHRASE_MAX_LENGTH,
    ReleaseRecoveryError,
    encodeRecoveryPassphrase,
    deriveRecoveryKey,
    recoveryAssociatedData,
    parseRecoveryFile,
    openRecoveryFile,
    sealRecoveryFile,
    writeRecoveryFile,
    readRecoveryFile,
    checkRecoveryContents,
    type ReleaseComparison,
    type ReleaseKeySetStatus,
    type StoredReleaseKeySet,
    type ReleaseRecoveryContents,
    type ReleaseRecoveryErrorCode,
    type ParsedRecoveryFile,
    type RecoveryProgress,
    type ReadRecoveryFileOptions,
    type CheckRecoveryContentsOptions,
} from './recoveryFile';
export {
    RELEASE_IDENTITY_HISTORY_LIMIT,
    RELEASE_IDENTITY_ERRORS,
    type ReleaseIdentityEntry,
    type ReleaseIdentityDirectoryEntry,
    type ReleaseIdentityPublishResult,
} from './contracts';
