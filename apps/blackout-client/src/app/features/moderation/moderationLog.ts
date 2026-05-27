// Pure helpers for the moderation action log, split out from the React
// component so the filtering/severity logic can be unit-tested directly.

export interface ModActionEntry {
  eventId: string;
  action: string;
  moderator: string;
  target: string;
  reason: string;
  timestamp: number;
}

export type ModSeverity = 'info' | 'low' | 'medium' | 'high';

export const classifyModSeverity = (action: string): ModSeverity => {
  const a = action.toLowerCase();
  if (a.includes('ban')) return 'high';
  if (a.includes('kick') || a.includes('remove')) return 'medium';
  if (a.includes('timeout') || a.includes('mute') || a.includes('slowmode')) return 'low';
  return 'info';
};

export interface ModLogFilters {
  /** 'all' or a specific action string. */
  action: string;
  moderator: string;
  target: string;
  query: string;
  fromTs: number | null;
  toTs: number | null;
}

export const filterModActionEntries = (
  entries: ModActionEntry[],
  filters: ModLogFilters
): ModActionEntry[] => {
  const q = filters.query.trim().toLowerCase();
  const moderator = filters.moderator.trim().toLowerCase();
  const target = filters.target.trim().toLowerCase();

  return entries.filter((entry) => {
    if (filters.action !== 'all' && entry.action !== filters.action) return false;
    if (moderator && !entry.moderator.toLowerCase().includes(moderator)) return false;
    if (target && !entry.target.toLowerCase().includes(target)) return false;
    if (filters.fromTs != null && entry.timestamp < filters.fromTs) return false;
    if (filters.toTs != null && entry.timestamp > filters.toTs) return false;
    if (!q) return true;
    return `${entry.action} ${entry.moderator} ${entry.target} ${entry.reason}`
      .toLowerCase()
      .includes(q);
  });
};

/** Parse a YYYY-MM-DD input into a day-boundary timestamp, or null. */
export const dayBoundaryTs = (value: string, edge: 'start' | 'end'): number | null => {
  if (!value) return null;
  const ms = Date.parse(edge === 'start' ? `${value}T00:00:00.000` : `${value}T23:59:59.999`);
  return Number.isNaN(ms) ? null : ms;
};
