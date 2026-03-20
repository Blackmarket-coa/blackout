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
  private settingsOpen = false;
  private composerIsTyping = false;
  private readonly telemetry;
  private readonly trackedDenials = new Set<string>();

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
  }) {
    this.root = root;
    this.runtimeConfig = runtimeConfig;
    this.telemetry = createTelemetryClient(this.runtimeConfig.rollout.cohort);
    this.deploymentPreset = runtimeConfig.presets.diagnostics.deploymentPreset;
    this.appliedPreset = runtimeConfig.presets.activePreset;
    this.selectedPreset = runtimeConfig.presets.activePreset;
    this.appliedFeatures = Object.keys(runtimeConfig.presets.features).length
      ? { ...runtimeConfig.presets.features }
      : { ...FEATURE_PRESET_BUNDLES[runtimeConfig.presets.activePreset] };
  }

  async mount(): Promise<void> {
    this.telemetry.track("preset_adoption_seen", {
      preset: this.appliedPreset,
      cohort: this.runtimeConfig.rollout.cohort,
    });
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
          <h1>Blackout Core</h1>
          <p class="meta">Discord-like starter shell on top of Matrix-compatible APIs.</p>
          <p class="meta" data-testid="active-preset">Active preset: <strong>${this.appliedPreset}</strong></p>
          <p class="meta" data-testid="release-cohort">Release cohort: ${this.runtimeConfig.rollout.cohort}</p>
          <p class="meta" data-testid="preset-diagnostics">Preset sources: deployment=${this.runtimeConfig.presets.diagnostics.deploymentPreset}, tenant=${this.runtimeConfig.presets.diagnostics.tenantPreset ?? "none"}, user overrides=${this.runtimeConfig.presets.diagnostics.userOverrideCount}</p>
        </header>
        <div class="header-actions">
          <button type="button" class="ghost-btn" data-action="toggle-settings" data-testid="toggle-settings-button">${this.settingsOpen ? "Close settings" : "Open settings"}</button>
        </div>
        ${this.settingsOpen ? `<section class="admin-grid">${this.renderPresetManagementSection()}${this.renderFeatureEntryPoints()}${(this.getActivePresetFeatures()["features.epic.deliveryBlueprint"] ?? false) ? this.renderEpicDeliverySection() : ""}</section>` : ""}
        ${this.featureActionResult ? `<p class="meta" data-testid="feature-action-result">${this.featureActionResult}</p>` : ""}

        ${state.error ? `<p class="error" role="alert">${state.error}</p>` : ""}
        ${loading.servers || loading.channels || loading.messages ? '<p class="loading">Syncing workspace…</p>' : ""}

        ${state.session ? this.renderWorkspace() : renderAuthView({ mode: state.authMode, busy: loading.auth })}
      </main>
      ${modalMode !== "none" ? renderCreateEntityModal({ mode: modalMode, value: state.createName, error: state.createError, busy: loading.channels || loading.servers }) : ""}
    `;

    this.bindEvents();
    this.scrollMessagesToBottom();
  }

  private renderWorkspace(): string {
    const state = this.store.getState();
    const selectedServer = state.servers.find((server) => server.id === state.activeServerId);

    return `
      <section class="workspace ${state.channelDrawerOpen ? "show-channel-drawer" : ""}">
        ${renderServerSidebar({ servers: state.servers, activeServerId: state.activeServerId })}
        ${renderChannelSidebar({
          serverName: selectedServer?.name ?? "Channels",
          channels: state.channels,
          activeChannelId: state.activeChannelId,
          unreadByChannel: state.unreadByChannel,
        })}
        ${renderChatWindow({
          channelLabel: state.activeChannelId ? `#${state.channels.find((channel) => channel.id === state.activeChannelId)?.name ?? "channel"}` : "Pick a channel",
          messages: state.messages,
          canSend: Boolean(state.activeChannelId),
          sendPending: state.loading.send,
          richEditingEnabled: this.getActivePresetFeatures()["features.composer.richEditing"] ?? false,
          typingIndicatorsEnabled: this.getActivePresetFeatures()["features.composer.typingIndicators"] ?? false,
          showTypingIndicator: this.composerIsTyping,
        })}
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
        <h2>Feature entry points</h2>
        <p class="meta">Visible entries: ${totalEntries}. Enabled in current preset: ${enabledCount}.</p>
        <input type="search" data-action="filter-features" data-testid="feature-filter-input" value="${this.featureFilter}" placeholder="Filter by id, name, or entrypoint" />
        ${this.renderFeatureGroup("settings toggle", grouped.get("settings_toggle") ?? [])}
        ${this.renderFeatureGroup("composer action", grouped.get("composer_action") ?? [])}
        ${this.renderFeatureGroup("room action", grouped.get("room_action") ?? [])}
        ${this.renderFeatureGroup("widget panel", grouped.get("widget_panel") ?? [])}
        ${this.renderFeatureGroup("admin/governance console", grouped.get("admin_console") ?? [])}
      </section>
    `;
  }

  private renderPresetManagementSection(): string {
    const previewFeatures = Object.entries(FEATURE_PRESET_BUNDLES[this.selectedPreset]);
    const enabledFeatures = previewFeatures.filter(([, enabled]) => enabled).map(([key]) => key);

    return `
      <section class="stack panel-card" data-testid="feature-presets-panel">
        <h2>Feature Presets</h2>
        <p class="meta">Choose a preset, preview capabilities, and apply or rollback with confirmation.</p>
        <label class="stack">
          Preset
          <select data-testid="feature-preset-select" data-action="select-preset">
            ${this.renderPresetOption("baseline_matrix")}
            ${this.renderPresetOption("community_plus")}
            ${this.renderPresetOption("blackout_full")}
          </select>
        </label>
        <div class="stack" data-testid="preset-explainer-panel">
          <h3>What this preset enables</h3>
          <progress max="${previewFeatures.length}" value="${enabledFeatures.length}" data-testid="preset-capability-meter"></progress>
          <p class="meta">${enabledFeatures.length}/${previewFeatures.length} capabilities enabled.</p>
          <ul class="stack">
            ${enabledFeatures.map((key) => `<li class="meta" data-testid="preset-capability-${key.replaceAll(".", "-")}">${key}</li>`).join("")}
          </ul>
        </div>
        <div class="modal-actions">
          <button type="button" data-action="apply-preset" data-testid="apply-preset-button" ${this.selectedPreset === this.appliedPreset ? "disabled" : ""}>Apply preset</button>
          <button type="button" class="ghost-btn" data-action="rollback-preset" data-testid="rollback-preset-button" ${this.appliedPreset === this.deploymentPreset ? "disabled" : ""}>Rollback to deployment preset</button>
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

  private getActivePresetFeatures(): Record<string, boolean> {
    return this.appliedFeatures;
  }

  private renderFeatureGroup(label: string, items: string[]): string {
    return `
      <details class="stack" open>
        <summary><strong>${label}</strong> <span class="meta">(${items.length})</span></summary>
        <ul class="stack">${items.join("") || '<li class="empty">No matching entries.</li>'}</ul>
      </details>
    `;
  }

  private bindEvents(): void {
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
        void this.openServer(serverId);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-channel']").forEach((button) => {
      button.addEventListener("click", () => {
        const channelId = button.dataset.channelId;
        if (!channelId) return;
        void this.openChannel(channelId);
        this.store.patch({ channelDrawerOpen: false });
        this.render();
      });
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='create-server']")?.addEventListener("click", () => {
      this.openCreateModal("server");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='create-channel']")?.addEventListener("click", () => {
      this.openCreateModal("channel");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='cancel-create']")?.addEventListener("click", () => {
      this.closeCreateModal();
    });

    this.root.querySelector<HTMLFormElement>("#create-entity-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submitCreateEntity(event.currentTarget as HTMLFormElement);
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='toggle-settings']")?.addEventListener("click", () => {
      this.settingsOpen = !this.settingsOpen;
      this.render();
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
        const featureId = button.dataset.featureId;
        const kind = button.dataset.featureKind;
        if (!featureId || !kind) return;
        this.featureActionResult = `Opened ${featureId} via ${kind}.`;
        this.telemetry.track("feature_open_success", { featureId, entrypointKind: kind });
        this.render();
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
  }

  private applyComposerSnippet(snippet: string): void {
    const textarea = this.root.querySelector<HTMLTextAreaElement>("#message-form textarea[name='message']");
    if (!textarea) return;
    textarea.value = `${textarea.value}${snippet}`;
    textarea.focus();
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
