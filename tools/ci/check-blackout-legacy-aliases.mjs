#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ALLOWED_BLACKOUT_LEGACY_ALIASES = new Set([
  "feature_governance",
  "feature_education",
  "feature_mutual_aid",
  "feature_deliberation_clustering",
  "feature_ipfs_storage",
  "feature_townhall",
]);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const featureFlagsPath = path.resolve(process.cwd(), "_port/src/modules/blackout/featureFlags.ts");

if (!fs.existsSync(featureFlagsPath)) {
  fail(`Blackout feature flag source not found: ${featureFlagsPath}`);
}

const source = fs.readFileSync(featureFlagsPath, "utf8");
const aliasesBlockMatch = source.match(/const LEGACY_FLAG_ALIASES[\s\S]*?=\s*{([\s\S]*?)};/);

if (!aliasesBlockMatch) {
  fail("Could not find LEGACY_FLAG_ALIASES map in _port/src/modules/blackout/featureFlags.ts.");
}

const aliasBlock = aliasesBlockMatch[1];
const aliasValues = Array.from(aliasBlock.matchAll(/:\s*"([^"]+)"/g), (match) => match[1]);

const unexpected = aliasValues.filter((alias) => !ALLOWED_BLACKOUT_LEGACY_ALIASES.has(alias));
if (unexpected.length > 0) {
  fail(
    `Found non-allowlisted blackout legacy aliases: ${unexpected.join(", ")}. ` +
      "Use canonical feature_blackout_* keys for new flags.",
  );
}

const missing = Array.from(ALLOWED_BLACKOUT_LEGACY_ALIASES).filter((alias) => !aliasValues.includes(alias));
if (missing.length > 0) {
  fail(`Expected legacy aliases missing from LEGACY_FLAG_ALIASES: ${missing.join(", ")}.`);
}

process.stdout.write(
  `Blackout legacy alias policy check passed (${aliasValues.length} aliases, allowlist locked).\n`,
);
