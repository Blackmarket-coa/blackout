import { expect, test } from '@playwright/test';

test.describe('Blackout client shell', () => {
  test('boots, has the expected document title, and mounts the React root', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveTitle('Blackout Client');

    // The Vite-built bundle injects the app under #root. The element exists in
    // index.html before hydration; we additionally wait for it to acquire any
    // child to confirm React mounted.
    const root = page.locator('#root');
    await expect(root).toBeAttached();
    await expect(root).not.toBeEmpty({ timeout: 30_000 });

    // Fail-fast on uncaught exceptions and console.error surfaces — both are
    // production smoke regressions worth blocking a deploy on.
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });
});
