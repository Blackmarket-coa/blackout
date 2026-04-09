import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, "tools/ci/check-blackout-legacy-aliases.mjs");

function runWithFixture(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blackout-legacy-alias-policy-"));
  const file = path.join(dir, "featureFlags.ts");
  fs.writeFileSync(file, source);
  return spawnSync("node", [scriptPath, "--file", file], { encoding: "utf8" });
}

test("passes with the repository's current blackout legacy alias map", () => {
  const res = spawnSync("node", [scriptPath], { encoding: "utf8" });

  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /policy check passed/i);
});

test("fails when a non-allowlisted legacy alias is added", () => {
  const res = runWithFixture(`
    const LEGACY_FLAG_ALIASES = {
      Governance: "feature_governance",
      NewAlias: "feature_some_future_legacy_alias",
    };
  `);

  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /non-allowlisted blackout legacy aliases/i);
});

test("allows an alias subset to support staged removals", () => {
  const res = runWithFixture(`
    const LEGACY_FLAG_ALIASES = {
      Governance: "feature_governance",
    };
  `);

  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /policy check passed/i);
});
