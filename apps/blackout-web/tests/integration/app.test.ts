import { fireEvent, getByRole, waitFor } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { BlackoutWebApp } from "../../src/app";

describe("BlackoutWebApp", () => {
  it("lets a user sign in and load rooms using mock API", async () => {
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
      expect(getByRole(root, "button", { name: "Refresh rooms" })).toBeTruthy();
    });
  });
});
