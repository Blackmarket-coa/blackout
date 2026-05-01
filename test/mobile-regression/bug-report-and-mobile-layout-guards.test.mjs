import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

test("bug report FAB + submission flow remains wired", () => {
  const bugFab = read("legacy/blackout-web/src/components/BugReportFab.ts");
  const appSource = read("legacy/blackout-web/src/app.ts");

  assert.match(bugFab, /class=\"bug-report-fab\"/);
  assert.match(bugFab, /data-action=\"open-bug-report\"/);
  assert.match(bugFab, /data-action=\"submit-bug-report\"/);
  assert.match(bugFab, /data-action=\"bug-report-issue\"/);
  assert.match(bugFab, /data-action=\"bug-report-steps\"/);
  assert.match(bugFab, /data-action=\"bug-report-suggestions\"/);

  assert.match(appSource, /private submitBugReport\(\): void/);
  assert.match(appSource, /this\.telemetry\.track\("user_bug_report", \{/);
  assert.match(appSource, /device_type:/);
  assert.match(appSource, /screen_width:/);
  assert.match(appSource, /screen_height:/);
  assert.match(appSource, /current_view:/);
  assert.match(appSource, /this\.bugReportOpen = false/);
});

test("mobile composer/sidebar layout rules stay constrained to mobile breakpoints", () => {
  const styles = read("legacy/blackout-web/src/styles.css");

  // Desktop baseline: sidebar visible + popovers as floating panels by default.
  assert.match(styles, /\.server-sidebar \{[\s\S]*display:\s*flex;/);
  assert.match(styles, /\.composer-popover \{[\s\S]*position:\s*absolute;/);

  // Mobile overrides: sidebar collapse + bottom-sheet composer + hamburger toggle.
  const mobileBlock = styles.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n\}/);
  assert.ok(mobileBlock, "Expected mobile breakpoint block");
  const mobileCss = mobileBlock[1];

  assert.match(mobileCss, /\.server-sidebar \{[\s\S]*display:\s*none;/);
  assert.match(mobileCss, /\.workspace\.show-channel-drawer \.channel-list \{/);
  assert.match(mobileCss, /\.composer-popover\.is-open \{[\s\S]*position:\s*fixed;/);
  assert.match(mobileCss, /\.composer-popover\.is-open \{[\s\S]*bottom:\s*0;/);
  assert.match(mobileCss, /\.mobile-tabbar \{[\s\S]*display:\s*grid;/);
});
