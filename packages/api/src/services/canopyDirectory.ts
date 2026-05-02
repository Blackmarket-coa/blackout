export type CanopyFederationTier = 'local' | 'zone' | 'global';

export interface CanopyDirectoryEntry {
    canopyId: string;
    name: string;
    summary?: string;
    federationTier: CanopyFederationTier;
    indexedAt: string;
}

const canopies = new Map<string, CanopyDirectoryEntry>();

export interface UpsertCanopyInput {
    canopyId: string;
    name: string;
    summary?: string;
    federationTier?: CanopyFederationTier;
}

export function upsertCanopy(input: UpsertCanopyInput): CanopyDirectoryEntry {
    const entry: CanopyDirectoryEntry = {
        canopyId: input.canopyId,
        name: input.name,
        summary: input.summary,
        federationTier: input.federationTier ?? 'local',
        indexedAt: new Date().toISOString(),
    };
    canopies.set(input.canopyId, entry);
    return entry;
}

export function getCanopy(canopyId: string): CanopyDirectoryEntry | null {
    return canopies.get(canopyId) ?? null;
}

export function hasCanopy(canopyId: string): boolean {
    return canopies.has(canopyId);
}

export function listCanopies(filter: { federationTier?: CanopyFederationTier } = {}): CanopyDirectoryEntry[] {
    const all = [...canopies.values()];
    const filtered = filter.federationTier
        ? all.filter((entry) => entry.federationTier === filter.federationTier)
        : all;
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
}

export function __resetCanopyDirectoryForTests(): void {
    canopies.clear();
}
