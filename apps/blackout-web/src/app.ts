import { ApiError, type GatewayEvent } from "./api/client";
import { renderChannelSidebar } from "./components/ChannelSidebar";
import { renderChatWindow } from "./components/ChatWindow";
import { renderCreateEntityModal } from "./components/CreateEntityModal";
import { renderServerSidebar } from "./components/ServerSidebar";
import { renderAuthView } from "./features/auth/auth-view";
import { createApiClient } from "./services/api";
import { MatrixGatewayClient } from "./services/matrix-client";
import { createTelemetryClient } from "./services/telemetry";
import { SessionStore } from "./session/store";
import { FEATURE_UI_ENTRIES, type UiEntryKind } from "./settings/feature-entrypoints";
import { FEATURE_PRESET_BUNDLES, type FeaturePresetKey } from "./settings/feature-presets";
import { AppStore, type PendingCreate } from "./store/app-store";
import type { BlackoutRuntimeConfig } from "./config";
import type { ChatMessage, ServerDetails } from "./types";

const NAME_PATTERN = /^[a-zA-Z0-9 _-]{2,40}$/;

type WorkspacePanelView = "chat" | "dms" | "activity" | "files" | "repo-tools";

export class BlackoutWebApp {
  private readonly root: HTMLElement;
  private readonly api = createApiClient();
  private readonly sessions = new SessionStore();
  private readonly matrixGateway = new MatrixGatewayClient();
  private readonly store = new AppStore(this.sessions.load());
  private readonly seenEventIds = new Set<string>();

  private readonly runtimeConfig: BlackoutRuntimeConfig;
  private readonly deploymentPreset: FeaturePresetKey;
  private appliedPreset: FeaturePresetKey;
  private selectedPreset: FeaturePresetKey;
  private appliedFeatures: Record<string, boolean>;
  private featureActionResult: string | null = null;
  private featureFilter = "";
  private quickAccessFeatureId = FEATURE_UI_ENTRIES[0]?.id ?? "";
  private commandPaletteQuery = "";
  private commandPaletteOpen = false;
  private commandPalettePreviouslyFocused: HTMLElement | null = null;
  private commandPalettePreviouslyFocusedSelector: string | null = null;
  private compactModeEnabled = false;
  private settingsOpen = false;
  private composerIsTyping = false;
  private activeWorkspacePanel: WorkspacePanelView = "chat";
  private repoToolsOpen = false;
  private readonly telemetry;
  private readonly trackedDenials = new Set<string>();
  private readonly hasSeenFeatureTooltips: boolean;

  private readonly featureKindUi: Record<UiEntryKind, { icon: string; label: string; firstUseTooltip: string }> = {
    settings_toggle: {
      icon: "⚙️",
      label: "Settings toggles",
      firstUseTooltip: "Use these to tune workspace behavior and personal defaults.",
    },
    composer_action: {
      icon: "✍️",
      label: "Composer actions",
      firstUseTooltip: "Quick inserts and send-flow helpers for faster authoring.",
    },
    room_action: {
      icon: "💬",
      label: "Room actions",
      firstUseTooltip: "Context actions for channels, threads, and room workflows.",
    },
    widget_panel: {
      icon: "🧩",
      label: "Widget panels",
      firstUseTooltip: "Open feature surfaces embedded alongside chat.",
    },
    admin_console: {
      icon: "🛡️",
      label: "Admin & governance",
      firstUseTooltip: "Operational controls for moderation, policy, and access.",
    },
    command_palette: {
      icon: "⌘",
      label: "Command palette",
      firstUseTooltip: "Run quick commands from a bounded list without feed mechanics.",
    },
  };

  constructor(root: HTMLElement, runtimeConfig: BlackoutRuntimeConfig = {
    homeserverUrl: "https://matrix.blackout.local",
    mode: "daily-chat",
    rollout: {
      cohort: "internal",
    },
    presets: {
      activePreset: "baseline_matrix",
      features: {},
      diagnostics: {
        deploymentPreset: "baseline_matrix",
        tenantPreset: null,
        userOverrideCount: 0,
      },
    },
    engagement: {
      policy: {
        notifications: { mode: "balanced" },
        discover: { enabled: true },
        streaks: { enabled: false },
        leaderboards: { enabled: false },
        wellbeing: {
          breakPrompts: { enabled: true },
          maxNudgesPerDay: 3,
        },
      },
      notificationRules: [],
    },
  }) {
    this.root = root;
    this.runtimeConfig = runtimeConfig;
    this.telemetry = createTelemetryClient(this.runtimeConfig.rollout.cohort);
    this.deploymentPreset = runtimeConfig.presets.diagnostics.deploymentPreset;
    this.appliedPreset = runtimeConfig.presets.activePreset;
    this.selectedPreset = runtimeConfig.presets.activePreset;
    this.hasSeenFeatureTooltips = globalThis.localStorage.getItem("blackout.featureTipsSeen") === "true";
    this.appliedFeatures = Object.keys(runtimeConfig.presets.features).length
      ? { ...runtimeConfig.presets.features }
      : { ...FEATURE_PRESET_BUNDLES[runtimeConfig.presets.activePreset] };
  }

  async mount(): Promise<void> {
    this.telemetry.track("preset_adoption_seen", {
      preset: this.appliedPreset,
      cohort: this.runtimeConfig.rollout.cohort,
    });
    globalThis.document.addEventListener("keydown", this.handleGlobalKeyDown);
    this.render();

    const state = this.store.getState();
    if (!state.session) return;

    this.connectGateway();
    await this.loadServers();
  }

