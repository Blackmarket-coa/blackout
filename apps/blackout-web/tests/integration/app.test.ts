import { fireEvent, getByRole, waitFor } from "@testing-library/dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BlackoutWebApp } from "../../src/app";

describe("BlackoutWebApp integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("supports auth submit, server switching, and message send flow", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_free",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_free",
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
    });
    await app.mount();

    const username = document.querySelector<HTMLInputElement>("input[name='username']");
    const password = document.querySelector<HTMLInputElement>("input[name='password']");
    if (!username || !password) throw new Error("missing auth fields");

    fireEvent.input(username, { target: { value: "alice" } });
    fireEvent.input(password, { target: { value: "secret" } });
    fireEvent.submit(document.querySelector("#auth-form") as HTMLFormElement);

    await waitFor(() => {
      expect(getByRole(root, "button", { name: "Alpha Ops" })).toBeTruthy();
    });

    fireEvent.click(getByRole(root, "button", { name: "Beta Crew" }));

    await waitFor(() => {
      expect(root.querySelector(".chat-head")?.textContent).toContain("general");
    });

    const composer = document.querySelector<HTMLTextAreaElement>("textarea[name='message']");
    if (!composer) throw new Error("missing message composer");

    fireEvent.input(composer, { target: { value: "hello from integration" } });
    fireEvent.submit(document.querySelector("#message-form") as HTMLFormElement);

    await waitFor(() => {
      expect(root.textContent).toContain("hello from integration");
    });
  });

  it("supports keyboard UX: Enter sends, Shift+Enter inserts newline", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_free",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_free",
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
    });
    await app.mount();

    fireEvent.input(document.querySelector("input[name='username']") as HTMLInputElement, { target: { value: "alice" } });
    fireEvent.input(document.querySelector("input[name='password']") as HTMLInputElement, { target: { value: "secret" } });
    fireEvent.submit(document.querySelector("#auth-form") as HTMLFormElement);

    await waitFor(() => {
      expect(getByRole(root, "button", { name: "Alpha Ops" })).toBeTruthy();
    });

    const composer = document.querySelector<HTMLTextAreaElement>("textarea[name='message']");
    if (!composer) throw new Error("missing message composer");

    fireEvent.input(composer, { target: { value: "line 1" } });
    fireEvent.keyDown(composer, { key: "Enter", code: "Enter", shiftKey: true });
    fireEvent.input(composer, { target: { value: "line 1\nline 2" } });
    expect(composer.value).toContain("\n");

    fireEvent.keyDown(composer, { key: "Enter", code: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(root.textContent).toContain("line 1");
    });
  });

  it("allows signed-in users to close settings after opening from an authenticated entrypoint", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
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
    });
    await app.mount();

    fireEvent.input(document.querySelector("input[name='username']") as HTMLInputElement, { target: { value: "alice" } });
    fireEvent.input(document.querySelector("input[name='password']") as HTMLInputElement, { target: { value: "secret" } });
    fireEvent.submit(document.querySelector("#auth-form") as HTMLFormElement);

    await waitFor(() => {
      expect(getByRole(root, "button", { name: "Admin" })).toBeTruthy();
    });

    fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(root.querySelector('[data-testid="settings-shell"]')).toBeTruthy();
    });

    fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(root.querySelector('[data-testid="settings-shell"]')).toBeNull();
    });
  });

  it("shows active preset diagnostics in header", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_pro",
        features: {
          "features.composer.richEditing": true,
          "features.governance.entitlements": false,
        },
        diagnostics: {
          deploymentPreset: "tier_free",
          tenantPreset: "tier_pro",
          userOverrideCount: 2,
        },
      },
    });
    await app.mount();

    fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);
    expect(root.querySelector('[data-testid="active-preset"]')?.textContent).toContain("tier_pro");
    expect(root.querySelector('[data-testid="preset-diagnostics"]')?.textContent).toContain("user overrides=2");
    expect(root.querySelector('[data-testid="feature-composer-rich-editing"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="feature-admin-governance-entitlements-unavailable"]')).toBeTruthy();
  });

  it("supports preset choose, preview, apply, and rollback with confirmation", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    vi.spyOn(window, "confirm").mockReturnValue(true);

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_free",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_free",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();
    fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);

    const select = root.querySelector<HTMLSelectElement>('[data-testid="feature-preset-select"]');
    if (!select) throw new Error("missing preset select");

    fireEvent.change(select, { target: { value: "tier_enterprise" } });
    expect(root.querySelector('[data-testid="preset-capability-features-stego-enabled"]')).toBeTruthy();

    fireEvent.click(root.querySelector('[data-testid="apply-preset-button"]') as HTMLButtonElement);
    expect(root.querySelector('[data-testid="active-preset"]')?.textContent).toContain("tier_enterprise");

    fireEvent.click(root.querySelector('[data-testid="rollback-preset-button"]') as HTMLButtonElement);
    expect(root.querySelector('[data-testid="active-preset"]')?.textContent).toContain("tier_free");
  });

  it("supports one meaningful entrypoint action per feature category", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_enterprise",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_enterprise",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();
    fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);

    const entrypointTestIds = [
      "feature-toggle-stego-toolkit",
      "feature-composer-rich-editing",
      "feature-room-ephemeral-stego",
      "feature-widget-townhall-sfu",
      "feature-admin-governance-entitlements",
    ];

    for (const testId of entrypointTestIds) {
      fireEvent.click(root.querySelector(`[data-testid=\"${testId}\"]`) as HTMLButtonElement);
      expect(root.querySelector('[data-testid="feature-action-result"]')?.textContent).toContain("Opened");
    }
  });

  it("renders a ui entrypoint hook for every feature registry row", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_free",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_free",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();
    fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);

    const allFeatureTestIds = [
      "feature-toggle-stego-toolkit",
      "feature-room-ephemeral-stego",
      "feature-admin-governance-entitlements",
      "feature-admin-federation-boost",
      "feature-widget-townhall-sfu",
      "feature-composer-rich-editing",
      "feature-composer-typing-indicators",
      "feature-widget-shell-layouts",
      "feature-toggle-matrix-client",
      "feature-toggle-homeserver-discovery",
      "feature-toggle-e2ee-defaults",
      "feature-toggle-oidc-auth",
      "feature-widget-matrix-compat",
      "feature-room-multiplatform-bootstrap",
    ];

    for (const testId of allFeatureTestIds) {
      const primary = root.querySelector(`[data-testid=\"${testId}\"]`);
      const unavailable = root.querySelector(`[data-testid=\"${testId}-unavailable\"]`);
      expect(primary || unavailable).toBeTruthy();
    }
  });

  it("supports modern feature list filtering and capability meter", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_pro",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_pro",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();
    fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);

    const meter = root.querySelector<HTMLProgressElement>('[data-testid="preset-capability-meter"]');
    expect(meter?.value).toBeGreaterThan(0);

    const filter = root.querySelector<HTMLInputElement>('[data-testid="feature-filter-input"]');
    if (!filter) throw new Error("missing filter input");
    fireEvent.input(filter, { target: { value: "governance" } });

    expect(root.querySelector('[data-testid="feature-admin-governance-entitlements"]') || root.querySelector('[data-testid="feature-admin-governance-entitlements-unavailable"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="feature-widget-townhall-sfu"]')).toBeFalsy();
  });

  it("supports settings page navigation for reduced scrolling", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_enterprise",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_enterprise",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();
    fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);

    const overviewTab = root.querySelector<HTMLButtonElement>('[data-testid="settings-page-overview"]');
    const monetizationTab = root.querySelector<HTMLButtonElement>('[data-testid="settings-page-monetization"]');
    const operationsTab = root.querySelector<HTMLButtonElement>('[data-testid="settings-page-operations"]');
    if (!overviewTab || !monetizationTab || !operationsTab) throw new Error("missing settings page tabs");

    expect(overviewTab.classList.contains("settings-page-nav__button--active")).toBe(true);
    expect(monetizationTab.classList.contains("settings-page-nav__button--active")).toBe(false);
    expect(operationsTab.classList.contains("settings-page-nav__button--active")).toBe(false);
    expect(overviewTab.classList.contains("ghost-btn")).toBe(true);
    expect(monetizationTab.classList.contains("ghost-btn")).toBe(true);
    expect(operationsTab.classList.contains("ghost-btn")).toBe(true);
    expect(overviewTab.getAttribute("aria-selected")).toBe("true");
    expect(monetizationTab.getAttribute("aria-selected")).toBe("false");
    expect(operationsTab.getAttribute("aria-selected")).toBe("false");
    expect(overviewTab.textContent?.trim().length).toBeGreaterThan(0);
    expect(monetizationTab.textContent?.trim().length).toBeGreaterThan(0);
    expect(operationsTab.textContent?.trim().length).toBeGreaterThan(0);

    expect(root.querySelector('[data-testid="feature-presets-panel"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="subscription-panel"]')).toBeFalsy();

    fireEvent.click(monetizationTab);
    expect(monetizationTab.classList.contains("settings-page-nav__button--active")).toBe(true);
    expect(overviewTab.classList.contains("settings-page-nav__button--active")).toBe(false);
    expect(monetizationTab.className).toContain("settings-page-nav__button--active");
    expect(overviewTab.className.trim()).toBe("ghost-btn");
    expect(monetizationTab.getAttribute("aria-selected")).toBe("true");
    expect(overviewTab.getAttribute("aria-selected")).toBe("false");
    expect(root.querySelector('[data-testid="subscription-panel"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="upgrade-prompts-panel"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="feature-presets-panel"]')).toBeFalsy();

    fireEvent.click(operationsTab);
    expect(operationsTab.classList.contains("settings-page-nav__button--active")).toBe(true);
    expect(monetizationTab.classList.contains("settings-page-nav__button--active")).toBe(false);
    expect(operationsTab.className).toContain("settings-page-nav__button--active");
    expect(monetizationTab.className.trim()).toBe("ghost-btn");
    expect(operationsTab.getAttribute("aria-selected")).toBe("true");
    expect(monetizationTab.getAttribute("aria-selected")).toBe("false");
    expect(operationsTab.textContent?.trim().length).toBeGreaterThan(0);
    expect(root.querySelector('[data-testid="revenue-ops-panel"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="platform-ops-panel"]')).toBeTruthy();
  });

  it("progressively reveals advanced feature library by cohort", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "general" },
      presets: {
        activePreset: "tier_pro",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_pro",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();
    fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);
    const disclosure = root.querySelector<HTMLDetailsElement>('[data-testid="feature-library-disclosure"]');
    expect(disclosure).toBeTruthy();
    expect(disclosure?.open).toBe(false);
  });

  it("renders the EPIC delivery blueprint with E2EE and rollout guardrails", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_enterprise",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_enterprise",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();

    fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);

    expect(root.querySelector('[data-testid="epic-delivery-panel"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="epic-dod-e2ee"]')?.textContent).toContain("No E2EE regressions");
    expect(root.querySelector('[data-testid="epic-dod-permissions"]')?.textContent).toContain("Permission model validated");
    expect(root.querySelector('[data-testid="epic-dod-rollout"]')?.textContent).toContain("Feature flag + migration notes");
  });

  it("hides the EPIC delivery blueprint when feature flag is disabled", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_free",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_free",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();
    fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);
    expect(root.querySelector('[data-testid="epic-delivery-panel"]')).toBeFalsy();
  });

  it("supports messaging feature toolbar and typing indicator", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_pro",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_pro",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();

    fireEvent.input(document.querySelector("input[name='username']") as HTMLInputElement, { target: { value: "alice" } });
    fireEvent.input(document.querySelector("input[name='password']") as HTMLInputElement, { target: { value: "secret" } });
    fireEvent.submit(document.querySelector("#auth-form") as HTMLFormElement);

    await waitFor(() => {
      expect(getByRole(root, "button", { name: "Alpha Ops" })).toBeTruthy();
    });

    const composer = document.querySelector<HTMLTextAreaElement>("textarea[name='message']");
    if (!composer) throw new Error("missing composer");

    fireEvent.click(root.querySelector("[data-action='composer-format-bold']") as HTMLButtonElement);
    expect(composer.value).toContain("**bold**");

    fireEvent.input(composer, { target: { value: `${composer.value} test` } });
    expect(root.querySelector('[data-testid="typing-indicator"]')).toBeTruthy();
  });

  it("supports attachment, GIF, sticker, and stego composer actions when features are enabled", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_enterprise",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_enterprise",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();

    fireEvent.input(document.querySelector("input[name='username']") as HTMLInputElement, { target: { value: "alice" } });
    fireEvent.input(document.querySelector("input[name='password']") as HTMLInputElement, { target: { value: "secret" } });
    fireEvent.submit(document.querySelector("#auth-form") as HTMLFormElement);

    await waitFor(() => {
      expect(getByRole(root, "button", { name: "Alpha Ops" })).toBeTruthy();
    });

    const composer = document.querySelector<HTMLTextAreaElement>("textarea[name='message']");
    if (!composer) throw new Error("missing composer");

    const attachmentTrigger = root.querySelector('[data-testid="composer-attachment-trigger"]') as HTMLButtonElement | null;
    expect(attachmentTrigger).toBeTruthy();
    fireEvent.click(attachmentTrigger as HTMLButtonElement);
    expect((root.querySelector('[data-testid="composer-attachment-panel"]') as HTMLElement).classList.contains("is-open")).toBe(true);
    const attachmentAdvanced = root.querySelector(".composer-advanced-accordion") as HTMLDetailsElement | null;
    expect(attachmentAdvanced).toBeTruthy();
    expect(attachmentAdvanced?.open).toBe(false);
    fireEvent.click(root.querySelector("[data-action='composer-attach-image']") as HTMLButtonElement);
    expect(composer.value).toContain("![uploaded image]");
    fireEvent.click(attachmentTrigger as HTMLButtonElement);
    fireEvent.change(root.querySelector("[data-action='composer-attachment-type']") as HTMLSelectElement, { target: { value: "video" } });
    const attachmentLabelHelper = root.querySelector("[data-testid='composer-attachment-label-helper']") as HTMLElement | null;
    expect(attachmentLabelHelper?.hidden).toBe(false);
    fireEvent.input(root.querySelector("[data-action='composer-attachment-url']") as HTMLInputElement, { target: { value: "https://cdn.example.com/videos/launch-recap.mp4" } });
    fireEvent.click(root.querySelector("[data-action='composer-attachment-add']") as HTMLButtonElement);
    expect(attachmentLabelHelper?.hidden).toBe(false);
    fireEvent.input(root.querySelector("[data-action='composer-attachment-label']") as HTMLInputElement, { target: { value: "x" } });
    expect(attachmentLabelHelper?.hidden).toBe(false);
    fireEvent.input(root.querySelector("[data-action='composer-attachment-label']") as HTMLInputElement, { target: { value: "Launch recap" } });
    expect(attachmentLabelHelper?.hidden).toBe(true);
    fireEvent.click((attachmentAdvanced as HTMLDetailsElement).querySelector("summary") as HTMLElement);
    expect((attachmentAdvanced as HTMLDetailsElement).open).toBe(true);
    fireEvent.click(root.querySelector("[data-action='composer-attachment-export']") as HTMLButtonElement);
    expect((root.querySelector("[data-action='composer-attachment-import-json']") as HTMLTextAreaElement).value).toContain("launch-recap.mp4");
    fireEvent.click(root.querySelector("[data-action='composer-attachment-stego']") as HTMLButtonElement);
    expect(composer.value).toContain("[stego-attachment");
    fireEvent.click(root.querySelector("[data-action='composer-open-governance']") as HTMLButtonElement);
    fireEvent.input(root.querySelector("[data-action='composer-governance-title']") as HTMLInputElement, { target: { value: "Approve release train" } });
    fireEvent.input(root.querySelector("[data-action='composer-governance-options']") as HTMLInputElement, { target: { value: "Approve,Block,Delay" } });
    fireEvent.click(root.querySelector("[data-action='composer-governance-save-template']") as HTMLButtonElement);
    fireEvent.click(root.querySelector("[data-action='composer-governance-export-templates']") as HTMLButtonElement);
    expect((root.querySelector("[data-action='composer-governance-import-json']") as HTMLTextAreaElement).value).toContain("Approve release train");
    fireEvent.click(root.querySelector("[data-action='composer-governance-insert-proposal']") as HTMLButtonElement);
    expect(composer.value).toContain("/proposal");

    const gifTrigger = root.querySelector('[data-testid="composer-gif-trigger"]') as HTMLButtonElement | null;
    expect(gifTrigger).toBeTruthy();
    fireEvent.click(gifTrigger as HTMLButtonElement);
    fireEvent.click(root.querySelector("[data-action='composer-select-gif']") as HTMLButtonElement);
    expect(composer.value).toContain("giphy.gif");
    fireEvent.click(gifTrigger as HTMLButtonElement);
    fireEvent.input(root.querySelector("[data-action='composer-gif-label']") as HTMLInputElement, { target: { value: "Ship it" } });
    fireEvent.input(root.querySelector("[data-action='composer-gif-url']") as HTMLInputElement, { target: { value: "https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif" } });
    fireEvent.click(root.querySelector("[data-action='composer-gif-add']") as HTMLButtonElement);
    fireEvent.click(root.querySelector("[data-action='composer-gif-export']") as HTMLButtonElement);
    expect((root.querySelector("[data-action='composer-gif-import-json']") as HTMLTextAreaElement).value).toContain("Ship it");
    fireEvent.click(root.querySelector("[data-action='composer-gif-stego']") as HTMLButtonElement);
    expect(composer.value).toContain("[stego-media");

    const emojiTrigger = root.querySelector('[data-testid="composer-emoji-trigger"]') as HTMLButtonElement | null;
    expect(emojiTrigger).toBeTruthy();
    fireEvent.click(emojiTrigger as HTMLButtonElement);
    fireEvent.input(root.querySelector("[data-action='composer-emoji-symbol']") as HTMLInputElement, { target: { value: "🛰️" } });
    fireEvent.input(root.querySelector("[data-action='composer-emoji-label']") as HTMLInputElement, { target: { value: "Satellite" } });
    fireEvent.click(root.querySelector("[data-action='composer-emoji-add']") as HTMLButtonElement);
    fireEvent.click(root.querySelector("[data-action='composer-emoji-export']") as HTMLButtonElement);
    expect((root.querySelector("[data-action='composer-emoji-import-json']") as HTMLTextAreaElement).value).toContain("Satellite");
    fireEvent.click(root.querySelector("[data-action='composer-emoji-stego']") as HTMLButtonElement);
    expect(composer.value).toContain("[stego-emoji");

    const stegoTrigger = root.querySelector('[data-testid="composer-stego-trigger"]') as HTMLButtonElement | null;
    expect(stegoTrigger).toBeTruthy();
    fireEvent.click(stegoTrigger as HTMLButtonElement);
    fireEvent.click(root.querySelector("[data-action='composer-stego-tab-password']") as HTMLButtonElement);
    fireEvent.click(root.querySelector("[data-action='composer-stego-generate-passphrase']") as HTMLButtonElement);
    const generatedPassphrase = (root.querySelector("[data-action='composer-stego-generated-passphrase']") as HTMLInputElement).value;
    expect(generatedPassphrase).not.toBe("auto-generate to begin");
    fireEvent.input(root.querySelector("[data-action='composer-stego-channel-name']") as HTMLInputElement, { target: { value: "ops-incident" } });
    fireEvent.input(root.querySelector("[data-action='composer-stego-channel-audience']") as HTMLInputElement, { target: { value: "Incident leads" } });
    fireEvent.input(root.querySelector("[data-action='composer-stego-channel-passphrase']") as HTMLInputElement, { target: { value: "Incident#2026" } });
    fireEvent.click(root.querySelector("[data-action='composer-stego-save-channel']") as HTMLButtonElement);
    const channelSelect = root.querySelector("[data-testid='composer-stego-channel-select']") as HTMLSelectElement;
    expect(channelSelect.options.length).toBeGreaterThan(1);
    fireEvent.change(channelSelect, { target: { value: "ops-incident" } });
    fireEvent.click(root.querySelector("[data-action='composer-stego-use-passphrase-hide']") as HTMLButtonElement);
    fireEvent.input(root.querySelector("[data-action='composer-stego-hidden']") as HTMLInputElement, { target: { value: "drop at 5" } });
    fireEvent.input(root.querySelector("[data-action='composer-stego-cover']") as HTMLInputElement, { target: { value: "all green for launch" } });
    fireEvent.click(root.querySelector("[data-action='composer-insert-stego']") as HTMLButtonElement);
    expect(composer.value).toContain('hidden="drop at 5"');
    expect(composer.value).toContain("algo=");
    expect(composer.value).toContain('channel="ops-incident"');

    fireEvent.click(stegoTrigger as HTMLButtonElement);
    fireEvent.click(root.querySelector("[data-action='composer-stego-tab-decrypt']") as HTMLButtonElement);
    fireEvent.input(root.querySelector("[data-action='composer-stego-decrypt-payload']") as HTMLTextAreaElement, { target: { value: '[stego algo="lsb-aes-256-cbc" keyHint="AA***ZZ" hidden="secret"]cover text[/stego]' } });
    fireEvent.click(root.querySelector("[data-action='composer-decrypt-stego']") as HTMLButtonElement);
    expect((root.querySelector('[data-testid="composer-stego-decrypt-result"]') as HTMLElement).textContent).toContain('Hidden: "secret"');

    const moreActions = root.querySelector<HTMLSelectElement>('[data-testid="composer-more-actions"]');
    expect(moreActions).toBeTruthy();
    fireEvent.change(moreActions as HTMLSelectElement, { target: { value: "code" } });
    expect(composer.value).toContain("```text");
  });

  it("opens features via command palette and supports Ctrl+K shortcut", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_free",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_free",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const paletteInput = root.querySelector<HTMLInputElement>('[data-testid="feature-command-palette-input"]');
    expect(paletteInput).toBeTruthy();
    fireEvent.input(paletteInput as HTMLInputElement, { target: { value: "matrix-native" } });
    fireEvent.click(getByRole(root, "button", { name: /Matrix-native client architecture/i }));
    expect(root.querySelector('[data-testid="feature-action-result"]')?.textContent).toContain("Opened matrix_client_arch");

    fireEvent.click(root.querySelector('[data-testid="open-command-palette"]') as HTMLButtonElement);
    const secondPaletteInput = root.querySelector<HTMLInputElement>('[data-testid="feature-command-palette-input"]');
    fireEvent.input(secondPaletteInput as HTMLInputElement, { target: { value: "governance and entitlement" } });
    fireEvent.click(getByRole(root, "button", { name: /Governance and entitlement policy layer/i }));
    expect(root.querySelector('[data-testid="feature-action-result"]')?.textContent).toContain("unavailable");
  });

  it("restores focus to the opener when command palette closes via Escape", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root);
    await app.mount();

    const trigger = root.querySelector<HTMLButtonElement>('[data-testid="open-command-palette"]');
    if (!trigger) throw new Error("missing command palette trigger");
    trigger.focus();
    fireEvent.click(trigger);
    expect(root.querySelector('[data-testid="feature-command-palette"]')).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(root.querySelector('[data-testid="feature-command-palette"]')).toBeFalsy();
    const restoredTrigger = root.querySelector<HTMLButtonElement>('[data-testid="open-command-palette"]');
    expect(document.activeElement).toBe(restoredTrigger);
  });

  it("separates browse and create channel actions", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root);
    await app.mount();

    fireEvent.input(document.querySelector("input[name='username']") as HTMLInputElement, { target: { value: "alice" } });
    fireEvent.input(document.querySelector("input[name='password']") as HTMLInputElement, { target: { value: "secret" } });
    fireEvent.submit(document.querySelector("#auth-form") as HTMLFormElement);

    await waitFor(() => {
      expect(getByRole(root, "button", { name: "Alpha Ops" })).toBeTruthy();
    });

    const browseButton = getByRole(root, "button", { name: "Browse channels" });
    fireEvent.click(browseButton);
    expect(root.querySelector('[data-testid="feature-action-result"]')?.textContent).toContain("Browse available channels");
    expect(root.querySelector(".chat-window")).toBeTruthy();

    const createButton = root.querySelector<HTMLButtonElement>("[data-action='create-channel']");
    if (!createButton) throw new Error("missing create channel button");
    fireEvent.click(createButton);
    expect(root.querySelector("#create-entity-form")).toBeTruthy();
  });

  it("opens widget entries from the files panel", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_enterprise",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_enterprise",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();

    fireEvent.input(document.querySelector("input[name='username']") as HTMLInputElement, { target: { value: "alice" } });
    fireEvent.input(document.querySelector("input[name='password']") as HTMLInputElement, { target: { value: "secret" } });
    fireEvent.submit(document.querySelector("#auth-form") as HTMLFormElement);

    await waitFor(() => {
      expect(getByRole(root, "button", { name: "Alpha Ops" })).toBeTruthy();
    });

    fireEvent.click(root.querySelector("[data-action='open-files-panel']") as HTMLButtonElement);
    fireEvent.click(root.querySelector("[data-feature-id='media_pipeline']") as HTMLButtonElement);

    expect(root.querySelector('[data-testid="feature-action-result"]')?.textContent).toContain("Opened media_pipeline");
    expect(root.querySelector('[data-testid="right-panel-overlay"]')?.textContent).toContain("Media pipeline widget");
  });

  it("supports DM panel quick-start action with dm- prefix", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_free",
        features: {},
        diagnostics: {
          deploymentPreset: "tier_free",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();

    fireEvent.input(document.querySelector("input[name='username']") as HTMLInputElement, { target: { value: "alice" } });
    fireEvent.input(document.querySelector("input[name='password']") as HTMLInputElement, { target: { value: "secret" } });
    fireEvent.submit(document.querySelector("#auth-form") as HTMLFormElement);

    await waitFor(() => {
      expect(getByRole(root, "button", { name: "Alpha Ops" })).toBeTruthy();
    });

    fireEvent.click(root.querySelector("[data-action='open-dms-panel']") as HTMLButtonElement);
    fireEvent.click(root.querySelector("[data-action='start-dm-channel']") as HTMLButtonElement);

    const input = root.querySelector<HTMLInputElement>("#create-entity-form input[name='name']");
    expect(input?.value).toBe("dm-");
  });

});
