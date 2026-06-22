import { ReactNode, useEffect, useState } from 'react';
import { SpecVersions, specVersions } from '../cs-api';
import { SpecVersionsProvider } from '../hooks/useSpecVersions';
import { useMatrixClient } from '../hooks/useMatrixClient';

// Empty seed so the context is never null while the (fast, unauthenticated)
// /_matrix/client/versions request is in flight.
const EMPTY: SpecVersions = { versions: [] };

/**
 * Fetches the homeserver's supported spec versions once and supplies them via
 * `SpecVersionsProvider`, so version-gated hooks (`useMediaAuthentication`,
 * `useReportRoomSupported`, `useMutualRooms`) resolve correctly.
 *
 * Non-blocking by design: it renders children immediately with an empty seed
 * and fills in the real versions when the request resolves, so the authenticated
 * boot path (router, hydrators) is never gated on the versions fetch. Mounted
 * inside the logged-in tree, where the Matrix client (and thus `baseUrl`) exists.
 */
export function SpecVersionsBootstrap({ children }: { children: ReactNode }) {
  const mx = useMatrixClient();
  const [versions, setVersions] = useState<SpecVersions>(EMPTY);

  const baseUrl = mx.getHomeserverUrl();

  useEffect(() => {
    let cancelled = false;
    void specVersions(fetch, baseUrl)
      .then((next) => {
        if (!cancelled) setVersions(next);
      })
      .catch(() => {
        // Keep the empty seed: version-gated features degrade to "unknown"
        // but the app still renders rather than crashing.
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  return <SpecVersionsProvider value={versions}>{children}</SpecVersionsProvider>;
}

export default SpecVersionsBootstrap;
