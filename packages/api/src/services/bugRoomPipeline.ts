/**
 * Bug-report widget → Matrix `#bugs` room pipeline.
 *
 * The global report widget (web + native) posts here. We forward each report
 * into the `#bugs` Matrix room as the server bot:
 *   1. Post the formatted report message (bold title, metadata code block,
 *      plaintext body) and capture its event id.
 *   2. If an attachment is present, upload it to the media repo and post an
 *      `m.image`/`m.video`/`m.file` event as a reply in the report's thread.
 *   3. Seed a triage thread reply so maintainers have a place to discuss.
 *   4. Seed an `m.reaction` status emoji (🔍 investigating) on the report.
 *
 * Free-text and metadata are scrubbed with the shared redaction primitives so
 * tokens are dropped and matrix/room/user ids are pseudonymised — reports stay
 * pseudonymous by default (reporter identity only appears as an opt-in hash).
 *
 * Dev no-op: when no homeserver/bot token is configured the room can't be
 * resolved, so we short-circuit to a synthetic outcome and let the UI flow
 * complete without external services (mirrors the GitHub no-op in
 * `bugReportPipeline.ts`).
 */

import { redactString } from '@blackout/core/redaction';
import { createHash } from 'node:crypto';
import { matrixClient } from '../integrations/matrix-client';
import { log } from '../telemetry/logger';

export interface WidgetReportMetadata {
  readonly clientVersion: string;
  readonly userAgent: string;
  readonly platform: string;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly currentPath?: string;
  readonly currentRoomId?: string;
  readonly buildChannel?: string;
}

export interface WidgetReportInput {
  readonly description: string;
  readonly steps?: string;
  readonly suggestions?: string;
  /** Opt-in pseudonymous reporter id — already a hash or a raw mxid to hash. */
  readonly reporterMatrixId?: string;
  readonly includeReporterHash?: boolean;
  readonly metadata: WidgetReportMetadata;
  readonly attachment?: {
    readonly filename: string;
    readonly contentType: string;
    readonly base64: string;
  };
}

export interface WidgetReportOutcome {
  readonly ok: boolean;
  readonly roomId: string | null;
  readonly eventId: string | null;
  readonly messageLink: string | null;
  readonly attachmentPosted: boolean;
  readonly threadSeeded: boolean;
  readonly reactionSeeded: boolean;
  readonly devNoop: boolean;
  readonly error: string | null;
}

export interface BugRoomConfig {
  readonly roomId: string | null;
  readonly roomAlias: string;
  readonly hashSalt: string;
  readonly maxAttachmentBytes: number;
}

/** Initial triage status seeded on every report. */
export const TRIAGE_STATUS_EMOJI = '🔍';
/** The status emoji vocabulary maintainers toggle in `#bugs`. */
export const TRIAGE_STATUS_SET = {
  investigating: '🔍',
  fixed: '✅',
  wontfix: '🚫',
} as const;

