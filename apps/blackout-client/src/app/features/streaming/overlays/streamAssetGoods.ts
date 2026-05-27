/**
 * Model for purchasable creator/stream assets (Workstream 4). A `stream_asset`
 * entitlement is one of: an overlay pack (scenes of positioned elements an
 * in-app overlay renders — also usable as a browser source), an alert pack
 * (event → message/sound), a channel-point reward kit (reward configs applied
 * via the existing channel-points API), or a badge/emote set. Dependency-free.
 */

export type StreamAssetType = 'overlay' | 'alert' | 'channel_point_kit' | 'badge_set';

export type OverlayElementKind = 'text' | 'image' | 'box';

export interface OverlayElement {
    id: string;
    kind: OverlayElementKind;
    /** Position + size as viewport percentages (0..100). */
    x: number;
    y: number;
    w: number;
    h: number;
    text?: string;
    color?: string;
    imageUrl?: string;
}

export interface OverlayScene {
    id: string;
    name: string;
    elements: OverlayElement[];
}

export type AlertEvent = 'tip' | 'sub' | 'boost';

export interface OverlayAlert {
    event: AlertEvent;
    message: string;
    color?: string;
    soundUrl?: string;
}

export interface ChannelPointRewardConfig {
    title: string;
    cost: number;
    prompt?: string;
}

export interface StreamBadge {
    id: string;
    name: string;
    glyph?: string;
    color?: string;
}

export interface OwnedStreamAsset {
    id: string;
    name: string;
    assetType: StreamAssetType;
    scenes?: OverlayScene[];
    alerts?: OverlayAlert[];
    rewards?: ChannelPointRewardConfig[];
    badges?: StreamBadge[];
}

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const HTTPS_RE = /^https:\/\//i;
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(?:rgb|hsl)a?\([0-9.,%\s/-]+\))$/;
const ASSET_TYPES: readonly StreamAssetType[] = [
    'overlay',
    'alert',
    'channel_point_kit',
    'badge_set',
];
const ELEMENT_KINDS: readonly OverlayElementKind[] = ['text', 'image', 'box'];
const ALERT_EVENTS: readonly AlertEvent[] = ['tip', 'sub', 'boost'];

function str(value: unknown, max: number): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim().slice(0, max)
        : undefined;
}
function color(value: unknown): string | undefined {
    const s = str(value, 64);
    return s && COLOR_RE.test(s) ? s : undefined;
}
function pct(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.min(100, Math.max(0, value))
        : fallback;
}
function posInt(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 10_000_000
        ? value
        : undefined;
}

function parseElement(raw: unknown): OverlayElement | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : undefined;
    const kind = ELEMENT_KINDS.includes(o.kind as OverlayElementKind)
        ? (o.kind as OverlayElementKind)
        : undefined;
    if (!id || !kind) return null;
    const imageUrl = str(o.imageUrl, 2048);
    return {
        id,
        kind,
        x: pct(o.x, 0),
        y: pct(o.y, 0),
        w: pct(o.w, 20),
        h: pct(o.h, 10),
        text: str(o.text, 280),
        color: color(o.color),
        imageUrl: imageUrl && HTTPS_RE.test(imageUrl) ? imageUrl : undefined,
    };
}

function parseScenes(input: unknown): OverlayScene[] {
    if (!Array.isArray(input)) return [];
    const out: OverlayScene[] = [];
    for (const raw of input) {
        if (!raw || typeof raw !== 'object') continue;
        const o = raw as Record<string, unknown>;
        const id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : undefined;
        const name = str(o.name, 80);
        if (!id || !name) continue;
        const elements = Array.isArray(o.elements)
            ? o.elements.map(parseElement).filter((e): e is OverlayElement => e !== null).slice(0, 50)
            : [];
        out.push({ id, name, elements });
        if (out.length >= 20) break;
    }
    return out;
}

function parseAlerts(input: unknown): OverlayAlert[] {
    if (!Array.isArray(input)) return [];
    const out: OverlayAlert[] = [];
    for (const raw of input) {
        if (!raw || typeof raw !== 'object') continue;
        const o = raw as Record<string, unknown>;
        if (!ALERT_EVENTS.includes(o.event as AlertEvent)) continue;
        const message = str(o.message, 200);
        if (!message) continue;
        const soundUrl = str(o.soundUrl, 2048);
        out.push({
            event: o.event as AlertEvent,
            message,
            color: color(o.color),
            soundUrl: soundUrl && HTTPS_RE.test(soundUrl) ? soundUrl : undefined,
        });
        if (out.length >= 12) break;
    }
    return out;
}

function parseRewards(input: unknown): ChannelPointRewardConfig[] {
    if (!Array.isArray(input)) return [];
    const out: ChannelPointRewardConfig[] = [];
    for (const raw of input) {
        if (!raw || typeof raw !== 'object') continue;
        const o = raw as Record<string, unknown>;
        const title = str(o.title, 80);
        const cost = posInt(o.cost);
        if (!title || cost === undefined) continue;
        out.push({ title, cost, prompt: str(o.prompt, 200) });
        if (out.length >= 24) break;
    }
    return out;
}

function parseBadges(input: unknown): StreamBadge[] {
    if (!Array.isArray(input)) return [];
    const out: StreamBadge[] = [];
    for (const raw of input) {
        if (!raw || typeof raw !== 'object') continue;
        const o = raw as Record<string, unknown>;
        const id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : undefined;
        const name = str(o.name, 60);
        if (!id || !name) continue;
        out.push({
            id,
            name,
            glyph: typeof o.glyph === 'string' ? o.glyph.trim().slice(0, 8) : undefined,
            color: color(o.color),
        });
        if (out.length >= 50) break;
    }
    return out;
}

/** Parse + sanitize an untrusted stream_asset payload. */
export function parseOwnedStreamAsset(payload: unknown): OwnedStreamAsset | null {
    if (!payload || typeof payload !== 'object') return null;
    const data = payload as Record<string, unknown>;
    const assetType = data.assetType;
    if (typeof assetType !== 'string' || !ASSET_TYPES.includes(assetType as StreamAssetType)) {
        return null;
    }
    const id =
        typeof data.id === 'string' && ID_RE.test(data.id)
            ? data.id
            : str(data.name, 64)?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const name = str(data.name, 80) ?? id;
    if (!id || !name) return null;

    const asset: OwnedStreamAsset = { id, name, assetType: assetType as StreamAssetType };
    switch (asset.assetType) {
        case 'overlay': {
            const scenes = parseScenes(data.scenes);
            if (scenes.length === 0) return null;
            asset.scenes = scenes;
            break;
        }
        case 'alert': {
            const alerts = parseAlerts(data.alerts);
            if (alerts.length === 0) return null;
            asset.alerts = alerts;
            break;
        }
        case 'channel_point_kit': {
            const rewards = parseRewards(data.rewards);
            if (rewards.length === 0) return null;
            asset.rewards = rewards;
            break;
        }
        case 'badge_set': {
            const badges = parseBadges(data.badges);
            if (badges.length === 0) return null;
            asset.badges = badges;
            break;
        }
    }
    return asset;
}