  private render(): void {
    const state = this.store.getState();
    const loading = state.loading;
    const modalMode = state.pendingCreate;

    this.root.innerHTML = `
      <main class="container">
        <header class="header">
          <h1>Blackout Chat</h1>
          <p class="meta">A familiar, modern messaging workspace inspired by the best team chat apps.</p>
          <details class="header-environment panel-card" data-testid="environment-details">
            <summary>Environment details</summary>
            <p class="meta" data-testid="active-preset">Active preset: <strong>${this.appliedPreset}</strong></p>
            <p class="meta" data-testid="release-cohort">Release cohort: ${this.runtimeConfig.rollout.cohort}</p>
            <p class="meta" data-testid="preset-diagnostics">Preset sources: deployment=${this.runtimeConfig.presets.diagnostics.deploymentPreset}, tenant=${this.runtimeConfig.presets.diagnostics.tenantPreset ?? "none"}, user overrides=${this.runtimeConfig.presets.diagnostics.userOverrideCount}</p>
          </details>
        </header>
        <div class="header-actions">
          <div class="header-actions-copy">
            <strong>Workspace controls</strong>
            <span class="meta">Use ⌘K / Ctrl+K for the command palette, or open settings for full feature management.</span>
          </div>
          ${this.renderFeatureCommandPaletteTrigger()}
          <button type="button" class="ghost-btn" data-action="toggle-compact-mode" data-testid="toggle-compact-mode">${this.compactModeEnabled ? "Disable compact mode" : "Enable compact mode"}</button>
          <button type="button" class="ghost-btn" data-action="toggle-settings" data-testid="toggle-settings-button">${this.settingsOpen ? "Close settings" : "Open settings"}</button>
        </div>
        ${this.settingsOpen ? `<section class="admin-grid">${this.renderPresetManagementSection()}${this.renderFeatureLibraryDisclosure()}${(this.getActivePresetFeatures()["features.epic.deliveryBlueprint"] ?? false) ? this.renderEpicDeliverySection() : ""}</section>` : ""}
        ${this.featureActionResult ? `<p class="meta" data-testid="feature-action-result">${this.featureActionResult}</p>` : ""}

        ${state.error ? `<p class="error" role="alert">${state.error}</p>` : ""}
        ${loading.servers || loading.channels || loading.messages ? '<p class="loading">Syncing workspace…</p>' : ""}

        ${state.session ? this.renderWorkspace() : renderAuthView({ mode: state.authMode, busy: loading.auth })}
        ${state.session ? this.renderFeatureToolbar() : ""}
      </main>
      ${modalMode !== "none" ? renderCreateEntityModal({ mode: modalMode, value: state.createName, error: state.createError, busy: loading.channels || loading.servers }) : ""}
      ${this.commandPaletteOpen ? this.renderFeatureCommandPalette() : ""}
    `;

    this.bindEvents();
    this.scrollMessagesToBottom();
  }

  private renderWorkspace(): string {
    const state = this.store.getState();
    const selectedServer = state.servers.find((server) => server.id === state.activeServerId);

    return `
      <section class="workspace ${state.channelDrawerOpen ? "show-channel-drawer" : ""} ${this.getCompactModeActive() ? "workspace--compact" : ""}">
        ${renderServerSidebar({ servers: state.servers, activeServerId: state.activeServerId, activeView: this.activeWorkspacePanel })}
        ${renderChannelSidebar({
          serverName: selectedServer?.name ?? "Channels",
          channels: state.channels,
          activeChannelId: state.activeChannelId,
          unreadByChannel: state.unreadByChannel,
        })}
        ${this.renderWorkspacePanel()}
      </section>
    `;
  }


  private renderWorkspacePanel(): string {
    if (this.activeWorkspacePanel === "repo-tools") {
      return this.renderRepoToolsPage();
    }

    if (this.activeWorkspacePanel === "dms") {
      return this.renderDmsPanel();
    }

    if (this.activeWorkspacePanel === "activity") {
      return this.renderActivityPanel();
    }

    if (this.activeWorkspacePanel === "files") {
      return this.renderFilesPanel();
    }

    const state = this.store.getState();
    return renderChatWindow({
      channelLabel: state.activeChannelId ? `#${state.channels.find((channel) => channel.id === state.activeChannelId)?.name ?? "channel"}` : "Pick a channel",
      messages: state.messages,
      canSend: Boolean(state.activeChannelId),
      sendPending: state.loading.send,
      richEditingEnabled: this.getActivePresetFeatures()["features.composer.richEditing"] ?? false,
      stegoEnabled: (this.getActivePresetFeatures()["features.stego.enabled"] ?? false) || (this.getActivePresetFeatures()["features.bmc.steganography"] ?? false),
      composerRepliesEnabled: this.getActivePresetFeatures()["features.composer.replies"] ?? false,
      composerEditsEnabled: this.getActivePresetFeatures()["features.composer.edits"] ?? false,
      composerRedactionsEnabled: this.getActivePresetFeatures()["features.composer.redactions"] ?? false,
      mediaCodeBlocksEnabled: this.getActivePresetFeatures()["features.media.codeBlocks"] ?? false,
      mediaSpoilersEnabled: this.getActivePresetFeatures()["features.media.spoilers"] ?? false,
      typingIndicatorsEnabled: this.getActivePresetFeatures()["features.composer.typingIndicators"] ?? false,
      showTypingIndicator: this.composerIsTyping,
      compactMode: this.getCompactModeActive(),
      compactRecommended: this.isMessageHeavySession(),
    });
  }

  private renderRepoToolsPage(): string {
    const tools = [
      { name: "Build", command: "pnpm build", description: "Run the monorepo build across packages." },
      { name: "Lint", command: "pnpm lint", description: "Type and static checks via turbo tasks." },
      { name: "Unit tests", command: "pnpm test", description: "Execute the repository test matrix." },
      { name: "Feature registry guard", command: "pnpm guard:feature-registry", description: "Validate feature entrypoint declarations." },
      { name: "Preset completeness", command: "pnpm guard:preset-complete", description: "Ensure feature presets remain complete and consistent." },
      { name: "Port change guard", command: "pnpm guard:port", description: "Detect unauthorized port exposure changes." },
    ];

    const items = tools
      .map(
        (tool) => `
          <li class="repo-tools-item">
            <div>
              <strong>${tool.name}</strong>
              <p class="meta">${tool.description}</p>
            </div>
            <code>${tool.command}</code>
          </li>
        `,
      )
      .join("");

    return this.renderWorkspaceUtilityPage("Repo tools", "Key repository scripts for validating and shipping safely.", items);
  }

