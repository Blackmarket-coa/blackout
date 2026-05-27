import { CREATOR_KITS, type CreatorKit } from '../streaming/kits/kitCatalog';

/**
 * Creator archetypes shown in step 1 of the creator wizard. The selection is
 * persisted as intent and used to pre-highlight a Creator Kit in the kit step
 * via `suggestKitForArchetypes`. Archetypes are a superset of the four kit
 * workflows — several archetypes map onto the same kit.
 */
export interface CreatorArchetype {
    id: string;
    label: string;
    glyph: string;
}

export const CREATOR_ARCHETYPES: CreatorArchetype[] = [
    { id: 'streamer', label: 'Streamer', glyph: '🎮' },
    { id: 'educator', label: 'Educator', glyph: '🎓' },
    { id: 'organizer', label: 'Organizer', glyph: '🌱' },
    { id: 'musician', label: 'Musician', glyph: '🎵' },
    { id: 'developer', label: 'Developer', glyph: '🛠️' },
    { id: 'researcher', label: 'Researcher', glyph: '🔬' },
    { id: 'artist', label: 'Artist', glyph: '🎨' },
    { id: 'filmmaker', label: 'Filmmaker', glyph: '🎬' },
    { id: 'debater', label: 'Debater', glyph: '⚖️' },
    { id: 'community_leader', label: 'Community Leader', glyph: '🤝' },
    { id: 'vendor', label: 'Vendor', glyph: '🛒' },
    { id: 'journalist', label: 'Journalist', glyph: '📰' },
    { id: 'activist', label: 'Activist', glyph: '✊' },
    { id: 'workshop_host', label: 'Workshop Host', glyph: '🧰' },
    { id: 'builder', label: 'Builder / Maker', glyph: '🏗️' },
];

const VALID_ARCHETYPE_IDS = new Set(CREATOR_ARCHETYPES.map((archetype) => archetype.id));

export const isCreatorArchetypeId = (value: unknown): value is string =>
    typeof value === 'string' && VALID_ARCHETYPE_IDS.has(value);

/** Maps each archetype onto one of the four shipped Creator Kit ids. */
export const ARCHETYPE_KIT_MAP: Record<string, CreatorKit['id']> = {
    streamer: 'streamer',
    educator: 'educator',
    organizer: 'organizer',
    musician: 'musician',
    developer: 'educator',
    researcher: 'educator',
    artist: 'musician',
    filmmaker: 'musician',
    debater: 'organizer',
    community_leader: 'organizer',
    vendor: 'musician',
    journalist: 'educator',
    activist: 'organizer',
    workshop_host: 'educator',
    builder: 'educator',
};

const DEFAULT_KIT_ID = CREATOR_KITS[0]?.id ?? 'educator';

/**
 * Returns the kit id that best fits the chosen archetypes (most-frequent
 * mapped kit; ties resolve to the earliest kit in `CREATOR_KITS`). Falls back
 * to the first catalog kit when no archetypes are selected.
 */
export const suggestKitForArchetypes = (archetypeIds: readonly string[]): CreatorKit['id'] => {
    const counts = new Map<string, number>();
    for (const id of archetypeIds) {
        const kitId = ARCHETYPE_KIT_MAP[id];
        if (kitId) counts.set(kitId, (counts.get(kitId) ?? 0) + 1);
    }
    if (counts.size === 0) return DEFAULT_KIT_ID;

    let best = DEFAULT_KIT_ID;
    let bestCount = -1;
    for (const kit of CREATOR_KITS) {
        const count = counts.get(kit.id) ?? 0;
        if (count > bestCount) {
            best = kit.id;
            bestCount = count;
        }
    }
    return best;
};
