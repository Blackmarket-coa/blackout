import type { GifPickerItem, GifProvider } from './gifClient';

/**
 * Per-device recents for the online GIF picker (Workstream D exit
 * criterion: "recents persisted per device"). Stored in localStorage —
 * deliberately not Matrix account data, both because the criterion is
 * device-scoped and because provider CDN URLs are not guaranteed stable
 * enough to sync across devices. Mirrors the composer-draft storage
 * pattern in MessageComposer.tsx.
 */

export const GIF_RECENTS_STORAGE_KEY = 'blackout.gif_recents.v1';
export const GIF_RECENTS_MAX = 24;

const isProvider = (v: unknown): v is GifProvider => v === 'giphy' || v === 'tenor';

const isRendition = (v: unknown): v is { url: string; width: number; height: number } => {
    if (typeof v !== 'object' || v === null) return false;
    const r = v as Record<string, unknown>;
    return typeof r.url === 'string' && typeof r.width === 'number' && typeof r.height === 'number';
};

const isGifPickerItem = (v: unknown): v is GifPickerItem => {
    if (typeof v !== 'object' || v === null) return false;
    const item = v as Record<string, unknown>;
    return (
        typeof item.id === 'string' &&
        typeof item.description === 'string' &&
        isProvider(item.provider) &&
        isRendition(item.gif) &&
        isRendition(item.preview)
    );
};

export const readGifRecents = (): GifPickerItem[] => {
    try {
        const raw = window.localStorage.getItem(GIF_RECENTS_STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isGifPickerItem).slice(0, GIF_RECENTS_MAX);
    } catch {
        // Unavailable storage (SSR, privacy mode) or corrupt payload —
        // recents are a convenience, never worth an error surface.
        return [];
    }
};

export const addGifRecent = (item: GifPickerItem): void => {
    try {
        const next = [
            item,
            ...readGifRecents().filter(
                (recent) => !(recent.provider === item.provider && recent.id === item.id)
            ),
        ].slice(0, GIF_RECENTS_MAX);
        window.localStorage.setItem(GIF_RECENTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // ignore — same rationale as readGifRecents
    }
};