  private renderDmsPanel(): string {
    const state = this.store.getState();
    const items = state.channels
      .filter((channel) => /^dm[\s-]/i.test(channel.name) || /\bdirect\b/i.test(channel.name))
      .map(
        (channel) => `
          <li class="repo-tools-item">
            <div>
              <strong># ${channel.name}</strong>
              <p class="meta">Open this conversation from your direct-message list.</p>
            </div>
            <button type="button" class="ghost-btn" data-action="open-channel" data-channel-id="${channel.id}">Open</button>
          </li>
        `,
      )
      .join("");

    const fallback = '<li class="repo-tools-item"><div><strong>No DMs detected</strong><p class="meta">Create a DM-named channel (for example: "dm-alex") to populate this panel.</p></div></li>';
    return this.renderWorkspaceUtilityPage("Direct messages", "A focused panel for quick DM access.", items || fallback);
  }

  private renderActivityPanel(): string {
    const state = this.store.getState();
    const activeFeatures = this.getActivePresetFeatures();
    const items = FEATURE_UI_ENTRIES
      .filter((entry) => activeFeatures[entry.presetKey] ?? false)
      .slice(0, 8)
      .map((feature) => {
        const [kind] = feature.uiEntry.split(":") as [UiEntryKind, string];
        return `
          <li class="repo-tools-item">
            <div>
              <strong>${feature.name}</strong>
              <p class="meta">${feature.id}</p>
            </div>
            <button type="button" class="ghost-btn" data-action="open-feature-entry" data-feature-id="${feature.id}" data-feature-kind="${kind}">Open</button>
          </li>
        `;
      })
      .join("");

    const fallback = `<li class="repo-tools-item"><div><strong>No active inbox items</strong><p class="meta">You currently have ${state.channels.length} channels and no surfaced activity shortcuts.</p></div></li>`;
    return this.renderWorkspaceUtilityPage("Activity inbox", "Review feature and activity shortcuts in one place.", items || fallback);
  }

  private renderFilesPanel(): string {
    const items = [
      { name: "Browse channels", description: "Jump to the channel browser and discover rooms with files.", action: "browse-channels" },
      { name: "Media pipeline widget", description: "Open media upload/rendering feature entry.", featureId: "media_pipeline" },
      { name: "Link previews", description: "Inspect link preview controls and behavior.", featureId: "media_link_previews" },
    ]
      .map((item) => {
        if (item.action) {
          return `
            <li class="repo-tools-item">
              <div><strong>${item.name}</strong><p class="meta">${item.description}</p></div>
              <button type="button" class="ghost-btn" data-action="${item.action}">Open</button>
            </li>
          `;
        }
        return `
          <li class="repo-tools-item">
            <div><strong>${item.name}</strong><p class="meta">${item.description}</p></div>
            <button type="button" class="ghost-btn" data-action="open-feature-entry" data-feature-id="${item.featureId}" data-feature-kind="widget_panel">Open</button>
          </li>
        `;
      })
      .join("");

    return this.renderWorkspaceUtilityPage("Files browser", "Locate upload, preview, and media workflows.", items);
  }

