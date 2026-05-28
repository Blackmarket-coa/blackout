/**
 * Plugin distribution protocol shared between blackout-client (host),
 * blackout-server (entitlement granter), and creator tooling. The shapes
 * here are the canonical wire format for marketplace-installed plugins;
 * they are intentionally minimal so they can travel through any
 * marketplace provider.
 */

export const PLUGINS_PROTOCOL_VERSION = 2;

export type PluginProtocolVersion = 1 | 2;

export type PluginArtifactKind =
    | 'theme'
    | 'manifest_plugin'
    | 'code_plugin'
    | 'asset_bundle'
    | 'coalition_kit'
    | 'profile_cosmetic'
    | 'sound_pack'
    | 'community_template'
    | 'stream_asset'
    | 'vault_item'
    | 'ai_persona'
    | 'automation_recipe'
    | 'privacy_tool'
    // A Twitch extension run via the `Twitch.ext` SDK shim against a Blackout
    // livestream. Rendered in a visible sandboxed iframe (panel surface).
    | 'twitch_extension_compat';

export type PluginCapability =
    | 'shell.panel.read'
    | 'shell.panel.write'
    | 'message.read'
    | 'message.compose'
    | 'storage.read'
    | 'storage.write'
    | 'http.fetch'
    // AI inference is confined to AI dens (see core `den/classification.ts`
    // `aiToolsEnabled`). Granting it is necessary but not sufficient: the host
    // sandbox hard-denies `ai.inference` RPCs outside an AI den at runtime.
    | 'ai.inference'
    // Twitch-extension-compat surfaces. `identityShare` lets the extension
    // request the viewer's real Twitch id (gated by viewer consent);
    // `subscriptionStatus` lets it read whether the viewer subscribes.
    | 'twitch.ext.identityShare'
    | 'twitch.ext.subscriptionStatus';

/**
 * Spatial declaration: pinned sidebar entry contributed by an installed
 * plugin. The host materializes this as a `kind: 'sidebar'` shell panel
 * in the high-order band (>= 1000) so it sorts below core nav.
 */
export interface PluginPinnedNavSpec {
    label: string;
    iconUrl?: string;
    to?: string;
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
    iconUrl?: string;
    to?: string;
    order?: number;
}

export interface PluginManifest {
    /** Stable identifier; reverse-DNS recommended (`com.example.fancy-stickers`). */
    id: string;
    /** Human-readable label shown in Plugins view. */
    name: string;
    version: string;
    /**
     * Protocol version this manifest targets. Missing or `1` is treated as v1
     * (the `rightPanel` / `mobileTab` surface fields are ignored). `2` opts
     * into the v2 surface registration fields.
     */
    protocolVersion?: PluginProtocolVersion;
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
    /**
     * Optional discoverable card the plugin author wants surfaced on the
     * host's home / landing surface. `href` is advisory only — the host
     * routes the click to `/plugins/<id>` until a code-plugin entrypoint
     * registers an in-app route.
     */
    homepageCard?: PluginHomepageCardSpec;
    /**
     * Optional sidebar / nav rail entry the plugin author wants pinned.
     * The host materializes this into a `ShellPanelEntry` of kind
     * `sidebar`. Lower `order` renders first; `href` is advisory and the
     * host routes to `/plugins/<id>` until code-plugin entrypoint loading
     * is wired.
     */
    pinnedNav?: PluginPinnedNavSpec;
    /**
     * Optional right-panel entry (v2+). The host materializes this into a
     * `ShellPanelEntry` of kind `right-panel`. Until a code-plugin
     * entrypoint registers an in-app route, the host routes clicks to
     * `/plugins/<id>`.
     */
    rightPanel?: {
        id: string;
        label: string;
        iconUrl?: string;
        order?: number;
    };
    /**
     * Optional mobile-tab entry (v2+). The host materializes this into a
     * `ShellPanelEntry` of kind `mobile-tab`.
     */
    mobileTab?: {
        id: string;
        label: string;
        iconUrl?: string;
        order?: number;
    };
    /**
     * Optional companion dens (Matrix rooms) the plugin wants provisioned at
     * install time (Phase 5 den factory). `purpose` is one of the core plugin
     * den purposes (support/tutorial/collaboration/update) and `denType` is a
     * den classification; both are validated server-side. Strings are kept
     * loose here so the protocol stays free of a core dependency.
     */
    pluginDens?: Array<{ purpose: string; denType?: string; name?: string }>;
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
