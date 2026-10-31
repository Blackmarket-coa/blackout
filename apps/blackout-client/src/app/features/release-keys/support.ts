import { releaseKeyStoreAvailable } from './releaseKeyStore';

/**
 * Whether this browser or webview can hold release keys: WebCrypto with
 * Ed25519 and X25519, and IndexedDB. MDN's data has Ed25519 from Chrome 137,
 * Firefox 129 and Safari 17, and X25519 from Chrome 133, Firefox 130 and
 * Safari 17; nothing was tested on devices
 * (`docs/security/release-identities-2026-10-26.md` §1). Asked of the browser
 * itself, not inferred from its version.
 */
export const releaseKeysSupported = async (): Promise<boolean> => {
    if (!releaseKeyStoreAvailable() || !globalThis.crypto?.subtle) return false;
    try {
        await globalThis.crypto.subtle.generateKey(
            { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
            false,
            ['sign', 'verify']
        );
        await globalThis.crypto.subtle.generateKey(
            { name: 'X25519' } as unknown as AlgorithmIdentifier,
            false,
            ['deriveBits']
        );
        return true;
    } catch {
        return false;
    }
};
