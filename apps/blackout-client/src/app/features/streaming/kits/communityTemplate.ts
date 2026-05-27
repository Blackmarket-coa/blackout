import type {
    CreatorKit,
    KitAidPoolSpec,
    KitApplySpec,
    KitDenSpec,
    KitTierSpec,
} from './kitCatalog';

/**
 * A purchased community template (Workstream 3). Delivered as the payload of a
 * `community_template` entitlement, decoded onto the installed plugin record,
 * and adapted to a CreatorKit so it flows through the existing CreatorKits view
 * + applyCreatorKit machinery unchanged.
 *
 * Apply provisions the same additive resources the built-in kits do (profile
 * status, dens, subscription tiers, aid pools). Role / permission / moderation
 * bundles stay deep-linked (consistent with kit secret-minting), since they're
 * an explicit server-side action rather than a one-click client mutation.
 */
export interface OwnedTemplate {
    id: string;
    name: string;
    glyph?: string;
    tagline?: string;
    apply: KitApplySpec;
}

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const DEN_KINDS = ['public', 'private', 'restricted'] as const;
const MAX_ITEMS = 12;

function str(value: unknown, max: number): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim().slice(0, max)
        : undefined;
}

function nonNegInt(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : undefined;
}

function parseDens(input: unknown): KitDenSpec[] | undefined {
    if (!Array.isArray(input)) return undefined;
    const out: KitDenSpec[] = [];
    for (const raw of input) {
        // Tolerate a bare string (den name) or a full object.
        if (typeof raw === 'string') {
            const name = str(raw, 80);
            if (name) out.push({ name, kind: 'private' });
        } else if (raw && typeof raw === 'object') {
            const obj = raw as Record<string, unknown>;
            const name = str(obj.name, 80);
            if (!name) continue;
            const kind = DEN_KINDS.includes(obj.kind as (typeof DEN_KINDS)[number])
                ? (obj.kind as KitDenSpec['kind'])
                : 'private';
            out.push({ name, topic: str(obj.topic, 200), kind });
        }
        if (out.length >= MAX_ITEMS) break;
    }
    return out.length > 0 ? out : undefined;
}

function parseTiers(input: unknown): KitTierSpec[] | undefined {
    if (!Array.isArray(input)) return undefined;
    const out: KitTierSpec[] = [];
    for (const raw of input) {
        if (!raw || typeof raw !== 'object') continue;
        const obj = raw as Record<string, unknown>;
        const name = str(obj.name, 80);
        const priceCents = nonNegInt(obj.priceCents);
        const currency = str(obj.currency, 8);
        if (!name || priceCents === undefined || !currency) continue;
        out.push({ name, description: str(obj.description, 280), priceCents, currency });
        if (out.length >= MAX_ITEMS) break;
    }
    return out.length > 0 ? out : undefined;
}

function parseAidPools(input: unknown): KitAidPoolSpec[] | undefined {
    if (!Array.isArray(input)) return undefined;
    const out: KitAidPoolSpec[] = [];
    for (const raw of input) {
        if (!raw || typeof raw !== 'object') continue;
        const obj = raw as Record<string, unknown>;
        const title = str(obj.title, 120);
        const goalCents = nonNegInt(obj.goalCents);
        const currency = str(obj.currency, 8);
        if (!title || goalCents === undefined || !currency) continue;
        out.push({ title, goalCents, currency });
        if (out.length >= MAX_ITEMS) break;
    }
    return out.length > 0 ? out : undefined;
}

/** Parse + sanitize an untrusted community-template payload into an OwnedTemplate. */
export function parseOwnedTemplate(payload: unknown): OwnedTemplate | null {
    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;
    // Accept `{ template: {...} }` or a bare template object.
    const data = (root.template && typeof root.template === 'object'
        ? (root.template as Record<string, unknown>)
        : root) as Record<string, unknown>;

    const id =
        typeof data.id === 'string' && ID_RE.test(data.id)
            ? data.id
            : str(data.name, 64)?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const name = str(data.name, 80) ?? (id ? id : undefined);
    if (!id || !name) return null;

    const apply: KitApplySpec = {};
    // Only a status is taken from profile so applying never clobbers existing fields.
    const profile = data.profile as Record<string, unknown> | undefined;
    const status = profile?.status as Record<string, unknown> | undefined;
    const statusText = str(status?.text, 140);
    if (statusText) {
        apply.profile = {
            status: { text: statusText, emoji: str(status?.emoji, 8) },
        };
    }
    apply.dens = parseDens(data.dens);
    apply.tiers = parseTiers(data.tiers);
    apply.aidPools = parseAidPools(data.aidPools);

    return {
        id,
        name,
        glyph: str(data.glyph, 8),
        tagline: str(data.tagline, 160),
        apply,
    };
}

/** Synthesize a human-readable "configures" summary for the detail view. */
function describeConfigures(apply: KitApplySpec): CreatorKit['configures'] {
    return {
        profile: apply.profile?.status ? [`Status: ${apply.profile.status.text}`] : [],
        dens: (apply.dens ?? []).map((d) => `${d.kind ?? 'private'} den “${d.name}”`),
        monetization: [
            ...(apply.tiers ?? []).map((t) => `Tier “${t.name}”`),
            ...(apply.aidPools ?? []).map((p) => `Aid pool “${p.title}”`),
        ],
        streamTools: [],
    };
}

/** Adapt an OwnedTemplate to a CreatorKit so it reuses the kit apply UI/logic. */
export function templateToKit(template: OwnedTemplate): CreatorKit {
    return {
        id: `template:${template.id}`,
        name: template.name,
        glyph: template.glyph ?? '📦',
        tagline: template.tagline ?? 'Purchased community template',
        configures: describeConfigures(template.apply),
        deepLinks: [],
        apply: template.apply,
    };
}
