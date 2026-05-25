import { db } from '../db/store';
import type { CanopyDirectoryEntryRecord } from '../db/types';

export type CanopyFederationTier = 'local' | 'zone' | 'global';

export type CanopyDirectoryEntry = CanopyDirectoryEntryRecord;

export interface UpsertCanopyInput {
    canopyId: string;
    name: string;
    summary?: string;
    federationTier?: CanopyFederationTier;
}

export function upsertCanopy(input: UpsertCanopyInput): CanopyDirectoryEntry {
    return db.upsertCanopyDirectoryEntry({
        canopyId: input.canopyId,
        name: input.name,
        summary: input.summary,
        federationTier: input.federationTier ?? 'local',
    });
}

export function getCanopy(canopyId: string): CanopyDirectoryEntry | null {
    return db.getCanopyDirectoryEntry(canopyId) ?? null;
}

export function hasCanopy(canopyId: string): boolean {
    return db.getCanopyDirectoryEntry(canopyId) !== undefined;
}

export function listCanopies(filter: { federationTier?: CanopyFederationTier } = {}): CanopyDirectoryEntry[] {
    const all = db.listCanopyDirectoryEntries();
    const filtered = filter.federationTier
        ? all.filter((entry) => entry.federationTier === filter.federationTier)
        : all;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
}

export function __resetCanopyDirectoryForTests(): void {
    for (const entry of db.listCanopyDirectoryEntries()) {
        db.canopyDirectoryEntries.delete(entry.canopyId);
    }
}
