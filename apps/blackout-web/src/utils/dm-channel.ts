const DM_CHANNEL_PATTERNS: RegExp[] = [
  /^dm(?:$|[\s_-])/i,
  /^direct(?:$|[\s_-])/i,
  /^pm(?:$|[\s_-])/i,
  /^whisper(?:$|[\s_-])/i,
  /^1[:\s-]?1(?:$|[\s_-])/i,
];

export function isDirectMessageChannelName(name: string): boolean {
  const normalized = name.trim();
  if (!normalized) return false;

  return DM_CHANNEL_PATTERNS.some((pattern) => pattern.test(normalized));
}
