import { describe, expect, it } from "vitest";

import { BlackoutWebApp } from "../../src/app";

const SESSION_STORAGE_KEY = "blackout.web.session";

function createRoot(): HTMLElement {
  document.body.innerHTML = `<div id="app"></div>`;
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing app root");
  return root;
}

describe("AI-X-002 session persistence contract", () => {
  it("boots into authenticated workspace when stored session fixture is valid", async () => {
    window.localStorage.clear();
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        jwt: "persisted-valid-token",
        user: { id: "usr_fixture", username: "fixture-user" },
      }),
    );

    const app = new BlackoutWebApp(createRoot());
    await app.mount();

    expect(document.querySelector("#auth-form")).toBeNull();
    expect(document.querySelector("[data-action='open-rooms-panel']")).toBeTruthy();
  });

  it("shows auth prompt when stored session fixture is invalid", async () => {
    window.localStorage.clear();
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        jwt: "",
        user: { id: "usr_fixture", username: "fixture-user" },
      }),
    );

    const app = new BlackoutWebApp(createRoot());
    await app.mount();

    expect(document.querySelector("#auth-form")).toBeTruthy();
    expect(document.querySelector("[data-action='open-rooms-panel']")).toBeNull();
  });
});
