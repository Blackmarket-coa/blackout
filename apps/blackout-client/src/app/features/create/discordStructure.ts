import type { DenKind } from '../canopy/denKind';

/**
 * Pure parser for Discord "Get Guild Channels" JSON
 * (`GET /guilds/{guild.id}/channels`) → a Blackout import plan.
 *
 * No React, no Matrix — this module is deliberately side-effect free so the
 * structure mapping is unit-testable in isolation. Accepted inputs:
 *
 *   1. A bare JSON array of channel objects
 *      (`{ id, type, name, parent_id?, position?, topic? }[]`), with `type`
 *      either the numeric Discord channel type or its string name
 *      (e.g. `"GUILD_TEXT"`).
 *   2. A wrapper object `{ name?, channels: [...] }` so exports that carry
 *      the guild name can seed the canopy name.
 *
 * Mapping (Discord type → den kind):
 *   0 / GUILD_TEXT         → text
 *   2 / GUILD_VOICE        → voice
 *   5 / GUILD_ANNOUNCEMENT → announcement
 *   13 / GUILD_STAGE_VOICE → stage
 *   15 / GUILD_FORUM       → forum
 *   4 / GUILD_CATEGORY     → category (grouping bucket, not a den)
 *
 * Threads and any other/unknown types are skipped and reported in
 * `ImportPlan.skipped`. Channels are grouped under categories by `parent_id`
 * and ordered by `position`; uncategorized channels come first, mirroring how
 * Discord renders them above the first category.
 */

export type DenPlan = {
    name: string;
    kind: DenKind;
    topic?: string;
};

export type CategoryPlan = {
    name: string;
    dens: DenPlan[];
};

export type SkippedChannel = {
    name: string;
    reason: string;
};

export type ImportPlan = {
    canopyName: string;
    uncategorized: DenPlan[];
    categories: CategoryPlan[];
    skipped: SkippedChannel[];
};

export type DiscordStructureErrorCode = 'invalid-json' | 'invalid-shape' | 'empty-structure';

/**
 * Typed parse failure with a human-readable message the wizard can surface
 * verbatim. `code` lets tests (and future telemetry) branch without string
 * matching on copy.
 */
export class DiscordStructureError extends Error {
    readonly code: DiscordStructureErrorCode;

    constructor(code: DiscordStructureErrorCode, message: string) {
        super(message);
        this.name = 'DiscordStructureError';
        this.code = code;
    }
}

/** Fallback canopy name when the input carries no guild name. */
export const DEFAULT_CANOPY_NAME = 'Discord import';

const NUMERIC_TYPE_TO_KIND: Record<number, DenKind> = {
    0: 'text',
    2: 'voice',
    5: 'announcement',
    13: 'stage',
    15: 'forum',
};

const STRING_TYPE_TO_KIND: Record<string, DenKind> = {
    GUILD_TEXT: 'text',
    GUILD_VOICE: 'voice',
    GUILD_ANNOUNCEMENT: 'announcement',
    // Discord's older API docs used GUILD_NEWS for type 5.
    GUILD_NEWS: 'announcement',
    GUILD_STAGE_VOICE: 'stage',
    GUILD_FORUM: 'forum',
};

const CATEGORY_NUMERIC_TYPE = 4;
const CATEGORY_STRING_TYPE = 'GUILD_CATEGORY';

const THREAD_NUMERIC_TYPES = new Set([10, 11, 12]);
const THREAD_STRING_TYPES = new Set(['ANNOUNCEMENT_THREAD', 'PUBLIC_THREAD', 'PRIVATE_THREAD']);

type ResolvedType =
    | { role: 'den'; kind: DenKind }
    | { role: 'category' }
    | { role: 'skip'; reason: string };

const resolveChannelType = (rawType: unknown): ResolvedType | null => {
    if (typeof rawType === 'number' && Number.isFinite(rawType)) {
        const kind = NUMERIC_TYPE_TO_KIND[rawType];
        if (kind) return { role: 'den', kind };
        if (rawType === CATEGORY_NUMERIC_TYPE) return { role: 'category' };
        if (THREAD_NUMERIC_TYPES.has(rawType)) {
            return { role: 'skip', reason: 'Threads are not imported.' };
        }
        return { role: 'skip', reason: `Unsupported channel type (${rawType}).` };
    }

    if (typeof rawType === 'string' && rawType.trim().length > 0) {
        const upper = rawType.trim().toUpperCase();
        const kind = STRING_TYPE_TO_KIND[upper];
        if (kind) return { role: 'den', kind };
        if (upper === CATEGORY_STRING_TYPE) return { role: 'category' };
        if (THREAD_STRING_TYPES.has(upper)) {
            return { role: 'skip', reason: 'Threads are not imported.' };
        }
        return { role: 'skip', reason: `Unsupported channel type ("${rawType}").` };
    }

    return null;
};

type RawChannel = Record<string, unknown>;

type ParsedDen = {
    name: string;
    kind: DenKind;
    topic?: string;
    parentId: string | null;
    position: number;
    index: number;
};

