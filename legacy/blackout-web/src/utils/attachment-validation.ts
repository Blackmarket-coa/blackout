export type AttachmentType = "meme" | "picture" | "video" | "audio";

export type AttachmentInput = {
  type?: string;
  label?: string;
  url?: string;
};

export type AttachmentValidationResult = {
  valid: boolean;
  error?: string;
};

export type ValidatedAttachment = {
  type: AttachmentType;
  label: string;
  url: string;
};

export type AttachmentImportResult = {
  attachments: ValidatedAttachment[];
  parsedCount: number;
  error?: string;
};

const ATTACHMENT_TYPES: AttachmentType[] = ["meme", "picture", "video", "audio"];
const JSON_POSITION_PATTERN = /position (\d+)/i;

function isAttachmentType(type: string): type is AttachmentType {
  return ATTACHMENT_TYPES.includes(type as AttachmentType);
}

export function validateAttachmentUrl(rawUrl: string): AttachmentValidationResult {
  const url = rawUrl.trim();
  if (!url) return { valid: false, error: "URL is required." };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "URL must use http:// or https://." };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Enter a valid URL format." };
  }
}

function toLineColumn(raw: string, position: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(position, raw.length));
  const upToError = raw.slice(0, clamped);
  const line = upToError.split("\n").length;
  const lastNewline = upToError.lastIndexOf("\n");
  const column = clamped - lastNewline;
  return { line, column };
}

function normalizeAttachment(candidate: AttachmentInput): ValidatedAttachment | null {
  if (!candidate || typeof candidate.type !== "string" || typeof candidate.label !== "string" || typeof candidate.url !== "string") {
    return null;
  }
  const type = candidate.type.trim();
  const label = candidate.label.trim();
  const url = candidate.url.trim();
  if (!isAttachmentType(type) || !label) return null;
  const urlValidation = validateAttachmentUrl(url);
  if (!urlValidation.valid) return null;
  return { type, label, url };
}

export function parseAttachmentImport(raw: string): AttachmentImportResult {
  const input = raw.trim();
  if (!input) return { attachments: [], parsedCount: 0 };
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!Array.isArray(parsed)) {
      return {
        attachments: [],
        parsedCount: 0,
        error: "Import JSON must be an array of attachments.",
      };
    }
    const attachments = parsed
      .map((item) => normalizeAttachment(item as AttachmentInput))
      .filter((item): item is ValidatedAttachment => item !== null);
    return { attachments, parsedCount: attachments.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    const match = message.match(JSON_POSITION_PATTERN);
    if (!match) {
      return { attachments: [], parsedCount: 0, error: `Import JSON error: ${message}` };
    }
    const position = Number.parseInt(match[1] ?? "0", 10);
    const { line, column } = toLineColumn(input, Number.isNaN(position) ? 0 : position);
    return {
      attachments: [],
      parsedCount: 0,
      error: `Import JSON error at line ${line}, column ${column}.`,
    };
  }
}

export function validateAttachmentInput(input: AttachmentInput): {
  attachment?: ValidatedAttachment;
  urlError?: string;
  inputError?: string;
} {
  const label = input.label?.trim() ?? "";
  const type = input.type?.trim() ?? "";
  const url = input.url?.trim() ?? "";
  if (!label) return { inputError: "Label is required." };
  if (!isAttachmentType(type)) return { inputError: "Attachment type is invalid." };
  const urlValidation = validateAttachmentUrl(url);
  if (!urlValidation.valid) return { urlError: urlValidation.error };
  return { attachment: { type, label, url } };
}

