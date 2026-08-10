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
 * Resilience: a report is delivered to two independent sinks so a single
 * misconfiguration never hard-fails the widget (which previously surfaced as a
 * 502 in the UI):
 *   - Matrix `#bugs` is self-healing — if the alias can't be resolved we create
 *     the room (the bot becomes creator/admin), and if the post is rejected
 *     403 because the bot isn't a member we admin-join it and retry once.
 *   - Every report is also forwarded to GitHub via `submitBugReport` so it
 *     lands as an issue even when Matrix delivery fails.
 * The outcome is `ok` if *either* sink succeeds; only a double failure is 502.
 *
 * Dev no-op: when no homeserver/bot token is configured the room can't be
 * resolved, so the Matrix leg short-circuits to a synthetic outcome; the GitHub
 * leg dev-no-ops the same way when no auth is configured (see
 * `bugReportPipeline.ts`). Either keeps the end-to-end UI flow working without
 * external services.
 */

import { redactString } from '@blackout/core/redaction';
import { createHash } from 'node:crypto';
import { matrixClient } from '../integrations/matrix-client';
import { submitBugReport, type BugReportInput } from './bugReportPipeline';
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
    /** GitHub issue URL when the parallel GitHub forward succeeded (or dev no-op). */
    readonly issueUrl: string | null;
    readonly issueError: string | null;
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
        maxAttachmentBytes:
            Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_ATTACHMENT_BYTES,
    };
};

const hashWithSalt =
    (salt: string) =>
    (value: string): string =>
        `h:${createHash('sha256').update(salt).update(value).digest('base64url').slice(0, 16)}`;

// First non-empty line of the description, trimmed to a headline length.
const buildReportTitle = (description: string): string => {
    const firstLine =
        description
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.length > 0) ?? 'Bug report';
    return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
};

const escapeHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Diagnostics (version/platform/screen/agent) are non-sensitive and useful raw
// in an internal triage room — only the route and room id are scrubbed so an
// inline den/room id is pseudonymised rather than leaked verbatim.
const buildMetadataLines = (meta: WidgetReportMetadata, scrub: (s: string) => string): string[] => {
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
        htmlParts.push(
            `<p><strong>Steps to reproduce</strong><br/>${escapeHtml(
                scrub(input.steps.trim())
            )}</p>`
        );
    }
    if (input.suggestions?.trim()) {
        htmlParts.push(
            `<p><strong>Suggestions</strong><br/>${escapeHtml(scrub(input.suggestions.trim()))}</p>`
        );
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
        filename?: string
    ): Promise<{ ok: boolean; contentUri?: string; reason?: string }>;
    sendEvent(
        roomId: string,
        content: Record<string, unknown>,
        options?: { eventType?: string; txnId?: string }
    ): Promise<{ ok: boolean; status?: number; eventId?: string; reason?: string }>;
    /** Self-heal: bot mxid, used to admin-join the bot into #bugs on a 403. */
    botUserId(): Promise<string | undefined>;
    /** Self-heal: create #bugs when its alias can't be resolved. */
    createRoom(input: {
        aliasLocalpart?: string;
        name?: string;
        topic?: string;
        /** Required, no default — see `matrixClient.createRoom`. */
        encrypted: boolean;
    }): Promise<{ ok: boolean; roomId?: string; reason?: string; status?: number }>;
    /** Self-heal: admin-join the bot into the room so it can post. */
    adminJoinUserToRoom(
        roomId: string,
        userId: string
    ): Promise<{ ok: boolean; status?: number; reason?: string }>;
}

/** Forwards a widget report to GitHub (default reuses {@link submitBugReport}). */
export type WidgetGithubForwarder = (
    input: WidgetReportInput
) => Promise<{ issueUrl: string | null; issueError: string | null }>;

export interface BugRoomPipelineDeps {
    readonly config?: BugRoomConfig;
    readonly matrix?: MatrixPoster;
    readonly forwardToGithub?: WidgetGithubForwarder;
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
    issueUrl: null,
    issueError: null,
    error,
});

