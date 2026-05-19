import { useEffect, useState, type ReactNode } from 'react';
import { ClientConfigProvider, type ClientConfig } from './useClientConfig';

const EMPTY_CONFIG: ClientConfig = {};

/**
 * Hydrates the runtime `ClientConfig` from `/config.json` and exposes it
 * via `ClientConfigProvider`. Mounted high in the tree by `main.tsx` so
 * every consumer of `useClientConfig` (bug-report submission, hash-router
 * helpers) sees a non-null context — without this wrapper the hook throws
 * "Client config are not provided!" and any route that uses it surfaces
 * inside `PluginRouteBoundary` as a generic plugin crash.
 *
 * `config.json` is optional: the fetch is best-effort, and a missing or
 * malformed file just leaves the context at `{}` so callers fall back to
 * their own defaults (same shape `useBugReportSubmission` already
 * expects).
 */
export const ClientConfigLoader = ({ children }: { children: ReactNode }) => {
  const [config, setConfig] = useState<ClientConfig>(EMPTY_CONFIG);

  useEffect(() => {
    let cancelled = false;
    fetch('/config.json', { cache: 'no-cache' })
      .then((response) => (response.ok ? response.json() : EMPTY_CONFIG))
      .then((parsed: unknown) => {
        if (cancelled) return;
        if (parsed && typeof parsed === 'object') {
          setConfig(parsed as ClientConfig);
        }
      })
      .catch(() => {
        // Best-effort: missing /config.json is normal in dev and the
        // empty default keeps every consumer working.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <ClientConfigProvider value={config}>{children}</ClientConfigProvider>;
};

export default ClientConfigLoader;
