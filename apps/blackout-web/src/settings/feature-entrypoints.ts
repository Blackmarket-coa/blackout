export type UiEntryKind = "settings_toggle" | "composer_action" | "room_action" | "widget_panel" | "admin_console";

export interface FeatureUiEntry {
  id: string;
  name: string;
  presetKey: string;
  uiEntry: `${UiEntryKind}:${string}`;
}

export const FEATURE_UI_ENTRIES: FeatureUiEntry[] = [
  { id: "stego_toolkit", name: "Steganographic messaging toolkit", presetKey: "features.stego.enabled", uiEntry: "settings_toggle:feature-toggle-stego-toolkit" },
  { id: "ephemeral_stego_lifecycle", name: "Ephemeral stego lifecycle management", presetKey: "features.stego.enabled", uiEntry: "room_action:feature-room-ephemeral-stego" },
  { id: "governance_entitlements", name: "Governance and entitlement policy layer", presetKey: "features.governance.entitlements", uiEntry: "admin_console:feature-admin-governance-entitlements" },
  { id: "federation_boost_policy", name: "Federation boost policy engine", presetKey: "features.federationBoost.enabled", uiEntry: "admin_console:feature-admin-federation-boost" },
  { id: "townhall_sfu", name: "Townhall SFU sessions and moderation", presetKey: "features.townhall.enabled", uiEntry: "widget_panel:feature-widget-townhall-sfu" },
  { id: "rich_composer", name: "Rich composer ergonomics", presetKey: "features.composer.richEditing", uiEntry: "composer_action:feature-composer-rich-editing" },
  { id: "typing_indicators", name: "Typing indicators", presetKey: "features.composer.typingIndicators", uiEntry: "composer_action:feature-composer-typing-indicators" },
  { id: "widget_shell_layouts", name: "Widget shell layouts", presetKey: "features.widgets.layouts", uiEntry: "widget_panel:feature-widget-shell-layouts" },
  { id: "matrix_client_arch", name: "Matrix-native client architecture", presetKey: "features.matrix.client", uiEntry: "settings_toggle:feature-toggle-matrix-client" },
  { id: "homeserver_discovery", name: "Homeserver discovery and validation", presetKey: "features.matrix.homeserverDiscovery", uiEntry: "settings_toggle:feature-toggle-homeserver-discovery" },
  { id: "e2ee_defaults", name: "E2EE defaults and policy controls", presetKey: "features.security.e2eeDefaults", uiEntry: "settings_toggle:feature-toggle-e2ee-defaults" },
  { id: "oidc_delegated_auth", name: "OIDC delegated authentication", presetKey: "features.auth.oidc", uiEntry: "settings_toggle:feature-toggle-oidc-auth" },
  { id: "matrix_widget_compat", name: "Matrix widget state-event compatibility", presetKey: "features.matrix.widgetCompat", uiEntry: "widget_panel:feature-widget-matrix-compat" },
  { id: "multiplatform_bootstrap", name: "Multi-platform Matrix bootstrap", presetKey: "features.platform.bootstrap", uiEntry: "room_action:feature-room-multiplatform-bootstrap" },
];
