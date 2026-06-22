import { createContext, useContext } from 'react';
import { SpecVersions } from '../cs-api';

const SpecVersionsContext = createContext<SpecVersions | null>(null);

export const SpecVersionsProvider = SpecVersionsContext.Provider;

// Safe default for when the provider hasn't supplied versions yet (or at all):
// an empty version list. Returning this instead of throwing keeps a missing or
// not-yet-loaded provider from taking down the whole React tree — version-gated
// consumers (e.g. useMediaAuthentication) degrade to "feature unknown" rather
// than crashing the app. The logged-in tree mounts SpecVersionsBootstrap, which
// supplies the real homeserver versions.
const EMPTY_SPEC_VERSIONS: SpecVersions = { versions: [] };

export function useSpecVersions(): SpecVersions {
  return useContext(SpecVersionsContext) ?? EMPTY_SPEC_VERSIONS;
}
