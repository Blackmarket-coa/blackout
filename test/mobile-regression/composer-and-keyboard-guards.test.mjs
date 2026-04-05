import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

test("android keyboard hardening config is enabled", () => {
  const capacitorConfig = read("blackout-mobile/capacitor.config.ts");
  const androidManifest = read("blackout-mobile/android/app/src/main/AndroidManifest.xml");

  assert.match(capacitorConfig, /Keyboard:\s*\{[\s\S]*resize:\s*'body'/, "Keyboard.resize should be body");
  assert.match(capacitorConfig, /resizeOnFullScreen:\s*true/, "resizeOnFullScreen should stay enabled");
  assert.match(capacitorConfig, /scroll:\s*true/, "Keyboard.scroll should be enabled");
  assert.match(capacitorConfig, /scrollAssist:\s*true/, "Keyboard.scrollAssist should be enabled");
  assert.match(capacitorConfig, /style:\s*'DARK'/, "Keyboard.style should be DARK");

  assert.match(androidManifest, /android:windowSoftInputMode="adjustResize"/, "Android manifest should force adjustResize");
});

test("composer panel dismissal guards remain wired", () => {
  const appSource = read("apps/blackout-web/src/app.ts");

  assert.match(appSource, /document\.addEventListener\("pointerdown", this\.handleDocumentPointerDown\)/);
  assert.match(appSource, /if \(event\.key === "Escape" && this\.root\.querySelector\("\.composer-popover\.is-open"\)\)/);
  assert.match(appSource, /const insidePanel = event\.target\.closest\("\.composer-popover"\)/);
  assert.match(appSource, /const isTrigger = event\.target\.closest\("\[data-action\^='composer-toggle-'\], \[data-action='composer-open-governance'\]"\)/);
  assert.match(appSource, /if \(!insidePanel && !isTrigger\) \{\s*this\.closeComposerPanels\(\);\s*\}/);
});
