import { Capabilities, MatrixClient } from 'matrix-js-sdk';
import { createContext, useContext, useEffect, useState } from 'react';
import { useMatrixClientOrNull } from './useMatrixClient';

const CapabilitiesContext = createContext<Capabilities | null>(null);

export const CapabilitiesProvider = CapabilitiesContext.Provider;

const EMPTY_CAPABILITIES: Capabilities = {};

const capabilitiesCache = new WeakMap<MatrixClient, Capabilities>();
const inflight = new WeakMap<MatrixClient, Promise<Capabilities>>();

const loadCapabilities = (mx: MatrixClient): Promise<Capabilities> => {
  const cached = capabilitiesCache.get(mx);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(mx);
  if (existing) return existing;
  const pending = mx
    .getCapabilities()
    .then((caps) => {
      capabilitiesCache.set(mx, caps);
      return caps;
    })
    .catch(() => EMPTY_CAPABILITIES)
    .finally(() => {
      inflight.delete(mx);
    });
  inflight.set(mx, pending);
  return pending;
};

export function useCapabilities(): Capabilities {
  const ctxCapabilities = useContext(CapabilitiesContext);
  const mx = useMatrixClientOrNull();
  const [loaded, setLoaded] = useState<Capabilities | null>(() =>
    mx ? capabilitiesCache.get(mx) ?? null : null
  );

  useEffect(() => {
    if (ctxCapabilities || !mx) return;
    if (capabilitiesCache.has(mx)) {
      setLoaded(capabilitiesCache.get(mx) ?? EMPTY_CAPABILITIES);
      return;
    }
    let cancelled = false;
    loadCapabilities(mx).then((caps) => {
      if (!cancelled) setLoaded(caps);
    });
    return () => {
      cancelled = true;
    };
  }, [ctxCapabilities, mx]);

  return ctxCapabilities ?? loaded ?? EMPTY_CAPABILITIES;
}
