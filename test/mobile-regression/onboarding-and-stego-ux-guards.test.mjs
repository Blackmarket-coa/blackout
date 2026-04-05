import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

test("glossary/info-tip system remains present for jargon surfaces", () => {
  const glossary = read("apps/blackout-web/src/components/glossary.ts");
  const messageInput = read("apps/blackout-web/src/components/MessageInput.ts");
  const governancePanel = read("apps/blackout-web/src/components/GovernanceRoomPanel.ts");
  const federationPanel = read("apps/blackout-web/src/components/FederationPanel.ts");

  assert.match(glossary, /export function renderInfoTip\(/);
  assert.match(glossary, /export function renderGlossaryTip\(/);
  assert.match(glossary, /"Steganography"/);
  assert.match(glossary, /"Quorum"/);

  assert.match(messageInput, /renderGlossaryTip\("Steganography"\)/);
  assert.match(governancePanel, /renderGlossaryTip\("Quorum"\)/);
  assert.match(federationPanel, /renderGlossaryTip\("Federation"\)/);
});

test("guided tours and telemetry hooks remain wired for first-use discovery", () => {
  const appSource = read("apps/blackout-web/src/app.ts");

  assert.match(appSource, /private maybeShowAdvancedTour\(/);
  assert.match(appSource, /private advanceAdvancedTour\(/);
  assert.match(appSource, /private skipAdvancedTour\(/);

  assert.match(appSource, /this\.trackKpiEvent\("advanced_tour_completed", \{ module \}\)/);
  assert.match(appSource, /this\.trackKpiEvent\("advanced_tour_skipped", \{ module \}\)/);
  assert.match(appSource, /this\.trackKpiEvent\("advanced_module_entered", \{ module \}\)/);
  assert.match(appSource, /this\.trackKpiEvent\("kpi_advanced_feature_discovery", \{ module, eligible_admin: true \}\)/);

  assert.match(appSource, /\[data-action='onboarding-tour-next'\]/);
  assert.match(appSource, /\[data-action='onboarding-tour-skip'\]/);
});

test("stego UX baseline keeps explanatory copy, preview, and progressive disclosure", () => {
  const messageInput = read("apps/blackout-web/src/components/MessageInput.ts");

  assert.match(messageInput, /Hide secret messages inside normal-looking text\./);
  assert.match(messageInput, /Others see:/);
  assert.match(messageInput, /Hidden inside:/);
  assert.match(messageInput, /<details class="composer-stego-advanced">/);
  assert.match(messageInput, /<summary>Advanced options<\/summary>/);

  assert.match(messageInput, /data-action="composer-stego-hidden"/);
  assert.match(messageInput, /data-action="composer-stego-cover"/);
  assert.match(messageInput, /data-action="composer-stego-passphrase"/);
});
