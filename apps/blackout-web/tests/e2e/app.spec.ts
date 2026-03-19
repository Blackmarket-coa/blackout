import { expect, test } from "@playwright/test";

test("new user to first message flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Blackout Core" })).toBeVisible();

  await page.getByRole("button", { name: "Need an account? Register" }).click();
  await page.getByRole("textbox", { name: "Username" }).fill(`newuser-${Date.now()}`);
  await page.getByLabel("Password").fill("secretpass");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByRole("button", { name: "Alpha Ops" })).toBeVisible();
  await page.getByRole("button", { name: "# general" }).click();

  const message = `hello-${Date.now()}`;
  await page.locator("textarea[name='message']").fill(message);
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(message)).toBeVisible();
});
