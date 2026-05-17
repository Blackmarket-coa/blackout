/**
 * Plugin distribution protocol shared between blackout-client (host),
 * blackout-server (entitlement granter), and creator tooling. The shapes
 * here are the canonical wire format for marketplace-installed plugins;
 * they are intentionally minimal so they can travel through any
 * marketplace provider.
 */

export const PLUGINS_PROTOCOL_VERSION = 2;

export type PluginArtifactKind = 'theme' | 'manifest_plugin' | 'code_plugin' | 'asset_bundle';

export type PluginCapability =
    | 'shell.panel.read'
    | 'shell.panel.write'
    | 'message.read'
    | 'message.compose'
    | 'storage.read'
    | 'storage.write'
    | 'http.fetch';

/**
 * Spatial declaration: pinned sidebar entry contributed by an installed
 * plugin. The host materializes this as a `kind: 'sidebar'` shell panel
 * in the high-order band (>= 1000) so it sorts below core nav.
 */
export interface PluginPinnedNavSpec {
    label: string;
    to: string;
    order?: number;
}

/**
 * Spatial declaration: home-page card contributed by an installed
 * plugin. The host renders this directly inside the home feed; it is
 * not currently a shell-panel surface.
 */
export interface PluginHomepageCardSpec {
    title: string;
    subtitle?: string;
    to: string;
    order?: number;
}

export interface PluginManifest {
    /** Stable identifier; reverse-DNS recommended (`com.example.fancy-stickers`). */
    id: string;
    /** Human-readable label shown in Plugins view. */
    name: string;
    version: string;
    artifactKind: PluginArtifactKind;
    /** Marketplace listing this manifest was published with. */
    listing: {
        providerId: string;
        providerListingId: string;
        publicSlug?: string;
    };
    /** Capabilities the sandbox should grant. */
    capabilities: PluginCapability[];
    /** Optional entrypoint URL relative to the bundle (code plugins only). */
    entry?: string;
    /** SHA-256 hex of the bundle bytes; verified against the signed envelope. */
    sha256: string;
    /** Optional description for end users. */
    description?: string;
    /** Optional pinned sidebar nav entry contributed by this plugin. */
    pinnedNav?: PluginPinnedNavSpec;
    /** Optional home-page card contributed by this plugin. */
    homepageCard?: PluginHomepageCardSpec;
}

export interface PluginSignatureEnvelope {
    /** Identifier of the publishing key, looked up in the well-known keyset. */
    keyId: string;
    /** Detached signature over `manifestSha256 || ":" || sha256`. */
    signature: string;
    /** Hex SHA-256 of the canonical JSON manifest. */
    manifestSha256: string;
    /** Hex SHA-256 of the bundle bytes (must equal manifest.sha256). */
    sha256: string;
    /** ISO timestamp the signature was issued. */
    issuedAt: string;
}

export interface SignedPluginBundle {
    manifest: PluginManifest;
    /** base64-encoded raw bytes of the artifact (zip / tarball / json). */
    bundleBase64: string;
    signature: PluginSignatureEnvelope;
}

export const PLUGIN_EVENT_TYPES = {
    INSTALLED: 'plugin.installed',
    ENABLED: 'plugin.enabled',
    DISABLED: 'plugin.disabled',
    REVOKED: 'plugin.revoked',
} as const;

export type PluginEventType = (typeof PLUGIN_EVENT_TYPES)[keyof typeof PLUGIN_EVENT_TYPES];

export interface PluginInstallEvent {
    type: PluginEventType;
    pluginId: string;
    listing: PluginManifest['listing'];
    occurredAt: string;
}
