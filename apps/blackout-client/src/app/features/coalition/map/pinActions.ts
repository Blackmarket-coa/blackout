import type { SpatialLayerKey } from '@blackout/core';

/**
 * What you can do at a pin.
 *
 * The map used to be a viewer: tapping a pin showed a title, a subtitle, and
 * sometimes a link to a den. A world you can only look at isn't a world. Each
 * layer kind now offers verbs, so the map is somewhere you act.
 */
export type PinLayer = SpatialLayerKey | 'aid' | 'vendors';

export type PinActionId = 'watch' | 'den' | 'directions' | 'details' | 'board';

export interface PinActionSpec {
    id: PinActionId;
    label: string;
    glyph: string;
    /** Primary actions lead; the rest are secondary. */
    primary?: boolean;
}

/**
 * The verb catalogue, keyed by layer.
 *
 * Deliberately only lists actions that can actually be performed from the map
 * with what a pin carries. Claiming an aid post or RSVPing an event are real
 * verbs, but they need their own composers and confirmation states — those
 * belong with the boards, not stubbed here as buttons that half-work.
 */
const LAYER_ACTIONS: Partial<Record<PinLayer, PinActionSpec[]>> = {
    video: [{ id: 'watch', label: 'Watch story', glyph: '▶', primary: true }],
    aid: [{ id: 'den', label: 'Open the thread', glyph: '💬', primary: true }],
    vendors: [{ id: 'den', label: 'Message vendor', glyph: '💬', primary: true }],
    events: [{ id: 'den', label: 'Open the event', glyph: '📅', primary: true }],
    dens: [{ id: 'den', label: 'Open den', glyph: '🚪', primary: true }],
    communities: [{ id: 'den', label: 'Open canopy', glyph: '🗂️', primary: true }],
    // The three boards that gained coordinates. Their verb is to open the
    // record on its board, where claiming, supporting and booking already live
    // with their composers — the map sends you there rather than reimplementing
    // them as buttons that half-work.
    needs: [{ id: 'board', label: 'Open on the needs board', glyph: '🙋', primary: true }],
    projects: [{ id: 'board', label: 'Open the project', glyph: '🌱', primary: true }],
    resources: [{ id: 'board', label: 'Open in the registry', glyph: '🧰', primary: true }],
};

export interface PinActionContext {
    layer: PinLayer;
    hasDen: boolean;
    hasCoordinates: boolean;
    hasMedia: boolean;
    /**
     * True when the pin is an area of operations rather than an address. Its
     * centre is a reference point, so navigating to it is meaningless.
     */
    isArea?: boolean;
}

/**
 * Resolve the verbs a specific pin supports.
 *
 * Filters the catalogue down to what this pin can actually do — no "Open den"
 * on a pin with no den, no "Watch" on a story with no media. Directions is
 * offered for anything with an exact position, because a map that connects to
 * the real world should be able to send you there.
 */
export function resolvePinActions(context: PinActionContext): PinActionSpec[] {
    const catalogue = LAYER_ACTIONS[context.layer] ?? [];
    const actions = catalogue.filter((action) => {
        if (action.id === 'den') return context.hasDen;
        if (action.id === 'watch') return context.hasMedia;
        return true;
    });

    // Anything with a real address can be navigated to. An area is deliberately
    // excluded: routing someone to the centre of a 25km service radius sends
    // them to a field, not to the thing.
    if (context.hasCoordinates && !context.isArea) {
        actions.push({ id: 'directions', label: 'Directions', glyph: '🧭' });
    }
    // A den link is worth offering even on layers with no catalogue entry.
    if (context.hasDen && !actions.some((action) => action.id === 'den')) {
        actions.push({ id: 'den', label: 'Open den', glyph: '🚪' });
    }
    return actions;
}

/**
 * A geo: URI, which hands off to whatever map app the device actually uses
 * rather than hard-coding one vendor's web URL.
 */
export function directionsHref(latitude: number, longitude: number, label?: string): string {
    const query = label ? `?q=${encodeURIComponent(label)}` : '';
    return `geo:${latitude},${longitude}${query}`;
}
