import { createContext, useContext } from 'react';

export type HashRouterConfig = {
  enabled?: boolean;
  basename?: string;
};

export type ClientConfig = {
  defaultHomeserver?: number;
  homeserverList?: string[];
  allowCustomHomeservers?: boolean;

  featuredCommunities?: {
    openAsDefault?: boolean;
    spaces?: string[];
    rooms?: string[];
    servers?: string[];
  };

  hashRouter?: HashRouterConfig;

  // @deprecated — superseded by the server-side /bug-report endpoint on the
  // Blackout API, which forwards to rageshake + GitHub. Still read for
  // back-compat with legacy installs; new code should not consume it.
  bugReportEndpointUrl?: string;

  // Self-hosted Sentry / GlitchTip DSN for client-side crash capture.
  // Empty disables Sentry. The server-side Sentry → GitHub integration is
  // configured in Sentry's UI; this just hands events to that pipeline.
  sentryDsn?: string;

  // Base URL of the Blackout API. The client POSTs bug reports to
  // `${blackoutApiBaseUrl}/bug-report`. When unset, defaults to same-origin.
  blackoutApiBaseUrl?: string;

  // Self-hosted matrix-dimension integration manager URL (optional). Consumed
  // by the room "manage integrations" surface to deep-link into Dimension.
  integrationsUrl?: string;
  integrationsUiUrl?: string;
};

const ClientConfigContext = createContext<ClientConfig | null>(null);

export const ClientConfigProvider = ClientConfigContext.Provider;

export function useClientConfig(): ClientConfig {
  const config = useContext(ClientConfigContext);
  if (!config) throw new Error('Client config are not provided!');
  return config;
}

export const clientDefaultServer = (clientConfig: ClientConfig): string =>
  clientConfig.homeserverList?.[clientConfig.defaultHomeserver ?? 0] ?? 'matrix.theblackout.app';

export const clientAllowedServer = (clientConfig: ClientConfig, server: string): boolean => {
  const { homeserverList, allowCustomHomeservers } = clientConfig;

  if (allowCustomHomeservers) return true;

  return homeserverList?.includes(server) === true;
};
