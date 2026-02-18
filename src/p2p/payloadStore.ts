/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { Buffer as NodeBuffer } from "buffer";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export interface StoredEncryptedPayload {
    cipherText: Uint8Array;
    createdAt: number;
    iv: Uint8Array;
    messageId: string;
    roomId: string;
}

const DB_NAME = "blackout-p2p";
const STORE_NAME = "encrypted_payloads";

/**
 * Phase 2 entry point: encrypted local payload store used by P2P transport.
 * Uses IndexedDB where available with an in-memory fallback for non-browser tests.
 */
export class EncryptedPayloadStore {
    private readonly fallback = new Map<string, StoredEncryptedPayload>();
    private readonly keyBytes = randomBytes(32);

    private cacheKey(roomId: string, messageId: string): string {
        return `${roomId}|${messageId}`;
    }

    private async openDb(): Promise<IDBDatabase | null> {
        if (!globalThis.indexedDB) return null;

        return await new Promise((resolve, reject) => {
            const request = globalThis.indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: ["roomId", "messageId"] });
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
