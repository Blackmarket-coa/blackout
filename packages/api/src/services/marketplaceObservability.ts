type CounterLabels = Record<string, string | number | boolean>;

const counters = new Map<string, { total: number; labelTotals: Map<string, number> }>();

function labelKey(labels: CounterLabels | undefined): string {
    if (!labels) return '';
    return Object.keys(labels)
        .sort()
        .map((key) => `${key}=${String(labels[key])}`)
        .join('|');
}

export function incrementCounter(name: string, labels?: CounterLabels, by = 1): void {
    const existing = counters.get(name) ?? { total: 0, labelTotals: new Map<string, number>() };
    existing.total += by;
    const key = labelKey(labels);
    existing.labelTotals.set(key, (existing.labelTotals.get(key) ?? 0) + by);
    counters.set(name, existing);
}

export function getCounter(name: string, labels?: CounterLabels): number {
    const existing = counters.get(name);
    if (!existing) return 0;
    if (labels === undefined) return existing.total;
    return existing.labelTotals.get(labelKey(labels)) ?? 0;
}

export function resetCountersForTest(): void {
    counters.clear();
}

export function logEvent(event: string, fields: Record<string, unknown>): void {
    const payload = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        ...fields,
    });
    process.stdout.write(`${payload}\n`);
}
