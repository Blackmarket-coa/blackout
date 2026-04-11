import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const workspaceRoot = path.resolve(__dirname, "../../../..");
const reactClientRouterFile = path.join(workspaceRoot, "apps/blackout-client/src/main.tsx");
const blackoutWebAllowlistFile = path.join(workspaceRoot, "apps/blackout-web/config/react-client-paths.json");

const extractRouterPaths = (source: string): string[] => {
  const matches = Array.from(source.matchAll(/\bpath\s*:\s*["']([^"']+)["']/g));
  return [...new Set(matches.map((match) => match[1]).filter((segment) => segment.startsWith("/")))].sort();
};

describe("react client router path parity", () => {
  it("tracks blackout-client browser router paths in blackout-web allowlist", () => {
    const routerSource = fs.readFileSync(reactClientRouterFile, "utf8");
    const trackedPaths = JSON.parse(fs.readFileSync(blackoutWebAllowlistFile, "utf8")) as string[];

    const routerPaths = extractRouterPaths(routerSource);
    const expectedTrackedPaths = [...new Set([...routerPaths, "/moderation/draupnir"])].sort();
    const sortedTrackedPaths = [...trackedPaths].sort();

    expect(sortedTrackedPaths).toEqual(expectedTrackedPaths);
  });
});
