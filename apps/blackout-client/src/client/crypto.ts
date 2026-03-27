import '@matrix-org/matrix-sdk-crypto-wasm';

export type CryptoInitErrorCode = 'missing_webcrypto' | 'missing_indexeddb' | 'bootstrap_failed';

export class CryptoInitError extends Error {
  readonly code: CryptoInitErrorCode;
  readonly cause?: unknown;

  constructor(code: CryptoInitErrorCode, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = 'CryptoInitError';
  }
}

export type CryptoInitState = 'idle' | 'initializing' | 'ready' | 'failed';

type CryptoBootstrap = () => Promise<void>;

/**
 * initCrypto contract:
 * - validates browser crypto prerequisites before Matrix login/session restore.
 * - performs a single in-flight bootstrap for concurrent callers.
 * - becomes idempotent after success (subsequent calls resolve immediately).
 * - exposes typed failures for predictable startup fallback UX.
 */
const ensureBrowserCryptoPrerequisites = (): void => {
  if (typeof globalThis.crypto?.subtle === 'undefined') {
    throw new CryptoInitError('missing_webcrypto', 'WebCrypto API is not available in this environment.');
  }

  if (typeof globalThis.indexedDB === 'undefined') {
    throw new CryptoInitError('missing_indexeddb', 'IndexedDB is required for Matrix E2EE storage.');
  }
};

const defaultBootstrap: CryptoBootstrap = async () => {
  ensureBrowserCryptoPrerequisites();
  await import('@matrix-org/matrix-sdk-crypto-wasm');
};

let cryptoInitState: CryptoInitState = 'idle';
let cryptoInitPromise: Promise<void> | null = null;
let cryptoBootstrap: CryptoBootstrap = defaultBootstrap;

export const initCrypto = async (): Promise<void> => {
  if (cryptoInitState === 'ready') {
    return;
  }

  if (cryptoInitPromise) {
    return cryptoInitPromise;
  }

  cryptoInitState = 'initializing';
  cryptoInitPromise = cryptoBootstrap()
    .then(() => {
      cryptoInitState = 'ready';
    })
    .catch((error: unknown) => {
      cryptoInitState = 'failed';

      if (error instanceof CryptoInitError) {
        throw error;
      }

      throw new CryptoInitError(
        'bootstrap_failed',
        'Failed to initialize Matrix crypto bootstrap.',
        error,
      );
    })
    .finally(() => {
      if (cryptoInitState !== 'ready') {
        cryptoInitPromise = null;
      }
    });

  return cryptoInitPromise;
};

export const getCryptoInitState = (): CryptoInitState => cryptoInitState;

export const isCryptoReady = (): boolean => cryptoInitState === 'ready';

export const setCryptoBootstrapForTests = (bootstrap: CryptoBootstrap | null): void => {
  cryptoBootstrap = bootstrap ?? defaultBootstrap;
};

export const resetCryptoInitForTests = (): void => {
  cryptoInitState = 'idle';
  cryptoInitPromise = null;
  cryptoBootstrap = defaultBootstrap;
};