  private renderWorkspaceUtilityPage(title: string, subtitle: string, items: string): string {
    return `
      <section class="chat-window repo-tools-page" aria-label="${title}">
        <div class="chat-head">
          <div class="chat-head-copy">
            <strong>${title}</strong>
            <small>${subtitle}</small>
          </div>
          <button type="button" class="ghost-btn" data-action="open-chat-panel" aria-label="Back to chat">Back to chat</button>
        </div>
        <ul class="repo-tools-list">${items}</ul>
        ${this.repoToolsOpen ? this.renderRepoToolsPage() : renderChatWindow({
          channelLabel: state.activeChannelId ? `#${state.channels.find((channel) => channel.id === state.activeChannelId)?.name ?? "channel"}` : "Pick a channel",
          messages: state.messages,
          canSend: Boolean(state.activeChannelId),
          sendPending: state.loading.send,
          richEditingEnabled: this.getActivePresetFeatures()["features.composer.richEditing"] ?? false,
          stegoEnabled: (this.getActivePresetFeatures()["features.stego.enabled"] ?? false) || (this.getActivePresetFeatures()["features.bmc.steganography"] ?? false),
          composerRepliesEnabled: this.getActivePresetFeatures()["features.composer.replies"] ?? false,
          composerEditsEnabled: this.getActivePresetFeatures()["features.composer.edits"] ?? false,
          composerRedactionsEnabled: this.getActivePresetFeatures()["features.composer.redactions"] ?? false,
          mediaCodeBlocksEnabled: this.getActivePresetFeatures()["features.media.codeBlocks"] ?? false,
          mediaSpoilersEnabled: this.getActivePresetFeatures()["features.media.spoilers"] ?? false,
          typingIndicatorsEnabled: this.getActivePresetFeatures()["features.composer.typingIndicators"] ?? false,
          showTypingIndicator: this.composerIsTyping,
          compactMode: this.getCompactModeActive(),
          compactRecommended: this.isMessageHeavySession(),
        })}
      </section>
    `;
  }


  private renderRepoToolsPage(): string {
    const tools = [
      { name: "Build", command: "pnpm build", description: "Run the monorepo build across packages." },
      { name: "Lint", command: "pnpm lint", description: "Type and static checks via turbo tasks." },
      { name: "Unit tests", command: "pnpm test", description: "Execute the repository test matrix." },
      { name: "Feature registry guard", command: "pnpm guard:feature-registry", description: "Validate feature entrypoint declarations." },
      { name: "Preset completeness", command: "pnpm guard:preset-complete", description: "Ensure feature presets remain complete and consistent." },
      { name: "Port change guard", command: "pnpm guard:port", description: "Detect unauthorized port exposure changes." },
    ];

    const items = tools
      .map(
        (tool) => `
          <li class="repo-tools-item">
            <div>
              <strong>${tool.name}</strong>
              <p class="meta">${tool.description}</p>
            </div>
            <code>${tool.command}</code>
          </li>
        `,
      )
      .join("");

    return `
      <section class="chat-window repo-tools-page" aria-label="Repository tools">
        <div class="chat-head">
          <div class="chat-head-copy">
            <strong>Repo tools</strong>
            <small>Key repository scripts for validating and shipping safely.</small>
          </div>
          <button type="button" class="ghost-btn" data-action="close-repo-tools" aria-label="Back to chat">Back to chat</button>
        </div>
        <ul class="repo-tools-list">${items}</ul>
      </section>
    `;
  }

  private renderFeatureEntryPoints(): string {
    const filterQuery = this.featureFilter.trim().toLowerCase();
    const grouped = new Map<UiEntryKind, string[]>();
    for (const feature of FEATURE_UI_ENTRIES) {
      if (
        filterQuery &&
        !`${feature.id} ${feature.name} ${feature.uiEntry}`.toLowerCase().includes(filterQuery)
      ) {
        continue;
      }
      const [kind, testId] = feature.uiEntry.split(":") as [UiEntryKind, string];
      const enabled = this.getActivePresetFeatures()[feature.presetKey] ?? false;
      const content = enabled
        ? `<button type="button" class="ghost-btn" data-action="open-feature-entry" data-feature-id="${feature.id}" data-feature-kind="${kind}" data-testid="${testId}">${feature.name}</button>`
        : `<p class="empty" data-testid="${testId}-unavailable">${feature.name} unavailable: blocked by policy or entitlement.</p>`;
      if (!enabled) {
        this.trackDeniedFeature(feature.id, kind);
      }
      const row = `<li class="stack"><strong>${feature.id}</strong><span class="meta">${feature.uiEntry}</span>${content}</li>`;
      grouped.set(kind, [...(grouped.get(kind) ?? []), row]);
    }
    const totalEntries = Array.from(grouped.values()).reduce((total, entries) => total + entries.length, 0);
    const enabledCount = FEATURE_UI_ENTRIES.filter((feature) => this.getActivePresetFeatures()[feature.presetKey] ?? false).length;

    return `
      <section class="stack panel-card" data-testid="feature-entrypoint-registry">
        <h2>Feature library</h2>
        <p class="meta">${enabledCount} of ${totalEntries} feature entry points are active for this workspace.</p>
        <input type="search" data-action="filter-features" data-testid="feature-filter-input" value="${this.featureFilter}" placeholder="Search features by name, id, or placement" />
        ${this.renderFeatureGroup("settings_toggle", grouped.get("settings_toggle") ?? [])}
        ${this.renderFeatureGroup("composer_action", grouped.get("composer_action") ?? [])}
        ${this.renderFeatureGroup("room_action", grouped.get("room_action") ?? [])}
        ${this.renderFeatureGroup("widget_panel", grouped.get("widget_panel") ?? [])}
        ${this.renderFeatureGroup("admin_console", grouped.get("admin_console") ?? [])}
        ${this.renderFeatureGroup("command_palette", grouped.get("command_palette") ?? [])}
      </section>
    `;
  }

  private renderFeatureLibraryDisclosure(): string {
    const openByDefault = this.isAdvancedCohort();
    return `
      <details class="stack panel-card" data-testid="feature-library-disclosure" ${openByDefault ? "open" : ""}>
        <summary><strong>Advanced feature library</strong> <span class="meta">Role-based progressive reveal for power workflows.</span></summary>
        ${this.renderFeatureEntryPoints()}
      </details>
    `;
  }

  private renderFeatureCommandPaletteTrigger(): string {
    return `
      <button type="button" class="ghost-btn command-palette-trigger" data-action="open-command-palette" data-testid="open-command-palette">
        <span>Open command palette</span>
        <kbd>⌘K / Ctrl+K</kbd>
      </button>
    `;
  }

  private renderFeatureToolbar(): string {
    const activeFeatures = this.getActivePresetFeatures();
    const enabledFeatures = FEATURE_UI_ENTRIES.filter((feature) => activeFeatures[feature.presetKey] ?? false);

    if (!enabledFeatures.length) {
      return `
        <section class="feature-toolbar panel-card" data-testid="feature-toolbar">
          <p class="meta">No feature shortcuts are available in this preset.</p>
        </section>
      `;
    }

    const railButtons = enabledFeatures
      .slice(0, 8)
      .map((feature) => {
        const [kind] = feature.uiEntry.split(":") as [UiEntryKind, string];
        const selected = this.quickAccessFeatureId === feature.id ? "is-selected" : "";
        const glyph = this.getFeatureGlyph(feature.name);
        return `<button type="button" class="feature-rail-btn ${selected}" data-action="open-feature-entry" data-feature-id="${feature.id}" data-feature-kind="${kind}" data-testid="feature-toolbar-rail-${feature.id}" title="${feature.name}" aria-label="${feature.name}">${glyph}</button>`;
      })
      .join("");

    const toolbarButtons = enabledFeatures
      .map((feature) => {
        const [kind] = feature.uiEntry.split(":") as [UiEntryKind, string];
        const selected = this.quickAccessFeatureId === feature.id ? "is-selected" : "";
        const categoryLabel = this.featureKindUi[kind].label;
        return `
          <button type="button" class="feature-chip ${selected}" data-action="open-feature-entry" data-feature-id="${feature.id}" data-feature-kind="${kind}" data-testid="feature-toolbar-${feature.id}">
            <span>${feature.name}</span>
            <small>${categoryLabel}</small>
          </button>
        `;
      })
      .join("");

    return `
      <section class="feature-toolbar panel-card" data-testid="feature-toolbar">
        <div class="feature-toolbar-head">
          <h2>Quick actions</h2>
          <p class="meta">Discord-style dock: icon rail for frequent actions, detailed list for discovery.</p>
        </div>
        <div class="feature-dock-layout">
          <div class="feature-rail" aria-label="Frequent feature actions">${railButtons}</div>
          <div class="feature-toolbar-scroll">${toolbarButtons}</div>
        </div>
      </section>
    `;
  }

  private getFeatureGlyph(name: string): string {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  private renderFeatureCommandPalette(): string {
    const query = this.commandPaletteQuery.trim().toLowerCase();
    const activeFeatures = this.getActivePresetFeatures();
    const rows = FEATURE_UI_ENTRIES.filter((feature) => {
      if (!query) return true;
      return `${feature.id} ${feature.name} ${feature.uiEntry}`.toLowerCase().includes(query);
    })
      .slice(0, 14)
      .map((feature) => {
        const [kind] = feature.uiEntry.split(":") as [UiEntryKind, string];
        const enabled = activeFeatures[feature.presetKey] ?? false;
        const category = this.featureKindUi[kind];
        const tooltip = this.hasSeenFeatureTooltips ? "" : `title="${category.firstUseTooltip}"`;
        return `
          <button type="button" class="command-palette-item ${enabled ? "" : "command-palette-item--unavailable"}" data-action="open-feature-entry" data-feature-id="${feature.id}" data-feature-kind="${kind}" data-action-origin="palette" aria-disabled="${enabled ? "false" : "true"}" ${tooltip}>
            <span class="command-palette-item-main">${category.icon} ${feature.name}</span>
            <span class="meta">${category.label}${enabled ? "" : " · unavailable"}</span>
          </button>
        `;
      })
      .join("");

    return `
      <div class="command-palette-backdrop" data-action="close-command-palette">
        <section class="command-palette" data-testid="feature-command-palette" role="dialog" aria-modal="true" aria-label="Feature command palette">
          <div class="command-palette-header">
            <strong>Feature command palette</strong>
            <button type="button" class="ghost-btn" data-action="close-command-palette">Close</button>
          </div>
          <input type="search" autofocus data-action="filter-command-palette" data-testid="feature-command-palette-input" placeholder="Type a feature, category, or id…" value="${this.commandPaletteQuery}" />
          <div class="command-palette-list">${rows || '<p class="empty">No matching features.</p>'}</div>
        </section>
      </div>
    `;
  }

  private renderPresetManagementSection(): string {
    const previewFeatures = Object.entries(FEATURE_PRESET_BUNDLES[this.selectedPreset]);
    const enabledFeatures = previewFeatures.filter(([, enabled]) => enabled).map(([key]) => key);

    return `
      <section class="stack panel-card" data-testid="feature-presets-panel">
        <h2>Workspace layout presets</h2>
        <p class="meta">Pick the experience level that best matches your team, preview changes, then apply instantly.</p>
        <label class="stack">
          Preset
          <select data-testid="feature-preset-select" data-action="select-preset">
            ${this.renderPresetOption("baseline_matrix")}
            ${this.renderPresetOption("community_plus")}
            ${this.renderPresetOption("blackout_full")}
          </select>
        </label>
        <div class="stack" data-testid="preset-explainer-panel">
          <h3>What changes with this preset</h3>
          <progress max="${previewFeatures.length}" value="${enabledFeatures.length}" data-testid="preset-capability-meter"></progress>
          <p class="meta">${enabledFeatures.length}/${previewFeatures.length} capabilities enabled.</p>
          <ul class="stack">
            ${enabledFeatures.map((key) => `<li class="meta" data-testid="preset-capability-${key.replaceAll(".", "-")}">${key}</li>`).join("")}
          </ul>
        </div>
        <div class="modal-actions">
          <button type="button" data-action="apply-preset" data-testid="apply-preset-button" ${this.selectedPreset === this.appliedPreset ? "disabled" : ""}>Apply preset</button>
          <button type="button" class="ghost-btn" data-action="rollback-preset" data-testid="rollback-preset-button" ${this.appliedPreset === this.deploymentPreset ? "disabled" : ""}>Reset to default preset</button>
        </div>
      </section>
    `;
  }

  private renderEpicDeliverySection(): string {
    return `
      <section class="stack panel-card" data-testid="epic-delivery-panel">
        <h2>EPIC delivery blueprint</h2>
        <p class="meta">Template for implementing <code>&lt;epic_name&gt;</code> while preserving E2EE and Matrix protocol compatibility.</p>
        <ul class="stack">
          <li data-testid="epic-deliverable-design"><strong>Technical design note:</strong> architecture, trust boundaries, and Matrix/Synapse integration points.</li>
          <li data-testid="epic-deliverable-schema"><strong>Data + event schema:</strong> introduce additive room/account data shapes only; avoid wire-protocol breaking changes.</li>
          <li data-testid="epic-deliverable-ui"><strong>UI/UX:</strong> ship behind feature flag with unavailable-state fallback copy.</li>
          <li data-testid="epic-deliverable-tests"><strong>Tests:</strong> unit + integration coverage, including encrypted room workflows and permission denials.</li>
          <li data-testid="epic-deliverable-rollout"><strong>Telemetry + rollout:</strong> cohort rollout plan with rollback trigger and migration notes.</li>
        </ul>
        <h3>Definition of done</h3>
        <ul class="stack">
          <li data-testid="epic-dod-acceptance">Acceptance criteria are met.</li>
          <li data-testid="epic-dod-e2ee">No E2EE regressions.</li>
          <li data-testid="epic-dod-permissions">Permission model validated for allow/deny paths.</li>
          <li data-testid="epic-dod-rollout">Feature flag + migration notes documented.</li>
        </ul>
      </section>
    `;
  }

  private renderPresetOption(preset: FeaturePresetKey): string {
    return `<option value="${preset}" ${this.selectedPreset === preset ? "selected" : ""}>${preset}</option>`;
  }

  private readonly handleGlobalKeyDown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      this.openCommandPalette();
      return;
    }

    if (event.key === "Escape" && this.commandPaletteOpen) {
      this.closeCommandPalette();
    }
  };

  private isMessageHeavySession(): boolean {
    return this.store.getState().messages.length >= 30;
  }

  private isAdvancedCohort(): boolean {
    const cohort = this.runtimeConfig.rollout.cohort.toLowerCase();
    return cohort.includes("internal") || cohort.includes("operator") || cohort.includes("admin");
  }

  private getCompactModeActive(): boolean {
    return this.compactModeEnabled || this.isMessageHeavySession();
  }

  private getActivePresetFeatures(): Record<string, boolean> {
    return this.appliedFeatures;
  }

  private renderFeatureGroup(kind: UiEntryKind, items: string[]): string {
    const category = this.featureKindUi[kind];
    const tooltip = this.hasSeenFeatureTooltips ? "" : `title="${category.firstUseTooltip}"`;
    return `
      <details class="stack" open>
        <summary ${tooltip}><strong>${category.icon} ${category.label}</strong> <span class="meta">(${items.length})</span></summary>
        <ul class="stack">${items.join("") || '<li class="empty">No matching entries.</li>'}</ul>
      </details>
    `;
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-command-palette']").forEach((button) => {
      button.addEventListener("click", () => {
        this.openCommandPalette();
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='close-command-palette']").forEach((element) => {
      element.addEventListener("click", (event) => {
        if (element.classList.contains("command-palette") || element.closest(".command-palette")) {
          event.stopPropagation();
        }
        this.closeCommandPalette();
      });
    });

    this.root.querySelector<HTMLInputElement>("[data-action='filter-command-palette']")?.addEventListener("input", (event) => {
      this.commandPaletteQuery = (event.currentTarget as HTMLInputElement).value;
      this.render();
    });

    this.root.querySelector<HTMLFormElement>("#auth-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleAuthSubmit(event.currentTarget as HTMLFormElement);
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='toggle-auth-mode']")?.addEventListener("click", () => {
      const nextMode = this.store.getState().authMode === "login" ? "register" : "login";
      this.store.patch({ authMode: nextMode, error: null });
      this.render();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-server']").forEach((button) => {
      button.addEventListener("click", () => {
        const serverId = button.dataset.serverId;
        if (!serverId) return;
        this.activeWorkspacePanel = "chat";
        this.repoToolsOpen = false;
        void this.openServer(serverId);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-channel']").forEach((button) => {
      button.addEventListener("click", () => {
        const channelId = button.dataset.channelId;
        if (!channelId) return;
        this.activeWorkspacePanel = "chat";
        this.repoToolsOpen = false;
        void this.openChannel(channelId);
        this.store.patch({ channelDrawerOpen: false });
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='create-server']").forEach((button) => {
      button.addEventListener("click", () => {
        this.openCreateModal("server");
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='create-channel']").forEach((button) => {
      button.addEventListener("click", () => {
        this.openCreateModal("channel");
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='browse-channels']").forEach((button) => {
      button.addEventListener("click", () => {
        this.store.patch({ channelDrawerOpen: true });
        this.featureActionResult = "Browse available channels from the channel list, then pick one to jump into the conversation.";
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-repo-tools']").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeWorkspacePanel = "repo-tools";
        this.repoToolsOpen = true;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-dms-panel']").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeWorkspacePanel = "dms";
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-activity-panel']").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeWorkspacePanel = "activity";
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-files-panel']").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeWorkspacePanel = "files";
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-chat-panel']").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeWorkspacePanel = "chat";
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='close-repo-tools']").forEach((button) => {
      button.addEventListener("click", () => {
        this.repoToolsOpen = false;
        this.render();
      });
    });


    this.root.querySelector<HTMLButtonElement>("[data-action='cancel-create']")?.addEventListener("click", () => {
      this.closeCreateModal();
    });

    this.root.querySelector<HTMLFormElement>("#create-entity-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submitCreateEntity(event.currentTarget as HTMLFormElement);
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='toggle-settings']").forEach((button) => {
      button.addEventListener("click", () => {
        this.settingsOpen = !this.settingsOpen;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='toggle-compact-mode']").forEach((button) => {
      button.addEventListener("click", () => {
        this.compactModeEnabled = !this.compactModeEnabled;
        this.render();
      });
    });

    this.root.querySelector<HTMLSelectElement>("[data-action='select-preset']")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value as FeaturePresetKey;
      this.selectedPreset = value;
      this.render();
    });

    this.root.querySelector<HTMLInputElement>("[data-action='filter-features']")?.addEventListener("input", (event) => {
      this.featureFilter = (event.currentTarget as HTMLInputElement).value;
      this.render();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='apply-preset']")?.addEventListener("click", () => {
      if (this.selectedPreset === this.appliedPreset) return;
      const approved = globalThis.confirm?.(`Apply preset ${this.selectedPreset}?`) ?? true;
      if (!approved) return;
      this.appliedPreset = this.selectedPreset;
      this.appliedFeatures = { ...FEATURE_PRESET_BUNDLES[this.selectedPreset] };
      this.telemetry.track("preset_applied", { preset: this.appliedPreset, cohort: this.runtimeConfig.rollout.cohort });
      this.render();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='rollback-preset']")?.addEventListener("click", () => {
      if (this.appliedPreset === this.deploymentPreset) return;
      const approved = globalThis.confirm?.(`Rollback preset to ${this.deploymentPreset}?`) ?? true;
      if (!approved) return;
      this.appliedPreset = this.deploymentPreset;
      this.selectedPreset = this.deploymentPreset;
      this.appliedFeatures = { ...FEATURE_PRESET_BUNDLES[this.deploymentPreset] };
      this.telemetry.track("preset_rollback", { preset: this.deploymentPreset, cohort: this.runtimeConfig.rollout.cohort });
      this.render();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-feature-entry']").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.actionOrigin === "palette") {
          this.closeCommandPalette({ restoreFocus: false });
          if (!this.hasSeenFeatureTooltips) {
            globalThis.localStorage.setItem("blackout.featureTipsSeen", "true");
          }
        }
        this.openFeatureById(button.dataset.featureId);
      });
    });


    this.root.querySelector<HTMLButtonElement>("[data-action='toggle-channel-drawer']")?.addEventListener("click", () => {
      const current = this.store.getState().channelDrawerOpen;
      this.store.patch({ channelDrawerOpen: !current });
      this.render();
    });

    this.root.querySelector<HTMLFormElement>("#message-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.composerIsTyping = false;
      void this.handleSendMessage(event.currentTarget as HTMLFormElement);
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-format-bold']")?.addEventListener("click", () => {
      this.applyComposerSnippet("**bold**");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-format-italic']")?.addEventListener("click", () => {
      this.applyComposerSnippet("_italic_");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-insert-emoji']")?.addEventListener("click", () => {
      this.applyComposerSnippet(" 😊");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-insert-stego']")?.addEventListener("click", () => {
      this.applyComposerSnippet(" [stego::hidden-message]");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-help']")?.addEventListener("click", () => {
      this.featureActionResult = "Composer tips: Enter sends, Shift+Enter adds a line break, and formatting tools insert snippets at the cursor.";
      this.render();
    });

    this.root.querySelector<HTMLSelectElement>("[data-action='composer-more-actions']")?.addEventListener("change", (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      const action = select.value;
      if (!action) return;
      const snippetMap: Record<string, string> = {
        reply: " > reply context\n",
        edit: " [edit::message-id]",
        redact: " [redact::message-id]",
        code: "\n```text\ncode snippet\n```\n",
        spoiler: " ||spoiler||",
      };
      const snippet = snippetMap[action];
      if (snippet) {
        this.applyComposerSnippet(snippet);
      }
      select.value = "";
    });


    this.root.querySelector<HTMLTextAreaElement>("#message-form textarea[name='message']")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const form = (event.currentTarget as HTMLTextAreaElement).form;
        form?.requestSubmit();
      }
    });

    this.root.querySelector<HTMLTextAreaElement>("#message-form textarea[name='message']")?.addEventListener("input", (event) => {
      const canShowTyping = this.getActivePresetFeatures()["features.composer.typingIndicators"] ?? false;
      if (!canShowTyping) return;
      const value = (event.currentTarget as HTMLTextAreaElement).value.trim();
      this.composerIsTyping = value.length > 0;
      this.render();
    });

    this.bindCommandPaletteFocusTrap();
  }

  private openCommandPalette(): void {
    const active = globalThis.document.activeElement;
    this.commandPalettePreviouslyFocused = active instanceof HTMLElement ? active : null;
    const testId = this.commandPalettePreviouslyFocused?.dataset.testid;
    if (testId) {
      this.commandPalettePreviouslyFocusedSelector = `[data-testid="${testId}"]`;
    } else if (this.commandPalettePreviouslyFocused?.id) {
      this.commandPalettePreviouslyFocusedSelector = `#${this.commandPalettePreviouslyFocused.id}`;
    } else {
      this.commandPalettePreviouslyFocusedSelector = null;
    }
    this.commandPaletteOpen = true;
    this.commandPaletteQuery = "";
    this.render();
  }

  private closeCommandPalette(options: { restoreFocus: boolean } = { restoreFocus: true }): void {
    this.commandPaletteOpen = false;
    this.render();
    if (options.restoreFocus) {
      const fallbackElement = this.commandPalettePreviouslyFocused;
      const selector = this.commandPalettePreviouslyFocusedSelector;
      const restoredElement = selector ? this.root.querySelector<HTMLElement>(selector) : null;
      (restoredElement ?? fallbackElement)?.focus();
    }
  }

  private bindCommandPaletteFocusTrap(): void {
    const palette = this.root.querySelector<HTMLElement>("[data-testid='feature-command-palette']");
    if (!palette) return;
    palette.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = palette.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = globalThis.document.activeElement;

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  private applyComposerSnippet(snippet: string): void {
    const textarea = this.root.querySelector<HTMLTextAreaElement>("#message-form textarea[name='message']");
    if (!textarea) return;
    textarea.value = `${textarea.value}${snippet}`;
    textarea.focus();
  }

  private openFeatureById(featureId?: string): void {
    if (!featureId) return;
    const entry = FEATURE_UI_ENTRIES.find((feature) => feature.id === featureId);
    if (!entry) return;
    const [kind] = entry.uiEntry.split(":") as [UiEntryKind, string];
    const enabled = this.getActivePresetFeatures()[entry.presetKey] ?? false;
    if (!enabled) {
      this.featureActionResult = `${entry.id} is unavailable: blocked by policy or entitlement.`;
      this.trackDeniedFeature(entry.id, kind);
      this.render();
      return;
    }
    this.featureActionResult = `Opened ${entry.id} via ${kind}.`;
    this.quickAccessFeatureId = entry.id;
    this.telemetry.track("feature_open_success", { featureId: entry.id, entrypointKind: kind });
    this.render();
  }

  private trackDeniedFeature(featureId: string, kind: UiEntryKind): void {
    const dedupeKey = `${this.appliedPreset}:${featureId}`;
    if (this.trackedDenials.has(dedupeKey)) return;
    this.trackedDenials.add(dedupeKey);
    this.telemetry.track("feature_open_denied", {
      featureId,
      entrypointKind: kind,
      reason: "blocked_by_policy_or_entitlement",
    });
  }

  private async withLoading<T extends keyof ReturnType<AppStore["getState"]>["loading"]>(
    key: T,
    work: () => Promise<void>,
    onError: (message: string) => void = (message) => {
      this.store.patch({ error: message });
    },
  ): Promise<void> {
    this.store.patchLoading({ [key]: true });
    this.render();

    try {
      await work();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Unexpected error.";
      onError(message);
    } finally {
      this.store.patchLoading({ [key]: false });
      this.render();
    }
  }

  private async handleAuthSubmit(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();
    const mode = this.store.getState().authMode;

    await this.withLoading("auth", async () => {
      const session = mode === "login" ? await this.api.login(username, password) : await this.api.register(username, password);
      this.sessions.save(session);
      this.store.patch({ session, error: null });
      this.connectGateway();
      await this.loadServers();
    });
  }

  private async loadServers(): Promise<void> {
    const state = this.store.getState();
    const session = state.session;
    if (!session) return;

    await this.withLoading("servers", async () => {
      const servers = await this.api.getServers(session);
      const preferredServerId = state.activeServerId && servers.some((server) => server.id === state.activeServerId) ? state.activeServerId : servers[0]?.id ?? null;

      this.store.patch({
        servers,
        activeServerId: preferredServerId,
        channels: [],
        activeChannelId: null,
        messages: [],
      });

      if (preferredServerId) {
        await this.openServer(preferredServerId);
      }
    });
  }

  private async openServer(serverId: string): Promise<void> {
    const state = this.store.getState();
    if (!state.session) return;

    await this.withLoading("channels", async () => {
      const details: ServerDetails = await this.api.getServerDetails(state.session!, serverId);
      const preferredChannelId = state.activeChannelId && details.channels.some((channel) => channel.id === state.activeChannelId) ? state.activeChannelId : details.channels[0]?.id ?? null;

      this.store.patch({
        activeServerId: serverId,
        channels: details.channels,
        activeChannelId: preferredChannelId,
        messages: [],
      });

      if (preferredChannelId) {
        await this.openChannel(preferredChannelId);
      }
    });
  }

  private async openChannel(channelId: string): Promise<void> {
    const state = this.store.getState();
    if (!state.session) return;

    await this.withLoading("messages", async () => {
      const messages = this.sortMessages(await this.api.getMessages(state.session!, channelId));
      const current = this.store.getState();
      this.store.patch({
        activeChannelId: channelId,
        messages,
        unreadByChannel: {
          ...current.unreadByChannel,
          [channelId]: 0,
        },
      });
      this.markSeen(messages);
    });
  }

  private openCreateModal(mode: Exclude<PendingCreate, "none">): void {
    if (mode === "channel" && !this.store.getState().activeServerId) {
      this.store.patch({ error: "Pick a server before creating a channel." });
      this.render();
      return;
    }

    this.store.patch({ pendingCreate: mode, createError: null, createName: "" });
    this.render();
  }

  private closeCreateModal(): void {
    this.store.patch({ pendingCreate: "none", createError: null, createName: "" });
    this.render();
  }

  private async submitCreateEntity(form: HTMLFormElement): Promise<void> {
    const state = this.store.getState();
    if (!state.session || state.pendingCreate === "none") return;

    const name = String(new FormData(form).get("name") ?? "").trim();
    this.store.patch({ createName: name });

    const validationError = this.validateName(name);
    if (validationError) {
      this.store.patch({ createError: validationError });
      this.render();
      return;
    }

    const key = state.pendingCreate === "server" ? "servers" : "channels";

    await this.withLoading(
      key,
      async () => {
        const current = this.store.getState();
        if (current.pendingCreate === "server") {
          const server = await this.api.createServer(current.session!, name);
          this.store.patch({
            servers: [...current.servers, server],
            pendingCreate: "none",
            createError: null,
            createName: "",
          });
          await this.openServer(server.id);
          return;
        }

        if (!current.activeServerId) {
          throw new ApiError("No active server selected.", 400, "VALIDATION_ERROR");
        }

        const channel = await this.api.createChannel(current.session!, current.activeServerId, name);
        this.store.patch({
          channels: [...current.channels, channel],
          pendingCreate: "none",
          createError: null,
          createName: "",
        });
        await this.openChannel(channel.id);
      },
      (message) => {
        this.store.patch({ createError: message });
      },
    );
  }

  private validateName(name: string): string | null {
    if (!name) return "Name is required.";
    if (!NAME_PATTERN.test(name)) return "Use 2-40 chars: letters, numbers, spaces, _ or -.";
    return null;
  }

  private async handleSendMessage(form: HTMLFormElement): Promise<void> {
    const state = this.store.getState();
    if (!state.session || !state.activeChannelId) return;

    const formData = new FormData(form);
    const body = String(formData.get("message") ?? "").trim();
    if (!body) return;

    const optimisticMessage: ChatMessage = {
      id: `tmp_${Date.now()}`,
      sender: state.session.user.username,
      body,
      timestamp: new Date().toISOString(),
    };

    this.appendMessage(optimisticMessage);
    form.reset();

    await this.withLoading(
      "send",
      async () => {
        const delivered = await this.api.sendMessage(state.session!, state.activeChannelId!, body);
        const current = this.store.getState();
        const withoutOptimistic = current.messages.filter((message) => message.id !== optimisticMessage.id);
        this.store.patch({ messages: this.sortMessages([...withoutOptimistic, delivered]), error: null });
      },
      () => {
        const current = this.store.getState();
        this.store.patch({
          messages: current.messages.filter((message) => message.id !== optimisticMessage.id),
          error: "Message failed to send.",
        });
      },
    );
  }

  private connectGateway(): void {
    const state = this.store.getState();
    if (!state.session) return;

    this.matrixGateway.connect(this.api, state.session, {
      onEvent: (event) => {
        this.handleGatewayEvent(event);
      },
      onReconnect: () => {
        void this.recoverAfterReconnect();
      },
    });
  }

  private handleGatewayEvent(event: GatewayEvent): void {
    if (typeof event.eventId === "string") {
      if (this.seenEventIds.has(event.eventId)) return;
      this.seenEventIds.add(event.eventId);
    }

    if (event.type !== "message.created" || !event.message || !event.channelId) return;

    const state = this.store.getState();
    if (event.channelId === state.activeChannelId) {
      this.appendMessage(event.message);
      return;
    }

    this.store.patch({
      unreadByChannel: {
        ...state.unreadByChannel,
        [event.channelId]: (state.unreadByChannel[event.channelId] ?? 0) + 1,
      },
    });
    this.render();
  }

  private async recoverAfterReconnect(): Promise<void> {
    const state = this.store.getState();
    if (!state.session || !state.activeChannelId) return;

    await this.withLoading("messages", async () => {
      const messages = this.sortMessages(await this.api.getMessages(state.session!, state.activeChannelId!));
      this.store.patch({ messages });
      this.markSeen(messages);
    });
  }

  private appendMessage(message: ChatMessage): void {
    const state = this.store.getState();
    if (state.messages.some((entry) => entry.id === message.id)) return;

    this.store.patch({ messages: this.sortMessages([...state.messages, message]) });
    this.markSeen([message]);
    this.render();
  }

  private sortMessages(messages: ChatMessage[]): ChatMessage[] {
    return [...messages].sort((a, b) => {
      const timeA = Date.parse(a.timestamp);
      const timeB = Date.parse(b.timestamp);
      if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
        return a.id.localeCompare(b.id);
      }
      if (timeA === timeB) {
        return a.id.localeCompare(b.id);
      }
      return timeA - timeB;
    });
  }

  private markSeen(messages: ChatMessage[]): void {
    for (const message of messages) {
      this.seenEventIds.add(message.id);
    }
  }

  private scrollMessagesToBottom(): void {
    const messageList = this.root.querySelector<HTMLElement>(".message-list");
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }
}
