/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { Buffer as NodeBuffer } from "buffer";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export interface StoredEncryptedPayload {
    cipherText: Uint8Array;
    createdAt: number;
    iv: Uint8Array;
    messageId: string;
    roomId: string;
}

export interface ChunkIndex {
    chunkHashes: string[];
    merkleRoot: string;
}

export interface StoredChunkRecord {
    chunk: Uint8Array;
    chunkHash: string;
    index: number;
    messageId: string;
    roomId: string;
}

const DB_NAME = "blackout-p2p";
const STORE_NAME = "encrypted_payloads";
const CHUNK_STORE = "payload_chunks";
const CHUNK_INDEX_STORE = "payload_chunk_index";
export const CHUNK_SIZE_BYTES = 256 * 1024;

/**
 * Phase 2 entry point: encrypted local payload store used by P2P transport.
 * Uses IndexedDB where available with an in-memory fallback for non-browser tests.
 */
export class EncryptedPayloadStore {
    private readonly fallback = new Map<string, StoredEncryptedPayload>();
    private readonly fallbackChunkIndex = new Map<string, ChunkIndex>();
    private readonly fallbackChunks = new Map<string, StoredChunkRecord>();
    private readonly keyBytes = randomBytes(32);

    private cacheKey(roomId: string, messageId: string): string {
        return `${roomId}|${messageId}`;
    }

    private chunkCacheKey(roomId: string, messageId: string, index: number): string {
        return `${roomId}|${messageId}|${index}`;
    }

