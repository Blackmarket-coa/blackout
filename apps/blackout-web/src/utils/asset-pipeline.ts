import type { CanopyAssetKind, CanopyPlan } from "../types";

export interface AssetUploadDraft {
  kind: CanopyAssetKind;
  name: string;
  aliases: string[];
  sourceUrl: string;
  sizeBytes: number;
  mimeType: string;
}

export interface AssetPipelineResult {
  accepted: boolean;
  reason?: string;
  normalizedName: string;
  normalizedAliases: string[];
  normalizedUrl: string;
  normalizedMimeType: string;
  abuseFlags: string[];
}

const PLAN_LIMITS: Record<CanopyPlan, Record<CanopyAssetKind, number>> = {
  starter: { emoji: 50, sticker: 25, sound: 12 },
  governance: { emoji: 200, sticker: 100, sound: 40 },
  sovereignty: { emoji: 600, sticker: 300, sound: 120 },
};

const KIND_SIZE_LIMITS: Record<CanopyAssetKind, number> = {
  emoji: 256 * 1024,
  sticker: 2 * 1024 * 1024,
  sound: 700 * 1024,
};

const SOUND_MIME_WHITELIST = new Set(["audio/mpeg", "audio/ogg", "audio/wav"]);
const IMAGE_MIME_WHITELIST = new Set(["image/png", "image/webp", "image/gif"]);

export function getPlanPackLimit(plan: CanopyPlan, kind: CanopyAssetKind): number {
  return PLAN_LIMITS[plan][kind];
}

export function runAssetPipeline(draft: AssetUploadDraft): AssetPipelineResult {
  const normalizedName = normalizeSlug(draft.name);
  const normalizedAliases = [...new Set(draft.aliases.map(normalizeSlug).filter(Boolean))];
  const abuseFlags = scanAssetAbuse(`${draft.name} ${draft.aliases.join(" ")} ${draft.sourceUrl}`);

  if (!normalizedName) {
    return rejected("Name is required.", draft, abuseFlags);
  }

  if (draft.sizeBytes > KIND_SIZE_LIMITS[draft.kind]) {
    return rejected(`Asset exceeds ${Math.floor(KIND_SIZE_LIMITS[draft.kind] / 1024)}KB limit for ${draft.kind}.`, draft, abuseFlags);
  }

  if (!isMimeTypeAllowed(draft.kind, draft.mimeType)) {
    return rejected(`Unsupported MIME type ${draft.mimeType} for ${draft.kind}.`, draft, abuseFlags);
  }

  if (abuseFlags.includes("blocked-term")) {
    return rejected("Asset blocked by abuse scanner.", draft, abuseFlags);
  }

  return {
    accepted: true,
    normalizedName,
    normalizedAliases,
    normalizedUrl: normalizeAssetUrl(draft.sourceUrl, draft.kind),
    normalizedMimeType: normalizeMimeType(draft.mimeType, draft.kind),
    abuseFlags,
  };
}

function rejected(reason: string, draft: AssetUploadDraft, abuseFlags: string[]): AssetPipelineResult {
  return {
    accepted: false,
    reason,
    normalizedName: normalizeSlug(draft.name),
    normalizedAliases: draft.aliases.map(normalizeSlug).filter(Boolean),
    normalizedUrl: normalizeAssetUrl(draft.sourceUrl, draft.kind),
    normalizedMimeType: normalizeMimeType(draft.mimeType, draft.kind),
    abuseFlags,
  };
}

function isMimeTypeAllowed(kind: CanopyAssetKind, mimeType: string): boolean {
  if (kind === "sound") return SOUND_MIME_WHITELIST.has(mimeType);
  return IMAGE_MIME_WHITELIST.has(mimeType);
}

function normalizeMimeType(mimeType: string, kind: CanopyAssetKind): string {
  if (kind === "sound") {
    if (mimeType === "audio/wav") return "audio/ogg";
    return mimeType;
  }
  if (mimeType === "image/gif") return "image/webp";
  return mimeType;
}

function normalizeAssetUrl(url: string, kind: CanopyAssetKind): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("normalized", "1");
    if (kind === "sound") parsed.searchParams.set("codec", "opus");
    if (kind !== "sound") parsed.searchParams.set("format", "webp");
    return parsed.toString();
  } catch {
    return url;
  }
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function scanAssetAbuse(input: string): string[] {
  const text = input.toLowerCase();
  const flags: string[] = [];
  if (/(hate|slur|nazi|extremist)/.test(text)) flags.push("blocked-term");
  if (/(nsfw|porn|gore)/.test(text)) flags.push("sensitive-term");
  return flags;
}
