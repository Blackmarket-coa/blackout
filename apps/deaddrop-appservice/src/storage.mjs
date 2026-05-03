/**
 * JSON-file backed persistence for opaque dead-drop envelopes.
 *
 * Schema:
 *   {
 *     drops: { [clueBase64]: { envelope, storedAt } },
 *     decoySeeds: { [roomId]: <hex 32-byte seed> }
 *   }
 *
 * Periodic cleanup removes envelopes whose `expiresAt` has passed.
 * The seed table only ever grows (one seed per room) and is harmless to
 * leak (decoys are not security-sensitive on their own).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const DEFAULT_DB_PATH = '.blackout/data/deaddrop.json';

const emptyState = () => ({ drops: {}, decoySeeds: {} });

export class DeadDropStore {
    constructor({ dbPath, mode } = {}) {
        this.mode = mode ?? process.env.BLACKOUT_DEADDROP_DB_MODE ?? 'file';
        this.path = resolve(
            process.cwd(),
            dbPath ?? process.env.BLACKOUT_DEADDROP_DB_FILE ?? DEFAULT_DB_PATH
        );
        this.state = emptyState();
        if (this.mode === 'file') this.hydrate();
    }

    hydrate() {
        if (!existsSync(this.path)) {
            this.persist();
            return;
        }
        try {
            const raw = readFileSync(this.path, 'utf8');
            const parsed = JSON.parse(raw);
            this.state = {
                drops: parsed.drops ?? {},
                decoySeeds: parsed.decoySeeds ?? {},
            };
        } catch {
            this.state = emptyState();
            this.persist();
        }
    }

    persist() {
        if (this.mode !== 'file') return;
        mkdirSync(dirname(this.path), { recursive: true });
        writeFileSync(this.path, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    }

    /**
     * Insert a drop keyed by clue. Throws if the clue is already taken
     * (clues are 16 random bytes, collisions are vanishingly unlikely).
     */
    insertDrop(envelope) {
        if (this.state.drops[envelope.clue]) {
            throw new Error(`drop with clue ${envelope.clue} already exists`);
        }
        this.state.drops[envelope.clue] = {
            envelope,
            storedAt: new Date().toISOString(),
        };
        this.persist();
    }

    /**
     * Fetch all drops matching a clue. (In v1, a clue maps to at most
     * one drop — but the API returns a list to allow future
     * multi-recipient mailbox semantics without a second wire change.)
     */
    fetchByClue(clueBase64) {
        const row = this.state.drops[clueBase64];
        if (!row) return [];
        if (Date.parse(row.envelope.expiresAt) <= Date.now()) {
            delete this.state.drops[clueBase64];
            this.persist();
            return [];
        }
        return [row.envelope];
    }

    deleteByClue(clueBase64) {
        if (!this.state.drops[clueBase64]) return false;
        delete this.state.drops[clueBase64];
        this.persist();
        return true;
    }

    /** Returns existing seed bytes (Uint8Array) or creates a new one. */
    getOrCreateDecoySeed(roomId) {
        let seedHex = this.state.decoySeeds[roomId];
        if (!seedHex) {
            seedHex = randomBytes(32).toString('hex');
            this.state.decoySeeds[roomId] = seedHex;
            this.persist();
        }
        const out = new Uint8Array(32);
        for (let i = 0; i < 32; i += 1) {
            out[i] = parseInt(seedHex.slice(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    /** Removes any expired drop. Returns the count of removed entries. */
    sweepExpired(now = Date.now()) {
        let removed = 0;
        for (const [clue, row] of Object.entries(this.state.drops)) {
            if (Date.parse(row.envelope.expiresAt) <= now) {
                delete this.state.drops[clue];
                removed += 1;
            }
        }
        if (removed > 0) this.persist();
        return removed;
    }

    snapshot() {
        return {
            dropCount: Object.keys(this.state.drops).length,
            roomCount: Object.keys(this.state.decoySeeds).length,
        };
    }
}
