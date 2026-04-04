import { ApiError, type GatewayEvent } from "./api/client";
import { renderChannelSidebar } from "./components/ChannelSidebar";
import { renderChatWindow } from "./components/ChatWindow";
import { renderCreateEntityModal } from "./components/CreateEntityModal";
import { renderEconomicsPanel, type EconomicsTab } from "./components/EconomicsPanel";
import { renderFederationPanel, type FederationTab } from "./components/FederationPanel";
import { renderGovernanceRoomPanel, type GovernanceRoomTab } from "./components/GovernanceRoomPanel";
import { renderMobileTabBar, type MobileTab } from "./components/MobileTabBar";
import { renderPlatformOpsPanel, type PlatformOpsTab } from "./components/PlatformOpsPanel";
import { renderRevenueOpsPanel, type QuestStage, type RevenueOpsTab } from "./components/RevenueOpsPanel";
import { renderServerSidebar } from "./components/ServerSidebar";
import { renderTownhallPanel, type TownhallMode } from "./components/TownhallPanel";
import { renderGlossaryTip } from "./components/glossary";
import { renderAuthView } from "./features/auth/auth-view";
import { createApiClient } from "./services/api";
import { MatrixGatewayClient } from "./services/matrix-client";
import { createTelemetryClient } from "./services/telemetry";
import { SessionStore } from "./session/store";
import { renderBugReportFab } from "./components/BugReportFab";
import { FEATURE_UI_ENTRIES, type UiEntryKind } from "./settings/feature-entrypoints";
import {
  parseAttachmentImport,
  validateAttachmentInput,
  validateAttachmentUrl,
  type AttachmentType,
} from "./utils/attachment-validation";
import { getDirectMessageChannels } from "./utils/dm-channel";
import { FEATURE_PRESET_BUNDLES, normalizeFeaturePresetKey, type FeaturePresetKey } from "./settings/feature-presets";
import { AppStore, type PendingCreate } from "./store/app-store";
import type { BlackoutRuntimeConfig } from "./config";
import type { ChannelCapabilityTag, ChatMessage, GovernanceProposal, ServerDetails } from "./types";

const NAME_PATTERN = /^[a-zA-Z0-9 _-]{2,40}$/;
const ONBOARDING_INVITE_SENT_STORAGE_KEY = "blackout.onboarding.invite_sent";
const ONBOARDING_CONVERSATION_STARTED_STORAGE_KEY = "blackout.onboarding.conversation_started";
const ONBOARDING_ADVANCED_STEGO_STORAGE_KEY = "blackout.onboarding.advanced.stego";
const ONBOARDING_ADVANCED_GOVERNANCE_STORAGE_KEY = "blackout.onboarding.advanced.governance";
const ONBOARDING_ADVANCED_FEDERATION_STORAGE_KEY = "blackout.onboarding.advanced.federation";
const ONBOARDING_TOUR_STEGO_DISMISSED_STORAGE_KEY = "blackout.onboarding.tour.stego.dismissed";
const ONBOARDING_TOUR_GOVERNANCE_DISMISSED_STORAGE_KEY = "blackout.onboarding.tour.governance.dismissed";
const ONBOARDING_GUIDE_DISMISSED_STORAGE_KEY = "blackout.onboarding.guide.dismissed";
const QUICK_ACTION_BAR_COLLAPSED_STORAGE_KEY = "blackout.quick_actions.collapsed";

type WorkspacePanelView = "chat" | "dms" | "activity" | "calls" | "files" | "repo-tools" | "discover";
type ThemeKey = "dark_canopy" | "light_grove" | "amoled_night" | "storybook_meadow" | "adventure_spectrum";
type RightPanelView = "members" | "threads" | "pinned" | "search" | "governance" | "widget";
type GovernanceRightPanelTab = "active" | "past" | "create" | "my-votes" | "results";
type SettingsPageView = "workspace" | "appearance" | "monetization" | "mobile" | "operations";
type SubscriptionTierMatch = {
  tier: FeaturePresetKey;
  subscription: string;
  price: string;
  highlights: string;
};
type StegoChannel = {
  id: string;
  name: string;
  audience: string;
  passphrase: string;
  rotationDays: number;
  updatedAt: string;
};

type AdvancedModule = "governance" | "federation" | "stego";
type GifLibraryItem = { id: string; label: string; url: string };
type EmojiLibraryItem = { id: string; symbol: string; label: string };
type QuickActionPopup = { featureId: string; kind: UiEntryKind; name: string };
type AttachmentType = "image" | "video" | "audio" | "file" | "governance" | "meme";
type AttachmentLibraryItem = { id: string; type: AttachmentType; label: string; url: string };
type GovernanceTemplateItem = { id: string; title: string; type: "binary" | "multiple_choice" | "ranked"; options: string[]; durationHours: number };
type AttachmentPanelMode = "quick" | "manage" | "bulk";

