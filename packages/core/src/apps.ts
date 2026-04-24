export const appEvents = ['message_created', 'member_joined', 'report_created'] as const;
export type AppEventType = (typeof appEvents)[number];

export const appActions = ['post_message', 'moderate_user', 'assign_role'] as const;
export type AppActionType = (typeof appActions)[number];

export const appScopes = [
  'canopy:read',
  'canopy:write',
  'messages:read',
  'messages:write',
  'moderation:write',
  'members:read',
  'roles:write',
  'reports:read',
  'webhooks:write',
] as const;
export type AppScope = (typeof appScopes)[number];

export interface OAuthAppRegistrationContract {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecretRef: string;
  redirectUris: string[];
  scopes: readonly AppScope[];
}

export interface WebhookSignatureContract {
  algorithm: 'hmac-sha256';
  signatureHeader: 'x-blackout-signature';
  timestampHeader: 'x-blackout-timestamp';
  signedHeaders: readonly ['content-type', 'x-blackout-event'];
  replayWindowSeconds: number;
}

export interface RateLimitContract {
  unit: 'minute';
  burst: number;
  sustained: number;
}

export interface CanopyInstallLifecycle {
  states: readonly ['requested', 'approved', 'active', 'suspended', 'revoked'];
  transitionRules: readonly string[];
}

export interface IntegrationContract {
  oauth: OAuthAppRegistrationContract;
  webhook: WebhookSignatureContract;
  rateLimits: {
    eventsIngress: RateLimitContract;
    actionsEgress: RateLimitContract;
  };
  installLifecycle: CanopyInstallLifecycle;
  supportedEvents: readonly AppEventType[];
  supportedActions: readonly AppActionType[];
}

export const defaultIntegrationContract: IntegrationContract = {
  oauth: {
    authorizationUrl: 'https://apps.blackout.local/oauth/authorize',
    tokenUrl: 'https://apps.blackout.local/oauth/token',
    clientId: 'issued-per-app',
    clientSecretRef: 'vault://apps/{appId}/oauth-client-secret',
    redirectUris: ['https://example-app.dev/callback'],
    scopes: appScopes,
  },
  webhook: {
    algorithm: 'hmac-sha256',
    signatureHeader: 'x-blackout-signature',
    timestampHeader: 'x-blackout-timestamp',
    signedHeaders: ['content-type', 'x-blackout-event'],
    replayWindowSeconds: 300,
  },
  rateLimits: {
    eventsIngress: { unit: 'minute', burst: 120, sustained: 600 },
    actionsEgress: { unit: 'minute', burst: 60, sustained: 300 },
  },
  installLifecycle: {
    states: ['requested', 'approved', 'active', 'suspended', 'revoked'],
    transitionRules: [
      'requested -> approved -> active',
      'active -> suspended -> active',
      'active -> revoked (terminal)',
    ],
  },
  supportedEvents: appEvents,
  supportedActions: appActions,
};

export type InstallState = IntegrationContract['installLifecycle']['states'][number];
