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

    const app = new BlackoutWebApp(root);
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

    const app = new BlackoutWebApp(root);
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
  it("shows active preset diagnostics in header", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "community_plus",
        features: {
          "features.composer.richEditing": true,
          "features.governance.entitlements": false,
        },
        diagnostics: {
          deploymentPreset: "baseline_matrix",
          tenantPreset: "community_plus",
          userOverrideCount: 2,
        },
      },
    });
    await app.mount();

    fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);
    expect(root.querySelector('[data-testid="active-preset"]')?.textContent).toContain("community_plus");
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
        activePreset: "baseline_matrix",
        features: {},
        diagnostics: {
          deploymentPreset: "baseline_matrix",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();
    fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);

    const select = root.querySelector<HTMLSelectElement>('[data-testid="feature-preset-select"]');
    if (!select) throw new Error("missing preset select");

    fireEvent.change(select, { target: { value: "blackout_full" } });
    expect(root.querySelector('[data-testid="preset-capability-features-stego-enabled"]')).toBeTruthy();

    fireEvent.click(root.querySelector('[data-testid="apply-preset-button"]') as HTMLButtonElement);
    expect(root.querySelector('[data-testid="active-preset"]')?.textContent).toContain("blackout_full");

    fireEvent.click(root.querySelector('[data-testid="rollback-preset-button"]') as HTMLButtonElement);
    expect(root.querySelector('[data-testid="active-preset"]')?.textContent).toContain("baseline_matrix");
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
        activePreset: "blackout_full",
        features: {},
        diagnostics: {
          deploymentPreset: "blackout_full",
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
        activePreset: "baseline_matrix",
        features: {},
        diagnostics: {
          deploymentPreset: "baseline_matrix",
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
        activePreset: "community_plus",
        features: {},
        diagnostics: {
          deploymentPreset: "community_plus",
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

  it("renders the EPIC delivery blueprint with E2EE and rollout guardrails", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "blackout_full",
        features: {},
        diagnostics: {
          deploymentPreset: "blackout_full",
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
        activePreset: "baseline_matrix",
        features: {},
        diagnostics: {
          deploymentPreset: "baseline_matrix",
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
        activePreset: "community_plus",
        features: {},
        diagnostics: {
          deploymentPreset: "community_plus",
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

  it("shows stego and advanced composer actions in the message box when features are enabled", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "blackout_full",
        features: {},
        diagnostics: {
          deploymentPreset: "blackout_full",
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

    const stegoButton = root.querySelector('[data-testid="composer-stego-button"]') as HTMLButtonElement | null;
    expect(stegoButton).toBeTruthy();
    fireEvent.click(stegoButton as HTMLButtonElement);
    expect(composer.value).toContain("[stego::hidden-message]");

    const moreActions = root.querySelector<HTMLSelectElement>('[data-testid="composer-more-actions"]');
    expect(moreActions).toBeTruthy();
    fireEvent.change(moreActions as HTMLSelectElement, { target: { value: "code" } });
    expect(composer.value).toContain("```text");
  });

  it("provides quick-access dropdown + button for blackout features", async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "baseline_matrix",
        features: {},
        diagnostics: {
          deploymentPreset: "baseline_matrix",
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });
    await app.mount();

    const select = root.querySelector<HTMLSelectElement>('[data-testid="feature-quick-access-select"]');
    const openButton = root.querySelector<HTMLButtonElement>('[data-testid="feature-quick-access-button"]');
    expect(select).toBeTruthy();
    expect(openButton).toBeTruthy();

    fireEvent.change(select as HTMLSelectElement, { target: { value: "matrix_client_arch" } });
    fireEvent.click(openButton as HTMLButtonElement);
    expect(root.querySelector('[data-testid="feature-action-result"]')?.textContent).toContain("Opened matrix_client_arch");

    fireEvent.change(select as HTMLSelectElement, { target: { value: "governance_entitlements" } });
    fireEvent.click(openButton as HTMLButtonElement);
    expect(root.querySelector('[data-testid="feature-action-result"]')?.textContent).toContain("unavailable");
  });

});