const STEGO_CHANNEL_STORAGE_KEY = "blackout.stego.channels.v1";
const GIF_LIBRARY_STORAGE_KEY = "blackout.composer.gifs.v1";
const EMOJI_LIBRARY_STORAGE_KEY = "blackout.composer.emoji.v1";
const ATTACHMENT_LIBRARY_STORAGE_KEY = "blackout.composer.attachments.v1";
const GOVERNANCE_TEMPLATE_STORAGE_KEY = "blackout.composer.governance.v1";
const MOBILE_PUSH_TOKEN_STORAGE_KEY = "blackout.mobile.pushToken";
const MOBILE_PUSH_TOKEN_REGISTERED_STORAGE_KEY = "blackout.mobile.pushToken.registered";
const ONBOARDING_STARTED_AT_STORAGE_KEY = "blackout.onboarding.started_at";
const PRESET_AUDIT_LOG_STORAGE_KEY = "blackout.preset.audit.v1";

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
  private activeSettingsPage: SettingsPageView = "workspace";
  private composerIsTyping = false;
  private activeWorkspacePanel: WorkspacePanelView = "chat";
  private repoToolsOpen = false;
  private activeRightPanel: RightPanelView | null = null;
  private activeGovernancePanelTab: GovernanceRightPanelTab = "active";
  private selectedGovernanceProposalId: string | null = null;
  private latestGovernanceVoteByProposal: Record<string, "approve" | "block"> = {};
  private activeWidgetFeatureId: string | null = null;
  private governanceTabByChannel: Record<string, GovernanceRoomTab> = {};
  private governanceProposalModalByChannel: Record<string, boolean> = {};
  private activeEconomicsTab: EconomicsTab = "boosts";
  private activeFederationTab: FederationTab = "health";
  private activeTownhallMode: TownhallMode = "standard";
  private activeMobileTab: MobileTab = "spaces";
  private swipeRightGesture: "reply" | "quote" = "reply";
  private swipeLeftGesture: "thread" | "react" = "thread";
  private activeRevenueOpsTab: RevenueOpsTab = "monetization";
  private paymentSheetOpen = false;
  private paymentIssue = false;
  private questStage: QuestStage = "open";
  private installedApps = 2;
  private activePlatformOpsTab: PlatformOpsTab = "federation";
  private readinessScore = 86;
  private vaultUsageGb = 11.5;
  private hostingTier = 2;
  private blackboxProvisioned = false;
  private recommendationMode: "heuristic" | "matrix_public_rooms" = "heuristic";
  private selectedTheme: ThemeKey;
  private readonly telemetry;
  private readonly trackedDenials = new Set<string>();
  private readonly hasSeenFeatureTooltips: boolean;
  private stegoChannels: StegoChannel[] = [];
  private gifLibrary: GifLibraryItem[] = [];
  private emojiLibrary: EmojiLibraryItem[] = [];
  private quickActionPopup: QuickActionPopup | null = null;
  private subscriptionPopupOpen = false;
  private attachmentLibrary: AttachmentLibraryItem[] = [];
  private activeAttachmentMode: AttachmentPanelMode = "quick";
  private governanceTemplates: GovernanceTemplateItem[] = [];
  private mobileBridgeEventsBound = false;
  private pendingMobileRoomId: string | null = null;
  private pendingPushTokenRegistration: string | null = null;
  private pushTokenRegisterRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private pushTokenUnregisterRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private bugReportOpen = false;
  private bugReportIssue = "";
  private bugReportSteps = "";
  private bugReportSuggestions = "";
  private readonly viewedOnboardingSteps = new Set<number>();
  private readonly completedOnboardingSteps = new Set<number>();
  private onboardingCompletionTracked = false;
  private onboardingGuideDismissed = globalThis.localStorage.getItem(ONBOARDING_GUIDE_DISMISSED_STORAGE_KEY) === "true";
  private quickActionBarCollapsed = (() => {
    const storedPreference = globalThis.localStorage.getItem(QUICK_ACTION_BAR_COLLAPSED_STORAGE_KEY);
    if (storedPreference !== null) return storedPreference === "true";
    return globalThis.matchMedia?.("(max-width: 768px)").matches ?? false;
  })();
  private advancedPanelViewedTracked = false;
  private readonly advancedModuleDiscoveryTracked = new Set<string>();

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
      activePreset: "starter",
      features: {},
      diagnostics: {
        deploymentPreset: "starter",
        tenantPreset: null,
        userOverrideCount: 0,
      },
    },
    simpleMode: {
      simple_mode_default: true,
      show_advanced_admin_modules: false,
      onboarding_progressive_disclosure: true,
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
    this.runtimeConfig = {
      ...runtimeConfig,
      simpleMode: runtimeConfig.simpleMode ?? {
        simple_mode_default: true,
        show_advanced_admin_modules: false,
        onboarding_progressive_disclosure: true,
      },
      engagement: runtimeConfig.engagement ?? {
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
    };
    this.telemetry = createTelemetryClient(this.runtimeConfig.rollout.cohort);
    const resolvedDeploymentPreset = normalizeFeaturePresetKey(runtimeConfig.presets.diagnostics.deploymentPreset) ?? "starter";
    const resolvedActivePreset = normalizeFeaturePresetKey(runtimeConfig.presets.activePreset) ?? resolvedDeploymentPreset;
    this.deploymentPreset = resolvedDeploymentPreset;
    this.appliedPreset = resolvedActivePreset;
    this.selectedPreset = resolvedActivePreset;
    this.hasSeenFeatureTooltips = globalThis.localStorage.getItem("blackout.featureTipsSeen") === "true";
    this.appliedFeatures = Object.keys(runtimeConfig.presets.features).length
      ? { ...runtimeConfig.presets.features }
      : { ...FEATURE_PRESET_BUNDLES[resolvedActivePreset] };
    const storedTheme = globalThis.localStorage.getItem("blackout.theme");
    this.selectedTheme = this.parseTheme(storedTheme);
    this.stegoChannels = this.loadStegoChannels();
    this.gifLibrary = this.loadGifLibrary();
    this.emojiLibrary = this.loadEmojiLibrary();
    this.attachmentLibrary = this.loadAttachmentLibrary();
    this.governanceTemplates = this.loadGovernanceTemplates();
  }

  async mount(): Promise<void> {
    this.telemetry.track("preset_adoption_seen", {
      preset: this.appliedPreset,
      cohort: this.runtimeConfig.rollout.cohort,
    });
    globalThis.document.addEventListener("keydown", this.handleGlobalKeyDown);
    globalThis.document.addEventListener("pointerdown", this.handleDocumentPointerDown);
    this.bindMobileBridgeEvents();
    this.applyTheme(this.selectedTheme);
    this.render();

    const state = this.store.getState();
    if (!state.session) return;
    if (!globalThis.localStorage.getItem(ONBOARDING_STARTED_AT_STORAGE_KEY)) {
      globalThis.localStorage.setItem(ONBOARDING_STARTED_AT_STORAGE_KEY, String(Date.now()));
    }

    this.connectGateway();
    await this.loadServers();
    const cachedPushToken = globalThis.localStorage.getItem(MOBILE_PUSH_TOKEN_STORAGE_KEY);
    if (cachedPushToken) {
      this.schedulePushTokenRegistration(cachedPushToken, 0);
    }
  }

  private render(): void {
    const state = this.store.getState();
    const loading = state.loading;
    const modalMode = state.pendingCreate;

    this.root.innerHTML = `
      <main class="container">
        <div class="header-actions">
          <button type="button" class="ghost-btn" data-action="toggle-settings" data-testid="toggle-settings-button">${this.settingsOpen ? "Close settings" : "Open settings"}</button>
          ${!state.session ? `<button type="button" class="ghost-btn" data-action="open-command-palette" data-testid="open-command-palette">⌘K</button>` : ""}
        </div>
        ${this.settingsOpen ? this.renderSettingsWorkspace() : ""}
        ${this.featureActionResult ? `<p class="meta" data-testid="feature-action-result">${this.featureActionResult}</p>` : ""}

        ${state.error ? `<p class="error" role="alert">${state.error}</p>` : ""}
        ${loading.servers || loading.channels || loading.messages ? '<p class="loading">Syncing workspace…</p>' : ""}

        ${state.session ? this.renderWorkspace() : renderAuthView({ mode: state.authMode, busy: loading.auth })}
        ${state.session ? this.renderFeatureToolbar() : ""}
        ${state.session ? renderMobileTabBar({ activeTab: this.activeMobileTab }) : ""}
      </main>
      ${modalMode !== "none" ? renderCreateEntityModal({ mode: modalMode, value: state.createName, error: state.createError, busy: loading.channels || loading.servers }) : ""}
      ${this.commandPaletteOpen ? this.renderFeatureCommandPalette() : ""}
      ${this.quickActionPopup ? this.renderQuickActionPopup() : ""}
      ${this.subscriptionPopupOpen ? this.renderSubscriptionPopup() : ""}
      ${renderBugReportFab({
        open: this.bugReportOpen,
        issue: this.bugReportIssue,
        steps: this.bugReportSteps,
        suggestions: this.bugReportSuggestions,
      })}
    `;

    this.bindEvents();
    this.scrollMessagesToBottom();
    this.centerVisibleOnboardingPrompts();
  }


  private centerPromptInView(prompt: HTMLElement): void {
    const scrollContainer = prompt.closest<HTMLElement>(".composer-popover.is-open, .workspace-content, .chat-window");
    if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
      const promptRect = prompt.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const targetTop = scrollContainer.scrollTop + (promptRect.top - containerRect.top) - ((scrollContainer.clientHeight - promptRect.height) / 2);
      scrollContainer.scrollTo({ top: Math.max(0, targetTop), left: 0, behavior: "auto" });
      return;
    }
    prompt.scrollIntoView({ block: "center", inline: "nearest" });
  }

  private centerVisibleOnboardingPrompts(): void {
    const prompts = this.root.querySelectorAll<HTMLElement>("[data-testid='first-run-guide']");
    if (!prompts.length) return;
    prompts.forEach((prompt) => this.centerPromptInView(prompt));
  }

  private getSidebarActiveView(): "home" | "rooms" | "dms" | "activity" | "calls" | "admin" {
    if (this.settingsOpen) return "admin";
    if (this.activeWorkspacePanel === "dms") return "dms";
    if (this.activeWorkspacePanel === "activity") return "activity";
    if (this.activeWorkspacePanel === "calls") return "calls";
    return "rooms";
  }

  private hasAdminAccess(): boolean {
    const state = this.store.getState();
    const activeServer = state.servers.find((server) => server.id === state.activeServerId);
    if (!activeServer) return false;
    return /admin|owner|mod|moderator/i.test(activeServer.role);
  }

  private governanceFeatureEnabled(): boolean {
    const features = this.getActivePresetFeatures();
    if ((features["features.governance.entitlements"] ?? false) || (features["features.bmc.governance"] ?? false)) return true;
    if (this.hasAdminAccess()) return true;
    return this.activeChannelHasCapability("governance");
  }

  private canPropose(): boolean {
    return this.governanceFeatureEnabled() && this.hasAdminAccess();
  }

  private canVote(): boolean {
    return this.governanceFeatureEnabled();
  }

  private activeChannel() {
    const state = this.store.getState();
    return state.channels.find((channel) => channel.id === state.activeChannelId) ?? null;
  }

  private activeChannelHasCapability(capability: "governance" | "economics" | "federation" | "townhall"): boolean {
    const channel = this.activeChannel();
    return Boolean(channel?.capabilityTags?.includes(capability));
  }

  private inferCapabilityTags(channelName: string): ChannelCapabilityTag[] {
    const tags: ChannelCapabilityTag[] = [];
    const normalized = channelName.toLowerCase();
    if (/\b(governance|proposal|council|treasury|vote)\b/.test(normalized)) tags.push("governance");
    if (/\b(boost|subscription|quest|market|wallet|monetization)\b/.test(normalized)) tags.push("economics");
    if (/\b(federation|mesh|replication|recovery|self-healing)\b/.test(normalized)) tags.push("federation");
    if (/\b(townhall|assembly|stage|all-hands)\b/.test(normalized)) tags.push("townhall");
    return tags;
  }

  private getGovernanceTabForChannel(channelId: string): GovernanceRoomTab {
    return this.governanceTabByChannel[channelId] ?? "feed";
  }

  private governanceModalOpen(channelId: string): boolean {
    return this.governanceProposalModalByChannel[channelId] ?? false;
  }

  private openGovernanceDestination(): void {
    const state = this.store.getState();
    const governanceChannel = state.channels.find((channel) => channel.capabilityTags?.includes("governance"));
    if (governanceChannel) {
      void this.openChannel(governanceChannel.id);
      this.featureActionResult = `Opened governance room #${governanceChannel.name}.`;
      return;
    }
    this.activeRightPanel = "governance";
    this.featureActionResult = "No governance-tagged room found. Opened governance dashboard instead.";
  }

  private getRoleClass(): string {
    const state = this.store.getState();
    const activeServer = state.servers.find((server) => server.id === state.activeServerId);
    return activeServer?.role?.toLowerCase() ?? "unknown";
  }

  private telemetryContext(): Record<string, string | number | boolean | null> {
    const state = this.store.getState();
    return {
      tenant_id: state.activeServerId ?? "none",
      role_class: this.getRoleClass(),
      client_surface: "web",
      flag_cohort: this.runtimeConfig.rollout.cohort,
      simple_mode_enabled: this.runtimeConfig.simpleMode.simple_mode_default,
    };
  }

  private trackKpiEvent(name: string, payload: Record<string, string | number | boolean | null> = {}): void {
    this.telemetry.track(name, {
      ...this.telemetryContext(),
      ...payload,
    });
  }

  private submitBugReport(): void {
    if (!this.bugReportIssue.trim()) return;
    const metadata = {
      device_type: /Mobi|Android|iPhone|iPad/i.test(globalThis.navigator.userAgent) ? "mobile" : "desktop",
      screen_width: globalThis.innerWidth,
      screen_height: globalThis.innerHeight,
      user_agent: globalThis.navigator.userAgent,
      current_view: this.settingsOpen ? `settings:${this.activeSettingsPage}` : this.activeWorkspacePanel,
      timestamp: new Date().toISOString(),
      app_version: "0.0.1",
    };
    this.telemetry.track("user_bug_report", {
      ...metadata,
      issue: this.bugReportIssue.trim(),
      steps_to_reproduce: this.bugReportSteps.trim() || null,
      suggestions: this.bugReportSuggestions.trim() || null,
    });
    this.featureActionResult = "Bug report sent. Thanks for helping improve Blackout.";
    this.bugReportOpen = false;
    this.bugReportIssue = "";
    this.bugReportSteps = "";
    this.bugReportSuggestions = "";
    this.render();
  }

  private onboardingSteps() {
    const state = this.store.getState();
    const inviteSent = globalThis.localStorage.getItem(ONBOARDING_INVITE_SENT_STORAGE_KEY) === "true";
    const conversationStarted = state.messages.length > 0 || globalThis.localStorage.getItem(ONBOARDING_CONVERSATION_STARTED_STORAGE_KEY) === "true";
    const stegoExplored = globalThis.localStorage.getItem(ONBOARDING_ADVANCED_STEGO_STORAGE_KEY) === "true";
    const governanceExplored = globalThis.localStorage.getItem(ONBOARDING_ADVANCED_GOVERNANCE_STORAGE_KEY) === "true";
    const federationExplored = globalThis.localStorage.getItem(ONBOARDING_ADVANCED_FEDERATION_STORAGE_KEY) === "true";
    return [
      { index: 1, label: "Join your mission HQ", done: Boolean(state.session), action: '<button type="button" class="ghost-btn" data-action="open-home-panel">Open mission map</button>' },
      { index: 2, label: "Set up your first operations zone", done: state.channels.length > 0, action: '<button type="button" class="ghost-btn" data-action="create-channel">Create zone</button>' },
      { index: 3, label: "Recruit your response team", done: inviteSent, action: '<button type="button" class="ghost-btn" data-action="onboarding-send-invite">Invite team</button>' },
      { index: 4, label: "Launch your first mission brief", done: conversationStarted, action: '<button type="button" class="ghost-btn" data-action="onboarding-open-thread">Open brief</button><button type="button" class="ghost-btn" data-action="onboarding-start-call">Start call</button>' },
      { index: 5, label: "Optional: Pack the Stego toolkit", done: stegoExplored, action: '<button type="button" class="ghost-btn" data-action="onboarding-open-stego">Open toolkit</button>' },
      { index: 6, label: "Optional: Open mission governance", done: governanceExplored, action: '<button type="button" class="ghost-btn" data-action="onboarding-open-governance">Open governance</button>' },
      { index: 7, label: "Optional: Link allied organizations", done: federationExplored, action: '<button type="button" class="ghost-btn" data-action="onboarding-open-federation">Open federation</button>' },
    ];
  }

  private trackOnboardingProgress(): void {
    const steps = this.onboardingSteps();
    const firstIncomplete = steps.find((step) => !step.done);

    if (firstIncomplete && !this.viewedOnboardingSteps.has(firstIncomplete.index)) {
      this.viewedOnboardingSteps.add(firstIncomplete.index);
      this.trackKpiEvent("onboarding_step_viewed", { step: firstIncomplete.index });
    }

    for (const step of steps) {
      if (step.done && !this.completedOnboardingSteps.has(step.index)) {
        this.completedOnboardingSteps.add(step.index);
        this.trackKpiEvent("onboarding_step_completed", { step: step.index });
      }
    }

    if (steps.every((step) => step.done) && !this.onboardingCompletionTracked) {
      this.onboardingCompletionTracked = true;
      const startedAtRaw = globalThis.localStorage.getItem(ONBOARDING_STARTED_AT_STORAGE_KEY);
      const startedAt = startedAtRaw ? Number.parseInt(startedAtRaw, 10) : Date.now();
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      this.trackKpiEvent("kpi_onboarding_completion", { completed: true, ttfv_ms: elapsedMs });
      this.trackKpiEvent("kpi_ttfv", { ttfv_ms: elapsedMs });
    }
  }

  private trackOnboardingDrop(reason: string): void {
    const firstIncomplete = this.onboardingSteps().find((step) => !step.done);
    if (!firstIncomplete) return;
    this.trackKpiEvent("onboarding_step_dropped", {
      step: firstIncomplete.index,
      reason,
    });
  }

  private advancedOnboardingStorageKey(module: AdvancedModule): string {
    if (module === "stego") return ONBOARDING_ADVANCED_STEGO_STORAGE_KEY;
    if (module === "governance") return ONBOARDING_ADVANCED_GOVERNANCE_STORAGE_KEY;
    return ONBOARDING_ADVANCED_FEDERATION_STORAGE_KEY;
  }

  private tourDismissedStorageKey(module: Extract<AdvancedModule, "stego" | "governance">): string {
    return module === "stego" ? ONBOARDING_TOUR_STEGO_DISMISSED_STORAGE_KEY : ONBOARDING_TOUR_GOVERNANCE_DISMISSED_STORAGE_KEY;
  }

  private markAdvancedOnboardingComplete(module: AdvancedModule, reason: "completed" | "skipped"): void {
    globalThis.localStorage.setItem(this.advancedOnboardingStorageKey(module), "true");
    this.trackKpiEvent("onboarding_step_completed", {
      step: module === "stego" ? 5 : module === "governance" ? 6 : 7,
      module,
      reason,
    });
  }

  private tourCopy(module: Extract<AdvancedModule, "stego" | "governance">): string[] {
    return module === "stego"
      ? [
          "Toolkit briefing: hide mission notes inside normal-looking text.",
          "Pack your backpack with a secret note, cover text, and a passphrase.",
          "Your final message looks ordinary, but only teammates with the passphrase can decode it.",
        ]
      : [
          "Toolkit briefing: mission governance keeps team decisions transparent and accountable.",
          "Build a proposal, define response options, then set the decision window before launch.",
          "When quorum is met, the mission log records the final decision for the whole crew.",
        ];
  }

  private renderAdvancedTourStep(module: Extract<AdvancedModule, "stego" | "governance">, step: number): string {
    const copy = this.tourCopy(module);
    const current = copy[Math.min(step, copy.length - 1)];
    return `<aside class="composer-tour" data-testid="composer-tour-${module}" data-tour-module="${module}" data-tour-step="${step}"><p>${current}</p><div class="composer-tour-actions"><button type="button" class="ghost-btn" data-action="onboarding-tour-skip" data-tour="${module}">Skip tour</button><button type="button" data-action="onboarding-tour-next" data-tour="${module}">${step >= copy.length - 1 ? "Finish" : "Next"}</button></div></aside>`;
  }

  private maybeShowAdvancedTour(module: Extract<AdvancedModule, "stego" | "governance">): void {
    if (globalThis.localStorage.getItem(this.tourDismissedStorageKey(module)) === "true") return;
    const panel = this.root.querySelector<HTMLElement>(`[data-panel='${module}']`);
    if (!panel || panel.querySelector("[data-testid^='composer-tour-']")) return;
    panel.insertAdjacentHTML("afterbegin", this.renderAdvancedTourStep(module, 0));
    panel.scrollTop = 0;
    this.trackKpiEvent("onboarding_step_viewed", {
      step: module === "stego" ? 5 : 6,
      module,
      walkthrough: true,
    });
  }

  private advanceAdvancedTour(module: Extract<AdvancedModule, "stego" | "governance">): void {
    const tour = this.root.querySelector<HTMLElement>(`[data-testid='composer-tour-${module}']`);
    if (!tour) return;
    this.centerPromptInView(tour);
    const step = Number.parseInt(tour.dataset.tourStep ?? "0", 10) || 0;
    const finalStep = 2;
    if (step >= finalStep) {
      tour.remove();
      globalThis.localStorage.setItem(this.tourDismissedStorageKey(module), "true");
      this.markAdvancedOnboardingComplete(module, "completed");
      this.trackKpiEvent("advanced_tour_completed", { module });
      this.featureActionResult = module === "stego"
        ? "Stego toolkit complete. Try encoding your first hidden field note."
        : "Governance mission complete. Draft your first proposal.";
      this.render();
      return;
    }
    tour.outerHTML = this.renderAdvancedTourStep(module, step + 1);
  }

  private skipAdvancedTour(module: Extract<AdvancedModule, "stego" | "governance">): void {
    this.root.querySelector<HTMLElement>(`[data-testid='composer-tour-${module}']`)?.remove();
    globalThis.localStorage.setItem(this.tourDismissedStorageKey(module), "true");
    this.markAdvancedOnboardingComplete(module, "skipped");
    this.trackKpiEvent("advanced_tour_skipped", { module });
    this.featureActionResult = module === "stego" ? "Stego toolkit tour skipped." : "Governance mission tour skipped.";
    this.render();
  }

  private trackAdvancedDiscovery(module: AdvancedModule): void {
    if (!this.hasAdminAccess()) return;
    const dedupe = `${module}:${this.store.getState().activeServerId ?? "none"}`;
    if (this.advancedModuleDiscoveryTracked.has(dedupe)) return;
    this.advancedModuleDiscoveryTracked.add(dedupe);
    this.trackKpiEvent("advanced_module_entered", { module });
    this.trackKpiEvent("kpi_advanced_feature_discovery", { module, eligible_admin: true });
    if (module === "federation") {
      this.markAdvancedOnboardingComplete("federation", "completed");
    }
  }

  private renderWorkspace(): string {
    const state = this.store.getState();
    const selectedServer = state.servers.find((server) => server.id === state.activeServerId);

    return `
      <section class="workspace ${state.channelDrawerOpen ? "show-channel-drawer" : ""} ${this.getCompactModeActive() ? "workspace--compact" : ""}">
        ${renderServerSidebar({ servers: state.servers, activeServerId: state.activeServerId, activeView: this.getSidebarActiveView(), showAdminEntry: this.hasAdminAccess() })}
        ${renderChannelSidebar({
          serverName: selectedServer?.name ?? "Channels",
          channels: state.channels,
          activeChannelId: state.activeChannelId,
          unreadByChannel: state.unreadByChannel,
          currentUserDisplayName: state.session?.user.username ?? "User",
          currentUserHandle: state.session ? `@${state.session.user.username}` : "@user",
          showAdvancedModules: this.shouldShowAdvancedAdminModules(),
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

    if (this.activeWorkspacePanel === "calls") {
      return this.renderCallsPanel();
    }

    if (this.activeWorkspacePanel === "files") {
      return this.renderFilesPanel();
    }

    if (this.activeWorkspacePanel === "discover") {
      return this.renderDiscoverRolloutNotice();
    }

    const state = this.store.getState();
    const activeChannel = state.channels.find((channel) => channel.id === state.activeChannelId) ?? null;
    const activeChannelName = activeChannel?.name ?? "";
    const activeChannelId = activeChannel?.id ?? "";
    const isGovernanceRoom = this.activeChannelHasCapability("governance");
    const isEconomicsRoom = this.activeChannelHasCapability("economics");
    const isFederationRoom = this.activeChannelHasCapability("federation");
    const isTownhallRoom = this.activeChannelHasCapability("townhall");

    if (isGovernanceRoom && activeChannelId) {
      this.trackAdvancedDiscovery("governance");
      return renderGovernanceRoomPanel({
        channelId: activeChannelId,
        channelLabel: activeChannelName,
        activeTab: this.getGovernanceTabForChannel(activeChannelId),
        showProposalModal: this.governanceModalOpen(activeChannelId),
        proposals: state.governanceProposals.filter((proposal) => proposal.channelId === activeChannelId),
        canPropose: this.canPropose(),
        canVote: this.canVote(),
        actionMessage: this.featureActionResult,
      });
    }

    if (isEconomicsRoom) {
      return renderEconomicsPanel({
        channelLabel: activeChannelName,
        activeTab: this.activeEconomicsTab,
      });
    }

    if (isFederationRoom) {
      this.trackAdvancedDiscovery("federation");
      return renderFederationPanel({
        channelLabel: activeChannelName,
        activeTab: this.activeFederationTab,
      });
    }

    if (isTownhallRoom) {
      return renderTownhallPanel({
        channelLabel: activeChannelName,
        mode: this.activeTownhallMode,
      });
    }

    const chatView = renderChatWindow({
      channelLabel: state.activeChannelId ? `#${state.channels.find((channel) => channel.id === state.activeChannelId)?.name ?? "channel"}` : "Pick a channel",
      messages: state.messages,
      canSend: Boolean(state.activeChannelId),
      canPropose: this.canPropose(),
      governanceEnabled: this.governanceFeatureEnabled(),
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
      attachmentMode: this.attachmentComposerMode,
      compactMode: this.getCompactModeActive(),
      compactRecommended: this.isMessageHeavySession(),
    });

    return `
      ${this.renderFirstRunGuide()}
      <section class="workspace-content ${this.activeRightPanel ? "workspace-content--with-panel" : ""}">
        ${chatView}
        ${this.activeRightPanel ? this.renderRightPanelOverlay(this.activeRightPanel) : ""}
      </section>
    `;
  }

  private renderRightPanelOverlay(panel: RightPanelView): string {
    if (panel === "widget") {
      const widget = this.describeWidgetPanel(this.activeWidgetFeatureId);
      return `
        <aside class="right-panel-overlay" data-testid="right-panel-overlay">
          <div class="right-panel-header">
            <h3>${widget.title}</h3>
            <button type="button" class="ghost-btn" data-action="close-right-panel" aria-label="Close right panel">Close</button>
          </div>
          <p class="meta">${widget.subtitle}</p>
          <div class="right-panel-widget-body">
            <p><strong>${widget.heading}</strong></p>
            <p class="meta">${widget.description}</p>
          </div>
        </aside>
      `;
    }

    if (panel === "governance") {
      return this.renderGovernanceRightPanel();
    }

    const panelTitle: Record<Exclude<RightPanelView, "governance">, string> = {
      members: "Member list",
      threads: "Thread view",
      pinned: "Pinned messages",
      search: "Search results",
      widget: "Widget panel",
    };

    const panelBody: Record<Exclude<RightPanelView, "governance">, string> = {
      members: `<ul class="right-panel-list">
          <li><strong>Facilitator</strong><span class="meta">Online • can moderate and propose</span></li>
          <li><strong>Treasury guardian</strong><span class="meta">Online • signer #2</span></li>
          <li><strong>General member</strong><span class="meta">Away • voter role</span></li>
        </ul>`,
      threads: `<ul class="right-panel-list">
          <li><strong>Budget RFC follow-up</strong><span class="meta">12 replies • updated 4m ago</span></li>
          <li><strong>Call notes synthesis</strong><span class="meta">7 replies • updated 19m ago</span></li>
        </ul>`,
      pinned: `<ul class="right-panel-list">
          <li><strong>Meeting charter</strong><span class="meta">Pinned by @ops</span></li>
          <li><strong>Emergency relay docs</strong><span class="meta">Pinned by @security</span></li>
        </ul>`,
      search: `<div class="right-panel-search">
          <label>Find in room<input type="search" value="governance roadmap" readonly /></label>
          <ul class="right-panel-list">
            <li><strong>Roadmap checkpoint posted</strong><span class="meta">#governance • 2 results</span></li>
            <li><strong>Roadmap vote opened</strong><span class="meta">#announcements • 1 result</span></li>
          </ul>
        </div>`,
      widget: "",
    };

    return `
      <aside class="right-panel-overlay" data-testid="right-panel-overlay">
        <div class="right-panel-header">
          <h3>${panelTitle[panel]}</h3>
          <button type="button" class="ghost-btn" data-action="close-right-panel" aria-label="Close right panel">Close</button>
        </div>
        <p class="meta">Plan-aligned contextual overlay for room collaboration workflows.</p>
        ${panelBody[panel]}
      </aside>
    `;
  }

  private renderGovernanceRightPanel(): string {
    const state = this.store.getState();
    const proposals = state.governanceProposals.filter((proposal) => proposal.channelId === state.activeChannelId);
    const activeProposals = proposals.filter((proposal) => proposal.status === "active");
    const pastProposals = proposals.filter((proposal) => proposal.status !== "active");
    const selectedProposal = proposals.find((proposal) => proposal.id === this.selectedGovernanceProposalId);

    const renderProposalCard = (proposal: GovernanceProposal): string => {
      const myVote = this.latestGovernanceVoteByProposal[proposal.id];
      return `
        <article class="governance-proposal-card">
          <h4>${proposal.title}</h4>
          <p class="meta">Status: ${proposal.status} • Duration: ${proposal.durationHours}h • Quorum: ${proposal.quorum}%</p>
          ${myVote ? `<p class="meta">Your vote: ${myVote}</p>` : ""}
          <button type="button" class="ghost-btn" data-action="governance-open-proposal-detail" data-proposal-id="${proposal.id}">${myVote ? "View / Change Vote" : "Vote"}</button>
        </article>
      `;
    };

    const tabButtons = `
      <div class="right-panel-actions">
        <button type="button" class="ghost-btn" data-action="governance-right-panel-tab" data-tab="active" ${this.activeGovernancePanelTab === "active" ? "aria-current='true'" : ""}>Active</button>
        <button type="button" class="ghost-btn" data-action="governance-right-panel-tab" data-tab="past" ${this.activeGovernancePanelTab === "past" ? "aria-current='true'" : ""}>Past</button>
        <button type="button" class="ghost-btn" data-action="governance-right-panel-tab" data-tab="create" ${this.activeGovernancePanelTab === "create" ? "aria-current='true'" : ""}>Create</button>
        <button type="button" class="ghost-btn" data-action="governance-right-panel-tab" data-tab="my-votes" ${this.activeGovernancePanelTab === "my-votes" ? "aria-current='true'" : ""}>My Votes</button>
        <button type="button" class="ghost-btn" data-action="governance-right-panel-tab" data-tab="results" ${this.activeGovernancePanelTab === "results" ? "aria-current='true'" : ""}>Results</button>
      </div>
    `;

    let body = "";

    if (selectedProposal) {
      const myVote = this.latestGovernanceVoteByProposal[selectedProposal.id];
      body = `
        <div class="right-panel-governance">
          <button type="button" class="ghost-btn" data-action="governance-back-to-list">← Back to proposals</button>
          <h4>${selectedProposal.title}</h4>
          <p class="meta">${selectedProposal.description}</p>
          <p class="meta">Status: ${selectedProposal.status} • Votes use proposal detail as action surface.</p>
          <div class="right-panel-actions">
            <button type="button" class="ghost-btn" data-action="governance-vote" data-proposal-id="${selectedProposal.id}" data-vote="approve" ${this.canVote() ? "" : "disabled"}>${myVote ? "Change to approve" : "Vote approve"}</button>
            <button type="button" class="ghost-btn" data-action="governance-vote" data-proposal-id="${selectedProposal.id}" data-vote="block" ${this.canVote() ? "" : "disabled"}>${myVote ? "Change to block" : "Vote block"}</button>
          </div>
          ${this.canVote() ? "" : '<p class="meta" role="status">Voting is unavailable until governance entitlements are enabled.</p>'}
        </div>
      `;
    } else if (this.activeGovernancePanelTab === "active") {
      body = activeProposals.length
        ? `<section class="right-panel-governance">${activeProposals.map((proposal) => renderProposalCard(proposal)).join("")}</section>`
        : '<p class="meta">No active proposals.</p>';
    } else if (this.activeGovernancePanelTab === "past") {
      body = pastProposals.length
        ? `<section class="right-panel-governance">${pastProposals.map((proposal) => renderProposalCard(proposal)).join("")}</section>`
        : '<p class="meta">No past proposals.</p>';
    } else if (this.activeGovernancePanelTab === "create") {
      body = `
        <section class="right-panel-governance">
          <p class="meta">Create new governance proposals using the standard creation flow.</p>
          <button type="button" class="ghost-btn" data-action="governance-open-proposal" ${this.canPropose() ? "" : "disabled"}>Create Proposal</button>
        </section>
      `;
    } else if (this.activeGovernancePanelTab === "my-votes") {
      const voted = proposals.filter((proposal) => this.latestGovernanceVoteByProposal[proposal.id]);
      body = voted.length
        ? `<section class="right-panel-governance">${voted.map((proposal) => renderProposalCard(proposal)).join("")}</section>`
        : '<p class="meta">No votes cast yet in this room.</p>';
    } else {
      body = proposals.length
        ? `<section class="right-panel-governance">${proposals
            .map(
              (proposal) =>
                `<article class="governance-proposal-card"><h4>${proposal.title}</h4><p class="meta">Status: ${proposal.status} • Duration: ${proposal.durationHours}h • Quorum: ${proposal.quorum}%</p></article>`,
            )
            .join("")}</section>`
        : '<p class="meta">No proposal results yet.</p>';
    }

    return `
      <aside class="right-panel-overlay" data-testid="right-panel-overlay">
        <div class="right-panel-header">
          <h3>Governance Dashboard</h3>
          <button type="button" class="ghost-btn" data-action="close-right-panel" aria-label="Close right panel">Close</button>
        </div>
        ${tabButtons}
        ${body}
      </aside>
    `;
  }

  private renderDiscoverRolloutNotice(): string {
    return `
      <section class="deepdive-panel" data-testid="deepdive-rollout-notice">
        <header>
          <h2>DeepDive Discovery</h2>
          <p class="meta">DeepDive is saved for a later rollout while we prioritize core workspace stability.</p>
        </header>
        <article class="deepdive-card">
          <h3>Rollout status</h3>
          <p>Room swipe discovery is temporarily paused for this release.</p>
          <p class="meta">Use channels, DMs, and activity to navigate the workspace in the meantime.</p>
        </article>
      </section>
    `;
  }

  private renderDmsPanel(): string {
    const state = this.store.getState();
    const dmChannels = getDirectMessageChannels(state.channels, state.unreadByChannel);
    const quickLinks = `
      <li class="dm-hub-shell">
      <section class="dm-hub-card" aria-label="Direct message hub">
        <button type="button" class="dm-hub-search" data-action="start-dm-channel" aria-label="Find or start a secure conversation">Find or start a secure conversation</button>
        <div class="dm-hub-list" role="list">
          <button type="button" class="dm-hub-item" data-action="dm-open-friends" role="listitem">
            <span class="dm-hub-icon" aria-hidden="true">👥</span>
            <span>Allies</span>
          </button>
          <button type="button" class="dm-hub-item" data-action="dm-open-nitro" role="listitem">
            <span class="dm-hub-icon" aria-hidden="true">⚡</span>
            <span>Boosts</span>
          </button>
          <button type="button" class="dm-hub-item dm-hub-item--active" data-action="dm-open-shop" role="listitem">
            <span class="dm-hub-icon" aria-hidden="true">🛍️</span>
            <span>Black Market</span>
          </button>
          <button type="button" class="dm-hub-item" data-action="dm-open-quests" role="listitem">
            <span class="dm-hub-icon" aria-hidden="true">🎯</span>
            <span>Missions</span>
          </button>
        </div>
      </section>
      </li>
    `;
    const starter = `
      <li class="repo-tools-item">
        <div>
          <strong>Start a direct message</strong>
          <p class="meta">Create a dedicated DM channel with a guided name prefix.</p>
        </div>
        <button type="button" class="ghost-btn" data-action="start-dm-channel">Start DM</button>
      </li>
    `;

    const items = dmChannels
      .map(
        ({ channel, displayName, unreadCount }) => `
          <li class="repo-tools-item">
            <div>
              <strong>${displayName}${unreadCount > 0 ? ` <span class="badge">${unreadCount}</span>` : ""}</strong>
              <p class="meta">#${channel.name} • Open this conversation from your direct-message list.</p>
            </div>
            <button type="button" class="ghost-btn" data-action="open-channel" data-channel-id="${channel.id}">Open</button>
          </li>
        `,
      )
      .join("");

    const fallback = '<li class="repo-tools-item"><div><strong>No DMs detected</strong><p class="meta">Create a DM channel with names like "dm-alex", "pm-sam", or "@alex:matrix.org".</p></div></li>';
    return this.renderWorkspaceUtilityPage(
      "Direct messages",
      "A focused panel for quick DM access.",
      `${quickLinks}${starter}${items || fallback}`,
    );
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


  private renderCallsPanel(): string {
    return this.renderWorkspaceUtilityPage(
      "Calls",
      "Start a room call quickly or open threaded follow-up.",
      `<li class="repo-tools-item"><div><strong>Start room call</strong><p class="meta">Launch a lightweight call in the active room.</p></div><button type="button" class="ghost-btn" data-action="onboarding-start-call">Start call</button></li>
       <li class="repo-tools-item"><div><strong>Start thread</strong><p class="meta">Open thread panel to kick off focused discussion.</p></div><button type="button" class="ghost-btn" data-action="onboarding-open-thread">Open thread</button></li>`
    );
  }

  private renderFirstRunGuide(): string {
    if (!this.runtimeConfig.simpleMode.onboarding_progressive_disclosure) return "";
    const steps = this.onboardingSteps();
    this.trackOnboardingProgress();

    if (this.onboardingGuideDismissed || steps.every((step) => step.done)) return "";

    return `
      <section class="panel-card stack" data-testid="first-run-guide">
        <div class="panel-card-header">
          <h2>Mission launch guide (4 steps)</h2>
          <button type="button" class="ghost-btn" data-action="dismiss-onboarding-guide" aria-label="Close mission launch guide">Close</button>
        </div>
        <p class="meta">Build your mission toolkit: secure chat ${renderGlossaryTip("E2EE")}, partner links with Federation ${renderGlossaryTip("Federation")}, and trusted operations with Reputation Tier ${renderGlossaryTip("Reputation Tier")}.</p>
        <ol class="stack">
          ${steps
            .map((step) => `<li><strong>${step.done ? "✅" : "⬜"} ${step.label}</strong><div class="modal-actions">${step.done ? "<span class=\"meta\">Done</span>" : step.action}</div></li>`)
            .join("")}
        </ol>
      </section>
    `;
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

  private shouldShowAdvancedAdminModules(): boolean {
    return !this.runtimeConfig.simpleMode.simple_mode_default || this.runtimeConfig.simpleMode.show_advanced_admin_modules;
  }

  private shouldProgressivelyDiscloseOnboarding(): boolean {
    return this.runtimeConfig.simpleMode.onboarding_progressive_disclosure;
  }

  private renderFeatureEntryPoints(): string {
    const filterQuery = this.featureFilter.trim().toLowerCase();
    const grouped = new Map<UiEntryKind, string[]>();
    const showAdvancedModules = this.shouldShowAdvancedAdminModules();
    for (const feature of FEATURE_UI_ENTRIES) {
      if (
        filterQuery &&
        !`${feature.id} ${feature.name} ${feature.uiEntry}`.toLowerCase().includes(filterQuery)
      ) {
        continue;
      }
      const [kind, testId] = feature.uiEntry.split(":") as [UiEntryKind, string];
      if (!showAdvancedModules && kind === "admin_console") continue;
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
        ${showAdvancedModules ? this.renderFeatureGroup("admin_console", grouped.get("admin_console") ?? []) : `<p class="meta">Advanced admin modules are hidden in simple mode.</p>`}
        ${this.renderFeatureGroup("command_palette", grouped.get("command_palette") ?? [])}
      </section>
    `;
  }

  private renderFeatureLibraryDisclosure(): string {
    const openByDefault = this.isAdvancedCohort() && !this.shouldProgressivelyDiscloseOnboarding();
    if (this.hasAdminAccess() && this.shouldShowAdvancedAdminModules() && !this.advancedPanelViewedTracked) {
      this.advancedPanelViewedTracked = true;
      this.trackKpiEvent("advanced_panel_viewed", { panel: "feature_library" });
    }
    return `
      <details class="stack panel-card" data-testid="feature-library-disclosure" ${openByDefault ? "open" : ""}>
        <summary><strong>Advanced feature library</strong> <span class="meta">Role-based progressive reveal for power workflows.</span></summary>
        ${this.renderFeatureEntryPoints()}
      </details>
    `;
  }



  private renderFeatureToolbar(): string {
    const activeFeatures = this.getActivePresetFeatures();
    const showAdvancedModules = this.shouldShowAdvancedAdminModules();
    const enabledFeatures = FEATURE_UI_ENTRIES.filter((feature) => {
      const [kind] = feature.uiEntry.split(":") as [UiEntryKind, string];
      if (!showAdvancedModules && kind === "admin_console") return false;
      return activeFeatures[feature.presetKey] ?? false;
    });

    if (!enabledFeatures.length) {
      return `
        <section class="feature-toolbar panel-card" data-testid="feature-toolbar">
          <p class="meta">No feature shortcuts are available in this preset.</p>
        </section>
      `;
    }

    const optionsFor = (features: typeof FEATURE_UI_ENTRIES) =>
      features
        .map((feature) => {
          const [kind] = feature.uiEntry.split(":") as [UiEntryKind, string];
          const selected = this.quickAccessFeatureId === feature.id ? "selected" : "";
          return `<option value="${kind}|${feature.id}" ${selected}>${feature.name}</option>`;
        })
        .join("");

    const frequentOptions = optionsFor(enabledFeatures.slice(0, 8));
    const groupedByKind = enabledFeatures.reduce<Map<UiEntryKind, typeof FEATURE_UI_ENTRIES>>((acc, feature) => {
      const [kind] = feature.uiEntry.split(":") as [UiEntryKind, string];
      const existing = acc.get(kind) ?? [];
      existing.push(feature);
      acc.set(kind, existing);
      return acc;
    }, new Map());

    const groupedDropdowns = (Object.keys(this.featureKindUi) as UiEntryKind[])
      .map((kind) => {
        const features = groupedByKind.get(kind) ?? [];
        if (!features.length) return "";
        const category = this.featureKindUi[kind];
        return `
          <details class="quick-action-group" data-testid="feature-toolbar-group-${kind}">
            <summary>${category.icon} ${category.label}</summary>
            <label class="quick-action-select">
              <span>Select action</span>
              <select data-action="open-feature-dropdown" data-testid="feature-toolbar-dropdown-${kind}">
                <option value="">Choose action…</option>
                ${optionsFor(features)}
              </select>
            </label>
          </details>
        `;
      })
      .join("");

    return `
      <section class="feature-toolbar panel-card" data-testid="feature-toolbar">
        <div class="feature-toolbar-head">
          <div>
            <h2>Quick actions</h2>
            <p class="meta">Frequent actions stay visible. Categories expand only when you need them.</p>
          </div>
          <button
            type="button"
            class="ghost-btn"
            data-action="toggle-quick-action-bar"
            aria-expanded="${this.quickActionBarCollapsed ? "false" : "true"}"
            aria-label="${this.quickActionBarCollapsed ? "Expand quick actions" : "Collapse quick actions"}"
          >
            ${this.quickActionBarCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>
        <div class="quick-actions-grid ${this.quickActionBarCollapsed ? "quick-actions-grid--collapsed" : ""}">
          <label class="quick-action-select quick-action-select--pinned">
            <span>⚡ Frequent</span>
            <select data-action="open-feature-dropdown" data-testid="feature-toolbar-dropdown-frequent">
              <option value="">Choose quick action…</option>
              ${frequentOptions}
            </select>
          </label>
          ${groupedDropdowns}
        </div>
      </section>
    `;
  }

  private renderFeatureCommandPalette(): string {
    const query = this.commandPaletteQuery.trim().toLowerCase();
    const activeFeatures = this.getActivePresetFeatures();
    const showAdvancedModules = this.shouldShowAdvancedAdminModules();
    const rows = FEATURE_UI_ENTRIES.filter((feature) => {
      const [kind] = feature.uiEntry.split(":") as [UiEntryKind, string];
      if (!showAdvancedModules && kind === "admin_console") return false;
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

  private renderQuickActionPopup(): string {
    if (!this.quickActionPopup) return "";
    const { featureId, kind, name } = this.quickActionPopup;
    const category = this.featureKindUi[kind];
    return `
      <div class="modal-backdrop" data-action="close-quick-action-popup">
        <section class="modal" role="dialog" aria-modal="true" aria-label="Quick action feature popup">
          <h3>Quick action</h3>
          <p class="meta"><strong>${name}</strong></p>
          <p class="meta">Category: ${category.label}</p>
          <p class="meta">Feature id: ${featureId}</p>
          <div class="modal-actions">
            <button type="button" data-action="confirm-quick-action-popup" data-feature-id="${featureId}" data-feature-kind="${kind}">Open feature</button>
            <button type="button" class="ghost-btn" data-action="close-quick-action-popup">Cancel</button>
          </div>
        </section>
      </div>
    `;
  }

  private renderSettingsWorkspace(): string {
    return `
      <section class="settings-shell" data-testid="settings-shell">
        <div class="settings-page-nav" role="tablist" aria-label="Settings pages">
          ${this.renderSettingsNavButton("workspace", "Workspace")}
          ${this.renderSettingsNavButton("appearance", "Appearance")}
          ${this.renderSettingsNavButton("monetization", "Monetization")}
          ${this.renderSettingsNavButton("mobile", "Mobile")}
          ${this.renderSettingsNavButton("operations", "Operations")}
        </div>
        <section class="admin-grid" data-testid="settings-page-content">
          ${this.renderSettingsPageContent()}
        </section>
      </section>
    `;
  }

  private renderSettingsNavButton(page: SettingsPageView, label: string): string {
    const selected = this.activeSettingsPage === page;
    return `<button type="button" class="ghost-btn ${selected ? "settings-page-nav__button--active" : ""}" role="tab" aria-selected="${selected ? "true" : "false"}" data-action="settings-page" data-page="${page}" data-testid="settings-page-${page}">${label}</button>`;
  }

  private renderSettingsPageContent(): string {
    if (this.activeSettingsPage === "appearance") {
      return `${this.renderThemeManagementSection()}`;
    }
    if (this.activeSettingsPage === "monetization") {
      return `${this.renderSubscriptionPanelSection()}${this.renderUpgradePromptSection()}`;
    }
    if (this.activeSettingsPage === "mobile") {
      return `${this.renderMobileGesturesPanel()}`;
    }
    if (this.activeSettingsPage === "operations") {
      return `${this.renderRevenueOpsPanelSection()}${this.renderPlatformOpsPanelSection()}`;
    }
    return `${this.renderPresetManagementSection()}${this.renderFeatureLibraryDisclosure()}${(this.getActivePresetFeatures()["features.epic.deliveryBlueprint"] ?? false) ? this.renderEpicDeliverySection() : ""}`;
  }

  private renderPresetManagementSection(): string {
    const previewFeatures = Object.entries(FEATURE_PRESET_BUNDLES[this.selectedPreset]);
    const enabledFeatures = previewFeatures.filter(([, enabled]) => enabled).map(([key]) => key);
    const impact = this.describePresetImpact(this.appliedPreset, this.selectedPreset);
    const auditRows = this.loadPresetAuditLog()
      .slice(0, 5)
      .map((entry) => `<li class="meta">${entry}</li>`)
      .join("");

    return `
      <section class="stack panel-card" data-testid="feature-presets-panel">
        <h2>Workspace layout presets</h2>
        <p class="meta">Pick the experience level that best matches your team, preview changes, then apply instantly.</p>
        <p class="meta" data-testid="active-preset">Active preset: <strong>${this.appliedPreset}</strong></p>
        <p class="meta" data-testid="preset-diagnostics">Preset sources: deployment=${this.runtimeConfig.presets.diagnostics.deploymentPreset}, tenant=${this.runtimeConfig.presets.diagnostics.tenantPreset ?? "none"}, user overrides=${this.runtimeConfig.presets.diagnostics.userOverrideCount}</p>
        <label class="stack">
          Preset
          <select data-testid="feature-preset-select" data-action="select-preset">
            ${this.renderPresetOption("starter")}
            ${this.renderPresetOption("governance")}
            ${this.renderPresetOption("sovereignty")}
          </select>
        </label>
        <div class="stack" data-testid="preset-explainer-panel">
          <h3>What changes with this preset</h3>
          <progress max="${previewFeatures.length}" value="${enabledFeatures.length}" data-testid="preset-capability-meter"></progress>
          <p class="meta">${enabledFeatures.length}/${previewFeatures.length} capabilities enabled.</p>
          <p class="meta" data-testid="preset-impact-summary">${impact}</p>
          <ul class="stack preset-feature-list">
            ${enabledFeatures.map((key) => `<li class="meta" data-testid="preset-capability-${key.replaceAll(".", "-")}">${key}</li>`).join("")}
          </ul>
        </div>
        <div class="modal-actions">
          <button type="button" data-action="apply-preset" data-testid="apply-preset-button" ${this.selectedPreset === this.appliedPreset ? "disabled" : ""}>Apply preset</button>
          <button type="button" class="ghost-btn" data-action="rollback-preset" data-testid="rollback-preset-button" ${this.appliedPreset === this.deploymentPreset ? "disabled" : ""}>Reset to default preset</button>
        </div>
        <div class="stack">
          <h3>Preset audit trail</h3>
          <ul class="stack" data-testid="preset-audit-log">${auditRows || '<li class="meta">No preset changes recorded yet.</li>'}</ul>
        </div>
      </section>
    `;
  }

  private describePresetImpact(fromPreset: FeaturePresetKey, toPreset: FeaturePresetKey): string {
    if (fromPreset === toPreset) return "No changes pending.";
    const from = FEATURE_PRESET_BUNDLES[fromPreset];
    const to = FEATURE_PRESET_BUNDLES[toPreset];
    const enabledDelta = Object.keys(to).filter((key) => (to[key] ?? false) && !(from[key] ?? false)).length;
    const disabledDelta = Object.keys(from).filter((key) => (from[key] ?? false) && !(to[key] ?? false)).length;
    return `Impact summary: +${enabledDelta} capabilities enabled, -${disabledDelta} capabilities disabled.`;
  }

  private loadPresetAuditLog(): string[] {
    const raw = globalThis.localStorage.getItem(PRESET_AUDIT_LOG_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
    } catch {
      return [];
    }
  }

  private appendPresetAuditLog(entry: string): void {
    const current = this.loadPresetAuditLog();
    const next = [entry, ...current].slice(0, 50);
    globalThis.localStorage.setItem(PRESET_AUDIT_LOG_STORAGE_KEY, JSON.stringify(next));
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

  private renderThemeManagementSection(): string {
    const themes: Array<{ id: ThemeKey; label: string; description: string }> = [
      { id: "dark_canopy", label: "Dark canopy (default)", description: "Deep green and black surfaces for extended low-light sessions." },
      { id: "light_grove", label: "Light grove", description: "Light green and white surfaces for daylight readability." },
      { id: "amoled_night", label: "AMOLED night", description: "Pure black OLED surfaces with teal interaction accents." },
      { id: "storybook_meadow", label: "Storybook meadow", description: "Warm natural tones with soft highlights for calm reading and collaboration." },
      { id: "adventure_spectrum", label: "Adventure spectrum", description: "Playful high-contrast accents and clear landmarks for color-blind-friendly navigation." },
    ];

    return `
      <section class="stack panel-card theme-panel" data-testid="theme-panel">
        <h2>Theme selection</h2>
        <p class="meta">Theme variants from the Blackout UI plan: Dark, Light, AMOLED, Storybook, and Spectrum.</p>
        <label class="theme-select">
          <span>Active theme</span>
          <select data-action="select-theme" data-testid="theme-select">
            ${themes.map((theme) => `<option value="${theme.id}" ${theme.id === this.selectedTheme ? "selected" : ""}>${theme.label}</option>`).join("")}
          </select>
        </label>
        <ul class="theme-list">
          ${themes.map((theme) => `<li class="meta"><strong>${theme.label}</strong>: ${theme.description}</li>`).join("")}
        </ul>
      </section>
    `;
  }

  private renderSubscriptionPanelSection(): string {
    const plans = this.getSubscriptionTierMatches();

    return `
      <section class="stack panel-card subscription-panel" data-testid="subscription-panel">
        <h2>Subscription panel</h2>
        <p class="meta">Tier-aligned plan comparison and add-ons from the Blackout UI plan.</p>
        <div class="subscription-grid">
          ${plans
            .map(
              (plan) => `
                <article class="subscription-card">
                  <h3>${plan.subscription}</h3>
                  <strong>${plan.price}</strong>
                  <p class="meta"><strong>Tier:</strong> ${plan.tier}</p>
                  <p class="meta">${plan.highlights}</p>
                </article>
              `,
            )
            .join("")}
        </div>
        <button type="button" data-action="open-subscription-popup">Open subscription popup</button>
        <div class="subscription-addons">
          <span class="meta">Add-ons:</span>
          <span>Self-Healing ($19/mo)</span>
          <span>Steg Voting Compliance ($49/mo)</span>
          <span>Bounty Payroll ($9/mo)</span>
        </div>
      </section>
    `;
  }

  private getSubscriptionTierMatches(): SubscriptionTierMatch[] {
    return [
      { tier: "starter", subscription: "Starter", price: "$0", highlights: "Core chat, templates, secure defaults" },
      { tier: "governance", subscription: "Governance", price: "$9.99/mo", highlights: "Governance workflows and policy controls" },
      { tier: "sovereignty", subscription: "Sovereignty", price: "$29/mo org", highlights: "Federation + advanced stego + sovereign controls" },
    ];
  }

  private renderSubscriptionPopup(): string {
    const plans = this.getSubscriptionTierMatches();
    return `
      <div class="modal-backdrop" data-action="close-subscription-popup">
        <section class="modal subscription-modal" role="dialog" aria-modal="true" aria-label="Subscription tiers and plans">
          <h3>Subscription tiers</h3>
          <p class="meta">Each workspace tier now maps directly to a subscription plan.</p>
          <div class="subscription-popup-grid">
            ${plans
              .map(
                (plan) => `
                  <article class="subscription-popup-card">
                    <strong>${plan.tier} → ${plan.subscription}</strong>
                    <span>${plan.price}</span>
                    <p class="meta">${plan.highlights}</p>
                  </article>
                `,
              )
              .join("")}
          </div>
          <div class="modal-actions">
            <button type="button" data-action="close-subscription-popup">Close</button>
          </div>
        </section>
      </div>
    `;
  }

  private renderUpgradePromptSection(): string {
    const prompts = [
      { trigger: "Select advanced steg codec", location: "Stego panel dropdown", plan: "Signal" },
      { trigger: "Open Governance room tab", location: "Room header tabs", plan: "Coalition" },
      { trigger: "Start Townhall mode", location: "Call modal", plan: "Sovereign" },
      { trigger: "Enable federation dashboard", location: "Admin federation tab", plan: "Sovereign + add-on" },
    ];

    return `
      <section class="stack panel-card upgrade-prompts-panel" data-testid="upgrade-prompts-panel">
        <h2>Contextual upgrade prompts</h2>
        <p class="meta">Inline triggers should appear at point-of-need, not as generic banner spam.</p>
        <div class="upgrade-prompt-table">
          ${prompts
            .map(
              (prompt) => `
                <div><strong>${prompt.trigger}</strong></div>
                <div class="meta">${prompt.location}</div>
                <div>${prompt.plan}</div>
              `,
            )
            .join("")}
        </div>
      </section>
    `;
  }

  private renderMobileGesturesPanel(): string {
    return `
      <section class="stack panel-card mobile-gestures-panel" data-testid="mobile-gestures-panel">
        <h2>Mobile gestures</h2>
        <p class="meta">Configure swipe/press actions for the mobile gesture model.</p>
        <label>Swipe right on message
          <select data-action="mobile-gesture-right">
            <option value="reply" ${this.swipeRightGesture === "reply" ? "selected" : ""}>Reply</option>
            <option value="quote" ${this.swipeRightGesture === "quote" ? "selected" : ""}>Quote reply</option>
          </select>
        </label>
        <label>Swipe left on message
          <select data-action="mobile-gesture-left">
            <option value="thread" ${this.swipeLeftGesture === "thread" ? "selected" : ""}>Thread</option>
            <option value="react" ${this.swipeLeftGesture === "react" ? "selected" : ""}>Quick react</option>
          </select>
        </label>
        <ul class="meta">
          <li>Long press: copy, pin, delete, report, view source (dev mode).</li>
          <li>Pull to refresh in room list.</li>
          <li>Edge swipe right for back navigation.</li>
        </ul>
      </section>
    `;
  }

  private renderRevenueOpsPanelSection(): string {
    return renderRevenueOpsPanel({
      activeTab: this.activeRevenueOpsTab,
      paymentSheetOpen: this.paymentSheetOpen,
      paymentIssue: this.paymentIssue,
      questStage: this.questStage,
      installedApps: this.installedApps,
    });
  }

  private renderPlatformOpsPanelSection(): string {
    return renderPlatformOpsPanel({
      activeTab: this.activePlatformOpsTab,
      readinessScore: this.readinessScore,
      vaultUsageGb: this.vaultUsageGb,
      hostingTier: this.hostingTier,
      blackboxProvisioned: this.blackboxProvisioned,
      recommendationMode: this.recommendationMode,
    });
  }

  private parseTheme(theme: string | null): ThemeKey {
    if (theme === "light_grove" || theme === "amoled_night" || theme === "storybook_meadow" || theme === "adventure_spectrum") {
      return theme;
    }
    return "dark_canopy";
  }

  private applyTheme(theme: ThemeKey): void {
    this.selectedTheme = theme;
    globalThis.document.documentElement.dataset.theme = theme;
    globalThis.localStorage.setItem("blackout.theme", theme);
  }

  private readonly handleGlobalKeyDown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      this.openCommandPalette();
      return;
    }

    if (event.key === "Escape" && this.commandPaletteOpen) {
      this.closeCommandPalette();
      return;
    }

    if (event.key === "Escape" && this.root.querySelector(".composer-popover.is-open")) {
      this.closeComposerPanels();
      return;
    }

    if (event.key === "Escape" && this.root.querySelector(".governance-modal")) {
      const channelId = this.store.getState().activeChannelId;
      if (!channelId) return;
      this.governanceProposalModalByChannel[channelId] = false;
      this.render();
    }
  };

  private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
    if (!(event.target instanceof Element)) return;
    const hasOpenPanel = this.root.querySelector(".composer-popover.is-open");
    if (!hasOpenPanel) return;
    const insidePanel = event.target.closest(".composer-popover");
    const isTrigger = event.target.closest("[data-action^='composer-toggle-'], [data-action='composer-open-governance']");
    if (!insidePanel && !isTrigger) {
      this.closeComposerPanels();
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
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-home-panel']").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeWorkspacePanel = "chat";
        this.store.patch({ channelDrawerOpen: false });
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-rooms-panel']").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeWorkspacePanel = "chat";
        this.store.patch({ channelDrawerOpen: true });
        this.featureActionResult = "Rooms opened. Create your first room or pick an existing one.";
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-calls-panel']").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeWorkspacePanel = "calls";
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-admin-panel']").forEach((button) => {
      button.addEventListener("click", () => {
        this.trackOnboardingDrop("opened_admin_before_completion");
        this.settingsOpen = true;
        this.featureActionResult = "Admin controls are available in Settings.";
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='onboarding-send-invite']").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await globalThis.navigator.clipboard?.writeText(globalThis.location.href);
          this.featureActionResult = "Invite link copied. Share it with your team.";
        } catch {
          this.featureActionResult = "Invite ready. Copy the current URL and share it with your team.";
        }
        globalThis.localStorage.setItem(ONBOARDING_INVITE_SENT_STORAGE_KEY, "true");
        this.trackKpiEvent("kpi_invite_completion", { completed: true });
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='onboarding-open-thread']").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeRightPanel = "threads";
        globalThis.localStorage.setItem(ONBOARDING_CONVERSATION_STARTED_STORAGE_KEY, "true");
        this.featureActionResult = "Thread panel opened. Start your first threaded discussion.";
        this.trackKpiEvent("kpi_ttfv_checkpoint", { step: 4, path: "thread" });
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='onboarding-start-call']").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeWorkspacePanel = "calls";
        this.activeTownhallMode = "standard";
        globalThis.localStorage.setItem(ONBOARDING_CONVERSATION_STARTED_STORAGE_KEY, "true");
        this.featureActionResult = "Call setup ready from the Calls panel.";
        this.trackKpiEvent("kpi_ttfv_checkpoint", { step: 4, path: "call" });
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='onboarding-open-stego']").forEach((button) => {
      button.addEventListener("click", () => {
        this.toggleComposerPanel("stego", "[data-action='composer-toggle-stego-panel']");
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='onboarding-open-governance']").forEach((button) => {
      button.addEventListener("click", () => {
        this.toggleComposerPanel("governance", "[data-action='composer-open-governance']");
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='onboarding-open-federation']").forEach((button) => {
      button.addEventListener("click", () => {
        this.activePlatformOpsTab = "federation";
        this.settingsOpen = true;
        this.activeSettingsPage = "operations";
        this.trackAdvancedDiscovery("federation");
        this.featureActionResult = "Federation panel opened. Review node health and snapshots.";
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='onboarding-tour-next']").forEach((button) => {
      button.addEventListener("click", () => {
        const module = button.dataset.tour as "stego" | "governance" | undefined;
        if (!module) return;
        this.advanceAdvancedTour(module);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='onboarding-tour-skip']").forEach((button) => {
      button.addEventListener("click", () => {
        const module = button.dataset.tour as "stego" | "governance" | undefined;
        if (!module) return;
        this.skipAdvancedTour(module);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='dismiss-onboarding-guide']").forEach((button) => {
      button.addEventListener("click", () => {
        this.onboardingGuideDismissed = true;
        globalThis.localStorage.setItem(ONBOARDING_GUIDE_DISMISSED_STORAGE_KEY, "true");
        this.trackOnboardingDrop("user_closed_guide");
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='toggle-quick-action-bar']").forEach((button) => {
      button.addEventListener("click", () => {
        this.quickActionBarCollapsed = !this.quickActionBarCollapsed;
        globalThis.localStorage.setItem(QUICK_ACTION_BAR_COLLAPSED_STORAGE_KEY, String(this.quickActionBarCollapsed));
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='open-bug-report']").forEach((element) => {
      element.addEventListener("click", () => {
        this.bugReportOpen = true;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='close-bug-report']").forEach((element) => {
      element.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (element.classList.contains("bug-report-modal-backdrop") && target.closest(".bug-report-modal")) return;
        this.bugReportOpen = false;
        this.render();
      });
    });

    this.root.querySelector<HTMLTextAreaElement>("[data-action='bug-report-issue']")?.addEventListener("input", (event) => {
      this.bugReportIssue = (event.currentTarget as HTMLTextAreaElement).value;
    });
    this.root.querySelector<HTMLTextAreaElement>("[data-action='bug-report-steps']")?.addEventListener("input", (event) => {
      this.bugReportSteps = (event.currentTarget as HTMLTextAreaElement).value;
    });
    this.root.querySelector<HTMLTextAreaElement>("[data-action='bug-report-suggestions']")?.addEventListener("input", (event) => {
      this.bugReportSuggestions = (event.currentTarget as HTMLTextAreaElement).value;
    });
    this.root.querySelector<HTMLFormElement>("[data-action='submit-bug-report']")?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.submitBugReport();
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

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='start-dm-channel']").forEach((button) => {
      button.addEventListener("click", () => {
        this.openDmComposer();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='dm-open-friends']").forEach((button) => {
      button.addEventListener("click", () => {
        this.openDmComposer();
        this.featureActionResult = "Allies shortcuts map to direct-message contacts. Start a DM to reach your trusted circle.";
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='dm-open-nitro']").forEach((button) => {
      button.addEventListener("click", () => {
        this.settingsOpen = true;
        this.featureActionResult = "Boosts map to Blackout subscription perks. Open settings to manage plan upgrades.";
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='dm-open-shop']").forEach((button) => {
      button.addEventListener("click", () => {
        globalThis.open("https://freeblackmarket.com/digital-products", "_blank", "noopener,noreferrer");
        this.featureActionResult = "Black Market opened digital products at freeblackmarket.com.";
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='dm-open-quests']").forEach((button) => {
      button.addEventListener("click", () => {
        this.settingsOpen = true;
        this.activeRevenueOpsTab = "quests";
        this.featureActionResult = "Missions opened in Revenue Ops so you can review campaign milestones and payouts.";
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='browse-channels']").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeWorkspacePanel = "chat";
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
        this.settingsOpen = false;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-discover-panel']").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeWorkspacePanel = "discover";
        this.activeMobileTab = "home";
        this.render();
      });
    });

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

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='settings-page']").forEach((button) => {
      button.addEventListener("click", () => {
        const page = button.dataset.page as SettingsPageView | undefined;
        if (!page) return;
        this.activeSettingsPage = page;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='toggle-compact-mode']").forEach((button) => {
      button.addEventListener("click", () => {
        this.compactModeEnabled = !this.compactModeEnabled;
        this.render();
      });
    });

    this.root.querySelector<HTMLSelectElement>("[data-action='mobile-gesture-right']")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value as "reply" | "quote";
      this.swipeRightGesture = value;
      this.featureActionResult = `Updated swipe-right gesture to ${value}.`;
      this.render();
    });

    this.root.querySelector<HTMLSelectElement>("[data-action='mobile-gesture-left']")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value as "thread" | "react";
      this.swipeLeftGesture = value;
      this.featureActionResult = `Updated swipe-left gesture to ${value}.`;
      this.render();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='revenue-tab']").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab as RevenueOpsTab | undefined;
        if (!tab) return;
        this.activeRevenueOpsTab = tab;
        this.render();
      });
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='revenue-open-payment-sheet']")?.addEventListener("click", () => {
      this.paymentSheetOpen = true;
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='revenue-close-payment-sheet']")?.addEventListener("click", () => {
      this.paymentSheetOpen = false;
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='revenue-toggle-payment-issue']")?.addEventListener("click", () => {
      this.paymentIssue = !this.paymentIssue;
      this.render();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='quest-next-stage']")?.addEventListener("click", () => {
      this.questStage = this.questStage === "open" ? "claimed" : this.questStage === "claimed" ? "submitted" : this.questStage === "submitted" ? "approved" : "approved";
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='quest-reset-stage']")?.addEventListener("click", () => {
      this.questStage = "open";
      this.render();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='app-install']")?.addEventListener("click", () => {
      this.installedApps += 1;
      this.featureActionResult = "Installed app with sandbox permission review.";
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='app-uninstall']")?.addEventListener("click", () => {
      this.installedApps = Math.max(0, this.installedApps - 1);
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='app-permissions']")?.addEventListener("click", () => {
      this.featureActionResult = "Permissions reviewed: events.read, governance.write, treasury.read.";
      this.render();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='platform-tab']").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab as PlatformOpsTab | undefined;
        if (!tab) return;
        this.activePlatformOpsTab = tab;
        this.render();
      });
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='platform-refresh-readiness']")?.addEventListener("click", () => {
      this.readinessScore = 75 + Math.round(Math.random() * 24);
      this.featureActionResult = "Federation telemetry refreshed.";
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='compliance-toggle-secret-ballot']")?.addEventListener("click", () => {
      this.featureActionResult = "Secret-ballot compliance mode toggled.";
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='compliance-open-audit-log']")?.addEventListener("click", () => {
      this.featureActionResult = "Opened steganographic audit trail preview.";
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='compliance-generate-1099']")?.addEventListener("click", () => {
      this.featureActionResult = "Generated 1099 payroll batch (preview).";
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='vault-upload-sim']")?.addEventListener("click", () => {
      this.vaultUsageGb = Math.min(50, this.vaultUsageGb + 2.5);
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='vault-clear-sim']")?.addEventListener("click", () => {
      this.vaultUsageGb = 0;
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='hosting-scale-up']")?.addEventListener("click", () => {
      this.hostingTier = Math.min(5, this.hostingTier + 1);
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='hosting-scale-down']")?.addEventListener("click", () => {
      this.hostingTier = Math.max(1, this.hostingTier - 1);
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='hosting-trigger-backup']")?.addEventListener("click", () => {
      this.featureActionResult = "Manual backup trigger queued.";
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='blackbox-toggle-provisioning']")?.addEventListener("click", () => {
      this.blackboxProvisioned = !this.blackboxProvisioned;
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='mobile-toggle-recommendation']")?.addEventListener("click", () => {
      this.recommendationMode = this.recommendationMode === "heuristic" ? "matrix_public_rooms" : "heuristic";
      this.render();
    });

    this.root.querySelector<HTMLSelectElement>("[data-action='select-preset']")?.addEventListener("change", (event) => {
      const value = normalizeFeaturePresetKey((event.currentTarget as HTMLSelectElement).value) ?? this.appliedPreset;
      this.selectedPreset = value;
      this.render();
    });

    this.root.querySelector<HTMLSelectElement>("[data-action='select-theme']")?.addEventListener("change", (event) => {
      const value = this.parseTheme((event.currentTarget as HTMLSelectElement).value);
      this.applyTheme(value);
      this.render();
    });

    this.root.querySelector<HTMLInputElement>("[data-action='filter-features']")?.addEventListener("input", (event) => {
      this.featureFilter = (event.currentTarget as HTMLInputElement).value;
      this.render();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='apply-preset']")?.addEventListener("click", () => {
      if (this.selectedPreset === this.appliedPreset) return;
      const summary = this.describePresetImpact(this.appliedPreset, this.selectedPreset);
      const approved = globalThis.confirm?.(`Apply preset ${this.selectedPreset}?\n\n${summary}`) ?? true;
      if (!approved) return;
      const previousPreset = this.appliedPreset;
      this.appliedPreset = this.selectedPreset;
      this.appliedFeatures = { ...FEATURE_PRESET_BUNDLES[this.selectedPreset] };
      this.appendPresetAuditLog(`${new Date().toISOString()} applied ${previousPreset} → ${this.appliedPreset}`);
      this.telemetry.track("preset_applied", { preset: this.appliedPreset, fromPreset: previousPreset, cohort: this.runtimeConfig.rollout.cohort });
      this.render();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='rollback-preset']")?.addEventListener("click", () => {
      if (this.appliedPreset === this.deploymentPreset) return;
      const summary = this.describePresetImpact(this.appliedPreset, this.deploymentPreset);
      const approved = globalThis.confirm?.(`Rollback preset to ${this.deploymentPreset}?\n\n${summary}`) ?? true;
      if (!approved) return;
      const previousPreset = this.appliedPreset;
      this.appliedPreset = this.deploymentPreset;
      this.selectedPreset = this.deploymentPreset;
      this.appliedFeatures = { ...FEATURE_PRESET_BUNDLES[this.deploymentPreset] };
      this.appendPresetAuditLog(`${new Date().toISOString()} rollback ${previousPreset} → ${this.deploymentPreset}`);
      this.telemetry.track("preset_rollback", { preset: this.deploymentPreset, fromPreset: previousPreset, cohort: this.runtimeConfig.rollout.cohort });
      this.render();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-feature-entry']").forEach((button) => {
      button.addEventListener("click", () => {
        const featureId = button.dataset.featureId;
        const requestedKind = button.dataset.featureKind as UiEntryKind | undefined;
        if (!featureId) {
          this.featureActionResult = "Could not open feature: missing feature id.";
          this.render();
          return;
        }
        if (button.dataset.actionOrigin === "palette") {
          this.closeCommandPalette({ restoreFocus: false });
          if (!this.hasSeenFeatureTooltips) {
            globalThis.localStorage.setItem("blackout.featureTipsSeen", "true");
          }
        }
        this.openFeatureById(featureId, requestedKind);
      });
    });

    this.root.querySelectorAll<HTMLSelectElement>("[data-action='open-feature-dropdown']").forEach((select) => {
      select.addEventListener("change", (event) => {
        const value = (event.currentTarget as HTMLSelectElement).value;
        if (!value) return;
        const [kind, featureId] = value.split("|") as [UiEntryKind, string];
        this.showQuickActionPopup(featureId, kind);
        this.openFeatureById(featureId, kind);
        (event.currentTarget as HTMLSelectElement).value = "";
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='close-quick-action-popup']").forEach((element) => {
      element.addEventListener("click", (event) => {
        if (element.classList.contains("modal") || element.closest(".modal")) {
          if ((event.target as HTMLElement).closest("[data-action='confirm-quick-action-popup']")) return;
        }
        this.quickActionPopup = null;
        this.render();
      });
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='confirm-quick-action-popup']")?.addEventListener("click", (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const featureId = button.dataset.featureId;
      const kind = button.dataset.featureKind as UiEntryKind | undefined;
      this.quickActionPopup = null;
      this.openFeatureById(featureId, kind);
    });


    this.root.querySelector<HTMLButtonElement>("[data-action='toggle-channel-drawer']")?.addEventListener("click", () => {
      const current = this.store.getState().channelDrawerOpen;
      this.store.patch({ channelDrawerOpen: !current });
      this.render();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-right-panel']").forEach((button) => {
      button.addEventListener("click", () => {
        const panel = button.dataset.panel as RightPanelView | undefined;
        if (!panel) return;
        if (panel === "governance" && !this.governanceFeatureEnabled()) {
          this.featureActionResult = "Governance dashboard is disabled by feature policy.";
          this.render();
          return;
        }
        this.activeRightPanel = panel;
        if (panel === "governance") {
          this.activeGovernancePanelTab = "active";
          this.selectedGovernanceProposalId = null;
        }
        if (panel !== "widget") {
          this.activeWidgetFeatureId = null;
        }
        this.render();
      });
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='close-right-panel']")?.addEventListener("click", () => {
      this.activeRightPanel = null;
      this.activeWidgetFeatureId = null;
      this.render();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='governance-set-tab']").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab as GovernanceRoomTab | undefined;
        const channelId = this.store.getState().activeChannelId;
        if (!tab || !channelId) return;
        this.governanceTabByChannel[channelId] = tab;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='governance-right-panel-tab']").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab as GovernanceRightPanelTab | undefined;
        if (!tab) return;
        this.activeGovernancePanelTab = tab;
        this.selectedGovernanceProposalId = null;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='governance-open-proposal-detail']").forEach((button) => {
      button.addEventListener("click", () => {
        const proposalId = button.dataset.proposalId;
        if (!proposalId) return;
        this.selectedGovernanceProposalId = proposalId;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='governance-back-to-list']").forEach((button) => {
      button.addEventListener("click", () => {
        this.selectedGovernanceProposalId = null;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='governance-open-proposal']").forEach((element) => {
      element.addEventListener("click", () => {
        const channelId = this.store.getState().activeChannelId;
        if (!channelId || !this.canPropose()) {
          this.featureActionResult = "You do not have permission to create proposals in this room.";
          this.render();
          return;
        }
        if (!this.activeChannelHasCapability("governance")) {
          this.featureActionResult = "Proposal builder opened in composer because this channel does not run full governance workflows.";
          this.toggleComposerPanel("governance", "[data-action='composer-open-governance']");
          return;
        }
        this.governanceProposalModalByChannel[channelId] = true;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='governance-close-proposal']").forEach((element) => {
      element.addEventListener("click", (event) => {
        const channelId = this.store.getState().activeChannelId;
        const target = event.target as HTMLElement;
        if (!channelId) return;
        if (element.classList.contains("modal") && target.closest(".modal-content")) return;
        this.governanceProposalModalByChannel[channelId] = false;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='governance-create-proposal']").forEach((button) => {
      button.addEventListener("click", () => {
        const state = this.store.getState();
        if (!state.activeChannelId || !this.canPropose()) return;
        const title = this.root.querySelector<HTMLInputElement>("[data-action='governance-proposal-title']")?.value.trim() ?? "";
        const description = this.root.querySelector<HTMLTextAreaElement>("[data-action='governance-proposal-description']")?.value.trim() ?? "";
        const voteType = (this.root.querySelector<HTMLSelectElement>("[data-action='governance-proposal-vote-type']")?.value ??
          "simple_majority") as GovernanceProposal["voteType"];
        const durationHours = Math.max(1, Number.parseInt(this.root.querySelector<HTMLSelectElement>("[data-action='governance-proposal-duration']")?.value ?? "48", 10) || 48);
        const quorum = Math.min(100, Math.max(1, Number.parseInt(this.root.querySelector<HTMLInputElement>("[data-action='governance-proposal-quorum']")?.value ?? "60", 10) || 60));
        if (!title || description.length < 8) {
          this.featureActionResult = "Proposal validation failed: add a title and a descriptive body (8+ chars).";
          this.render();
          return;
        }
        const proposal: GovernanceProposal = {
          id: `gov_${Date.now()}`,
          channelId: state.activeChannelId,
          title,
          description,
          voteType,
          durationHours,
          quorum,
          status: "active",
          createdAt: new Date().toISOString(),
        };
        this.store.patch({
          governanceProposals: [proposal, ...state.governanceProposals],
        });
        this.governanceProposalModalByChannel[state.activeChannelId] = false;
        this.featureActionResult = "Proposal created and published to the governance board.";
        this.trackKpiEvent("governance_proposal_created", { channel_id: state.activeChannelId, vote_type: voteType });
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='governance-vote']").forEach((button) => {
      button.addEventListener("click", () => {
        const state = this.store.getState();
        if (!state.activeChannelId || !this.canVote()) return;
        const vote = button.dataset.vote ?? "approve";
        const proposalId = button.dataset.proposalId;
        if (proposalId && (vote === "approve" || vote === "block")) {
          this.latestGovernanceVoteByProposal[proposalId] = vote;
        }
        this.featureActionResult = `Vote submitted: ${vote}.`;
        this.trackKpiEvent("governance_vote_cast", { channel_id: state.activeChannelId, vote });
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='economics-set-tab']").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab as EconomicsTab | undefined;
        if (!tab) return;
        this.activeEconomicsTab = tab;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='federation-set-tab']").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab as FederationTab | undefined;
        if (!tab) return;
        this.activeFederationTab = tab;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='townhall-set-mode']").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode as TownhallMode | undefined;
        if (!mode) return;
        this.activeTownhallMode = mode;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='mobile-tab']").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab as MobileTab | undefined;
        if (!tab) return;
        this.activeMobileTab = tab;
        switch (tab) {
          case "home":
            this.activeWorkspacePanel = "discover";
            break;
          case "spaces":
            this.activeWorkspacePanel = "chat";
            break;
          case "search":
            this.activeWorkspacePanel = "activity";
            break;
          case "governance":
            this.settingsOpen = false;
            this.activeWorkspacePanel = "chat";
            this.openGovernanceDestination();
            break;
          case "profile":
            this.settingsOpen = true;
            break;
        }
        this.render();
      });
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

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-toggle-attachments']")?.addEventListener("click", () => {
      this.toggleComposerPanel("attachments", "[data-action='composer-toggle-attachments']");
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-close-panel']").forEach((button) => {
      button.addEventListener("click", () => {
        this.closeComposerPanels();
      });
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-toggle-gif-picker']")?.addEventListener("click", () => {
      this.toggleComposerPanel("gif", "[data-action='composer-toggle-gif-picker']");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-toggle-emoji-picker']")?.addEventListener("click", () => {
      this.toggleComposerPanel("emoji", "[data-action='composer-toggle-emoji-picker']");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-toggle-stego-panel']")?.addEventListener("click", () => {
      this.toggleComposerPanel("stego", "[data-action='composer-toggle-stego-panel']");
      this.trackAdvancedDiscovery("stego");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-open-subscription']")?.addEventListener("click", () => {
      this.subscriptionPopupOpen = true;
      this.featureActionResult = "Opened subscription popup. Upgrade to Signal to unlock advanced codecs and batch mode.";
      this.closeComposerPanels();
      this.render();
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='open-subscription-popup']").forEach((element) => {
      element.addEventListener("click", () => {
        this.subscriptionPopupOpen = true;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='close-subscription-popup']").forEach((element) => {
      element.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (element.classList.contains("modal-backdrop") && target.closest(".modal")) return;
        this.subscriptionPopupOpen = false;
        this.render();
      });
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-stego-tab-encode']")?.addEventListener("click", () => {
      this.switchStegoView("encode");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-stego-tab-decrypt']")?.addEventListener("click", () => {
      this.switchStegoView("decrypt");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-stego-tab-password']")?.addEventListener("click", () => {
      this.switchStegoView("password");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-attachment-mode-quick-add']")?.addEventListener("click", () => {
      this.switchAttachmentComposerMode("quick-add");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-attachment-mode-library']")?.addEventListener("click", () => {
      this.switchAttachmentComposerMode("library");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-attachment-mode-bulk-import']")?.addEventListener("click", () => {
      this.switchAttachmentComposerMode("bulk-import");
    });

    this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-hidden']")?.addEventListener("input", () => {
      this.updateStegoEncodePreview();
    });

    this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-cover']")?.addEventListener("input", () => {
      this.updateStegoEncodePreview();
    });

    this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-passphrase']")?.addEventListener("input", () => {
      this.updateStegoPassphraseStrength();
    });

    this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-preview-reveal']")?.addEventListener("change", () => {
      this.updateStegoEncodePreview();
    });
    this.updateStegoEncodePreview();
    this.updateStegoPassphraseStrength();

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-select-gif']").forEach((button) => {
      button.addEventListener("click", () => {
        const snippet = button.dataset.snippet;
        if (!snippet) return;
        this.applyComposerSnippet(snippet);
        this.closeComposerPanels();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-select-emoji']").forEach((button) => {
      button.addEventListener("click", () => {
        const snippet = button.dataset.snippet;
        if (!snippet) return;
        this.applyComposerSnippet(snippet);
        this.closeComposerPanels();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-attachment-mode']").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode as AttachmentPanelMode | undefined;
        if (!mode) return;
        this.switchAttachmentMode(mode);
      });
    });

    this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-label']")?.addEventListener("input", () => {
      this.updateAttachmentActionState();
    });

    this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-url']")?.addEventListener("input", () => {
      this.updateAttachmentActionState();
    });

    this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-attachment-import-json']")?.addEventListener("input", () => {
      this.updateAttachmentActionState();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-attach-image']")?.addEventListener("click", () => {
      this.applyComposerSnippet(" ![uploaded image](https://images.examplecdn.com/uploads/team-update.png)");
      this.closeComposerPanels();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-attach-file']")?.addEventListener("click", () => {
      this.applyComposerSnippet(" [file:quarterly-plan.pdf](https://files.examplecdn.com/quarterly-plan.pdf)");
      this.closeComposerPanels();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-open-governance']").forEach((button) => {
      button.addEventListener("click", () => {
        if (!this.governanceFeatureEnabled()) {
          this.featureActionResult = "Governance composer is disabled by feature policy.";
          this.render();
          return;
        }
        this.toggleComposerPanel("governance", button);
        this.trackAdvancedDiscovery("governance");
      });
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-governance-insert-proposal']")?.addEventListener("click", () => {
      if (!this.canPropose()) {
        this.featureActionResult = "You need proposal permissions to insert governance proposals.";
        this.render();
        return;
      }
      const title = this.root.querySelector<HTMLInputElement>("[data-action='composer-governance-title']")?.value.trim() || "Approve sprint release?";
      const type = this.root.querySelector<HTMLSelectElement>("[data-action='composer-governance-type']")?.value || "binary";
      const optionsRaw = this.root.querySelector<HTMLInputElement>("[data-action='composer-governance-options']")?.value || "Approve,Block";
      const duration = Math.max(1, Number.parseInt(this.root.querySelector<HTMLInputElement>("[data-action='composer-governance-duration']")?.value ?? "48", 10) || 48);
      const options = optionsRaw
        .split(",")
        .map((option) => option.trim())
        .filter(Boolean);
      this.applyComposerSnippet(`\n/proposal \"${title}\" --type=${type} --options=\"${options.join(",")}\" --duration=${duration}h\n`);
      this.closeComposerPanels();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-governance-insert-vote']")?.addEventListener("click", () => {
      const optionsRaw = this.root.querySelector<HTMLInputElement>("[data-action='composer-governance-options']")?.value || "Approve,Block";
      const options = optionsRaw
        .split(",")
        .map((option) => option.trim())
        .filter(Boolean);
      this.applyComposerSnippet(`\n/vote \"${options[0] ?? "Approve"}\"\n`);
      this.closeComposerPanels();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-governance-save-template']")?.addEventListener("click", () => {
      if (!this.canPropose()) {
        this.featureActionResult = "Template save requires governance proposal permissions.";
        this.render();
        return;
      }
      const title = this.root.querySelector<HTMLInputElement>("[data-action='composer-governance-title']")?.value.trim() || "";
      const type = (this.root.querySelector<HTMLSelectElement>("[data-action='composer-governance-type']")?.value as GovernanceTemplateItem["type"] | undefined) ?? "binary";
      const optionsRaw = this.root.querySelector<HTMLInputElement>("[data-action='composer-governance-options']")?.value || "";
      const durationHours = Math.max(1, Number.parseInt(this.root.querySelector<HTMLInputElement>("[data-action='composer-governance-duration']")?.value ?? "48", 10) || 48);
      if (!title) return;
      const options = optionsRaw
        .split(",")
        .map((option) => option.trim())
        .filter(Boolean);
      const id = this.normalizeStegoChannelId(`gov-${title}`);
      const template: GovernanceTemplateItem = { id, title, type, options, durationHours };
      const existing = this.governanceTemplates.find((item) => item.id === id);
      this.governanceTemplates = existing
        ? this.governanceTemplates.map((item) => (item.id === id ? template : item))
        : [...this.governanceTemplates, template];
      this.persistGovernanceTemplates();
      this.refreshGovernanceTemplateUi();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-governance-export-templates']")?.addEventListener("click", () => {
      const importInput = this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-governance-import-json']");
      if (!importInput) return;
      importInput.value = JSON.stringify(this.governanceTemplates, null, 2);
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-governance-import-templates']")?.addEventListener("click", () => {
      const importInput = this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-governance-import-json']");
      const raw = importInput?.value.trim() ?? "";
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as GovernanceTemplateItem[];
        if (!Array.isArray(parsed)) {
          this.featureActionResult = "Template import failed: payload must be a JSON array.";
          this.render();
          return;
        }
        const imported = parsed
          .filter((item) => item && typeof item.title === "string" && (item.type === "binary" || item.type === "multiple_choice" || item.type === "ranked") && Array.isArray(item.options))
          .map((item) => ({
            id: this.normalizeStegoChannelId(`gov-${item.title}`),
            title: item.title,
            type: item.type,
            options: item.options.map((option) => String(option)),
            durationHours: Math.max(1, Number.parseInt(String(item.durationHours), 10) || 48),
          }));
        this.governanceTemplates = [...this.governanceTemplates.filter((item) => !imported.some((next) => next.id === item.id)), ...imported];
        this.persistGovernanceTemplates();
        this.refreshGovernanceTemplateUi();
        this.featureActionResult = `Imported ${imported.length} governance template(s).`;
        this.render();
      } catch {
        this.featureActionResult = "Template import failed: invalid JSON format.";
        this.render();
        return;
      }
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-insert-stego']")?.addEventListener("click", () => {
      const hiddenInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-hidden']");
      const coverInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-cover']");
      const passphraseInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-passphrase']");
      const algorithmSelect = this.root.querySelector<HTMLSelectElement>("[data-action='composer-stego-algorithm']");
      const channelSelect = this.root.querySelector<HTMLSelectElement>("[data-action='composer-stego-channel-select']");
      const ephemeralCheckbox = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-ephemeral']");
      const ttlInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-ttl']");
      const hidden = hiddenInput?.value.trim() || "hidden-message";
      const cover = coverInput?.value.trim() || "let's sync after standup";
      const passphrase = passphraseInput?.value.trim() || "";
      const algorithm = algorithmSelect?.value || "lsb-aes-256-cbc";
      const ephemeral = ephemeralCheckbox?.checked ?? false;
      const ttl = Math.max(1, Number.parseInt(ttlInput?.value ?? "24", 10) || 24);
      const keyHint = passphrase ? `${passphrase.slice(0, 2)}***${passphrase.slice(-2)}` : "none";
      const channelId = channelSelect?.value || "";
      const lifecycle = ephemeral ? ` lifecycle="ephemeral" ttl="${ttl}h"` : "";
      const channelAttr = channelId ? ` channel="${channelId}"` : "";
      this.applyComposerSnippet(` [stego algo="${algorithm}" keyHint="${keyHint}"${channelAttr}${lifecycle} hidden="${hidden}"]${cover}[/stego]`);
      this.closeComposerPanels();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-decrypt-stego']")?.addEventListener("click", () => {
      const payloadInput = this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-stego-decrypt-payload']");
      const payload = payloadInput?.value.trim() ?? "";
      const match = payload.match(/\[stego ([^\]]+) hidden="([^"]+)"\]([\s\S]*?)\[\/stego\]/i);
      if (!match) {
        this.updateStegoDecryptResult("No stego payload found. Paste a [stego ...][/stego] packet.", true);
        return;
      }
      const attrs = match[1];
      const hidden = match[2];
      const cover = match[3];
      const algorithm = attrs.match(/algo="([^"]+)"/)?.[1] ?? "unknown";
      const keyHint = attrs.match(/keyHint="([^"]+)"/)?.[1] ?? "none";
      const lifecycle = attrs.match(/lifecycle="([^"]+)"/)?.[1] ?? "persistent";
      this.updateStegoDecryptResult(`Hidden: "${hidden}" · Cover: "${cover}" · Algo: ${algorithm} · Key hint: ${keyHint} · Lifecycle: ${lifecycle}`);
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-stego-generate-passphrase']")?.addEventListener("click", () => {
      const generated = this.generateStegoPassphrase();
      const generatedInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-generated-passphrase']");
      if (generatedInput) generatedInput.value = generated;
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-stego-copy-passphrase']")?.addEventListener("click", async () => {
      const generatedInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-generated-passphrase']");
      const generated = generatedInput?.value?.trim();
      if (!generated || generated === "auto-generate to begin") return;
      await globalThis.navigator.clipboard?.writeText?.(generated);
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-stego-use-passphrase-hide']")?.addEventListener("click", () => {
      const generatedInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-generated-passphrase']");
      const passphraseInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-passphrase']");
      const generated = generatedInput?.value?.trim();
      if (!generated || !passphraseInput || generated === "auto-generate to begin") return;
      passphraseInput.value = generated;
      this.switchStegoView("encode");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-stego-use-passphrase-decrypt']")?.addEventListener("click", () => {
      const generatedInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-generated-passphrase']");
      const passphraseInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-decrypt-passphrase']");
      const generated = generatedInput?.value?.trim();
      if (!generated || !passphraseInput || generated === "auto-generate to begin") return;
      passphraseInput.value = generated;
      this.switchStegoView("decrypt");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-gif-add']")?.addEventListener("click", () => {
      const labelInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-gif-label']");
      const urlInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-gif-url']");
      const label = labelInput?.value.trim() ?? "";
      const url = urlInput?.value.trim() ?? "";
      if (!label || !url) return;
      const id = this.normalizeStegoChannelId(label);
      const item: GifLibraryItem = { id, label, url };
      const existing = this.gifLibrary.find((gif) => gif.id === id);
      this.gifLibrary = existing ? this.gifLibrary.map((gif) => (gif.id === id ? item : gif)) : [...this.gifLibrary, item];
      this.persistGifLibrary();
      this.refreshGifLibraryUi();
      if (labelInput) labelInput.value = "";
      if (urlInput) urlInput.value = "";
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-gif-export']")?.addEventListener("click", () => {
      const importInput = this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-gif-import-json']");
      if (!importInput) return;
      importInput.value = JSON.stringify(this.gifLibrary, null, 2);
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-gif-import']")?.addEventListener("click", () => {
      const importInput = this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-gif-import-json']");
      const raw = importInput?.value.trim() ?? "";
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Array<{ label?: string; url?: string }>;
        if (!Array.isArray(parsed)) return;
        const imported = parsed
          .filter((item) => typeof item.label === "string" && typeof item.url === "string")
          .map((item) => ({
            id: this.normalizeStegoChannelId(item.label as string),
            label: item.label as string,
            url: item.url as string,
          }));
        this.gifLibrary = [...this.gifLibrary.filter((gif) => !imported.some((entry) => entry.id === gif.id)), ...imported];
        this.persistGifLibrary();
        this.refreshGifLibraryUi();
      } catch {
        return;
      }
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-emoji-add']")?.addEventListener("click", () => {
      const symbolInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-emoji-symbol']");
      const labelInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-emoji-label']");
      const symbol = symbolInput?.value.trim() ?? "";
      const label = labelInput?.value.trim() ?? symbol;
      if (!symbol) return;
      const id = this.normalizeStegoChannelId(label || symbol);
      const item: EmojiLibraryItem = { id, symbol, label: label || symbol };
      const existing = this.emojiLibrary.find((emoji) => emoji.id === id);
      this.emojiLibrary = existing ? this.emojiLibrary.map((emoji) => (emoji.id === id ? item : emoji)) : [...this.emojiLibrary, item];
      this.persistEmojiLibrary();
      this.refreshEmojiLibraryUi();
      if (symbolInput) symbolInput.value = "";
      if (labelInput) labelInput.value = "";
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-emoji-export']")?.addEventListener("click", () => {
      const importInput = this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-emoji-import-json']");
      if (!importInput) return;
      importInput.value = JSON.stringify(this.emojiLibrary, null, 2);
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-emoji-import']")?.addEventListener("click", () => {
      const importInput = this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-emoji-import-json']");
      const raw = importInput?.value.trim() ?? "";
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Array<{ symbol?: string; label?: string }>;
        if (!Array.isArray(parsed)) return;
        const imported = parsed
          .filter((item) => typeof item.symbol === "string")
          .map((item) => ({
            id: this.normalizeStegoChannelId((item.label as string) || (item.symbol as string)),
            symbol: item.symbol as string,
            label: (item.label as string) || (item.symbol as string),
          }));
        this.emojiLibrary = [...this.emojiLibrary.filter((emoji) => !imported.some((entry) => entry.id === emoji.id)), ...imported];
        this.persistEmojiLibrary();
        this.refreshEmojiLibraryUi();
      } catch {
        return;
      }
    });

    const attachmentTypeSelect = this.root.querySelector<HTMLSelectElement>("[data-action='composer-attachment-type']");
    const attachmentLabelInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-label']");
    const attachmentUrlInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-url']");
    const attachmentAddButton = this.root.querySelector<HTMLButtonElement>("[data-action='composer-attachment-add']");
    const attachmentImportInput = this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-attachment-import-json']");
    const syncAttachmentDraftUi = (): void => {
      const url = attachmentUrlInput?.value ?? "";
      const urlResult = validateAttachmentUrl(url);
      const urlError = url.length > 0 && !urlResult.valid ? urlResult.error ?? "Invalid URL." : "";
      const hasLabel = (attachmentLabelInput?.value.trim() ?? "").length > 0;
      if (attachmentAddButton) attachmentAddButton.disabled = !hasLabel || !urlResult.valid;
      const urlErrorNode = this.root.querySelector<HTMLElement>("[data-testid='composer-attachment-url-error']");
      if (urlErrorNode) {
        urlErrorNode.textContent = urlError;
      }
      this.refreshAttachmentDraftPreview();
    };
    attachmentTypeSelect?.addEventListener("change", syncAttachmentDraftUi);
    attachmentLabelInput?.addEventListener("input", syncAttachmentDraftUi);
    attachmentUrlInput?.addEventListener("input", syncAttachmentDraftUi);
    syncAttachmentDraftUi();

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-attachment-add']")?.addEventListener("click", () => {
      const labelInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-label']");
      const urlInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-url']");
      const type = (typeSelect?.value as AttachmentLibraryItem["type"] | undefined) ?? "picture";
      const url = urlInput?.value.trim() ?? "";
      this.updateAttachmentActionState();
      const quickAddButton = this.root.querySelector<HTMLButtonElement>("[data-action='composer-attachment-add']");
      if (quickAddButton?.disabled) return;
      const id = this.normalizeStegoChannelId(`${type}-${label}`);
      const item: AttachmentLibraryItem = { id, type, label, url };
      const existing = this.attachmentLibrary.find((entry) => entry.id === id);
      this.attachmentLibrary = existing
        ? this.attachmentLibrary.map((entry) => (entry.id === id ? item : entry))
        : [...this.attachmentLibrary, item];
      this.persistAttachmentLibrary();
      this.refreshAttachmentLibraryUi();
      if (labelInput) labelInput.value = normalizedLabel;
      if (urlInput) urlInput.value = "";
      this.updateAttachmentActionState();
    });
    this.syncAttachmentLabelHelper(this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-label']")?.value.trim() ?? "");

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-attachment-export']")?.addEventListener("click", () => {
      const importInput = this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-attachment-import-json']");
      if (!importInput) return;
      importInput.value = JSON.stringify(this.attachmentLibrary, null, 2);
      this.switchAttachmentComposerMode("bulk-import");
      this.updateAttachmentImportValidationState();
    });

    this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-search']")?.addEventListener("input", () => {
      this.refreshAttachmentLibraryUi();
    });

    this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-attachment-import-json']")?.addEventListener("input", () => {
      this.updateAttachmentImportValidationState();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-attachment-import']")?.addEventListener("click", () => {
      const importInput = this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-attachment-import-json']");
      const raw = importInput?.value.trim() ?? "";
      this.updateAttachmentActionState();
      const importButton = this.root.querySelector<HTMLButtonElement>("[data-action='composer-attachment-import']");
      if (!raw || importButton?.disabled) return;
      try {
        const parsed = JSON.parse(raw) as Array<{ type?: string; label?: string; url?: string }>;
        if (!Array.isArray(parsed)) {
          this.updateAttachmentImportValidationState("JSON must be an array of attachment objects.", true);
          return;
        }
        const imported = parsed
          .filter((item) => typeof item.label === "string" && typeof item.url === "string" && ATTACHMENT_TYPES.includes(this.normalizeAttachmentType(item.type)))
          .map((item) => ({
            id: this.normalizeStegoChannelId(`${this.normalizeAttachmentType(item.type)}-${item.label as string}`),
            type: this.normalizeAttachmentType(item.type),
            label: item.label as string,
            url: item.url as string,
          }));
        if (!imported.length) {
          this.updateAttachmentImportValidationState("No valid attachments found. Each item needs type, label, and url.", true);
          return;
        }
        this.attachmentLibrary = [...this.attachmentLibrary.filter((entry) => !imported.some((item) => item.id === entry.id)), ...imported];
        this.persistAttachmentLibrary();
        this.refreshAttachmentLibraryUi();
        this.updateAttachmentActionState();
      } catch {
        this.updateAttachmentImportValidationState("Invalid JSON. Check formatting and try again.", true);
        return;
      }
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='composer-stego-save-channel']")?.addEventListener("click", () => {
      const nameInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-channel-name']");
      const audienceInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-channel-audience']");
      const passphraseInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-channel-passphrase']");
      const rotationInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-channel-rotation-days']");
      const name = nameInput?.value.trim() ?? "";
      const audience = audienceInput?.value.trim() ?? "General audience";
      const passphrase = passphraseInput?.value.trim() ?? "";
      if (!name || !passphrase) return;
      const rotationDays = Math.max(1, Number.parseInt(rotationInput?.value ?? "14", 10) || 14);
      const id = this.normalizeStegoChannelId(name);
      const now = new Date().toISOString();
      const existing = this.stegoChannels.find((channel) => channel.id === id);
      const channel: StegoChannel = {
        id,
        name,
        audience,
        passphrase,
        rotationDays,
        updatedAt: now,
      };
      this.stegoChannels = existing
        ? this.stegoChannels.map((item) => (item.id === id ? channel : item))
        : [...this.stegoChannels, channel];
      this.persistStegoChannels();
      this.refreshStegoChannelUi();
      const encodePassphrase = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-passphrase']");
      if (encodePassphrase) encodePassphrase.value = passphrase;
      if (nameInput) nameInput.value = "";
      if (audienceInput) audienceInput.value = "";
      if (passphraseInput) passphraseInput.value = "";
    });

    this.root.querySelector<HTMLSelectElement>("[data-action='composer-stego-channel-select']")?.addEventListener("change", (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      const selectedId = select.value;
      const channel = this.stegoChannels.find((item) => item.id === selectedId);
      if (!channel) return;
      const encodePassphrase = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-passphrase']");
      const decryptPassphrase = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-decrypt-passphrase']");
      if (encodePassphrase) encodePassphrase.value = channel.passphrase;
      if (decryptPassphrase) decryptPassphrase.value = channel.passphrase;
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

    this.refreshStegoChannelUi();
    this.refreshGifLibraryUi();
    this.refreshEmojiLibraryUi();
    this.syncComposerAttachmentTypeUi();
    this.refreshAttachmentLibraryUi();
    this.switchAttachmentMode(this.activeAttachmentMode);
    this.updateAttachmentActionState();
    this.refreshGovernanceTemplateUi();
    this.bindCommandPaletteFocusTrap();
    this.manageGovernanceModalFocus();
  }

  private manageGovernanceModalFocus(): void {
    const modal = this.root.querySelector<HTMLElement>(".governance-modal-card");
    if (!modal) return;
    const primaryInput = modal.querySelector<HTMLInputElement>("[data-action='governance-proposal-title']");
    primaryInput?.focus();
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

  private toggleComposerPanel(
    panelName: "attachments" | "governance" | "gif" | "emoji" | "sticker" | "stego",
    triggerTarget: string | HTMLButtonElement,
  ): void {
    const panel = this.root.querySelector<HTMLElement>(`[data-panel='${panelName}']`);
    const trigger = typeof triggerTarget === "string"
      ? this.root.querySelector<HTMLButtonElement>(triggerTarget)
      : triggerTarget;
    if (!panel || !trigger) return;
    const shouldOpen = !panel.classList.contains("is-open");
    this.closeComposerPanels();
    if (shouldOpen) {
      panel.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
      trigger.setAttribute("aria-expanded", "true");
      panel.scrollIntoView({ block: "center", inline: "nearest" });
      panel.scrollTop = 0;
      if (panelName === "stego") {
        this.maybeShowAdvancedTour("stego");
      }
      if (panelName === "governance") {
        this.maybeShowAdvancedTour("governance");
      }
    }
  }

  private restoreMessageComposerFocus(): void {
    const textarea = this.root.querySelector<HTMLTextAreaElement>("#message-form textarea[name='message']");
    if (!textarea) return;
    globalThis.requestAnimationFrame(() => {
      textarea.focus();
    });
  }

  private closeComposerPanels(): void {
    this.root.querySelectorAll<HTMLElement>(".composer-popover").forEach((panel) => {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-toggle-attachments'], [data-action='composer-open-governance'], [data-action='composer-toggle-gif-picker'], [data-action='composer-toggle-emoji-picker'], [data-action='composer-toggle-stego-panel']").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  }

  private normalizeAttachmentType(type: string | undefined): AttachmentType {
    if (!type) return "image";
    if (type === "picture") return "image";
    return ATTACHMENT_TYPES.includes(type as AttachmentType) ? (type as AttachmentType) : "image";
  }

  private setComposerAttachmentType(type: AttachmentType): void {
    this.selectedAttachmentType = this.normalizeAttachmentType(type);
    this.syncComposerAttachmentTypeUi();
  }

  private syncComposerAttachmentTypeUi(): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-select-attachment-type']").forEach((button) => {
      const buttonType = this.normalizeAttachmentType(button.dataset.attachmentType);
      const isActive = buttonType === this.selectedAttachmentType;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  private switchStegoView(view: "encode" | "decrypt" | "password"): void {
    this.root.querySelectorAll<HTMLElement>(".composer-stego-view").forEach((panel) => {
      const isActive = panel.dataset.stegoView === view;
      panel.classList.toggle("is-active", isActive);
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-stego-tab-encode'], [data-action='composer-stego-tab-decrypt'], [data-action='composer-stego-tab-password']").forEach((button) => {
      const isActive = button.dataset.action === `composer-stego-tab-${view}`;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  private switchAttachmentMode(mode: AttachmentPanelMode): void {
    this.activeAttachmentMode = mode;
    const title = this.root.querySelector<HTMLElement>("[data-testid='composer-attachment-panel-title']");
    if (title) {
      title.textContent = mode === "quick"
        ? "Quick Add Attachment"
        : mode === "manage"
          ? "Manage Attachment Library"
          : "Bulk Import Attachments";
    }
    this.root.querySelectorAll<HTMLElement>(".composer-attachment-view").forEach((panel) => {
      const active = panel.dataset.attachmentView === mode;
      panel.classList.toggle("is-active", active);
      panel.toggleAttribute("hidden", !active);
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-attachment-mode']").forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    this.updateAttachmentActionState();
  }

  private updateAttachmentActionState(): void {
    const label = this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-label']")?.value.trim() ?? "";
    const url = this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-url']")?.value.trim() ?? "";
    const rawImport = this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-attachment-import-json']")?.value.trim() ?? "";

    const quickReasonOutput = this.root.querySelector<HTMLElement>("[data-testid='composer-attachment-quick-reason']");
    const bulkReasonOutput = this.root.querySelector<HTMLElement>("[data-testid='composer-attachment-bulk-reason']");
    const quickButton = this.root.querySelector<HTMLButtonElement>("[data-action='composer-attachment-add']");
    const importButton = this.root.querySelector<HTMLButtonElement>("[data-action='composer-attachment-import']");

    let quickReason = "";
    if (!label) quickReason = "Add a label to enable Quick Add.";
    else if (!url) quickReason = "Add a URL to enable Quick Add.";
    else {
      try {
        // eslint-disable-next-line no-new
        new URL(url);
      } catch {
        quickReason = "Enter a valid URL (including http:// or https://).";
      }
    }

    let bulkReason = "";
    if (!rawImport) {
      bulkReason = "Paste attachment JSON to enable Bulk Import.";
    } else {
      try {
        const parsed = JSON.parse(rawImport);
        if (!Array.isArray(parsed)) {
          bulkReason = "JSON must be an array of attachment objects.";
        }
      } catch {
        bulkReason = "JSON is invalid. Fix syntax to continue.";
      }
    }

    if (quickButton) {
      quickButton.disabled = Boolean(quickReason);
      quickButton.title = quickReason;
    }
    if (importButton) {
      importButton.disabled = Boolean(bulkReason);
      importButton.title = bulkReason;
    }
    if (quickReasonOutput) quickReasonOutput.textContent = quickReason;
    if (bulkReasonOutput) bulkReasonOutput.textContent = bulkReason;
  }

  private updateStegoPassphraseStrength(): void {
    const passphrase = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-passphrase']")?.value ?? "";
    const strengthOutput = this.root.querySelector<HTMLElement>("[data-testid='composer-stego-passphrase-strength']");
    if (!strengthOutput) return;
    const strength = passphrase.length >= 14 && /[^a-zA-Z0-9]/.test(passphrase)
      ? "strong"
      : passphrase.length >= 8
        ? "medium"
        : "weak";
    strengthOutput.textContent = `Passphrase strength: ${strength}`;
  }

  private updateStegoEncodePreview(): void {
    const hidden = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-hidden']")?.value.trim() || "hidden-message";
    const cover = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-cover']")?.value.trim() || "let's sync after standup";
    const reveal = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-preview-reveal']")?.checked ?? false;
    const coverOutput = this.root.querySelector<HTMLElement>("[data-testid='composer-stego-preview-cover']");
    const hiddenOutput = this.root.querySelector<HTMLElement>("[data-testid='composer-stego-preview-hidden']");
    const revealOutput = this.root.querySelector<HTMLElement>("[data-testid='composer-stego-preview-reveal-output']");
    if (coverOutput) coverOutput.textContent = cover;
    if (hiddenOutput) hiddenOutput.textContent = hidden;
    if (!revealOutput) return;
    if (!reveal) {
      revealOutput.hidden = true;
      revealOutput.textContent = "";
      return;
    }
    const markerCount = Math.max(1, Math.min(hidden.length, 12));
    revealOutput.hidden = false;
    revealOutput.textContent = `Reveal mode: ${cover}${"•".repeat(markerCount)} (• marks invisible insert positions)`;
  }

  private generateStegoPassphrase(length = 24): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*+-?";
    const randomValues = globalThis.crypto.getRandomValues(new Uint32Array(length));
    return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join("");
  }

  private updateStegoDecryptResult(message: string, isError = false): void {
    const result = this.root.querySelector<HTMLElement>("[data-testid='composer-stego-decrypt-result']");
    if (!result) return;
    result.textContent = message;
    result.classList.toggle("composer-stego-result--error", isError);
  }

  private refreshStegoChannelUi(): void {
    const select = this.root.querySelector<HTMLSelectElement>("[data-action='composer-stego-channel-select']");
    if (select) {
      const selected = select.value;
      const optionRows = this.stegoChannels
        .map((channel) => `<option value="${channel.id}">${channel.name} · ${channel.audience}</option>`)
        .join("");
      select.innerHTML = `<option value="">No saved channel</option>${optionRows}`;
      if (selected && this.stegoChannels.some((channel) => channel.id === selected)) {
        select.value = selected;
      }
    }

    const list = this.root.querySelector<HTMLElement>("[data-testid='composer-stego-channel-list']");
    if (!list) return;
    if (!this.stegoChannels.length) {
      list.innerHTML = '<li class="meta">No saved channels yet.</li>';
      return;
    }
    list.innerHTML = this.stegoChannels
      .map((channel) => {
        return `
          <li class="composer-channel-row">
            <div>
              <strong>${channel.name}</strong>
              <p class="meta">${channel.audience} · rotate every ${channel.rotationDays}d</p>
            </div>
            <div class="composer-popover-actions">
              <button type="button" data-action="composer-stego-channel-apply" data-channel-id="${channel.id}">Use</button>
              <button type="button" data-action="composer-stego-channel-rotate" data-channel-id="${channel.id}">Rotate</button>
              <button type="button" data-action="composer-stego-channel-delete" data-channel-id="${channel.id}">Delete</button>
            </div>
          </li>
        `;
      })
      .join("");

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-stego-channel-apply']").forEach((button) => {
      button.addEventListener("click", () => {
        const channel = this.stegoChannels.find((item) => item.id === button.dataset.channelId);
        if (!channel) return;
        const channelSelect = this.root.querySelector<HTMLSelectElement>("[data-action='composer-stego-channel-select']");
        const encodePassphrase = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-passphrase']");
        const decryptPassphrase = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-decrypt-passphrase']");
        if (channelSelect) channelSelect.value = channel.id;
        if (encodePassphrase) encodePassphrase.value = channel.passphrase;
        if (decryptPassphrase) decryptPassphrase.value = channel.passphrase;
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-stego-channel-rotate']").forEach((button) => {
      button.addEventListener("click", () => {
        const channelId = button.dataset.channelId;
        if (!channelId) return;
        const nextPassphrase = this.generateStegoPassphrase();
        this.stegoChannels = this.stegoChannels.map((channel) =>
          channel.id === channelId ? { ...channel, passphrase: nextPassphrase, updatedAt: new Date().toISOString() } : channel,
        );
        this.persistStegoChannels();
        this.refreshStegoChannelUi();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-stego-channel-delete']").forEach((button) => {
      button.addEventListener("click", () => {
        const channelId = button.dataset.channelId;
        if (!channelId) return;
        this.stegoChannels = this.stegoChannels.filter((channel) => channel.id !== channelId);
        this.persistStegoChannels();
        this.refreshStegoChannelUi();
      });
    });
  }

  private refreshGifLibraryUi(): void {
    const list = this.root.querySelector<HTMLElement>("[data-testid='composer-gif-library-list']");
    if (!list) return;
    if (!this.gifLibrary.length) {
      list.innerHTML = '<li class="meta">No custom GIFs yet.</li>';
      return;
    }
    list.innerHTML = this.gifLibrary
      .map((gif) => `
        <li class="composer-channel-row">
          <div>
            <strong>${gif.label}</strong>
            <p class="meta">${gif.url}</p>
          </div>
          <div class="composer-popover-actions">
            <button type="button" data-action="composer-gif-use" data-gif-id="${gif.id}">Use</button>
            <button type="button" data-action="composer-gif-stego" data-gif-id="${gif.id}">Add stego</button>
            <button type="button" data-action="composer-gif-delete" data-gif-id="${gif.id}">Delete</button>
          </div>
        </li>
      `)
      .join("");

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-gif-use']").forEach((button) => {
      button.addEventListener("click", () => {
        const gif = this.gifLibrary.find((item) => item.id === button.dataset.gifId);
        if (!gif) return;
        this.applyComposerSnippet(` ![${gif.label}](${gif.url})`);
        this.closeComposerPanels();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-gif-stego']").forEach((button) => {
      button.addEventListener("click", () => {
        const gif = this.gifLibrary.find((item) => item.id === button.dataset.gifId);
        if (!gif) return;
        const hiddenInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-hidden']");
        const hidden = hiddenInput?.value.trim() || "hidden-message";
        this.applyComposerSnippet(` [stego-media kind="gif" hidden="${hidden}"]![${gif.label}](${gif.url})[/stego-media]`);
        this.closeComposerPanels();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-gif-delete']").forEach((button) => {
      button.addEventListener("click", () => {
        const gifId = button.dataset.gifId;
        if (!gifId) return;
        this.gifLibrary = this.gifLibrary.filter((gif) => gif.id !== gifId);
        this.persistGifLibrary();
        this.refreshGifLibraryUi();
      });
    });
  }

  private refreshEmojiLibraryUi(): void {
    const list = this.root.querySelector<HTMLElement>("[data-testid='composer-emoji-library-list']");
    if (!list) return;
    if (!this.emojiLibrary.length) {
      list.innerHTML = '<li class="meta">No custom emoji yet.</li>';
      return;
    }
    list.innerHTML = this.emojiLibrary
      .map((emoji) => `
        <li class="composer-channel-row">
          <div>
            <strong>${emoji.symbol} ${emoji.label}</strong>
          </div>
          <div class="composer-popover-actions">
            <button type="button" data-action="composer-emoji-use" data-emoji-id="${emoji.id}">Use</button>
            <button type="button" data-action="composer-emoji-stego" data-emoji-id="${emoji.id}">Add stego</button>
            <button type="button" data-action="composer-emoji-delete" data-emoji-id="${emoji.id}">Delete</button>
          </div>
        </li>
      `)
      .join("");

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-emoji-use']").forEach((button) => {
      button.addEventListener("click", () => {
        const emoji = this.emojiLibrary.find((item) => item.id === button.dataset.emojiId);
        if (!emoji) return;
        this.applyComposerSnippet(` ${emoji.symbol}`);
        this.closeComposerPanels();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-emoji-stego']").forEach((button) => {
      button.addEventListener("click", () => {
        const emoji = this.emojiLibrary.find((item) => item.id === button.dataset.emojiId);
        if (!emoji) return;
        const hiddenInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-hidden']");
        const hidden = hiddenInput?.value.trim() || "hidden-message";
        this.applyComposerSnippet(` [stego-emoji hidden="${hidden}"]${emoji.symbol}[/stego-emoji]`);
        this.closeComposerPanels();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-emoji-delete']").forEach((button) => {
      button.addEventListener("click", () => {
        const emojiId = button.dataset.emojiId;
        if (!emojiId) return;
        this.emojiLibrary = this.emojiLibrary.filter((emoji) => emoji.id !== emojiId);
        this.persistEmojiLibrary();
        this.refreshEmojiLibraryUi();
      });
    });
  }

  private refreshAttachmentLibraryUi(): void {
    const list = this.root.querySelector<HTMLElement>("[data-testid='composer-attachment-library-list']");
    if (!list) return;
    const query = this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-search']")?.value.trim().toLowerCase() ?? "";
    const visibleAttachments = query
      ? this.attachmentLibrary.filter((entry) =>
        `${entry.type} ${entry.label} ${entry.url}`.toLowerCase().includes(query),
      )
      : this.attachmentLibrary;
    if (!visibleAttachments.length) {
      list.innerHTML = `<li class="meta">${query ? "No attachments match your search." : "No custom attachments yet."}</li>`;
      return;
    }
    list.innerHTML = visibleAttachments
      .map((entry) => `
        <li class="composer-channel-row">
          <div>
            <strong>${entry.label}</strong>
            <p class="meta">${entry.type} · ${entry.url}</p>
          </div>
          <div class="composer-popover-actions">
            <button type="button" data-action="composer-attachment-edit" data-attachment-id="${entry.id}">Edit</button>
            <button type="button" data-action="composer-attachment-use" data-attachment-id="${entry.id}">Use</button>
            <button type="button" data-action="composer-attachment-stego" data-attachment-id="${entry.id}">Add stego</button>
            <button type="button" data-action="composer-attachment-delete" data-attachment-id="${entry.id}">Delete</button>
          </div>
        </li>
      `)
      .join("");

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-attachment-edit']").forEach((button) => {
      button.addEventListener("click", () => {
        const entry = this.attachmentLibrary.find((item) => item.id === button.dataset.attachmentId);
        if (!entry) return;
        const typeSelect = this.root.querySelector<HTMLSelectElement>("[data-action='composer-attachment-type']");
        const labelInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-label']");
        const urlInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-url']");
        if (typeSelect) typeSelect.value = entry.type;
        if (labelInput) labelInput.value = entry.label;
        if (urlInput) urlInput.value = entry.url;
        this.switchAttachmentComposerMode("quick-add");
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-attachment-use']").forEach((button) => {
      button.addEventListener("click", () => {
        const entry = this.attachmentLibrary.find((item) => item.id === button.dataset.attachmentId);
        if (!entry) return;
        const prefix = entry.type === "audio" ? " 🎧" : entry.type === "video" ? " 🎬" : entry.type === "meme" ? " 😂" : " 🖼️";
        this.applyComposerSnippet(` ${prefix} [${entry.type}:${entry.label}](${entry.url})`);
        this.closeComposerPanels();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-attachment-stego']").forEach((button) => {
      button.addEventListener("click", () => {
        const entry = this.attachmentLibrary.find((item) => item.id === button.dataset.attachmentId);
        if (!entry) return;
        const hiddenInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-stego-hidden']");
        const hidden = hiddenInput?.value.trim() || "hidden-message";
        this.applyComposerSnippet(` [stego-attachment type="${entry.type}" hidden="${hidden}"][${entry.label}](${entry.url})[/stego-attachment]`);
        this.closeComposerPanels();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-attachment-delete']").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.attachmentId;
        if (!id) return;
        this.attachmentLibrary = this.attachmentLibrary.filter((entry) => entry.id !== id);
        this.persistAttachmentLibrary();
        this.refreshAttachmentLibraryUi();
      });
    });
  }

  private inferAttachmentMediaType(type: AttachmentType, url: string): string {
    const lowerUrl = url.toLowerCase();
    if (type === "audio" || /\.(mp3|wav|ogg|m4a|flac)(\?|#|$)/.test(lowerUrl)) return "audio";
    if (type === "video" || /\.(mp4|webm|mov|mkv|avi)(\?|#|$)/.test(lowerUrl)) return "video";
    if (type === "picture" || type === "meme" || /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/.test(lowerUrl)) return "image";
    return "file";
  }

  private refreshAttachmentDraftPreview(): void {
    const previewNode = this.root.querySelector<HTMLElement>("[data-testid='composer-attachment-preview']");
    if (!previewNode) return;
    const type = this.root.querySelector<HTMLSelectElement>("[data-action='composer-attachment-type']")?.value as AttachmentType | undefined;
    const label = this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-label']")?.value.trim() ?? "";
    const url = this.root.querySelector<HTMLInputElement>("[data-action='composer-attachment-url']")?.value.trim() ?? "";
    const parsed = validateAttachmentInput({ type, label, url });
    if (!parsed.attachment) {
      previewNode.innerHTML = "";
      return;
    }
    const mediaType = this.inferAttachmentMediaType(parsed.attachment.type, parsed.attachment.url);
    const icon = mediaType === "image" ? "🖼️" : mediaType === "video" ? "🎬" : mediaType === "audio" ? "🎧" : "📎";
    const thumbnail = mediaType === "image"
      ? `<img src="${parsed.attachment.url}" alt="${parsed.attachment.label}" class="composer-attachment-thumb" loading="lazy" />`
      : `<span class="composer-attachment-icon" aria-hidden="true">${icon}</span>`;
    previewNode.innerHTML = `
      <div class="composer-attachment-preview-card">
        ${thumbnail}
        <div>
          <strong>${parsed.attachment.label}</strong>
          <p class="meta">${mediaType} · ${parsed.attachment.type}</p>
        </div>
      </div>
    `;
  }

  private updateAttachmentImportFeedback(overrideMessage?: string): void {
    const feedback = this.root.querySelector<HTMLElement>("[data-testid='composer-attachment-import-feedback']");
    if (!feedback) return;
    if (overrideMessage) {
      feedback.textContent = overrideMessage;
      return;
    }
    const raw = this.root.querySelector<HTMLTextAreaElement>("[data-action='composer-attachment-import-json']")?.value ?? "";
    if (!raw.trim()) {
      feedback.textContent = "";
      return;
    }
    const result = parseAttachmentImport(raw);
    feedback.textContent = result.error ?? `${result.parsedCount} attachment(s) ready to import.`;
  }

  private refreshGovernanceTemplateUi(): void {
    const list = this.root.querySelector<HTMLElement>("[data-testid='composer-governance-template-list']");
    if (!list) return;
    if (!this.governanceTemplates.length) {
      list.innerHTML = '<li class="meta">No governance templates yet.</li>';
      return;
    }
    list.innerHTML = this.governanceTemplates
      .map((template) => `
        <li class="composer-channel-row">
          <div>
            <strong>${template.title}</strong>
            <p class="meta">${template.type} · ${template.options.join(" / ")} · ${template.durationHours}h</p>
          </div>
          <div class="composer-popover-actions">
            <button type="button" data-action="composer-governance-template-use" data-template-id="${template.id}">Use</button>
            <button type="button" data-action="composer-governance-template-delete" data-template-id="${template.id}">Delete</button>
          </div>
        </li>
      `)
      .join("");

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-governance-template-use']").forEach((button) => {
      button.addEventListener("click", () => {
        const template = this.governanceTemplates.find((item) => item.id === button.dataset.templateId);
        if (!template) return;
        const titleInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-governance-title']");
        const typeSelect = this.root.querySelector<HTMLSelectElement>("[data-action='composer-governance-type']");
        const optionsInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-governance-options']");
        const durationInput = this.root.querySelector<HTMLInputElement>("[data-action='composer-governance-duration']");
        if (titleInput) titleInput.value = template.title;
        if (typeSelect) typeSelect.value = template.type;
        if (optionsInput) optionsInput.value = template.options.join(",");
        if (durationInput) durationInput.value = String(template.durationHours);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='composer-governance-template-delete']").forEach((button) => {
      button.addEventListener("click", () => {
        const templateId = button.dataset.templateId;
        if (!templateId) return;
        this.governanceTemplates = this.governanceTemplates.filter((template) => template.id !== templateId);
        this.persistGovernanceTemplates();
        this.refreshGovernanceTemplateUi();
      });
    });
  }

  private normalizeStegoChannelId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "channel";
  }

  private isAttachmentLabelValid(label: string): boolean {
    if (!label) return true;
    return label.length >= 2;
  }

  private syncAttachmentLabelHelper(label: string): void {
    const helper = this.root.querySelector<HTMLElement>("[data-testid='composer-attachment-label-helper']");
    if (!helper) return;
    if (!label) {
      helper.hidden = false;
      helper.textContent = "Optional: leave blank to auto-generate from the URL.";
      return;
    }
    if (!this.isAttachmentLabelValid(label)) {
      helper.hidden = false;
      helper.textContent = "Label is too short. Use at least 2 characters, or leave it blank.";
      return;
    }
    helper.hidden = true;
  }

  private deriveAttachmentLabelFromUrl(url: string, type: AttachmentLibraryItem["type"]): string {
    try {
      const parsed = new URL(url);
      const segment = parsed.pathname.split("/").filter(Boolean).pop()?.trim() ?? "";
      if (segment) return decodeURIComponent(segment);
    } catch {
      return `${type} attachment`;
    }
    return `${type} attachment`;
  }

  private persistStegoChannels(): void {
    globalThis.localStorage.setItem(STEGO_CHANNEL_STORAGE_KEY, JSON.stringify(this.stegoChannels));
  }

  private loadStegoChannels(): StegoChannel[] {
    const raw = globalThis.localStorage.getItem(STEGO_CHANNEL_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as StegoChannel[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.passphrase === "string")
        .map((item) => ({
          id: item.id,
          name: item.name,
          audience: item.audience ?? "General audience",
          passphrase: item.passphrase,
          rotationDays: Number.isFinite(item.rotationDays) ? Math.max(1, item.rotationDays) : 14,
          updatedAt: item.updatedAt ?? new Date().toISOString(),
        }));
    } catch {
      return [];
    }
  }

  private persistGifLibrary(): void {
    globalThis.localStorage.setItem(GIF_LIBRARY_STORAGE_KEY, JSON.stringify(this.gifLibrary));
  }

  private loadGifLibrary(): GifLibraryItem[] {
    const raw = globalThis.localStorage.getItem(GIF_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as GifLibraryItem[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => item && typeof item.id === "string" && typeof item.label === "string" && typeof item.url === "string");
    } catch {
      return [];
    }
  }

  private persistEmojiLibrary(): void {
    globalThis.localStorage.setItem(EMOJI_LIBRARY_STORAGE_KEY, JSON.stringify(this.emojiLibrary));
  }

  private loadEmojiLibrary(): EmojiLibraryItem[] {
    const raw = globalThis.localStorage.getItem(EMOJI_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as EmojiLibraryItem[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => item && typeof item.id === "string" && typeof item.symbol === "string" && typeof item.label === "string");
    } catch {
      return [];
    }
  }

  private persistAttachmentLibrary(): void {
    globalThis.localStorage.setItem(ATTACHMENT_LIBRARY_STORAGE_KEY, JSON.stringify(this.attachmentLibrary));
  }

  private loadAttachmentLibrary(): AttachmentLibraryItem[] {
    const raw = globalThis.localStorage.getItem(ATTACHMENT_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as AttachmentLibraryItem[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && typeof item.id === "string" && typeof item.label === "string" && typeof item.url === "string")
        .map((item) => ({
          id: item.id,
          label: item.label,
          url: item.url,
          type: this.normalizeAttachmentType(item.type),
        }));
    } catch {
      return [];
    }
  }

  private persistGovernanceTemplates(channelId = this.store.getState().activeChannelId): void {
    if (!channelId) return;
    const raw = globalThis.localStorage.getItem(GOVERNANCE_TEMPLATE_STORAGE_KEY);
    let existing: Record<string, GovernanceTemplateItem[]> = {};
    if (raw) {
      try {
        existing = JSON.parse(raw) as Record<string, GovernanceTemplateItem[]>;
      } catch {
        existing = {};
      }
    }
    existing[channelId] = this.governanceTemplates;
    globalThis.localStorage.setItem(GOVERNANCE_TEMPLATE_STORAGE_KEY, JSON.stringify(existing));
  }

  private loadGovernanceTemplates(channelId = this.store.getState().activeChannelId): GovernanceTemplateItem[] {
    const raw = globalThis.localStorage.getItem(GOVERNANCE_TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    try {
      if (!channelId) return [];
      const parsedByChannel = JSON.parse(raw) as Record<string, GovernanceTemplateItem[]>;
      const parsed = parsedByChannel[channelId];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && typeof item.id === "string" && typeof item.title === "string" && (item.type === "binary" || item.type === "multiple_choice" || item.type === "ranked") && Array.isArray(item.options))
        .map((item) => ({
          id: item.id,
          title: item.title,
          type: item.type,
          options: item.options.map((option) => String(option)),
          durationHours: Math.max(1, Number.parseInt(String(item.durationHours), 10) || 48),
        }));
    } catch {
      return [];
    }
  }

  private openFeatureById(featureId?: string, requestedKind?: UiEntryKind): void {
    if (!featureId) return;
    const entry = FEATURE_UI_ENTRIES.find((feature) => feature.id === featureId);
    if (!entry) return;
    const [kind] = entry.uiEntry.split(":") as [UiEntryKind, string];
    if (requestedKind && requestedKind !== kind) {
      this.featureActionResult = `Could not open ${entry.id}: invalid route mapping.`;
      this.render();
      return;
    }
    const enabled = this.getActivePresetFeatures()[entry.presetKey] ?? false;
    if (!enabled) {
      this.featureActionResult = `${entry.id} is unavailable: blocked by policy or entitlement.`;
      this.trackDeniedFeature(entry.id, kind);
      this.render();
      return;
    }
    const destination = this.routeFeatureToWorkflow(entry.id, kind);
    this.featureActionResult = `Opened ${entry.id} via ${kind} → ${destination}.`;
    this.quickAccessFeatureId = entry.id;
    this.telemetry.track("feature_open_success", { featureId: entry.id, entrypointKind: kind });
    if (entry.id.includes("governance")) this.trackAdvancedDiscovery("governance");
    if (entry.id.includes("federation")) this.trackAdvancedDiscovery("federation");
    if (entry.id.includes("stego")) this.trackAdvancedDiscovery("stego");
    this.render();
  }

  private routeFeatureToWorkflow(featureId: string, kind: UiEntryKind): string {
    switch (kind) {
      case "settings_toggle":
        this.settingsOpen = true;
        this.activeWorkspacePanel = "chat";
        this.repoToolsOpen = false;
        return "settings panel";
      case "composer_action":
        this.activeWorkspacePanel = "chat";
        this.repoToolsOpen = false;
        return "chat composer";
      case "room_action":
        if (featureId === "dm_list") {
          this.activeWorkspacePanel = "dms";
          return "direct messages panel";
        }
        if (featureId === "room_invites") {
          this.activeWorkspacePanel = "activity";
          return "activity inbox";
        }
        this.activeWorkspacePanel = "chat";
        this.repoToolsOpen = false;
        return "room workflow";
      case "widget_panel":
        this.activeWorkspacePanel = "chat";
        this.repoToolsOpen = false;
        this.activeRightPanel = "widget";
        this.activeWidgetFeatureId = featureId;
        return "chat widget panel";
      case "admin_console":
        this.settingsOpen = true;
        this.activeWorkspacePanel = "repo-tools";
        this.repoToolsOpen = true;
        return "admin console tools";
      case "command_palette":
        this.openCommandPalette();
        this.commandPaletteQuery = featureId.replaceAll("_", " ");
        return "command palette";
      default:
        this.activeWorkspacePanel = "chat";
        this.repoToolsOpen = false;
        return "chat";
    }
  }

  private showQuickActionPopup(featureId: string, kind: UiEntryKind): void {
    const entry = FEATURE_UI_ENTRIES.find((feature) => feature.id === featureId);
    if (!entry) return;
    this.quickActionPopup = { featureId, kind, name: entry.name };
    this.render();
  }

  private describeWidgetPanel(featureId: string | null): { title: string; subtitle: string; heading: string; description: string } {
    if (featureId === "media_pipeline") {
      return {
        title: "Media pipeline widget",
        subtitle: "Open media upload/rendering feature entry.",
        heading: "Media upload and MXC pipeline",
        description: "Uploads, transforms, and rendering previews are now surfaced in the widget panel.",
      };
    }
    if (featureId === "media_link_previews") {
      return {
        title: "Link previews widget",
        subtitle: "Inspect link preview controls and behavior.",
        heading: "Link preview cards",
        description: "Preview card controls are surfaced here so metadata behavior can be verified quickly.",
      };
    }
    const entry = FEATURE_UI_ENTRIES.find((feature) => feature.id === featureId);
    return {
      title: "Widget panel",
      subtitle: "Feature widgets open here from the workspace.",
      heading: entry?.name ?? "Widget workspace",
      description: entry ? `Feature id: ${entry.id}.` : "Open a widget entry from quick actions or files browser.",
    };
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
      const cachedPushToken = this.pendingPushTokenRegistration ?? globalThis.localStorage.getItem(MOBILE_PUSH_TOKEN_STORAGE_KEY);
      if (cachedPushToken) {
        this.schedulePushTokenRegistration(cachedPushToken, 0);
      }
      if (this.pendingMobileRoomId) {
        await this.navigateToMobileRoom(this.pendingMobileRoomId);
        this.pendingMobileRoomId = null;
      }
    });
  }

  private bindMobileBridgeEvents(): void {
    if (this.mobileBridgeEventsBound) return;
    this.mobileBridgeEventsBound = true;

    globalThis.addEventListener("blackout:deep-link", (event) => {
      const detail = (event as CustomEvent<{ url?: string }>).detail;
      const roomId = this.extractRoomIdFromUrl(detail?.url);
      if (!roomId) return;
      void this.navigateToMobileRoom(roomId);
    });

    globalThis.addEventListener("blackout:push-action", (event) => {
      const detail = (event as CustomEvent<{ notification?: { data?: { room_id?: string } } }>).detail;
      const roomId = detail?.notification?.data?.room_id;
      if (!roomId) return;
      void this.navigateToMobileRoom(roomId);
    });

    globalThis.addEventListener("blackout:resume-sync", () => {
      this.featureActionResult = "Mobile resume detected. Sync recovery started.";
      this.render();
      void this.recoverAfterReconnect();
    });

    globalThis.addEventListener("blackout:push-token", (event) => {
      const detail = (event as CustomEvent<{ token?: string }>).detail;
      if (!detail?.token) return;
      globalThis.localStorage.setItem(MOBILE_PUSH_TOKEN_STORAGE_KEY, detail.token);
      this.pendingPushTokenRegistration = detail.token;
      this.featureActionResult = "Mobile push token captured. Registering with backend…";
      this.render();
      this.schedulePushTokenRegistration(detail.token, 0);
    });
  }

  private getMobilePlatform(): "ios" | "android" | "web" {
    if (globalThis.document.body.classList.contains("blackout-platform-ios")) return "ios";
    if (globalThis.document.body.classList.contains("blackout-platform-android")) return "android";
    return "web";
  }

  private schedulePushTokenRegistration(token: string, attempt: number): void {
    if (this.pushTokenRegisterRetryTimer) {
      clearTimeout(this.pushTokenRegisterRetryTimer);
      this.pushTokenRegisterRetryTimer = null;
    }

    const session = this.store.getState().session;
    if (!session) return;

    const run = async () => {
      try {
        await this.tryUnregisterPreviousPushToken(token, 0);
        await this.api.registerDevicePushToken(session, token, this.getMobilePlatform());
        globalThis.localStorage.setItem(MOBILE_PUSH_TOKEN_REGISTERED_STORAGE_KEY, token);
        this.pendingPushTokenRegistration = null;
        this.featureActionResult = "Push token registered with gateway backend.";
        this.render();
      } catch {
        if (attempt >= 5) {
          this.featureActionResult = "Push token registration failed after retries.";
          this.render();
          return;
        }

        const delayMs = Math.min(30_000, 1_000 * 2 ** attempt);
        this.pushTokenRegisterRetryTimer = setTimeout(() => {
          this.schedulePushTokenRegistration(token, attempt + 1);
        }, delayMs);
      }
    };

    void run();
  }

  private async tryUnregisterPreviousPushToken(nextToken: string, attempt: number): Promise<void> {
    const session = this.store.getState().session;
    if (!session) return;

    const previousToken = globalThis.localStorage.getItem(MOBILE_PUSH_TOKEN_REGISTERED_STORAGE_KEY);
    if (!previousToken || previousToken === nextToken) return;

    try {
      await this.api.unregisterDevicePushToken(session, previousToken);
    } catch {
      if (attempt >= 5) return;

      const delayMs = Math.min(30_000, 1_000 * 2 ** attempt);
      await new Promise<void>((resolve) => {
        if (this.pushTokenUnregisterRetryTimer) {
          clearTimeout(this.pushTokenUnregisterRetryTimer);
        }
        this.pushTokenUnregisterRetryTimer = setTimeout(resolve, delayMs);
      });
      await this.tryUnregisterPreviousPushToken(nextToken, attempt + 1);
    }
  }

  private extractRoomIdFromUrl(url?: string): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (!["matrix:", "blackout:"].includes(parsed.protocol)) return null;
      if (parsed.hostname === "room" && parsed.pathname.length > 1) {
        return decodeURIComponent(parsed.pathname.slice(1));
      }
      const queryRoom = parsed.searchParams.get("room_id") ?? parsed.searchParams.get("roomId");
      return queryRoom?.trim() || null;
    } catch {
      return null;
    }
  }

  private async navigateToMobileRoom(roomId: string): Promise<void> {
    const state = this.store.getState();
    if (!state.session) {
      this.pendingMobileRoomId = roomId;
      this.store.patch({ error: "Sign in to open the mobile deep link target room." });
      this.render();
      return;
    }

    const targetChannel = state.channels.find((channel) => channel.id === roomId);
    this.activeWorkspacePanel = "chat";
    this.repoToolsOpen = false;

    if (targetChannel) {
      await this.openChannel(targetChannel.id);
      this.featureActionResult = `Opened mobile-linked room ${targetChannel.id}.`;
      this.render();
      return;
    }

    const crossServerMatch = await this.findMobileRoomAcrossServers(roomId);
    if (!crossServerMatch) {
      this.featureActionResult = `Mobile room ${roomId} was not found in available servers.`;
      this.render();
      return;
    }

    await this.openServer(crossServerMatch.serverId);
    await this.openChannel(crossServerMatch.channelId);
    this.featureActionResult = `Opened mobile-linked room ${crossServerMatch.channelId} from server ${crossServerMatch.serverId}.`;
    this.render();
  }

  private async findMobileRoomAcrossServers(roomId: string): Promise<{ serverId: string; channelId: string } | null> {
    const state = this.store.getState();
    const session = state.session;
    if (!session) return null;

    for (const server of state.servers) {
      try {
        const details = await this.api.getServerDetails(session, server.id);
        const match = details.channels.find((channel) => channel.id === roomId);
        if (match) {
          return { serverId: server.id, channelId: match.id };
        }
      } catch {
        // Continue fallback search through other servers.
      }
    }

    return null;
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
      const channels = details.channels.map((channel) => ({
        ...channel,
        capabilityTags: channel.capabilityTags?.length ? channel.capabilityTags : this.inferCapabilityTags(channel.name),
      }));
      const preferredChannelId = state.activeChannelId && channels.some((channel) => channel.id === state.activeChannelId) ? state.activeChannelId : channels[0]?.id ?? null;

      this.store.patch({
        activeServerId: serverId,
        channels,
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
      this.governanceTemplates = this.loadGovernanceTemplates(channelId);
      this.markSeen(messages);
    });
  }

  private openDmComposer(): void {
    const state = this.store.getState();
    if (!state.activeServerId) {
      this.store.patch({ error: "Pick a server before starting a DM." });
      this.render();
      return;
    }

    this.store.patch({ pendingCreate: "channel", createError: null, createName: "dm-" });
    this.render();
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
        const channelWithCapabilities = {
          ...channel,
          capabilityTags: channel.capabilityTags?.length ? channel.capabilityTags : this.inferCapabilityTags(channel.name),
        };
        this.store.patch({
          channels: [...current.channels, channelWithCapabilities],
          pendingCreate: "none",
          createError: null,
          createName: "",
        });
        await this.openChannel(channelWithCapabilities.id);
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
