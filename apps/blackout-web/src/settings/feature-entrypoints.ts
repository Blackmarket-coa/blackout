export type UiEntryKind = "settings_toggle" | "composer_action" | "room_action" | "widget_panel" | "admin_console" | "command_palette";
export type ApprovedFeaturePanelRegion = "settings_shell" | "chat_workspace" | "right_panel_overlay" | "repo_tools_shell" | "command_palette_overlay";

export interface FeatureUiEntry {
  id: string;
  name: string;
  presetKey: string;
  uiEntry: `${UiEntryKind}:${string}`;
  aliasOfId?: string;
}

export const FEATURE_UI_ENTRY_PREFIX_BY_KIND: Record<UiEntryKind, string> = {
  settings_toggle: "feature-toggle-",
  composer_action: "feature-composer-",
  room_action: "feature-room-",
  widget_panel: "feature-widget-",
  admin_console: "feature-admin-",
  command_palette: "feature-command-",
};

export const FEATURE_PANEL_REGION_BY_KIND: Record<UiEntryKind, ApprovedFeaturePanelRegion> = {
  settings_toggle: "settings_shell",
  composer_action: "chat_workspace",
  room_action: "chat_workspace",
  widget_panel: "right_panel_overlay",
  admin_console: "repo_tools_shell",
  command_palette: "command_palette_overlay",
};

