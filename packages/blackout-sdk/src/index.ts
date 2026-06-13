export * from './client/types';
export * from './client/fetchClient';
export * from './client/withRetry';
export * from './client/queries';
export * from './client/entitlementPaths';
export * from './client/media';
export * from './errors/sdkError';
export * from './governance/actions';
export * from './governance/matrixActions';
export * from './playbook/matrixActions';
export * from './rounds/matrixActions';
export * from './roles/matrixActions';
export * from './compost/matrixActions';
export * from './documents/matrixActions';
export * from './forum/actions';
export * from './deaddrop/actions';
export * from './deaddrop/matrixActions';
export * from './deadman/actions';
export * from './deadman/matrixActions';
export * from './deaddrop/entitlementGate';
export * from './persona/entitlementGate';
export * from './hardening/entitlementGate';
export * from './transparency/entitlementGate';
export * from './activedefense/entitlementGate';
export * from './shield/entitlementGate';
export * from './moderation/actions';
export * from './matrix/types';
export * from './shell/panelMetadata';
export * from './capabilities/actions';
export * from './notifications/actions';
export * from './media/actions';
export * from './stego/actions';
export * from './settings/actions';
export * from './mjolnir/actions';
export * from './federated-ops/actions';
export * from './auth-threads/actions';
export * from './education/actions';

export type {
  EntitlementKey,
  EntitlementAccessPayload,
  EntitlementMap,
  EntitlementResolverInput,
  EntitlementResolutionSource,
  EntitlementTier,
  ResolvedEntitlement,
} from '@blackout/protocol';

export type {
  PluginArtifactKind,
  PluginCapability,
  PluginManifest,
  PluginPinnedNavSpec,
  PluginHomepageCardSpec,
  PluginProtocolVersion,
  PluginSignatureEnvelope,
  SignedPluginBundle,
  PluginEventType,
  PluginInstallEvent,
} from '@blackout/protocol';
export { PLUGINS_PROTOCOL_VERSION, PLUGIN_EVENT_TYPES } from '@blackout/protocol';

export * from './entitlements';
