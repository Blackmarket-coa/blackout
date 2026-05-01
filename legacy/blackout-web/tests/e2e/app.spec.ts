import { expect, test } from "@playwright/test";

test("auth shell renders and toggles between login/register", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.getByRole("button", { name: "Need an account? Register" }).click();

  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Register" })).toBeVisible();
  await expect(page.getByLabel("Homeserver URL")).toBeVisible();
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});
