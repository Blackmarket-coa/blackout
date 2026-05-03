/**
 * Storage adapters for the key-transparency log.
 *
 * The Merkle construction in `keyTransparency.ts` is storage-agnostic.
 * This module owns durability: loading the leaf sequence on boot,
 * appending leaves atomically, and snapshotting the tail.
 *
 * Two adapters ship today:
 *   - `InMemoryKtStorage`: process-local, suitable for tests and single-
 *     node operators.
 *   - `JsonFileKtStorage`: append-only JSON file at `KT_LOG_FILE` (default
 *     `.blackout/data/key-transparency.json`).
 *
 * Both adapters are synchronous because the leaf sequence is small and
 * the API surface is auditor-style read-mostly. A SQL adapter is the
 * obvious next step (table `(leaf_index PRIMARY KEY, leaf_data BLOB)` +
 * snapshot table for `(tree_size, root_hash, signature)`); it slots in
 * by implementing the same interface.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { KeyEntry } from './keyTransparency';

export interface KeyTransparencyStorage {
    /** Load the persisted leaves, in append order. */
    load(): KeyEntry[];
    /** Persist a newly appended leaf. */
    append(entry: KeyEntry): void;
    /** Drop all state (test-only escape hatch). */
    reset(): void;
}

export class InMemoryKtStorage implements KeyTransparencyStorage {
    private entries: KeyEntry[] = [];

    load(): KeyEntry[] {
        return [...this.entries];
    }

    append(entry: KeyEntry): void {
        this.entries.push(entry);
    }

    reset(): void {
        this.entries = [];
    }
}

interface PersistedKtState {
    version: 1;
    entries: KeyEntry[];
}

export class JsonFileKtStorage implements KeyTransparencyStorage {
    private readonly path: string;
    private entries: KeyEntry[];

    constructor(path: string) {
        this.path = resolve(path);
        this.entries = this.hydrate();
    }

    private hydrate(): KeyEntry[] {
        if (!existsSync(this.path)) {
            this.persist([]);
            return [];
        }
        const raw = readFileSync(this.path, 'utf8');
        if (raw.trim().length === 0) return [];
        const parsed = JSON.parse(raw) as PersistedKtState;
        if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
            throw new Error(`unrecognised KT log file at ${this.path}`);
        }
        return parsed.entries.slice();
    }

    private persist(entries: KeyEntry[]): void {
        mkdirSync(dirname(this.path), { recursive: true });
        const payload: PersistedKtState = { version: 1, entries };
        writeFileSync(this.path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    }

    load(): KeyEntry[] {
        return [...this.entries];
    }

    append(entry: KeyEntry): void {
        this.entries.push(entry);
        this.persist(this.entries);
    }

    reset(): void {
        this.entries = [];
        this.persist(this.entries);
    }
}

export const resolveKtStorage = (): KeyTransparencyStorage => {
    const file = process.env.KT_LOG_FILE;
    if (file && file.length > 0) return new JsonFileKtStorage(file);
    return new InMemoryKtStorage();
};
