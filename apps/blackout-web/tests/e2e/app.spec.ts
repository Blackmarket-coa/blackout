import { expect, test } from "@playwright/test";

test("renders auth and allows login to workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Blackout Frontend" })).toBeVisible();

  await page.getByRole("textbox", { name: "Username" }).fill("alice");
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("button", { name: "Alpha Ops" })).toBeVisible();
});
