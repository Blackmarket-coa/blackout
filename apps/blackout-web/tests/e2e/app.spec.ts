import { expect, test } from "@playwright/test";

test("renders auth and allows switching tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Blackout Frontend" })).toBeVisible();
  await page.getByRole("button", { name: "Rooms" }).click();
  await expect(page.getByRole("button", { name: "Refresh rooms" })).toBeVisible();
});