export const FEATURE_UI_ENTRIES: FeatureUiEntry[] = [
  // Existing rollout entries.
  // Engagement roadmap entries.
  { id: "discover_panel", name: "Discover command (bounded top 10)", presetKey: "features.engagement.discover", uiEntry: "command_palette:feature-command-discover" },
  { id: "soft_streaks", name: "Opt-in soft streaks", presetKey: "features.engagement.streaks", uiEntry: "settings_toggle:feature-toggle-soft-streaks" },
  { id: "community_leaderboards", name: "Optional leaderboards", presetKey: "features.engagement.leaderboards", uiEntry: "widget_panel:feature-widget-leaderboards" },
  { id: "community_leaderboards_command", name: "Leaderboards command launcher", presetKey: "features.engagement.leaderboards", uiEntry: "command_palette:feature-command-leaderboards", aliasOfId: "community_leaderboards" },
  { id: "presence_digest", name: "Presence digest notifications", presetKey: "features.engagement.presenceDigest", uiEntry: "command_palette:feature-command-presence-digest" },
  { id: "recommendation_model", name: "Meaningful interaction recommendations", presetKey: "features.engagement.recommendations", uiEntry: "admin_console:feature-admin-recommendations" },
  { id: "engagement_experiments", name: "Experiment holdout and ramp controls", presetKey: "features.engagement.experiments", uiEntry: "admin_console:feature-admin-engagement-experiments" },
  { id: "wellbeing_hard_stops", name: "Wellbeing hard-stops and weekly summary", presetKey: "features.engagement.wellbeing", uiEntry: "settings_toggle:feature-toggle-wellbeing-hard-stops" },

  { id: "stego_toolkit", name: "Steganographic messaging toolkit", presetKey: "features.stego.enabled", uiEntry: "settings_toggle:feature-toggle-stego-toolkit" },
  { id: "ephemeral_stego_lifecycle", name: "Ephemeral stego lifecycle management", presetKey: "features.stego.ephemeral", uiEntry: "room_action:feature-room-ephemeral-stego" },
  { id: "governance_entitlements", name: "Governance and entitlement policy layer", presetKey: "features.governance.entitlements", uiEntry: "admin_console:feature-admin-governance-entitlements" },
  { id: "federation_boost_policy", name: "Federation boost policy engine", presetKey: "features.federationBoost.enabled", uiEntry: "admin_console:feature-admin-federation-boost" },
  { id: "townhall_sfu", name: "Townhall SFU sessions and moderation", presetKey: "features.townhall.enabled", uiEntry: "widget_panel:feature-widget-townhall-sfu" },

  // Cinny extraction plan coverage.
  { id: "matrix_bootstrap", name: "Matrix bootstrap and crypto init", presetKey: "features.platform.bootstrap", uiEntry: "settings_toggle:feature-toggle-matrix-bootstrap" },
  { id: "timeline_virtualized", name: "Timeline virtualization engine", presetKey: "features.timeline.virtualized", uiEntry: "room_action:feature-room-timeline-virtualized" },
  { id: "timeline_threads", name: "Thread panel and m.thread rendering", presetKey: "features.timeline.threads", uiEntry: "room_action:feature-room-threads" },
  { id: "timeline_receipts", name: "Read receipts and fully-read marker", presetKey: "features.timeline.readReceipts", uiEntry: "room_action:feature-room-read-receipts" },
  { id: "timeline_typing", name: "Typing indicators", presetKey: "features.timeline.typingIndicators", uiEntry: "room_action:feature-room-typing-indicators" },
  { id: "timeline_pins", name: "Pinned messages panel", presetKey: "features.timeline.pinnedMessages", uiEntry: "room_action:feature-room-pinned-messages" },
  { id: "rich_composer", name: "Rich composer ergonomics", presetKey: "features.composer.richEditing", uiEntry: "composer_action:feature-composer-rich-editing" },
  { id: "composer_replies", name: "Reply composer and quote preview", presetKey: "features.composer.replies", uiEntry: "composer_action:feature-composer-replies" },
  { id: "composer_edits", name: "Message edit flow", presetKey: "features.composer.edits", uiEntry: "composer_action:feature-composer-edits" },
  { id: "composer_redactions", name: "Message redaction flow", presetKey: "features.composer.redactions", uiEntry: "composer_action:feature-composer-redactions" },
  { id: "typing_indicators", name: "Composer typing indicators", presetKey: "features.composer.typingIndicators", uiEntry: "composer_action:feature-composer-typing-indicators" },
  { id: "media_pipeline", name: "Media upload and MXC pipeline", presetKey: "features.media.pipeline", uiEntry: "widget_panel:feature-widget-media-pipeline" },
  { id: "media_spoilers", name: "Spoiler rendering", presetKey: "features.media.spoilers", uiEntry: "widget_panel:feature-widget-media-spoilers" },
  { id: "media_codeblocks", name: "Code block rendering", presetKey: "features.media.codeBlocks", uiEntry: "widget_panel:feature-widget-media-codeblocks" },
  { id: "media_link_previews", name: "Link preview cards", presetKey: "features.media.linkPreviews", uiEntry: "widget_panel:feature-widget-link-previews" },
  { id: "space_hierarchy", name: "Space hierarchy navigation", presetKey: "features.nav.spaceHierarchy", uiEntry: "room_action:feature-room-space-hierarchy" },
  { id: "dm_list", name: "DM list from m.direct", presetKey: "features.nav.dmList", uiEntry: "room_action:feature-room-dm-list" },
  { id: "room_invites", name: "Invite inbox and actions", presetKey: "features.nav.roomInvites", uiEntry: "room_action:feature-room-invites" },
  { id: "search_ui", name: "Search and jump-to-message", presetKey: "features.nav.search", uiEntry: "room_action:feature-room-search" },
  { id: "widget_shell_layouts", name: "Widget shell layouts", presetKey: "features.widgets.layouts", uiEntry: "widget_panel:feature-widget-shell-layouts" },
  { id: "settings_framework", name: "Settings framework shell", presetKey: "features.settings.framework", uiEntry: "settings_toggle:feature-toggle-settings-framework" },
  { id: "settings_notifications", name: "Notification settings", presetKey: "features.settings.notifications", uiEntry: "settings_toggle:feature-toggle-settings-notifications" },
  { id: "settings_appearance", name: "Appearance settings", presetKey: "features.settings.appearance", uiEntry: "settings_toggle:feature-toggle-settings-appearance" },
  { id: "settings_account", name: "Account settings", presetKey: "features.settings.account", uiEntry: "settings_toggle:feature-toggle-settings-account" },
  { id: "settings_emoji", name: "Emoji style settings", presetKey: "features.settings.emoji", uiEntry: "settings_toggle:feature-toggle-settings-emoji" },
  { id: "settings_zoom", name: "Page zoom controls", presetKey: "features.settings.zoom", uiEntry: "settings_toggle:feature-toggle-settings-zoom" },
  { id: "element_call", name: "Element Call widget integration", presetKey: "features.call.elementCall", uiEntry: "widget_panel:feature-widget-element-call" },
  { id: "owncast_live", name: "Owncast live player and chat embed", presetKey: "features.townhall.enabled", uiEntry: "widget_panel:feature-widget-owncast-live" },

  // Blackout custom build manifest coverage.
  { id: "matrix_client_arch", name: "Matrix-native client architecture", presetKey: "features.matrix.client", uiEntry: "settings_toggle:feature-toggle-matrix-client" },
  { id: "homeserver_discovery", name: "Homeserver discovery and validation", presetKey: "features.matrix.homeserverDiscovery", uiEntry: "settings_toggle:feature-toggle-homeserver-discovery" },
  { id: "e2ee_defaults", name: "E2EE defaults and policy controls", presetKey: "features.security.e2eeDefaults", uiEntry: "settings_toggle:feature-toggle-e2ee-defaults" },
  { id: "oidc_delegated_auth", name: "OIDC delegated authentication", presetKey: "features.auth.oidc", uiEntry: "settings_toggle:feature-toggle-oidc-auth" },
  { id: "matrix_widget_compat", name: "Matrix widget state-event compatibility", presetKey: "features.matrix.widgetCompat", uiEntry: "widget_panel:feature-widget-matrix-compat" },
  // Deprecated compatibility alias for one release cycle: use `matrix_bootstrap`.
  { id: "multiplatform_bootstrap", name: "Multi-platform Matrix bootstrap", presetKey: "features.platform.bootstrap", uiEntry: "room_action:feature-room-multiplatform-bootstrap", aliasOfId: "matrix_bootstrap" },
  { id: "named_roles", name: "Named role system (co.bmc.roles)", presetKey: "features.bmc.roles", uiEntry: "admin_console:feature-admin-bmc-roles" },
  { id: "welcome_screen", name: "Welcome screen (co.bmc.welcome)", presetKey: "features.bmc.welcome", uiEntry: "room_action:feature-room-bmc-welcome" },
  { id: "onboarding_flow", name: "Onboarding flow (co.bmc.onboarding)", presetKey: "features.bmc.onboarding", uiEntry: "room_action:feature-room-bmc-onboarding" },
  { id: "forum_channels", name: "Forum channels (co.bmc.forum)", presetKey: "features.bmc.forum", uiEntry: "room_action:feature-room-bmc-forum" },
  { id: "soundboard", name: "Soundboard (co.bmc.soundboard)", presetKey: "features.bmc.soundboard", uiEntry: "widget_panel:feature-widget-bmc-soundboard" },
  { id: "space_templates", name: "Space templates (co.bmc.template)", presetKey: "features.bmc.templates", uiEntry: "admin_console:feature-admin-bmc-templates" },
  { id: "server_banner", name: "Server banner (co.bmc.banner)", presetKey: "features.bmc.banner", uiEntry: "room_action:feature-room-bmc-banner" },
  { id: "invite_splash", name: "Custom invite splash", presetKey: "features.bmc.inviteSplash", uiEntry: "room_action:feature-room-bmc-invite-splash" },
  { id: "cooperative_governance", name: "Cooperative governance tools", presetKey: "features.bmc.governance", uiEntry: "admin_console:feature-admin-bmc-governance" },
  { id: "steganography_layer", name: "Steganography layer", presetKey: "features.bmc.steganography", uiEntry: "composer_action:feature-composer-bmc-steganography" },
  { id: "deaddrop_channels", name: "Dead drop channels", presetKey: "features.bmc.deaddrop", uiEntry: "room_action:feature-room-bmc-deaddrop" },
  { id: "cell_routing", name: "Cell-structure routing", presetKey: "features.bmc.cellRouting", uiEntry: "admin_console:feature-admin-bmc-cell-routing" },
  { id: "numbers_station", name: "Numbers station broadcasts", presetKey: "features.bmc.numbersStation", uiEntry: "widget_panel:feature-widget-bmc-numbers-station" },
  { id: "solarpunk_theme", name: "Solarpunk theme engine", presetKey: "features.bmc.solarpunkTheme", uiEntry: "settings_toggle:feature-toggle-bmc-solarpunk-theme" },
  { id: "extended_profile", name: "Extended profile system", presetKey: "features.bmc.extendedProfile", uiEntry: "settings_toggle:feature-toggle-bmc-extended-profile" },
  { id: "quick_switcher", name: "Quick switcher (Ctrl+K)", presetKey: "features.bmc.quickSwitcher", uiEntry: "room_action:feature-room-bmc-quick-switcher" },
  { id: "server_folders", name: "Server folders", presetKey: "features.bmc.serverFolders", uiEntry: "room_action:feature-room-bmc-server-folders" },
  { id: "bookmark_system", name: "Bookmark system", presetKey: "features.bmc.bookmarks", uiEntry: "room_action:feature-room-bmc-bookmarks" },
  { id: "streamer_mode", name: "Streamer mode", presetKey: "features.bmc.streamerMode", uiEntry: "settings_toggle:feature-toggle-bmc-streamer-mode" },
  { id: "developer_mode", name: "Developer mode", presetKey: "features.bmc.developerMode", uiEntry: "settings_toggle:feature-toggle-bmc-developer-mode" },
  { id: "rich_presence", name: "Activity status / rich presence", presetKey: "features.bmc.richPresence", uiEntry: "settings_toggle:feature-toggle-bmc-rich-presence" },
  { id: "dm_permissions", name: "DM permission controls", presetKey: "features.bmc.dmPermissions", uiEntry: "settings_toggle:feature-toggle-bmc-dm-permissions" },
  { id: "stage_channels", name: "Stage channels", presetKey: "features.bmc.stageChannels", uiEntry: "widget_panel:feature-widget-bmc-stage-channels" },
  { id: "timeout_system", name: "Timeout system", presetKey: "features.bmc.timeout", uiEntry: "admin_console:feature-admin-bmc-timeout" },
  { id: "automod_panel", name: "AutoMod config panel", presetKey: "features.bmc.automod", uiEntry: "admin_console:feature-admin-bmc-automod" },
  { id: "audit_log", name: "Audit log viewer", presetKey: "features.bmc.auditLog", uiEntry: "admin_console:feature-admin-bmc-audit-log" },
  { id: "raid_protection", name: "Raid protection UI", presetKey: "features.bmc.raidProtection", uiEntry: "admin_console:feature-admin-bmc-raid-protection" },
  { id: "nsfw_toggle", name: "Content warning / NSFW toggle", presetKey: "features.bmc.nsfwGate", uiEntry: "settings_toggle:feature-toggle-bmc-nsfw-gate" },
  { id: "slowmode", name: "Slowmode controls", presetKey: "features.bmc.slowmode", uiEntry: "room_action:feature-room-bmc-slowmode" },
];

/**
 * Advanced admin-console controls that should resolve to concrete policy/control surfaces.
 * Baseline governance workflows (proposal feed, voting, basic composer flow) remain outside
 * paid admin upsell and are intentionally not listed here.
 */
export const PREMIUM_ADMIN_CONSOLE_FEATURE_IDS = [
  "federation_boost_policy",
  "engagement_experiments",
  "space_templates",
  "cell_routing",
] as const;
