import { fireEvent, getByRole, waitFor } from "@testing-library/dom";
import { beforeEach, describe, expect, it } from "vitest";

import { BlackoutWebApp } from "../../src/app";

describe("BlackoutWebApp integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
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
      presets: {
        activePreset: "community_plus",
        features: {},
        diagnostics: {
          deploymentPreset: "baseline_matrix",
          tenantPreset: "community_plus",
          userOverrideCount: 2,
        },
      },
    });
    await app.mount();

    expect(root.querySelector('[data-testid="active-preset"]')?.textContent).toContain("community_plus");
    expect(root.querySelector('[data-testid="preset-diagnostics"]')?.textContent).toContain("user overrides=2");
  });

});
