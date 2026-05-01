import type { ChannelSummary } from "../types";

const DM_CHANNEL_PATTERNS: RegExp[] = [
  /^dm(?:$|[\s_-]+)/i,
  /^direct(?:$|[\s_-]+)/i,
  /^pm(?:$|[\s_-]+)/i,
  /^whisper(?:$|[\s_-]+)/i,
  /^1[:\s-]?1(?:$|[\s_-]+)/i,
];

const MATRIX_USER_ID_PATTERN = /^@[^\s:]+:[^\s]+$/i;

export interface DirectMessageChannelView {
  channel: ChannelSummary;
  displayName: string;
  unreadCount: number;
}

export function isDirectMessageChannelName(name: string): boolean {
  return extractDirectMessageDisplayName(name) !== null;
}

export function extractDirectMessageDisplayName(name: string): string | null {
  const normalized = name.trim();
  if (!normalized) return null;

  if (MATRIX_USER_ID_PATTERN.test(normalized)) {
    return normalized;
  }

  const lowerName = normalized.toLowerCase();
  for (const pattern of DM_CHANNEL_PATTERNS) {
    if (!pattern.test(lowerName)) continue;

    const target = normalized.replace(pattern, "").trim();
    if (!target) return "Direct message";
    return target;
  }

  return null;
}

export function getDirectMessageChannels(channels: ChannelSummary[], unreadByChannel: Record<string, number>): DirectMessageChannelView[] {
  return channels
    .map((channel) => {
      const displayName = extractDirectMessageDisplayName(channel.name);
      if (!displayName) return null;

      return {
        channel,
        displayName,
        unreadCount: unreadByChannel[channel.id] ?? 0,
      } satisfies DirectMessageChannelView;
    })
    .filter((channel): channel is DirectMessageChannelView => channel !== null)
    .sort((left, right) => {
      if (left.unreadCount !== right.unreadCount) {
        return right.unreadCount - left.unreadCount;
      }
      return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
    });
}