const DEFAULT_MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const homeserverDomain = (env: NodeJS.ProcessEnv): string =>
  (env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');

export const readBugRoomConfig = (env: NodeJS.ProcessEnv = process.env): BugRoomConfig => {
  const maxBytes = Number.parseInt(env.BUG_REPORT_MAX_ATTACHMENT_BYTES ?? '', 10);
  return {
    roomId: env.BUG_REPORT_MATRIX_ROOM_ID?.trim() || null,
    roomAlias: env.BUG_REPORT_MATRIX_ROOM_ALIAS?.trim() || `#bugs:${homeserverDomain(env)}`,
    hashSalt: env.LOG_HASH_SALT ?? 'blackout-log-salt',
    maxAttachmentBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_ATTACHMENT_BYTES,
  };
};

const hashWithSalt = (salt: string) => (value: string): string =>
  `h:${createHash('sha256').update(salt).update(value).digest('base64url').slice(0, 16)}`;

// First non-empty line of the description, trimmed to a headline length.
const buildReportTitle = (description: string): string => {
  const firstLine = description.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? 'Bug report';
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Diagnostics (version/platform/screen/agent) are non-sensitive and useful raw
// in an internal triage room — only the route and room id are scrubbed so an
// inline den/room id is pseudonymised rather than leaked verbatim.
const buildMetadataLines = (
  meta: WidgetReportMetadata,
  scrub: (s: string) => string,
): string[] => {
  const lines = [
    `version : ${meta.clientVersion}`,
    `platform: ${meta.platform}`,
    `screen  : ${meta.screenWidth}x${meta.screenHeight}`,
    `agent   : ${meta.userAgent}`,
  ];
  if (meta.currentPath) lines.push(`route   : ${scrub(meta.currentPath)}`);
  if (meta.currentRoomId) lines.push(`room    : ${scrub(meta.currentRoomId)}`);
  if (meta.buildChannel) lines.push(`channel : ${meta.buildChannel}`);
  return lines;
};

interface BuiltMessage {
  readonly title: string;
  readonly body: string;
  readonly formattedBody: string;
}

const buildReportMessage = (input: WidgetReportInput, cfg: BugRoomConfig): BuiltMessage => {
  const hash = hashWithSalt(cfg.hashSalt);
  const scrub = (s: string) => redactString(s, { pseudonymize: true, hash });
  // The title is derived from the first line of the description, so it must be
  // scrubbed too — otherwise a token/mxid on line one would leak into the bold
  // headline.
  const title = scrub(buildReportTitle(input.description));
  const metaLines = buildMetadataLines(input.metadata, scrub);

  const reporter =
    input.includeReporterHash && input.reporterMatrixId ? hash(input.reporterMatrixId) : null;

  // Plaintext body (the m.text fallback).
  const bodyParts: string[] = [`🐞 ${title}`, ''];
  bodyParts.push(scrub(input.description));
  if (input.steps?.trim()) {
    bodyParts.push('', 'Steps to reproduce:', scrub(input.steps.trim()));
  }
  if (input.suggestions?.trim()) {
    bodyParts.push('', 'Suggestions:', scrub(input.suggestions.trim()));
  }
  bodyParts.push('', 'Metadata:', '```', ...metaLines, '```');
  if (reporter) bodyParts.push('', `Reporter: ${reporter}`);
  const body = bodyParts.join('\n');

  // HTML body (bold title, sections, <pre> metadata).
  const htmlParts: string[] = [`<strong>🐞 ${escapeHtml(title)}</strong>`];
  htmlParts.push(`<p>${escapeHtml(scrub(input.description))}</p>`);
  if (input.steps?.trim()) {
    htmlParts.push(`<p><strong>Steps to reproduce</strong><br/>${escapeHtml(scrub(input.steps.trim()))}</p>`);
  }
  if (input.suggestions?.trim()) {
    htmlParts.push(`<p><strong>Suggestions</strong><br/>${escapeHtml(scrub(input.suggestions.trim()))}</p>`);
  }
  htmlParts.push(`<pre><code>${escapeHtml(metaLines.join('\n'))}</code></pre>`);
  if (reporter) htmlParts.push(`<p><em>Reporter: ${escapeHtml(reporter)}</em></p>`);
  const formattedBody = htmlParts.join('');

  return { title, body, formattedBody };
};

const attachmentMsgType = (contentType: string): string => {
  if (contentType.startsWith('image/')) return 'm.image';
  if (contentType.startsWith('video/')) return 'm.video';
  if (contentType.startsWith('audio/')) return 'm.audio';
  return 'm.file';
};

const matrixToLink = (roomId: string, eventId: string): string =>
  `https://matrix.to/#/${encodeURIComponent(roomId)}/${encodeURIComponent(eventId)}`;

export interface MatrixPoster {
  resolveRoomAlias(alias: string): Promise<{ ok: boolean; roomId?: string; reason?: string }>;
  uploadContent(
    bytes: Uint8Array,
    contentType: string,
    filename?: string,
  ): Promise<{ ok: boolean; contentUri?: string; reason?: string }>;
  sendEvent(
    roomId: string,
    content: Record<string, unknown>,
    options?: { eventType?: string; txnId?: string },
  ): Promise<{ ok: boolean; status?: number; eventId?: string; reason?: string }>;
}

export interface BugRoomPipelineDeps {
  readonly config?: BugRoomConfig;
  readonly matrix?: MatrixPoster;
}

const failure = (error: string): WidgetReportOutcome => ({
  ok: false,
  roomId: null,
  eventId: null,
  messageLink: null,
  attachmentPosted: false,
  threadSeeded: false,
  reactionSeeded: false,
  devNoop: false,
  error,
});

export const postWidgetReportToBugRoom = async (
  input: WidgetReportInput,
  deps: BugRoomPipelineDeps = {},
): Promise<WidgetReportOutcome> => {
  const cfg = deps.config ?? readBugRoomConfig();
  const mx = deps.matrix ?? (matrixClient as MatrixPoster);

  // Resolve the target room. A configured id wins; otherwise resolve the alias.
  let roomId = cfg.roomId;
  if (!roomId) {
    const resolved = await mx.resolveRoomAlias(cfg.roomAlias);
    if (!resolved.ok || !resolved.roomId) {
      if (resolved.reason === 'matrix_not_configured') {
        // Dev no-op so the client flow still completes end-to-end.
        log.info('bug_room.noop', { reason: 'matrix_not_configured' });
        return {
          ok: true,
          roomId: null,
          eventId: null,
          messageLink: null,
          attachmentPosted: false,
          threadSeeded: false,
          reactionSeeded: false,
          devNoop: true,
          error: null,
        };
      }
      return failure(`could not resolve #bugs room: ${resolved.reason ?? 'unknown'}`);
    }
    roomId = resolved.roomId;
  }

  const message = buildReportMessage(input, cfg);
  const posted = await mx.sendEvent(roomId, {
    msgtype: 'm.text',
    body: message.body,
    format: 'org.matrix.custom.html',
    formatted_body: message.formattedBody,
  });
  if (!posted.ok || !posted.eventId) {
    return failure(`#bugs post failed (status ${posted.status ?? 'n/a'})`);
  }
  const eventId = posted.eventId;

  // Best-effort: attachment, triage thread seed, status reaction. None of these
  // failing should fail the report itself — the message is already in #bugs.
  let attachmentPosted = false;
  if (input.attachment) {
    attachmentPosted = await postAttachment(mx, roomId, eventId, input.attachment, cfg).catch((err) => {
      log.warn('bug_room.attachment_failed', { error: String(err) });
      return false;
    });
  }

  const threadSeeded = await mx
    .sendEvent(roomId, {
      msgtype: 'm.notice',
      body: `Triage — react with ${TRIAGE_STATUS_SET.investigating} investigating · ${TRIAGE_STATUS_SET.fixed} fixed · ${TRIAGE_STATUS_SET.wontfix} wontfix`,
      'm.relates_to': { rel_type: 'm.thread', event_id: eventId },
    })
    .then((r) => r.ok)
    .catch(() => false);

  const reactionSeeded = await mx
    .sendEvent(
      roomId,
      { 'm.relates_to': { rel_type: 'm.annotation', event_id: eventId, key: TRIAGE_STATUS_EMOJI } },
      { eventType: 'm.reaction' },
    )
    .then((r) => r.ok)
    .catch(() => false);

  return {
    ok: true,
    roomId,
    eventId,
    messageLink: matrixToLink(roomId, eventId),
    attachmentPosted,
    threadSeeded,
    reactionSeeded,
    devNoop: false,
    error: null,
  };
};

const postAttachment = async (
  mx: MatrixPoster,
  roomId: string,
  threadRootId: string,
  attachment: NonNullable<WidgetReportInput['attachment']>,
  cfg: BugRoomConfig,
): Promise<boolean> => {
  const bytes = Buffer.from(attachment.base64, 'base64');
  if (bytes.byteLength === 0 || bytes.byteLength > cfg.maxAttachmentBytes) {
    log.warn('bug_room.attachment_skipped', {
      bytes: bytes.byteLength,
      max: cfg.maxAttachmentBytes,
    });
    return false;
  }
  const uploaded = await mx.uploadContent(
    new Uint8Array(bytes),
    attachment.contentType,
    attachment.filename,
  );
  if (!uploaded.ok || !uploaded.contentUri) return false;
  const result = await mx.sendEvent(roomId, {
    msgtype: attachmentMsgType(attachment.contentType),
    body: attachment.filename,
    url: uploaded.contentUri,
    info: { mimetype: attachment.contentType, size: bytes.byteLength },
    'm.relates_to': { rel_type: 'm.thread', event_id: threadRootId },
  });
  return result.ok;
};

export const __test__ = { buildReportTitle, buildReportMessage, buildMetadataLines, attachmentMsgType, matrixToLink };
