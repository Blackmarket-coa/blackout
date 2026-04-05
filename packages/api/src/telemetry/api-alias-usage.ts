const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type UsageBucket = {
  total: number;
  byPath: Map<string, number>;
};

const usageByWeek = new Map<string, UsageBucket>();

function currentWeekKey(now = new Date()): string {
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = now.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  const mondayUtc = utc - mondayOffset * 24 * 60 * 60 * 1000;
  return new Date(mondayUtc).toISOString().slice(0, 10);
}

export function recordLegacyApiAliasUsage(path: string, now = new Date()) {
  const key = currentWeekKey(now);
  const bucket = usageByWeek.get(key) ?? { total: 0, byPath: new Map<string, number>() };
  bucket.total += 1;
  bucket.byPath.set(path, (bucket.byPath.get(path) ?? 0) + 1);
  usageByWeek.set(key, bucket);
}

export function emitWeeklyLegacyApiAliasReport(now = new Date()) {
  const currentKey = currentWeekKey(now);
  for (const [weekKey, bucket] of usageByWeek) {
    if (weekKey === currentKey) {
      continue;
    }

    const topPaths = [...bucket.byPath.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => `${path}:${count}`)
      .join(', ');

    console.info(`[api][legacy-alias][weekly] week=${weekKey} total=${bucket.total} top_paths=[${topPaths}]`);
    usageByWeek.delete(weekKey);
  }
}

let hookStarted = false;
export function startLegacyApiAliasWeeklyReporter() {
  if (hookStarted) {
    return;
  }

  hookStarted = true;
  const timer = setInterval(() => {
    emitWeeklyLegacyApiAliasReport();
  }, WEEK_MS);

  timer.unref?.();
}