    private async openDb(): Promise<IDBDatabase | null> {
        if (!globalThis.indexedDB) return null;

        return await new Promise((resolve, reject) => {
            const request = globalThis.indexedDB.open(DB_NAME, 2);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: ["roomId", "messageId"] });
                }
                if (!db.objectStoreNames.contains(CHUNK_STORE)) {
                    db.createObjectStore(CHUNK_STORE, { keyPath: ["roomId", "messageId", "index"] });
                }
                if (!db.objectStoreNames.contains(CHUNK_INDEX_STORE)) {
                    db.createObjectStore(CHUNK_INDEX_STORE, { keyPath: ["roomId", "messageId"] });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    private encrypt(plainText: string): { cipherText: Uint8Array; iv: Uint8Array } {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", this.keyBytes, iv);
        const ciphertext = NodeBuffer.concat([cipher.update(plainText, "utf8"), cipher.final(), cipher.getAuthTag()]);

        return {
            iv: new Uint8Array(iv),
            cipherText: new Uint8Array(ciphertext),
        };
    }

    private decrypt(payload: StoredEncryptedPayload): string {
        const buffer = NodeBuffer.from(payload.cipherText);
        const authTag = buffer.subarray(buffer.length - 16);
        const encryptedBytes = buffer.subarray(0, buffer.length - 16);
        const decipher = createDecipheriv("aes-256-gcm", this.keyBytes, NodeBuffer.from(payload.iv));
        decipher.setAuthTag(authTag);

        return NodeBuffer.concat([decipher.update(encryptedBytes), decipher.final()]).toString("utf8");
    }

    private hashBytes(bytes: Uint8Array): string {
        return createHash("sha256").update(bytes).digest("hex");
    }

    private computeMerkleRoot(chunkHashes: string[]): string {
        if (chunkHashes.length === 0) return this.hashBytes(new Uint8Array());

        let level = chunkHashes;
        while (level.length > 1) {
            const next: string[] = [];
            for (let i = 0; i < level.length; i += 2) {
                const left = level[i];
                const right = level[i + 1] ?? left;
                next.push(this.hashBytes(new TextEncoder().encode(`${left}${right}`)));
            }
            level = next;
        }

        return level[0];
    }

    private splitIntoChunks(plainText: string): Uint8Array[] {
        const bytes = new TextEncoder().encode(plainText);
        const chunks: Uint8Array[] = [];
        for (let i = 0; i < bytes.length; i += CHUNK_SIZE_BYTES) {
            chunks.push(bytes.slice(i, i + CHUNK_SIZE_BYTES));
        }
        return chunks;
    }

    public async put(roomId: string, messageId: string, plainText: string): Promise<void> {
        const encrypted = this.encrypt(plainText);
        const record: StoredEncryptedPayload = {
            roomId,
            messageId,
            createdAt: Date.now(),
            iv: encrypted.iv,
            cipherText: encrypted.cipherText,
        };

        const db = await this.openDb();
        if (!db) {
            this.fallback.set(this.cacheKey(roomId, messageId), record);
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }

    public async putChunked(roomId: string, messageId: string, plainText: string): Promise<ChunkIndex> {
        const chunks = this.splitIntoChunks(plainText);
        const chunkRecords = chunks.map((chunk, index) => ({
            roomId,
            messageId,
            index,
            chunk,
            chunkHash: this.hashBytes(chunk),
        }));

        const chunkHashes = chunkRecords.map((r) => r.chunkHash);
        const chunkIndex: ChunkIndex = {
            chunkHashes,
            merkleRoot: this.computeMerkleRoot(chunkHashes),
        };

        const db = await this.openDb();
        if (!db) {
            this.fallbackChunkIndex.set(this.cacheKey(roomId, messageId), chunkIndex);
            for (const chunkRecord of chunkRecords) {
                this.fallbackChunks.set(this.chunkCacheKey(roomId, messageId, chunkRecord.index), chunkRecord);
            }
            return chunkIndex;
        }

        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction([CHUNK_STORE, CHUNK_INDEX_STORE], "readwrite");
            const chunkStore = tx.objectStore(CHUNK_STORE);
            const indexStore = tx.objectStore(CHUNK_INDEX_STORE);

            for (const chunkRecord of chunkRecords) {
                chunkStore.put(chunkRecord);
            }
            indexStore.put({ roomId, messageId, ...chunkIndex });

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        db.close();
        return chunkIndex;
    }

    public async verifyMerkleRoot(roomId: string, messageId: string, expectedRoot: string): Promise<boolean> {
        const index = await this.getChunkIndex(roomId, messageId);
        if (!index) return false;
        return index.merkleRoot === expectedRoot;
    }

    public async getChunkIndex(roomId: string, messageId: string): Promise<ChunkIndex | null> {
        const db = await this.openDb();
        if (!db) {
            return this.fallbackChunkIndex.get(this.cacheKey(roomId, messageId)) ?? null;
        }

        const index = await new Promise<ChunkIndex | null>((resolve, reject) => {
            const tx = db.transaction(CHUNK_INDEX_STORE, "readonly");
            const request = tx.objectStore(CHUNK_INDEX_STORE).get([roomId, messageId]);
            request.onsuccess = () => {
                if (!request.result) {
                    resolve(null);
                    return;
                }
                resolve({
                    chunkHashes: request.result.chunkHashes,
                    merkleRoot: request.result.merkleRoot,
                });
            };
            request.onerror = () => reject(request.error);
        });

        db.close();
        return index;
    }

    public async get(roomId: string, messageId: string): Promise<StoredEncryptedPayload | null> {
        const db = await this.openDb();
        if (!db) {
            return this.fallback.get(this.cacheKey(roomId, messageId)) ?? null;
        }

        const payload = await new Promise<StoredEncryptedPayload | null>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const request = tx.objectStore(STORE_NAME).get([roomId, messageId]);
            request.onsuccess = () => resolve((request.result as StoredEncryptedPayload | undefined) ?? null);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return payload;
    }

    public async readPlainText(roomId: string, messageId: string): Promise<string | null> {
        const payload = await this.get(roomId, messageId);
        if (!payload) return null;
        return this.decrypt(payload);
    }
}

let sharedStore: EncryptedPayloadStore | undefined;

export function getEncryptedPayloadStore(): EncryptedPayloadStore {
    sharedStore ??= new EncryptedPayloadStore();
    return sharedStore;
}
