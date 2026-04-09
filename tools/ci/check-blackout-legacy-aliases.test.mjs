import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, "tools/ci/check-blackout-legacy-aliases.mjs");

test("passes with the repository's current blackout legacy alias map", () => {
  const res = spawnSync("node", [scriptPath], { encoding: "utf8" });

  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /policy check passed/i);
});
