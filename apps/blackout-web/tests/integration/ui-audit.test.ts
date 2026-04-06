import { fireEvent, waitFor } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { BlackoutWebApp } from "../../src/app";

async function mountAuthenticatedApp(): Promise<HTMLElement> {
  document.body.innerHTML = `<div id="app"></div>`;
  const root = document.querySelector("#app");
  if (!root) throw new Error("missing app root in test");

  const app = new BlackoutWebApp(root, {
    homeserverUrl: "https://matrix.blackout.local",
    mode: "daily-chat",
    rollout: { cohort: "internal" },
    presets: {
      activePreset: "sovereignty",
      features: {},
      diagnostics: {
        deploymentPreset: "sovereignty",
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
    expect(root.textContent).toContain("Alpha Ops");
  });

  fireEvent.click(root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement);
  return root;
}

describe("UI links/buttons audit", () => {
  it("renders only valid links and fully-typed buttons", async () => {
    const root = await mountAuthenticatedApp();

    const anchors = [...root.querySelectorAll("a")];
    for (const anchor of anchors) {
      const href = anchor.getAttribute("href");
      expect(href, `Anchor is missing href: ${anchor.outerHTML}`).toBeTruthy();
      expect(href?.trim(), `Anchor has empty href: ${anchor.outerHTML}`).not.toBe("");
    }

    const buttons = [...root.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThan(0);

    for (const button of buttons) {
      const type = button.getAttribute("type");
      expect(type, `Button missing explicit type: ${button.outerHTML}`).toBeTruthy();
      expect(["button", "submit"]).toContain(type);
      expect(button.textContent?.trim() || button.getAttribute("aria-label"), `Button has no label: ${button.outerHTML}`).toBeTruthy();
    }
  });
});
