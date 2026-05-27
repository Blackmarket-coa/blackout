/**
 * Model for purchasable AI-den goods (Workstream 6): AI personas / prompt packs
 * and declarative automation recipes. Delivered as the payload of an
 * `ai_persona` / `automation_recipe` entitlement and decoded onto the installed
 * plugin record. AI personas are confined to AI dens (the AiDenPanel is the only
 * consumer and self-gates on `aiToolsEnabled`).
 *
 * Dependency-free so the installer and the catalog atoms can import it.
 */

export interface OwnedAiPersona {
    id: string;
    name: string;
    /** System prompt injected ahead of the conversation in an AI den. */
    systemPrompt: string;
    /** Optional opening line shown when the persona is equipped. */
    greeting?: string;
}

export interface OwnedAutomationRecipe {
    id: string;
    name: string;
    /** Human-readable trigger descriptions (declarative). */
    triggers: string[];
    /** Human-readable action descriptions (declarative). */
    actions: string[];
}

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function str(value: unknown, max: number): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim().slice(0, max)
        : undefined;
}

function stringList(value: unknown, max: number, cap: number): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const raw of value) {
        const s = str(raw, max);
        if (s) out.push(s);
        if (out.length >= cap) break;
    }
    return out;
}

function resolveId(data: Record<string, unknown>): string | undefined {
    if (typeof data.id === 'string' && ID_RE.test(data.id)) return data.id;
    return str(data.name, 64)
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Parse + sanitize an untrusted ai_persona payload. */
export function parseOwnedAiPersona(payload: unknown): OwnedAiPersona | null {
    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;
    const data = (root.persona && typeof root.persona === 'object'
        ? (root.persona as Record<string, unknown>)
        : root) as Record<string, unknown>;
    const id = resolveId(data);
    const name = str(data.name, 80) ?? id;
    const systemPrompt = str(data.systemPrompt, 4000);
    if (!id || !name || !systemPrompt) return null;
    return { id, name, systemPrompt, greeting: str(data.greeting, 280) };
}

/** Parse + sanitize an untrusted automation_recipe payload. */
export function parseOwnedAutomationRecipe(payload: unknown): OwnedAutomationRecipe | null {
    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;
    const data = (root.recipe && typeof root.recipe === 'object'
        ? (root.recipe as Record<string, unknown>)
        : root) as Record<string, unknown>;
    const id = resolveId(data);
    const name = str(data.name, 80) ?? id;
    if (!id || !name) return null;
    const triggers = stringList(data.triggers, 160, 12);
    const actions = stringList(data.actions, 160, 12);
    if (triggers.length === 0 && actions.length === 0) return null;
    return { id, name, triggers, actions };
}