// Bare localpart for the #bugs alias (e.g. `#bugs:host` → `bugs`), used when
// self-healing creates the room. Synapse derives the full alias from it.
const aliasLocalpart = (alias: string): string => alias.replace(/^#/, '').split(':')[0] || 'bugs';

// Map the widget report onto the shared GitHub bug-report shape. The widget has
// no category/severity pickers, so we tag it generically; the screenshot is
// omitted here (the Matrix leg carries attachments and GitHub caps body size).
const mapToBugReport = (input: WidgetReportInput): BugReportInput => {
    const description: string[] = [input.description.trim()];
    if (input.steps?.trim()) description.push('', '## Steps to reproduce', input.steps.trim());
    if (input.suggestions?.trim()) description.push('', '## Suggestions', input.suggestions.trim());
    const m = input.metadata;
    return {
        title: buildReportTitle(input.description),
        description: description.join('\n'),
        category: 'other',
        severity: 'medium',
        includeDiagnostics: true,
        includeMatrixIdHash: Boolean(input.includeReporterHash && input.reporterMatrixId),
        matrixId: input.reporterMatrixId,
        diagnostics: {
            clientVersion: m.clientVersion,
            userAgent: m.userAgent,
            platform: m.platform,
            consoleTail: [],
            currentPath: m.currentPath,
            buildChannel: m.buildChannel,
        },
    };
};

const defaultForwardToGithub: WidgetGithubForwarder = async (input) => {
    try {
        const out = await submitBugReport(mapToBugReport(input));
        return { issueUrl: out.issueUrl, issueError: out.issueError };
    } catch (err) {
        const issueError = err instanceof Error ? err.message : String(err);
        log.warn('bug_room.github_forward_failed', { error: issueError });
        return { issueUrl: null, issueError };
    }
};

// Admin-join the server bot into the room so it can post. Returns false (and
// logs) on any failure so the caller can give up gracefully.
const ensureBotInRoom = async (mx: MatrixPoster, roomId: string): Promise<boolean> => {
    const botId = await mx.botUserId();
    if (!botId) return false;
    const joined = await mx.adminJoinUserToRoom(roomId, botId);
    if (!joined.ok) {
        log.warn('bug_room.bot_join_failed', {
            roomId,
            status: joined.status,
            reason: joined.reason,
        });
        return false;
    }
    log.info('bug_room.bot_joined', { roomId });
    return true;
};

interface MatrixLeg {
    readonly devNoop: boolean;
    readonly roomId: string | null;
    readonly eventId: string | null;
    readonly messageLink: string | null;
    readonly attachmentPosted: boolean;
    readonly threadSeeded: boolean;
    readonly reactionSeeded: boolean;
    readonly error: string | null;
}

const EMPTY_MATRIX_LEG: MatrixLeg = {
    devNoop: false,
    roomId: null,
    eventId: null,
    messageLink: null,
    attachmentPosted: false,
    threadSeeded: false,
    reactionSeeded: false,
    error: null,
};

// The sentinel domain `readBugRoomConfig` falls back to when neither
// MATRIX_HOMESERVER_DOMAIN nor an explicit BUG_REPORT_MATRIX_ROOM_ALIAS is set.
const DEFAULT_HOMESERVER_DOMAIN = 'blackout.local';

// When the alias is only on the `blackout.local` default (i.e. the operator
// configured no real domain), derive the homeserver's actual server name from
// the bot's MXID. Otherwise that default alias never resolves and every report
// re-creates / fails against the wrong domain.
const effectiveRoomAlias = async (mx: MatrixPoster, cfg: BugRoomConfig): Promise<string> => {
    const colon = cfg.roomAlias.indexOf(':');
    if (colon === -1) return cfg.roomAlias;
    const domain = cfg.roomAlias.slice(colon + 1);
    if (domain !== DEFAULT_HOMESERVER_DOMAIN) return cfg.roomAlias;
    const botDomain = (await mx.botUserId())?.split(':')[1];
    if (!botDomain) return cfg.roomAlias;
    return `${cfg.roomAlias.slice(0, colon)}:${botDomain}`;
};

// Resolve the target room, self-healing a missing alias by creating #bugs.
const resolveOrCreateRoom = async (
    mx: MatrixPoster,
    cfg: BugRoomConfig
): Promise<{ roomId: string } | { devNoop: true } | { error: string }> => {
    if (cfg.roomId) return { roomId: cfg.roomId };
    const alias = await effectiveRoomAlias(mx, cfg);
    const resolved = await mx.resolveRoomAlias(alias);
    if (resolved.ok && resolved.roomId) return { roomId: resolved.roomId };
    if (resolved.reason === 'matrix_not_configured') {
        log.info('bug_room.noop', { reason: 'matrix_not_configured' });
        return { devNoop: true };
    }
    if (resolved.reason === 'alias_not_found') {
        const created = await mx.createRoom({
            aliasLocalpart: aliasLocalpart(alias),
            name: 'Bugs',
            topic: 'User-reported bugs (auto-provisioned)',
            // #bugs is a public intake room the bot posts every report into; it
            // cannot encrypt. Reports are redacted before posting (see redactString
            // usage above) precisely because this room is server-visible.
            encrypted: false,
        });
        if (created.ok && created.roomId) {
            log.info('bug_room.created', { roomId: created.roomId });
            return { roomId: created.roomId };
        }
        return { error: `could not create #bugs room: ${created.reason ?? 'unknown'}` };
    }
    return { error: `could not resolve #bugs room: ${resolved.reason ?? 'unknown'}` };
};

const deliverToMatrix = async (
    input: WidgetReportInput,
    cfg: BugRoomConfig,
    mx: MatrixPoster
): Promise<MatrixLeg> => {
    const room = await resolveOrCreateRoom(mx, cfg);
    if ('devNoop' in room) return { ...EMPTY_MATRIX_LEG, devNoop: true };
    if ('error' in room) return { ...EMPTY_MATRIX_LEG, error: room.error };
    const { roomId } = room;

    const message = buildReportMessage(input, cfg);
    const content = {
        msgtype: 'm.text',
        body: message.body,
        format: 'org.matrix.custom.html',
        formatted_body: message.formattedBody,
    };
    // Self-heal: a 403 usually means the bot isn't in #bugs — admin-join + retry.
    let posted = await mx.sendEvent(roomId, content);
    if (!posted.ok && posted.status === 403 && (await ensureBotInRoom(mx, roomId))) {
        posted = await mx.sendEvent(roomId, content);
    }
    if (!posted.ok || !posted.eventId) {
        return {
            ...EMPTY_MATRIX_LEG,
            roomId,
            error: `#bugs post failed (status ${posted.status ?? 'n/a'})`,
        };
    }
    const eventId = posted.eventId;

    // Best-effort: attachment, triage thread seed, status reaction. None of these
    // failing should fail the report itself — the message is already in #bugs.
    let attachmentPosted = false;
    if (input.attachment) {
        attachmentPosted = await postAttachment(mx, roomId, eventId, input.attachment, cfg).catch(
            (err) => {
                log.warn('bug_room.attachment_failed', { error: String(err) });
                return false;
            }
        );
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
            {
                'm.relates_to': {
                    rel_type: 'm.annotation',
                    event_id: eventId,
                    key: TRIAGE_STATUS_EMOJI,
                },
            },
            { eventType: 'm.reaction' }
        )
        .then((r) => r.ok)
        .catch(() => false);

    return {
        devNoop: false,
        roomId,
        eventId,
        messageLink: matrixToLink(roomId, eventId),
        attachmentPosted,
        threadSeeded,
        reactionSeeded,
        error: null,
    };
};

export const postWidgetReportToBugRoom = async (
    input: WidgetReportInput,
    deps: BugRoomPipelineDeps = {}
): Promise<WidgetReportOutcome> => {
    const cfg = deps.config ?? readBugRoomConfig();
    const mx = deps.matrix ?? (matrixClient as MatrixPoster);
    const forwardToGithub = deps.forwardToGithub ?? defaultForwardToGithub;

    // Two independent sinks in parallel: Matrix #bugs (self-healing) and a GitHub
    // issue. The report is delivered if either succeeds, so a single broken sink
    // no longer surfaces as a 502 in the widget.
    const [matrix, github] = await Promise.all([
        deliverToMatrix(input, cfg, mx),
        forwardToGithub(input),
    ]);

    const matrixOk = matrix.eventId !== null || matrix.devNoop;
    const githubOk = github.issueUrl !== null;
    const error = matrixOk
        ? null
        : matrix.error ?? (githubOk ? null : 'bug report delivery failed');

    return {
        ok: matrixOk || githubOk,
        roomId: matrix.roomId,
        eventId: matrix.eventId,
        messageLink: matrix.messageLink,
        attachmentPosted: matrix.attachmentPosted,
        threadSeeded: matrix.threadSeeded,
        reactionSeeded: matrix.reactionSeeded,
        devNoop: matrix.devNoop,
        issueUrl: github.issueUrl,
        issueError: github.issueError,
        error,
    };
};

const postAttachment = async (
    mx: MatrixPoster,
    roomId: string,
    threadRootId: string,
    attachment: NonNullable<WidgetReportInput['attachment']>,
    cfg: BugRoomConfig
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
        attachment.filename
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

export const __test__ = {
    buildReportTitle,
    buildReportMessage,
    buildMetadataLines,
    attachmentMsgType,
    matrixToLink,
};