type ParsedCategory = {
    id: string | null;
    name: string;
    position: number;
    index: number;
};

const asOptionalId = (value: unknown): string | null => {
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
};

const asPosition = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;

const byPositionThenIndex = <T extends { position: number; index: number }>(a: T, b: T): number =>
    a.position - b.position || a.index - b.index;

const toDenPlan = (den: ParsedDen): DenPlan => ({
    name: den.name,
    kind: den.kind,
    ...(den.topic !== undefined ? { topic: den.topic } : {}),
});

const normalizeInput = (
    parsed: unknown
): { channels: unknown[]; guildName: string | undefined } => {
    if (Array.isArray(parsed)) {
        return { channels: parsed, guildName: undefined };
    }

    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const wrapper = parsed as { name?: unknown; channels?: unknown };
        if (Array.isArray(wrapper.channels)) {
            const guildName =
                typeof wrapper.name === 'string' && wrapper.name.trim().length > 0
                    ? wrapper.name.trim()
                    : undefined;
            return { channels: wrapper.channels, guildName };
        }
        throw new DiscordStructureError(
            'invalid-shape',
            'Expected a JSON array of channels, or an object with a "channels" array.'
        );
    }

    throw new DiscordStructureError(
        'invalid-shape',
        'Expected a JSON array of channels, or an object with a "channels" array.'
    );
};

/**
 * Parse raw JSON text into an `ImportPlan`.
 *
 * Structural problems with the input as a whole throw a typed
 * `DiscordStructureError`; per-channel problems (missing name, unknown type,
 * threads, non-object entries) are tolerated and reported in `skipped` so one
 * odd row never blocks the rest of the server.
 */
export const parseDiscordStructure = (rawJson: string): ImportPlan => {
    const trimmed = rawJson.trim();
    if (trimmed.length === 0) {
        throw new DiscordStructureError(
            'invalid-json',
            'No JSON provided — paste the "Get Guild Channels" response first.'
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new DiscordStructureError('invalid-json', `That is not valid JSON: ${detail}`);
    }

    const { channels, guildName } = normalizeInput(parsed);

    if (channels.length === 0) {
        throw new DiscordStructureError(
            'empty-structure',
            'The channel list is empty — there is nothing to import.'
        );
    }

    const skipped: SkippedChannel[] = [];
    const categories: ParsedCategory[] = [];
    const dens: ParsedDen[] = [];

    channels.forEach((entry, index) => {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
            skipped.push({
                name: `Entry ${index + 1}`,
                reason: 'Not a channel object.',
            });
            return;
        }

        const channel = entry as RawChannel;
        const rawName = channel.name;
        const name = typeof rawName === 'string' ? rawName.trim() : '';
        const fallbackName = name || asOptionalId(channel.id) || `Entry ${index + 1}`;

        const resolved = resolveChannelType(channel.type);
        if (resolved === null) {
            skipped.push({ name: fallbackName, reason: 'Missing or invalid channel type.' });
            return;
        }

        if (resolved.role === 'skip') {
            skipped.push({ name: fallbackName, reason: resolved.reason });
            return;
        }

        if (name.length === 0) {
            skipped.push({ name: fallbackName, reason: 'Missing channel name.' });
            return;
        }

        if (resolved.role === 'category') {
            categories.push({
                id: asOptionalId(channel.id),
                name,
                position: asPosition(channel.position),
                index,
            });
            return;
        }

        const rawTopic = channel.topic;
        const topic =
            typeof rawTopic === 'string' && rawTopic.trim().length > 0
                ? rawTopic.trim()
                : undefined;

        dens.push({
            name,
            kind: resolved.kind,
            topic,
            parentId: asOptionalId(channel.parent_id),
            position: asPosition(channel.position),
            index,
        });
    });

    const orderedCategories = [...categories].sort(byPositionThenIndex);
    const categoryIds = new Set(
        orderedCategories.map((category) => category.id).filter((id): id is string => id !== null)
    );

    // Discord semantics: channels without a (known) parent category render
    // above the first category, ordered by position.
    const uncategorized = dens
        .filter((den) => den.parentId === null || !categoryIds.has(den.parentId))
        .sort(byPositionThenIndex)
        .map(toDenPlan);

    const categoryPlans: CategoryPlan[] = orderedCategories.map((category) => ({
        name: category.name,
        dens: dens
            .filter((den) => den.parentId !== null && den.parentId === category.id)
            .sort(byPositionThenIndex)
            .map(toDenPlan),
    }));

    return {
        canopyName: guildName ?? DEFAULT_CANOPY_NAME,
        uncategorized,
        categories: categoryPlans,
        skipped,
    };
};

/** Total number of Matrix rooms an import plan will create (canopy included). */
export const countPlanItems = (plan: ImportPlan): number =>
    1 +
    plan.uncategorized.length +
    plan.categories.reduce((total, category) => total + 1 + category.dens.length, 0);
