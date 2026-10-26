import { mlKem768Provider, setKemProvider } from '@blackout/protocol';

/**
 * Install the ML-KEM-768 provider (`@noble/post-quantum`, FIPS 203) that
 * release keys need. Until this runs, the protocol's default provider throws
 * on every call, so nothing can be made with a zero-strength KEM. Called once
 * at startup, from `main.tsx`.
 */
export const installReleaseKemProvider = (): void => {
    setKemProvider(mlKem768Provider);
};
